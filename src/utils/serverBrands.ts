import crypto from 'crypto';
import { getPool, executeQuery } from './serverDb.ts';
import { VideoAdsAnalysisResult, DetectedAd } from './serverAdDetector.ts';
import { isStreamTitleBlocked } from '../config/streamFilters.ts';

export interface BrandMeasuredStream {
  stream_key: string;
  video_id: string;
  title_hash: string | null;
  channel_id: string;
  channel: string;
  channel_name: string;
  thumb: string;
  channel_type: string;
  video_title: string;
  start_date: string;
  video_start_date: string;
  scrape_date: string;
  avg_viewers: number;
  peak_viewers: number;
  ads_count: number;
  unique_brands: string[];
  total_ad_seconds: number;
  clock_offset_sec: number;
  analyzed_at: string;
}

export interface BrandsListSummary {
  total_streams: number;
  total_ads: number;
  unique_brands_count: number;
  total_ad_seconds: number;
  avg_viewers_across_streams: number;
  top_brands: string[];
}

export interface BrandStreamDetailPayload {
  stream_key: string;
  stream: {
    video_id: string;
    channel_id: string;
    channel_name: string;
    channel: string;
    thumb: string;
    tags: string;
    subs: number;
    twitter?: string;
    type: string;
    video_title: string;
    live: string;
    concurrent_viewers: number;
    old_viewers: number;
    avg_viewers: number;
    max_users: number;
    max_viewers: number;
    current_likes: number;
    old_likes: number;
    max_likes: number;
    comments_count: number;
    unique_commentators: number;
    start_date: string;
    video_start_date: string;
    scrape_date: string;
    superchats_total: number;
    superchats_count: number;
    data: Array<{
      scrape_date: string;
      raw_date: string;
      concurrent_viewers: number;
      likes: number;
      comments_count: number;
    }>;
  };
  channel: {
    channel_id: string;
    channel: string;
    channel_name: string;
    thumb: string;
    tags: string;
    subs: number;
    type: string;
  };
  ads_analysis: VideoAdsAnalysisResult;
  audience_timeline_points: Array<{
    scrape_date: string;
    raw_date: string;
    concurrent_viewers: number;
    likes: number;
    comments_count: number;
  }>;
}

function normalizeTitleForHash(title?: string | null): string {
  return String(title || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Deterministic 10-char hex hash of a stream title so eternal channels (which share one video_id
 * across multiple daily shows) get a unique, bookmarkable key per broadcast program.
 */
export function hashStreamTitle(title?: string | null): string {
  const norm = normalizeTitleForHash(title);
  return crypto.createHash('sha256').update(norm || 'untitled').digest('hex').slice(0, 10);
}

export function buildBrandStreamKey(
  videoId: string,
  isEternal: boolean,
  videoTitle?: string | null
): string {
  const cleanVid = String(videoId || '').trim();
  if (isEternal && normalizeTitleForHash(videoTitle).length > 0) {
    return `${cleanVid}--${hashStreamTitle(videoTitle)}`;
  }
  return cleanVid;
}

export function parseBrandStreamKey(rawKey: string): {
  videoId: string;
  titleHash: string | null;
} {
  const clean = decodeURIComponent(String(rawKey || '').trim());
  const match = clean.match(/^([A-Za-z0-9_-]{11})--([a-f0-9]{8,16})$/i);
  if (match) {
    return { videoId: match[1], titleHash: match[2].toLowerCase() };
  }
  return { videoId: clean, titleHash: null };
}

function parseDbTimestampMs(dateStr?: string | Date | null): number | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr.getTime();
  }
  const str = String(dateStr).trim();
  if (!str) return null;

  const match = str.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const hour = match[4] !== undefined ? parseInt(match[4], 10) : 0;
    const minute = match[5] !== undefined ? parseInt(match[5], 10) : 0;
    const second = match[6] !== undefined ? parseInt(match[6], 10) : 0;
    return Date.UTC(year, month - 1, day, hour, minute, second);
  }

  const parsed = new Date(str).getTime();
  return isNaN(parsed) ? null : parsed;
}

async function ensureAdsCacheTableSafe(): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS public.video_ads_cache (
        video_id VARCHAR(64) PRIMARY KEY,
        result_json TEXT NOT NULL,
        engine VARCHAR(32) NOT NULL DEFAULT 'gemini',
        version VARCHAR(32) NOT NULL DEFAULT 'ads_v1',
        clock_offset_sec INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await executeQuery(
      `ALTER TABLE public.video_ads_cache ADD COLUMN IF NOT EXISTS clock_offset_sec INTEGER NOT NULL DEFAULT 0;`
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists all individual broadcasts whose commercial ads / PNTs have been measured in `public.video_ads_cache`.
 * For eternal channels (multiple shows sharing one video_id), splits by program using a deterministic title hash.
 */
export async function listMeasuredBrandStreams(): Promise<{
  summary: BrandsListSummary;
  streams: BrandMeasuredStream[];
}> {
  const ok = await ensureAdsCacheTableSafe();
  if (!ok) {
    return {
      summary: {
        total_streams: 0,
        total_ads: 0,
        unique_brands_count: 0,
        total_ad_seconds: 0,
        avg_viewers_across_streams: 0,
        top_brands: [],
      },
      streams: [],
    };
  }

  // 1. Read all measured ad analyses from PostgreSQL
  const cacheRes: any = await executeQuery(
    `SELECT video_id, result_json, COALESCE(clock_offset_sec, 0) AS clock_offset_sec, updated_at
     FROM public.video_ads_cache
     ORDER BY updated_at DESC
     LIMIT 200`
  );

  interface ParsedCacheEntry {
    video_id: string;
    parsed: VideoAdsAnalysisResult;
    clock_offset_sec: number;
    updated_at: string;
  }

  const cacheEntries: ParsedCacheEntry[] = [];
  for (const row of cacheRes.rows || []) {
    try {
      const parsed = JSON.parse(row.result_json) as VideoAdsAnalysisResult;
      if (!parsed || !Array.isArray(parsed.ads)) continue;
      const clockOffset = Math.round(Number(row.clock_offset_sec) || 0);
      cacheEntries.push({
        video_id: String(row.video_id),
        parsed: { ...parsed, clock_offset_sec: clockOffset },
        clock_offset_sec: clockOffset,
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : parsed.analyzed_at || new Date().toISOString(),
      });
    } catch {
      // ignore malformed JSON row
    }
  }

  if (cacheEntries.length === 0) {
    return {
      summary: {
        total_streams: 0,
        total_ads: 0,
        unique_brands_count: 0,
        total_ad_seconds: 0,
        avg_viewers_across_streams: 0,
        top_brands: [],
      },
      streams: [],
    };
  }

  const videoIds = cacheEntries.map((e) => e.video_id);

  // 2. Fetch metadata from public.live + public.channels for these video_ids
  const liveMap = new Map<string, any>();
  try {
    const liveRes: any = await executeQuery(
      `SELECT DISTINCT ON (l.video_id)
              l.video_id,
              l.channel_id,
              l.video_title,
              l.start_date,
              l.scrape_date,
              l.concurrent_viewers,
              l.max_users,
              c.channel,
              c.channel_name,
              c.thumb,
              c.type
       FROM public.live l
       JOIN public.channels c ON l.channel_id = c.channel_id
       WHERE l.video_id = ANY($1)
       ORDER BY l.video_id, l.scrape_date DESC`,
      [videoIds]
    );
    for (const row of liveRes.rows || []) {
      liveMap.set(String(row.video_id), row);
    }
  } catch (err) {
    console.warn('[serverBrands] Error querying public.live:', err);
  }

  // Fallback channel lookup via public.minute for any video_id missing in public.live
  const missingVideoIds = videoIds.filter((vid) => !liveMap.has(vid));
  if (missingVideoIds.length > 0) {
    try {
      const fallbackRes: any = await executeQuery(
        `SELECT DISTINCT ON (m.video_id)
                m.video_id,
                m.channel_id,
                m.video_title,
                m.scrape_date,
                c.channel,
                c.channel_name,
                c.thumb,
                c.type
         FROM public.minute m
         JOIN public.channels c ON m.channel_id = c.channel_id
         WHERE m.video_id = ANY($1)
         ORDER BY m.video_id, m.scrape_date DESC`,
        [missingVideoIds]
      );
      for (const row of fallbackRes.rows || []) {
        liveMap.set(String(row.video_id), row);
      }
    } catch {
      // ignore
    }
  }

  // 3. Aggregate minute-level viewer stats per video_id (avg_viewers, max_viewers, first/last measurement)
  const videoStatsMap = new Map<
    string,
    { avg_viewers: number; peak_viewers: number; first_date: string | null; last_date: string | null }
  >();
  try {
    const statsRes: any = await executeQuery(
      `SELECT video_id,
              ROUND(AVG(concurrent_viewers))::int AS avg_viewers,
              MAX(concurrent_viewers)::int AS peak_viewers,
              MIN(scrape_date) AS first_date,
              MAX(scrape_date) AS last_date
       FROM public.minute
       WHERE video_id = ANY($1)
       GROUP BY video_id`,
      [videoIds]
    );
    for (const row of statsRes.rows || []) {
      videoStatsMap.set(String(row.video_id), {
        avg_viewers: Number(row.avg_viewers || 0),
        peak_viewers: Number(row.peak_viewers || 0),
        first_date: row.first_date ? new Date(row.first_date).toISOString() : null,
        last_date: row.last_date ? new Date(row.last_date).toISOString() : null,
      });
    }
  } catch (err) {
    console.warn('[serverBrands] Error querying public.minute video stats:', err);
  }

  // 4. For eternal channel video_ids, query distinct programs grouped by (video_id, video_title)
  const eternalVideoIds = videoIds.filter((vid) => {
    const meta = liveMap.get(vid);
    return meta && meta.type === 'eternal';
  });

  const eternalProgramsByVideo = new Map<string, any[]>();
  if (eternalVideoIds.length > 0) {
    try {
      const eternalRes: any = await executeQuery(
        `SELECT video_id,
                video_title,
                MIN(scrape_date) AS start_time,
                MAX(scrape_date) AS end_time,
                ROUND(AVG(concurrent_viewers))::int AS avg_viewers,
                MAX(concurrent_viewers)::int AS peak_viewers,
                COUNT(*)::int AS point_count
         FROM public.minute
         WHERE video_id = ANY($1)
           AND video_title IS NOT NULL
           AND TRIM(video_title) <> ''
         GROUP BY video_id, video_title
         ORDER BY MAX(scrape_date) DESC`,
        [eternalVideoIds]
      );

      for (const row of eternalRes.rows || []) {
        if (isStreamTitleBlocked(row.video_title)) continue;
        const vid = String(row.video_id);
        const arr = eternalProgramsByVideo.get(vid) || [];
        arr.push(row);
        eternalProgramsByVideo.set(vid, arr);
      }
    } catch (err) {
      console.warn('[serverBrands] Error querying eternal program groups:', err);
    }
  }

  // 5. Assemble final list of measured individual emissions
  const streams: BrandMeasuredStream[] = [];
  const globalBrandCount = new Map<string, number>();

  for (const entry of cacheEntries) {
    const meta = liveMap.get(entry.video_id);
    if (!meta) continue;
    if (meta.channel === '@Radio10am') continue;

    const isEternal = meta.type === 'eternal';
    const vStats = videoStatsMap.get(entry.video_id);
    const allAds: DetectedAd[] = Array.isArray(entry.parsed.ads) ? entry.parsed.ads : [];
    const videoFirstDate =
      vStats?.first_date ||
      (meta.start_date ? new Date(meta.start_date).toISOString() : null) ||
      (meta.scrape_date ? new Date(meta.scrape_date).toISOString() : new Date().toISOString());

    if (isEternal) {
      const rawPrograms = eternalProgramsByVideo.get(entry.video_id) || [];
      // Deduplicate programs that produce the same title hash (e.g. minor whitespace/case differences)
      const dedupByHash = new Map<string, any>();
      for (const prog of rawPrograms) {
        const tHash = hashStreamTitle(prog.video_title);
        const existing = dedupByHash.get(tHash);
        if (!existing) {
          dedupByHash.set(tHash, { ...prog, title_hash: tHash });
        } else {
          // Merge time range & pick weighted average
          const existingStart = parseDbTimestampMs(existing.start_time) ?? Infinity;
          const progStart = parseDbTimestampMs(prog.start_time) ?? Infinity;
          const existingEnd = parseDbTimestampMs(existing.end_time) ?? 0;
          const progEnd = parseDbTimestampMs(prog.end_time) ?? 0;
          if (progStart < existingStart) existing.start_time = prog.start_time;
          if (progEnd > existingEnd) existing.end_time = prog.end_time;
          const totalPts = (existing.point_count || 1) + (prog.point_count || 1);
          existing.avg_viewers = Math.round(
            ((existing.avg_viewers || 0) * (existing.point_count || 1) +
              (prog.avg_viewers || 0) * (prog.point_count || 1)) /
              totalPts
          );
          existing.peak_viewers = Math.max(existing.peak_viewers || 0, prog.peak_viewers || 0);
          existing.point_count = totalPts;
        }
      }

      const programs = Array.from(dedupByHash.values());
      const videoFirstMs = parseDbTimestampMs(videoFirstDate);
      const matchedItems: BrandMeasuredStream[] = [];

      if (programs.length > 0 && videoFirstMs !== null) {
        for (const prog of programs) {
          const pStartMs = parseDbTimestampMs(prog.start_time);
          const pEndMs = parseDbTimestampMs(prog.end_time);
          if (pStartMs === null || pEndMs === null) continue;

          const windowStart = pStartMs - 120_000;
          const windowEnd = pEndMs + 120_000;
          const progAds = allAds.filter((ad) => {
            const adMs =
              videoFirstMs +
              (Number(ad.start_sec || 0) + entry.clock_offset_sec + Number(ad.clock_offset_sec || 0)) *
                1000;
            return adMs >= windowStart && adMs <= windowEnd;
          });

          if (progAds.length > 0) {
            const brands = Array.from(
              new Set(progAds.map((a) => a.brand).filter((b) => b && b !== 'Anunciante / PNT detectado'))
            );
            const adSeconds = progAds.reduce((s, a) => s + (Number(a.duration_sec) || 0), 0);
            matchedItems.push({
              stream_key: `${entry.video_id}--${prog.title_hash}`,
              video_id: entry.video_id,
              title_hash: prog.title_hash,
              channel_id: String(meta.channel_id),
              channel: String(meta.channel),
              channel_name: String(meta.channel_name || meta.channel),
              thumb: String(meta.thumb || `https://i.ytimg.com/vi/${entry.video_id}/hqdefault.jpg`),
              channel_type: 'eternal',
              video_title: String(prog.video_title || meta.video_title || 'Emisión'),
              start_date: new Date(prog.start_time).toISOString(),
              video_start_date: videoFirstDate,
              scrape_date: new Date(prog.end_time).toISOString(),
              avg_viewers: Number(prog.avg_viewers || 0),
              peak_viewers: Number(prog.peak_viewers || prog.avg_viewers || 0),
              ads_count: progAds.length,
              unique_brands: brands,
              total_ad_seconds: adSeconds,
              clock_offset_sec: entry.clock_offset_sec,
              analyzed_at: entry.updated_at,
            });
          }
        }
      }

      if (matchedItems.length > 0) {
        // Keep only the single title emission with the most detected ads for this eternal video_id
        matchedItems.sort((a, b) => {
          if (b.ads_count !== a.ads_count) return b.ads_count - a.ads_count;
          if (b.total_ad_seconds !== a.total_ad_seconds) return b.total_ad_seconds - a.total_ad_seconds;
          if (b.peak_viewers !== a.peak_viewers) return b.peak_viewers - a.peak_viewers;
          const aMs = parseDbTimestampMs(a.start_date) || 0;
          const bMs = parseDbTimestampMs(b.start_date) || 0;
          return bMs - aMs;
        });
        const bestItem = matchedItems[0];
        streams.push(bestItem);
        for (const b of bestItem.unique_brands) {
          globalBrandCount.set(b, (globalBrandCount.get(b) || 0) + 1);
        }
      } else if (allAds.length > 0) {
        // Fallback: attach full video's measured ads to its most recent program group (or live row)
        const fallbackProg = programs[0];
        const title = String(fallbackProg?.video_title || meta.video_title || 'Emisión');
        if (!isStreamTitleBlocked(title)) {
          const tHash = hashStreamTitle(title);
          const brands = Array.from(
            new Set(allAds.map((a) => a.brand).filter((b) => b && b !== 'Anunciante / PNT detectado'))
          );
          const adSeconds = allAds.reduce((s, a) => s + (Number(a.duration_sec) || 0), 0);
          streams.push({
            stream_key: `${entry.video_id}--${tHash}`,
            video_id: entry.video_id,
            title_hash: tHash,
            channel_id: String(meta.channel_id),
            channel: String(meta.channel),
            channel_name: String(meta.channel_name || meta.channel),
            thumb: String(meta.thumb || `https://i.ytimg.com/vi/${entry.video_id}/hqdefault.jpg`),
            channel_type: 'eternal',
            video_title: title,
            start_date: fallbackProg?.start_time
              ? new Date(fallbackProg.start_time).toISOString()
              : videoFirstDate,
            video_start_date: videoFirstDate,
            scrape_date: fallbackProg?.end_time
              ? new Date(fallbackProg.end_time).toISOString()
              : meta.scrape_date
              ? new Date(meta.scrape_date).toISOString()
              : videoFirstDate,
            avg_viewers: Number(fallbackProg?.avg_viewers || vStats?.avg_viewers || meta.concurrent_viewers || 0),
            peak_viewers: Number(fallbackProg?.peak_viewers || vStats?.peak_viewers || meta.max_users || 0),
            ads_count: allAds.length,
            unique_brands: brands,
            total_ad_seconds: adSeconds,
            clock_offset_sec: entry.clock_offset_sec,
            analyzed_at: entry.updated_at,
          });
          for (const b of brands) {
            globalBrandCount.set(b, (globalBrandCount.get(b) || 0) + 1);
          }
        }
      }
    } else {
      // Standard channel: video_id is unique
      const title = String(meta.video_title || 'Emisión');
      if (isStreamTitleBlocked(title)) continue;
      const brands = Array.from(
        new Set(allAds.map((a) => a.brand).filter((b) => b && b !== 'Anunciante / PNT detectado'))
      );
      const adSeconds = allAds.reduce((s, a) => s + (Number(a.duration_sec) || 0), 0);
      const avgViewers = Number(vStats?.avg_viewers || meta.concurrent_viewers || meta.max_users || 0);
      const peakViewers = Number(vStats?.peak_viewers || meta.max_users || meta.concurrent_viewers || 0);

      streams.push({
        stream_key: entry.video_id,
        video_id: entry.video_id,
        title_hash: null,
        channel_id: String(meta.channel_id),
        channel: String(meta.channel),
        channel_name: String(meta.channel_name || meta.channel),
        thumb: String(meta.thumb || `https://i.ytimg.com/vi/${entry.video_id}/hqdefault.jpg`),
        channel_type: String(meta.type || 'standard'),
        video_title: title,
        start_date: meta.start_date
          ? new Date(meta.start_date).toISOString()
          : videoFirstDate,
        video_start_date: meta.start_date
          ? new Date(meta.start_date).toISOString()
          : videoFirstDate,
        scrape_date: meta.scrape_date
          ? new Date(meta.scrape_date).toISOString()
          : vStats?.last_date || videoFirstDate,
        avg_viewers: avgViewers,
        peak_viewers: peakViewers,
        ads_count: allAds.length,
        unique_brands: brands,
        total_ad_seconds: adSeconds,
        clock_offset_sec: entry.clock_offset_sec,
        analyzed_at: entry.updated_at,
      });

      for (const b of brands) {
        globalBrandCount.set(b, (globalBrandCount.get(b) || 0) + 1);
      }
    }
  }

  // Sort by most recent broadcast start_date descending (or avg_viewers if same date)
  streams.sort((a, b) => {
    const aMs = parseDbTimestampMs(a.start_date) || 0;
    const bMs = parseDbTimestampMs(b.start_date) || 0;
    return bMs - aMs || b.avg_viewers - a.avg_viewers;
  });

  const totalAds = streams.reduce((s, x) => s + x.ads_count, 0);
  const totalAdSeconds = streams.reduce((s, x) => s + x.total_ad_seconds, 0);
  const avgViewersAcross =
    streams.length > 0
      ? Math.round(streams.reduce((s, x) => s + x.avg_viewers, 0) / streams.length)
      : 0;
  const topBrands = Array.from(globalBrandCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([brand]) => brand);

  return {
    summary: {
      total_streams: streams.length,
      total_ads: totalAds,
      unique_brands_count: globalBrandCount.size,
      total_ad_seconds: totalAdSeconds,
      avg_viewers_across_streams: avgViewersAcross,
      top_brands: topBrands,
    },
    streams,
  };
}

/**
 * Loads full detail for a single measured emission identified by `streamKey`
 * (`video_id` for standard channels, or `video_id--titleHash` for eternal channels).
 */
export async function getBrandStreamDetail(
  rawKey: string
): Promise<BrandStreamDetailPayload | null> {
  const ok = await ensureAdsCacheTableSafe();
  if (!ok) return null;

  const { videoId, titleHash } = parseBrandStreamKey(rawKey);
  if (!videoId) return null;

  // 1. Read cached ads analysis
  const adsRes: any = await executeQuery(
    `SELECT result_json, COALESCE(clock_offset_sec, 0) AS clock_offset_sec
     FROM public.video_ads_cache
     WHERE video_id = $1
     LIMIT 1`,
    [videoId]
  );
  if (!adsRes.rows?.length) return null;

  let adsAnalysis: VideoAdsAnalysisResult;
  try {
    const parsed = JSON.parse(adsRes.rows[0].result_json) as VideoAdsAnalysisResult;
    const savedOffset = Math.round(Number(adsRes.rows[0].clock_offset_sec) || 0);
    adsAnalysis = { ...parsed, clock_offset_sec: savedOffset, cached: true };
  } catch {
    return null;
  }

  // 2. Load live + channel metadata
  let meta: any = null;
  const liveRes: any = await executeQuery(
    `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter, c.type
     FROM public.live l
     JOIN public.channels c ON l.channel_id = c.channel_id
     WHERE l.video_id = $1
     ORDER BY l.scrape_date DESC
     LIMIT 1`,
    [videoId]
  );
  meta = liveRes.rows?.[0] || null;

  if (!meta) {
    const fallbackRes: any = await executeQuery(
      `SELECT m.video_id, m.channel_id, m.video_title, m.scrape_date,
              c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter, c.type
       FROM public.minute m
       JOIN public.channels c ON m.channel_id = c.channel_id
       WHERE m.video_id = $1
       ORDER BY m.scrape_date DESC
       LIMIT 1`,
      [videoId]
    );
    meta = fallbackRes.rows?.[0] || null;
  }

  if (!meta) return null;

  const isEternal = meta.type === 'eternal';

  // 3. Load minute points for this video_id
  const allPtsRes: any = await executeQuery(
    `SELECT to_char(scrape_date, 'HH24:MI') AS scrape_date,
            scrape_date AS raw_date,
            video_title,
            concurrent_viewers,
            likes,
            comments_count,
            COALESCE(authors_count, 0) AS authors_count
     FROM public.minute
     WHERE video_id = $1
     ORDER BY scrape_date ASC
     LIMIT 1500`,
    [videoId]
  );

  const allRawRows: any[] = allPtsRes.rows || [];
  const fullVideoPoints = allRawRows.map((pt) => ({
    scrape_date: String(pt.scrape_date),
    raw_date: pt.raw_date ? new Date(pt.raw_date).toISOString() : '',
    concurrent_viewers: Number(pt.concurrent_viewers || 0),
    likes: Number(pt.likes || 0),
    comments_count: Number(pt.comments_count || 0),
  }));

  const videoFirstDate =
    fullVideoPoints.length > 0 && fullVideoPoints[0].raw_date
      ? fullVideoPoints[0].raw_date
      : meta.start_date
      ? new Date(meta.start_date).toISOString()
      : new Date().toISOString();

  // Scope chart rows for eternal channels to the exact program matching titleHash
  let scopedRows = allRawRows;
  let resolvedTitle = String(meta.video_title || 'Emisión');

  if (isEternal && titleHash && allRawRows.length > 0) {
    const matchingRows = allRawRows.filter(
      (r) => r.video_title && hashStreamTitle(r.video_title) === titleHash
    );
    if (matchingRows.length > 0) {
      scopedRows = matchingRows;
      resolvedTitle = String(matchingRows[0].video_title);
    }
  }

  // Normalize cumulative likes & comments for eternal scoped program
  const minScopedLikes = scopedRows.length > 0 ? Math.min(...scopedRows.map((r) => Number(r.likes || 0))) : 0;
  const minScopedComments = scopedRows.length > 0 ? Math.min(...scopedRows.map((r) => Number(r.comments_count || 0))) : 0;
  const minScopedAuthors = scopedRows.length > 0 ? Math.min(...scopedRows.map((r) => Number(r.authors_count || 0))) : 0;

  const chartPoints = scopedRows.map((pt) => ({
    scrape_date: String(pt.scrape_date),
    raw_date: pt.raw_date ? new Date(pt.raw_date).toISOString() : '',
    concurrent_viewers: Number(pt.concurrent_viewers || 0),
    likes: isEternal ? Math.max(0, Number(pt.likes || 0) - minScopedLikes) : Number(pt.likes || 0),
    comments_count: isEternal
      ? Math.max(0, Number(pt.comments_count || 0) - minScopedComments)
      : Number(pt.comments_count || 0),
  }));

  const avgViewers =
    chartPoints.length > 0
      ? Math.round(chartPoints.reduce((s, p) => s + p.concurrent_viewers, 0) / chartPoints.length)
      : Number(meta.concurrent_viewers || meta.max_users || 0);
  const peakViewers =
    chartPoints.length > 0
      ? Math.max(...chartPoints.map((p) => p.concurrent_viewers))
      : Number(meta.max_users || meta.concurrent_viewers || 0);
  const finalLikes =
    chartPoints.length > 0
      ? Math.max(...chartPoints.map((p) => p.likes))
      : Number(meta.max_likes || meta.current_likes || 0);
  const finalComments =
    chartPoints.length > 0
      ? Math.max(...chartPoints.map((p) => p.comments_count))
      : Number(meta.comments_count || 0);
  const finalAuthors =
    scopedRows.length > 0
      ? isEternal
        ? Math.max(0, Math.max(...scopedRows.map((r) => Number(r.authors_count || 0))) - minScopedAuthors)
        : Math.max(...scopedRows.map((r) => Number(r.authors_count || 0)))
      : Number(meta.authors_count || 0);

  const showStartDate =
    chartPoints.length > 0 && chartPoints[0].raw_date
      ? chartPoints[0].raw_date
      : meta.start_date
      ? new Date(meta.start_date).toISOString()
      : videoFirstDate;
  const showEndDate =
    chartPoints.length > 0 && chartPoints[chartPoints.length - 1].raw_date
      ? chartPoints[chartPoints.length - 1].raw_date
      : meta.scrape_date
      ? new Date(meta.scrape_date).toISOString()
      : showStartDate;

  // Superchats total in ARS for this broadcast window
  let superchatsTotal = 0;
  let superchatsCount = 0;
  try {
    const scRes: any = await executeQuery(
      isEternal
        ? `SELECT COALESCE(SUM(amount), 0)::numeric AS total_ars, COUNT(id)::int AS sc_count
           FROM public.superchats
           WHERE video_id = $1 AND (currency = 'ARS' OR currency ILIKE '%ARS%')
             AND created_at >= $2 AND created_at <= $3`
        : `SELECT COALESCE(SUM(amount), 0)::numeric AS total_ars, COUNT(id)::int AS sc_count
           FROM public.superchats
           WHERE video_id = $1 AND (currency = 'ARS' OR currency ILIKE '%ARS%')`,
      isEternal ? [videoId, showStartDate, showEndDate] : [videoId]
    );
    if (scRes.rows?.[0]) {
      superchatsTotal = Number(scRes.rows[0].total_ars || 0);
      superchatsCount = Number(scRes.rows[0].sc_count || 0);
    }
  } catch {
    // ignore
  }

  // For eternal channels with a titleHash, narrow ads_analysis to that program's time window if any match
  let scopedAdsAnalysis = adsAnalysis;
  if (isEternal && titleHash) {
    const videoFirstMs = parseDbTimestampMs(videoFirstDate);
    const pStartMs = parseDbTimestampMs(showStartDate);
    const pEndMs = parseDbTimestampMs(showEndDate);
    if (videoFirstMs !== null && pStartMs !== null && pEndMs !== null) {
      const offsetSec = Number(adsAnalysis.clock_offset_sec || 0);
      const inWindow = (adsAnalysis.ads || []).filter((ad) => {
        const adMs =
          videoFirstMs +
          (Number(ad.start_sec || 0) + offsetSec + Number(ad.clock_offset_sec || 0)) * 1000;
        return adMs >= pStartMs - 120_000 && adMs <= pEndMs + 120_000;
      });
      if (inWindow.length > 0) {
        const uniqueBrands = Array.from(
          new Set(inWindow.map((a) => a.brand).filter((b) => b && b !== 'Anunciante / PNT detectado'))
        );
        scopedAdsAnalysis = {
          ...adsAnalysis,
          ads: inWindow,
          total_ads: inWindow.length,
          unique_brands: uniqueBrands,
          total_ad_seconds: inWindow.reduce((s, a) => s + (Number(a.duration_sec) || 0), 0),
        };
      }
    }
  }

  const canonicalKey = buildBrandStreamKey(videoId, isEternal, resolvedTitle);

  return {
    stream_key: canonicalKey,
    stream: {
      video_id: videoId,
      channel_id: String(meta.channel_id),
      channel_name: String(meta.channel_name || meta.channel),
      channel: String(meta.channel),
      thumb: String(meta.thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
      tags: String(meta.tags || ''),
      subs: Number(meta.subs || 0),
      twitter: meta.twitter ? String(meta.twitter) : undefined,
      type: String(meta.type || 'standard'),
      video_title: resolvedTitle,
      live: String(meta.live || 'none'),
      concurrent_viewers: avgViewers,
      old_viewers: avgViewers,
      avg_viewers: avgViewers,
      max_users: peakViewers,
      max_viewers: peakViewers,
      current_likes: finalLikes,
      old_likes: finalLikes,
      max_likes: finalLikes,
      comments_count: finalComments,
      unique_commentators: finalAuthors,
      start_date: showStartDate,
      video_start_date: isEternal ? videoFirstDate : showStartDate,
      scrape_date: showEndDate,
      superchats_total: superchatsTotal,
      superchats_count: superchatsCount,
      data: chartPoints,
    },
    channel: {
      channel_id: String(meta.channel_id),
      channel: String(meta.channel),
      channel_name: String(meta.channel_name || meta.channel),
      thumb: String(meta.thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
      tags: String(meta.tags || ''),
      subs: Number(meta.subs || 0),
      type: String(meta.type || 'standard'),
    },
    ads_analysis: scopedAdsAnalysis,
    audience_timeline_points: isEternal && fullVideoPoints.length > 0 ? fullVideoPoints : chartPoints,
  };
}
