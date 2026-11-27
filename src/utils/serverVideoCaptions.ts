import { getPool, executeQuery } from './serverDb.ts';

export interface VideoCaptionWord {
  t: number; // absolute seconds from video start
  w: string; // word / segment text
}

export interface VideoCaptionCue {
  id: string;
  start: number; // absolute seconds from video start
  end: number;   // absolute seconds from video start
  text: string;
  words?: VideoCaptionWord[];
  source?: 'youtube';
}

export type CaptionDownloadStatus = 'idle' | 'complete' | 'unavailable';

export interface VideoCaptionsResult {
  cues: VideoCaptionCue[];
  status: CaptionDownloadStatus;
  progress: number;
  completed_chunks: number;
  total_chunks: number;
  duration_sec: number;
  source?: 'youtube';
  reason?: 'no_captions' | 'youtube_ip_blocked' | 'video_unavailable';
}

const CACHE_SOURCE_YT = 'yt_v4';
const YT_FULL_WINDOW_KEY = -1;

let tableInitialized = false;
const inFlightNativeFetches = new Map<string, Promise<VideoCaptionsResult>>();

async function ensureCaptionsTable(): Promise<void> {
  if (tableInitialized) return;
  const p = getPool();
  if (!p) return;
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS public.video_captions_cache (
        video_id VARCHAR(64) NOT NULL,
        window_start INT NOT NULL DEFAULT 0,
        cues_json TEXT NOT NULL,
        source VARCHAR(32) NOT NULL DEFAULT 'yt_v4',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (video_id, window_start)
      );
    `);
    tableInitialized = true;
  } catch (err) {
    console.warn('[videoCaptions] Could not create video_captions_cache table:', err);
  }
}

export function parseTimestampToSeconds(ts: string | number): number {
  if (typeof ts === 'number' && !isNaN(ts)) return Math.max(0, Number(ts.toFixed(2)));
  const str = String(ts || '').trim().replace(',', '.');
  if (!str) return 0;
  if (/^\d+(\.\d+)?$/.test(str)) {
    return Math.max(0, Number(parseFloat(str).toFixed(2)));
  }
  const clean = str.replace(/[^\d:.]/g, '');
  const parts = clean.split(':').map((n) => parseFloat(n) || 0);
  if (parts.length === 3) {
    return Number((parts[0] * 3600 + parts[1] * 60 + parts[2]).toFixed(2));
  }
  if (parts.length === 2) {
    return Number((parts[0] * 60 + parts[1]).toFixed(2));
  }
  return Number((parts[0] || 0).toFixed(2));
}

/**
 * Parses YouTube native json3 format (`{ events: [...] }`) including exact per-word `tOffsetMs`.
 */
function parseYouTubeJson3(json3: any): VideoCaptionCue[] {
  const events: any[] = json3?.events || [];
  const cues: VideoCaptionCue[] = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!Array.isArray(ev.segs) || ev.tStartMs === undefined) continue;

    const baseStartSec = Number(ev.tStartMs) / 1000;
    const durSec = ev.dDurationMs ? Number(ev.dDurationMs) / 1000 : 3.0;
    const words: VideoCaptionWord[] = [];
    let fullText = '';

    for (const seg of ev.segs) {
      const piece = String(seg.utf8 || '').replace(/\n/g, ' ');
      if (!piece.trim()) continue;
      const offsetSec = seg.tOffsetMs ? Number(seg.tOffsetMs) / 1000 : 0;
      words.push({
        t: Number((baseStartSec + offsetSec).toFixed(2)),
        w: piece.trim(),
      });
      fullText += (fullText ? ' ' : '') + piece.trim();
    }

    const cleanText = fullText.replace(/\s+/g, ' ').trim();
    if (!cleanText) continue;

    cues.push({
      id: `yt-${i}-${Math.round(baseStartSec * 100)}`,
      start: Number(baseStartSec.toFixed(2)),
      end: Number((baseStartSec + Math.max(0.5, durSec)).toFixed(2)),
      text: cleanText,
      words: words.length > 0 ? words : undefined,
      source: 'youtube',
    });
  }

  return cues.sort((a, b) => a.start - b.start);
}

/**
 * Parses raw WebVTT or SRT subtitles (e.g., saved directly from yt-dlp / YouTube into public.live.captions).
 */
function parseWebVttOrSrt(raw: string): VideoCaptionCue[] {
  const blocks = raw.replace(/\r\n/g, '\n').split(/\n\n+/);
  const cues: VideoCaptionCue[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;

    const [rawStart, rawEndPart] = lines[timeLineIdx].split('-->').map((s) => s.trim());
    const rawEnd = (rawEndPart || '').split(/\s+/)[0];
    const start = parseTimestampToSeconds(rawStart);
    const end = parseTimestampToSeconds(rawEnd);
    const textLines = lines.slice(timeLineIdx + 1);
    const cleanText = textLines
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) continue;
    cues.push({
      id: `vtt-${i}-${Math.round(start * 100)}`,
      start,
      end: Math.max(start + 0.5, end),
      text: cleanText,
      source: 'youtube',
    });
  }

  return cues.sort((a, b) => a.start - b.start);
}

/**
 * Reads native YouTube captions stored by the scraper in `public.live.captions`
 * (supports WebVTT, SRT, YouTube json3, or JSON cue arrays).
 */
async function tryReadNativeCaptionsFromLiveTable(videoId: string): Promise<VideoCaptionCue[]> {
  try {
    const res: any = await executeQuery(
      `SELECT captions
       FROM public.live
       WHERE video_id = $1 AND captions IS NOT NULL AND captions <> ''
       LIMIT 1`,
      [videoId]
    );
    const raw = String(res.rows?.[0]?.captions || '').trim();
    if (!raw) return [];

    if (raw.startsWith('WEBVTT') || /\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(raw)) {
      return parseWebVttOrSrt(raw);
    }

    if (raw.startsWith('{') || raw.startsWith('[')) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.events)) {
        return parseYouTubeJson3(parsed);
      }
      if (Array.isArray(parsed)) {
        return parsed
          .map((item: any, idx: number) => {
            const start =
              item.offset !== undefined
                ? Number(item.offset) > 10000
                  ? Number(item.offset) / 1000
                  : Number(item.offset)
                : parseTimestampToSeconds(item.start ?? 0);
            const end =
              item.end !== undefined
                ? parseTimestampToSeconds(item.end)
                : item.duration !== undefined
                ? start + (Number(item.duration) > 1000 ? Number(item.duration) / 1000 : Number(item.duration))
                : start + 3;
            const text = String(item.text || '').replace(/\s+/g, ' ').trim();
            return {
              id: `db-yt-${idx}-${Math.round(start * 100)}`,
              start: Number(start.toFixed(2)),
              end: Number(Math.max(start + 0.5, end).toFixed(2)),
              text,
              source: 'youtube' as const,
            };
          })
          .filter((c) => c.text.length > 0)
          .sort((a, b) => a.start - b.start);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Fetches YouTube's literal native timedtext captions via Supadata API if SUPADATA_API_KEY is configured.
 */
async function tryFetchSupadataYouTubeCaptions(videoId: string): Promise<VideoCaptionCue[]> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?videoId=${encodeURIComponent(videoId)}&lang=es`,
      {
        headers: { 'x-api-key': apiKey },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (!resp.ok) return [];

    const data: any = await resp.json().catch(() => null);
    const segments: any[] = Array.isArray(data?.content) ? data.content : [];
    if (segments.length === 0) return [];

    return segments
      .map((seg: any, idx: number) => {
        const start = Number((Number(seg.offset || 0) / 1000).toFixed(2));
        const dur = Number((Number(seg.duration || 2500) / 1000).toFixed(2));
        const text = String(seg.text || '').replace(/\s+/g, ' ').trim();
        return {
          id: `supa-${idx}-${Math.round(start * 100)}`,
          start,
          end: Number((start + Math.max(0.5, dur)).toFixed(2)),
          text,
          source: 'youtube' as const,
        };
      })
      .filter((c) => c.text.length > 0)
      .sort((a, b) => a.start - b.start);
  } catch {
    return [];
  }
}

/**
 * Fetches YouTube's exact native json3 caption track (including per-word tOffsetMs)
 * via InnerTube ANDROID / ANDROID_VR. Uses YOUTUBE_PROXY_URL via undici ProxyAgent if configured.
 */
async function probeAndFetchNativeYouTubeCaptions(videoId: string): Promise<{
  cues: VideoCaptionCue[];
  playability: 'ok' | 'unavailable' | 'blocked';
}> {
  let dispatcher: any = undefined;
  const proxyUrl = process.env.YOUTUBE_PROXY_URL;
  if (proxyUrl) {
    try {
      const undiciMod: any = await import('undici');
      if (undiciMod?.ProxyAgent) {
        dispatcher = new undiciMod.ProxyAgent(proxyUrl);
      }
    } catch {
      // ignore
    }
  }

  const clients = [
    {
      clientName: 'ANDROID',
      clientVersion: '20.10.38',
      ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
    },
    {
      clientName: 'ANDROID_VR',
      clientVersion: '1.60.19',
      ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L)',
    },
  ];

  for (const c of clients) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), proxyUrl ? 7000 : 3000);
      const fetchOpts: any = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': c.ua,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: c.clientName,
              clientVersion: c.clientVersion,
              hl: 'es',
              gl: 'AR',
            },
          },
          videoId,
        }),
        signal: controller.signal,
      };
      if (dispatcher) fetchOpts.dispatcher = dispatcher;

      const resp = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', fetchOpts);
      clearTimeout(timeout);
      if (!resp.ok) continue;

      const data: any = await resp.json().catch(() => null);
      const status = String(data?.playabilityStatus?.status || '').toUpperCase();
      if (status === 'UNPLAYABLE' || status === 'ERROR') {
        return { cues: [], playability: 'unavailable' };
      }

      const tracks: any[] = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (!tracks.length) {
        if (status === 'LOGIN_REQUIRED') continue;
        return { cues: [], playability: 'ok' };
      }

      const preferred =
        tracks.find((t) => String(t.languageCode || '').startsWith('es') && t.kind !== 'asr') ||
        tracks.find((t) => String(t.languageCode || '').startsWith('es')) ||
        tracks[0];

      if (!preferred?.baseUrl) continue;

      let trackUrl = String(preferred.baseUrl);
      if (/[?&]fmt=[^&]+/.test(trackUrl)) {
        trackUrl = trackUrl.replace(/([?&]fmt=)[^&]+/, '$1json3');
      } else {
        trackUrl += '&fmt=json3';
      }

      const trOpts: any = { headers: { 'User-Agent': c.ua } };
      if (dispatcher) trOpts.dispatcher = dispatcher;

      const trResp = await fetch(trackUrl, trOpts);
      if (!trResp.ok) continue;

      const json3: any = await trResp.json().catch(() => null);
      const cues = parseYouTubeJson3(json3);

      if (cues.length > 0) {
        return { cues, playability: 'ok' };
      }
    } catch {
      // try next client
    }
  }

  return { cues: [], playability: 'blocked' };
}

async function saveNativeYouTubeCuesToDb(videoId: string, cues: VideoCaptionCue[]): Promise<void> {
  try {
    await executeQuery(
      `INSERT INTO public.video_captions_cache (video_id, window_start, cues_json, source, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (video_id, window_start)
       DO UPDATE SET cues_json = EXCLUDED.cues_json, source = EXCLUDED.source, updated_at = NOW()`,
      [videoId, YT_FULL_WINDOW_KEY, JSON.stringify(cues), CACHE_SOURCE_YT]
    );
  } catch {
    // ignore
  }
}

async function readCachedNativeYouTubeCues(videoId: string): Promise<VideoCaptionCue[] | null> {
  try {
    const res: any = await executeQuery(
      `SELECT cues_json
       FROM public.video_captions_cache
       WHERE video_id = $1 AND window_start = $2 AND source = $3
       LIMIT 1`,
      [videoId, YT_FULL_WINDOW_KEY, CACHE_SOURCE_YT]
    );
    if (res.rows?.length > 0) {
      const parsed = JSON.parse(res.rows[0].cues_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Fetches ONLY literal native YouTube captions (never calls Gemini, avoiding 429 quota exhaustion
 * and ensuring 100% parity with YouTube's embed captions whenever a native source is available):
 * 1. PostgreSQL cache (`public.video_captions_cache`)
 * 2. Scraper-populated `public.live.captions` (WebVTT / SRT / json3 / JSON cues)
 * 3. Supadata API (`SUPADATA_API_KEY`)
 * 4. Direct or proxied (`YOUTUBE_PROXY_URL`) YouTube InnerTube `json3`
 */
export async function getVideoCaptions(options: {
  video_id: string;
  start_date?: string | null;
  end_date?: string | null;
  duration?: number | null;
  priority_time?: number | null;
  is_live?: boolean;
  download_all?: boolean;
}): Promise<VideoCaptionsResult> {
  const { video_id, download_all } = options;
  await ensureCaptionsTable();

  // 1. Instant DB cache check
  const cached = await readCachedNativeYouTubeCues(video_id);
  if (cached && cached.length > 0) {
    return {
      cues: cached,
      status: 'complete',
      progress: 100,
      completed_chunks: 1,
      total_chunks: 1,
      duration_sec: Math.ceil(cached[cached.length - 1].end || 0),
      source: 'youtube',
    };
  }

  // 2. Check if scraper already stored VTT / json3 / cues in public.live.captions
  const liveTableCues = await tryReadNativeCaptionsFromLiveTable(video_id);
  if (liveTableCues.length > 0) {
    await saveNativeYouTubeCuesToDb(video_id, liveTableCues);
    return {
      cues: liveTableCues,
      status: 'complete',
      progress: 100,
      completed_chunks: 1,
      total_chunks: 1,
      duration_sec: Math.ceil(liveTableCues[liveTableCues.length - 1].end || 0),
      source: 'youtube',
    };
  }

  // Passive GET without download_all returns idle immediately unless already cached above
  if (!download_all) {
    return {
      cues: [],
      status: 'idle',
      progress: 0,
      completed_chunks: 0,
      total_chunks: 1,
      duration_sec: 0,
    };
  }

  // Deduplicate concurrent native fetch attempts for the same video_id
  const existingPromise = inFlightNativeFetches.get(video_id);
  if (existingPromise) {
    return existingPromise;
  }

  const fetchPromise = (async (): Promise<VideoCaptionsResult> => {
    // 3. Try Supadata API if SUPADATA_API_KEY is configured
    const supadataCues = await tryFetchSupadataYouTubeCaptions(video_id);
    if (supadataCues.length > 0) {
      await saveNativeYouTubeCuesToDb(video_id, supadataCues);
      return {
        cues: supadataCues,
        status: 'complete',
        progress: 100,
        completed_chunks: 1,
        total_chunks: 1,
        duration_sec: Math.ceil(supadataCues[supadataCues.length - 1].end || 0),
        source: 'youtube',
      };
    }

    // 4. Try direct or proxied YouTube InnerTube json3
    const ytProbe = await probeAndFetchNativeYouTubeCaptions(video_id);
    if (ytProbe.cues.length > 0) {
      await saveNativeYouTubeCuesToDb(video_id, ytProbe.cues);
      return {
        cues: ytProbe.cues,
        status: 'complete',
        progress: 100,
        completed_chunks: 1,
        total_chunks: 1,
        duration_sec: Math.ceil(ytProbe.cues[ytProbe.cues.length - 1].end || 0),
        source: 'youtube',
      };
    }

    return {
      cues: [],
      status: 'unavailable',
      progress: 100,
      completed_chunks: 0,
      total_chunks: 0,
      duration_sec: 0,
      reason:
        ytProbe.playability === 'unavailable'
          ? 'video_unavailable'
          : ytProbe.playability === 'blocked'
          ? 'youtube_ip_blocked'
          : 'no_captions',
    };
  })();

  inFlightNativeFetches.set(video_id, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightNativeFetches.delete(video_id);
  }
}
