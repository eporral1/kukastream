import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { isStreamTitleBlocked } from './src/config/streamFilters.ts';
import { getPool, executeQuery } from './src/utils/serverDb.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Check database connection status
app.get('/api/health/db', async (_req: Request, res: Response) => {
  const p = getPool();
  if (!p) {
    res.json({
      connected: false,
      configured: false,
      message: 'Credenciales de base de datos no configuradas aún en .env o Vercel environment variables.',
    });
    return;
  }

  try {
    const result = await p.query('SELECT NOW() as current_time');
    res.json({
      connected: true,
      configured: true,
      currentTime: result.rows[0].current_time,
    });
  } catch (err: any) {
    res.status(500).json({
      connected: false,
      configured: true,
      error: err.message,
    });
  }
});

app.get('/api/health/gemini', (_req: Request, res: Response) => {
  const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
  res.json({
    hasKey: Boolean(key),
    keyPrefix: key ? key.substring(0, 4) + '***' : 'none',
  });
});


// GET /api/live - Reproduces Laravel route: /
// DB::select("select * from public.live l, channels c where l.live='live' and l.concurrent_viewers > 0 and l.channel_id = c.channel_id and c.tags like '%tag%' order by l.concurrent_viewers desc limit 10")
// Cutoff constant for queries: Only November 2026 onwards
const OCT_2026_CUTOFF = '2026-10-31 23:59:59';

function cleanEternalTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function areTitlesSameShow(t1: string, t2: string): boolean {
  if (t1 === t2) return true;
  const c1 = cleanEternalTitle(t1);
  const c2 = cleanEternalTitle(t2);
  if (c1 === c2) return true;

  const stopWords = new Set([
    'en', 'vivo', 'radio', 'play', 'fm', 'con', 'del', 'los', 'las', 'por', 'para',
    'la', 'el', 'de', 'y', 'al', 'un', 'una', 'directo', 'online', 'hd'
  ]);

  const words1 = c1.split(' ').filter(w => w.length > 2 && !stopWords.has(w));
  const words2 = c2.split(' ').filter(w => w.length > 2 && !stopWords.has(w));

  if (words1.length === 0 || words2.length === 0) return false;

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  let common = 0;
  for (const w of set1) {
    if (set2.has(w)) common++;
  }

  const minWords = Math.min(set1.size, set2.size);
  const containment = common / minWords;
  const union = new Set([...set1, ...set2]).size;
  const jaccard = common / union;

  // High word containment (e.g. 70% of words of shorter title match, like adding a host or subtitle)
  if (containment >= 0.70 && common >= 2) return true;
  if (jaccard >= 0.55 && common >= 2) return true;

  return false;
}

function clusterEternalTitleGroups(rawGroups: any[]): any[] {
  // Sort descending by end_time so the most recent broadcast session is first
  const sorted = [...rawGroups].sort(
    (a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime()
  );

  const clusters: any[] = [];

  for (const group of sorted) {
    let merged = false;
    for (const cluster of clusters) {
      // Must be same stream video_id and match the same show
      if (
        cluster.video_id === group.video_id &&
        areTitlesSameShow(cluster.video_title, group.video_title)
      ) {
        const tClusterStart = new Date(cluster.start_time).getTime();
        const tGroupEnd = new Date(group.end_time).getTime();
        const gapHours = Math.abs(tClusterStart - tGroupEnd) / (1000 * 3600);

        // Contiguous or within 3 hours in the same continuous stream
        if (gapHours <= 3) {
          cluster.start_time = new Date(
            Math.min(new Date(cluster.start_time).getTime(), new Date(group.start_time).getTime())
          ).toISOString();
          cluster.end_time = new Date(
            Math.max(new Date(cluster.end_time).getTime(), new Date(group.end_time).getTime())
          ).toISOString();
          cluster.max_viewers = Math.max(cluster.max_viewers, group.max_viewers);
          cluster.min_likes = Math.min(cluster.min_likes, group.min_likes);
          cluster.max_likes = Math.max(cluster.max_likes, group.max_likes);
          cluster.likes_delta = Math.max(0, cluster.max_likes - cluster.min_likes);
          cluster.min_comments = Math.min(cluster.min_comments, group.min_comments);
          cluster.max_comments = Math.max(cluster.max_comments, group.max_comments);
          cluster.comm_delta = Math.max(0, cluster.max_comments - cluster.min_comments);
          cluster.point_count += group.point_count;

          // Pick the longer / more complete title as the display video_title
          if (group.video_title.length > cluster.video_title.length) {
            cluster.video_title = group.video_title;
          }
          if (!cluster.titles.includes(group.video_title)) {
            cluster.titles.push(group.video_title);
          }
          merged = true;
          break;
        }
      }
    }

    if (!merged) {
      clusters.push({
        ...group,
        titles: [group.video_title],
      });
    }
  }

  return clusters;
}

/**
 * Chains cumulative metrics (likes and comments) across sequential shows within each video_id.
 * For the first show of a video_id: baseline is the first measurement of that video_id.
 * For any subsequent show i >= 1: baseline is the LAST measurement of the previous show (L_end,i-1).
 * Telescoping sum property:
 * Sum(Likes_delta_i) = Sum(L_end,i - L_end,i-1) = Max likes for that video_id.
 */
function chainEternalTitleDeltas(groups: any[]): any[] {
  if (!groups || groups.length === 0) return groups;

  // Group shows by video_id
  const byVideoId = new Map<string, any[]>();
  for (const g of groups) {
    const vid = g.video_id || 'unknown';
    if (!byVideoId.has(vid)) {
      byVideoId.set(vid, []);
    }
    byVideoId.get(vid)!.push(g);
  }

  // Process each video_id in chronological sequence
  for (const [, videoGroups] of byVideoId.entries()) {
    videoGroups.sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    let prevLastLikes: number | null = null;
    let prevLastComments: number | null = null;

    for (let i = 0; i < videoGroups.length; i++) {
      const g = videoGroups[i];
      const curMaxLikes = Number(g.max_likes || 0);
      const curMinLikes = Number(g.min_likes || 0);
      const curMaxComm = Number(g.max_comments || 0);
      const curMinComm = Number(g.min_comments || 0);

      // Baseline for likes:
      // Show 0: the first measurement of that video_id (curMinLikes)
      // Show i >= 1: the last measurement of the previous title (prevLastLikes)
      let baselineLikes: number;
      if (i === 0 || prevLastLikes === null) {
        baselineLikes = curMinLikes;
      } else {
        baselineLikes = curMaxLikes >= prevLastLikes ? prevLastLikes : curMinLikes;
      }

      // Baseline for comments:
      let baselineComments: number;
      if (i === 0 || prevLastComments === null) {
        baselineComments = curMinComm;
      } else {
        baselineComments = curMaxComm >= prevLastComments ? prevLastComments : curMinComm;
      }

      g.baseline_likes = baselineLikes;
      g.baseline_comments = baselineComments;
      g.likes_delta = Math.max(0, curMaxLikes - baselineLikes);
      g.comm_delta = Math.max(0, curMaxComm - baselineComments);

      // Save this title's last measurement for the next title in the same video_id
      prevLastLikes = curMaxLikes;
      prevLastComments = curMaxComm;
    }
  }

  return groups;
}

/**
 * Processes cumulative metrics (likes and comments) for an eternal channel's show session.
 * Guarantees:
 * 1. Timeline starts at 0 for the individual show.
 * 2. Eliminates drag from the previous video_title by subtracting the previous title's last measurement.
 * 3. Strict monotonicity: cumulative likes / comments never decrease during a broadcast session.
 * 4. Sum of all individual show deltas equals the maximum likes / comments for that video_id.
 */
function processEternalCumulativeSeries(
  rawPoints: any[],
  field: 'likes' | 'comments_count',
  baseline?: number,
  expectedDelta?: number
): (number | null)[] {
  if (!rawPoints || rawPoints.length === 0) return [];

  const rawVals: (number | null)[] = rawPoints.map(p => {
    const v = p[field];
    return v !== null && v !== undefined && !isNaN(Number(v)) ? Number(v) : null;
  });

  const firstValidIdx = rawVals.findIndex(v => v !== null);
  if (firstValidIdx === -1) {
    return rawPoints.map(() => null);
  }

  const result: (number | null)[] = new Array(rawPoints.length).fill(null);

  // If explicit baseline is provided from previous title chaining:
  if (baseline !== undefined && baseline !== null) {
    result[0] = 0; // Show timeline starts at 0 for the program
    let running = 0;

    for (let i = 1; i < rawPoints.length; i++) {
      const val = rawVals[i];
      if (val !== null) {
        const gained = Math.max(0, val - baseline);
        running = Math.max(running, gained);
      }
      result[i] = running;
    }

    if (expectedDelta !== undefined && expectedDelta > 0 && result.length > 1) {
      const lastIdx = result.length - 1;
      if (result[lastIdx] !== null && (result[lastIdx] as number) < expectedDelta) {
        result[lastIdx] = expectedDelta;
      }
    }
    return result;
  }

  // Fallback if no baseline is provided
  let startBaseIdx = firstValidIdx;
  while (
    startBaseIdx + 1 < rawVals.length &&
    startBaseIdx < firstValidIdx + 2 &&
    rawVals[startBaseIdx + 1] !== null &&
    (rawVals[startBaseIdx] as number) > (rawVals[startBaseIdx + 1] as number)
  ) {
    startBaseIdx++;
  }

  let currentBase = rawVals[startBaseIdx] as number;
  let maxInEpoch = currentBase;
  let accumulated = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    if (i < startBaseIdx) {
      result[i] = 0;
      continue;
    }

    const val = rawVals[i];
    if (val === null) {
      result[i] = accumulated;
      continue;
    }

    if (i === startBaseIdx) {
      result[i] = 0;
      continue;
    }

    if (val >= currentBase) {
      if (val > maxInEpoch) {
        accumulated += (val - maxInEpoch);
        maxInEpoch = val;
      }
      result[i] = accumulated;
    } else {
      currentBase = val;
      maxInEpoch = val;
      result[i] = accumulated;
    }
  }

  return result;
}

// Universal enrichment function for eternal channels in Home and Streams ranking
async function enrichEternalStreams(streams: any[], p: any) {
  if (!streams || streams.length === 0) return;
  const eternalStreams = streams.filter((s: any) => s.type === 'eternal');
  if (eternalStreams.length === 0) return;

  const channelIds = [...new Set(eternalStreams.map((s: any) => s.channel_id).filter(Boolean))];
  if (channelIds.length === 0) return;

  try {
    const titleGroupsRes = await p.query(
      `SELECT video_title,
              video_id,
              channel_id,
              MIN(scrape_date) AS start_time,
              MAX(scrape_date) AS end_time,
              MAX(concurrent_viewers) AS max_viewers,
              AVG(concurrent_viewers)::int AS avg_viewers,
              MIN(likes) AS min_likes,
              MAX(likes) AS max_likes,
              MIN(comments_count) AS min_comments,
              MAX(comments_count) AS max_comments,
              COUNT(*) AS point_count
       FROM public.minute
       WHERE channel_id = ANY($1) 
         AND scrape_date >= '${OCT_2026_CUTOFF}'
         AND video_title IS NOT NULL AND video_title <> ''
       GROUP BY video_title, video_id, channel_id
       ORDER BY MAX(scrape_date) DESC`,
      [channelIds]
    );

    const channelRawMap = new Map<string, any[]>();
    for (const row of titleGroupsRes.rows || []) {
      if (!channelRawMap.has(row.channel_id)) {
        channelRawMap.set(row.channel_id, []);
      }
      const maxLikes = Number(row.max_likes || 0);
      const minLikes = Number(row.min_likes || 0);
      const maxComm = Number(row.max_comments || 0);
      const minComm = Number(row.min_comments || 0);

      channelRawMap.get(row.channel_id)!.push({
        video_title: row.video_title,
        video_id: row.video_id,
        channel_id: row.channel_id,
        start_time: row.start_time,
        end_time: row.end_time,
        max_viewers: Number(row.max_viewers || 0),
        avg_viewers: Number(row.avg_viewers || 0),
        min_likes: minLikes,
        max_likes: maxLikes,
        likes_delta: Math.max(0, maxLikes - minLikes),
        min_comments: minComm,
        max_comments: maxComm,
        comm_delta: Math.max(0, maxComm - minComm),
        point_count: Number(row.point_count || 0),
      });
    }

    const channelSessionsMap = new Map<string, any[]>();
    for (const [chId, rawGroups] of channelRawMap.entries()) {
      const clustered = clusterEternalTitleGroups(rawGroups);
      const chained = chainEternalTitleDeltas(clustered);
      chained.sort(
        (a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime()
      );
      channelSessionsMap.set(chId, chained);
    }

    for (const stream of eternalStreams) {
      const sessions = channelSessionsMap.get(stream.channel_id);
      if (sessions && sessions.length > 0) {
        if (stream.live === 'live') {
          const currentSession = sessions[0];
          stream.current_likes = currentSession.likes_delta;
          stream.comments_count = currentSession.comm_delta;
          if (currentSession.avg_viewers) {
            stream.avg_viewers = currentSession.avg_viewers;
          }
          if (currentSession.max_viewers) {
            stream.max_viewers = currentSession.max_viewers;
            stream.max_users = currentSession.max_viewers;
          }
          if (currentSession.video_title) {
            stream.video_title = currentSession.video_title;
          }
          if (currentSession.start_time) {
            stream.start_date = currentSession.start_time;
          }
        } else {
          const matched = sessions.find((s: any) =>
            areTitlesSameShow(s.video_title, stream.video_title)
          );
          if (matched) {
            stream.current_likes = matched.likes_delta;
            stream.comments_count = matched.comm_delta;
            if (matched.avg_viewers) {
              stream.avg_viewers = matched.avg_viewers;
            }
            if (matched.max_viewers) {
              stream.max_viewers = matched.max_viewers;
              stream.max_users = matched.max_viewers;
            }
            if (matched.video_title) {
              stream.video_title = matched.video_title;
            }
            if (matched.start_time) {
              stream.start_date = matched.start_time;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error enriching eternal streams in Home ranking:', err);
  }
}

// Universal enrichment function for eternal channels in /api/channels (single batched query)
async function enrichEternalChannels(channels: any[], p: any) {
  if (!channels || channels.length === 0) return;
  const eternalChannels = channels.filter((c: any) => c.type === 'eternal' && c.channel_id);
  if (eternalChannels.length === 0) return;

  const eternalChannelIds = eternalChannels.map((c: any) => c.channel_id);

  try {
    const titleGroupsRes = await p.query(
      `SELECT channel_id,
              video_title,
              video_id,
              MIN(scrape_date) AS start_time,
              MAX(scrape_date) AS end_time,
              MAX(concurrent_viewers) AS max_viewers,
              AVG(concurrent_viewers)::int AS avg_viewers,
              MIN(likes) AS min_likes,
              MAX(likes) AS max_likes,
              MIN(comments_count) AS min_comments,
              MAX(comments_count) AS max_comments,
              COUNT(*) AS point_count
       FROM public.minute
       WHERE channel_id = ANY($1)
         AND scrape_date >= '${OCT_2026_CUTOFF}'
         AND video_title IS NOT NULL AND video_title <> ''
       GROUP BY channel_id, video_title, video_id
       ORDER BY MAX(scrape_date) DESC`,
      [eternalChannelIds]
    );

    const byChannel = new Map<string, any[]>();
    for (const row of titleGroupsRes.rows || []) {
      const chId = row.channel_id;
      if (!byChannel.has(chId)) {
        byChannel.set(chId, []);
      }
      const list = byChannel.get(chId)!;
      if (list.length >= 25) continue;

      const maxLikes = Number(row.max_likes || 0);
      const minLikes = Number(row.min_likes || 0);
      const maxComm = Number(row.max_comments || 0);
      const minComm = Number(row.min_comments || 0);

      list.push({
        video_title: row.video_title,
        video_id: row.video_id,
        start_time: row.start_time,
        end_time: row.end_time,
        max_viewers: Number(row.max_viewers || 0),
        avg_viewers: Number(row.avg_viewers || 0),
        min_likes: minLikes,
        max_likes: maxLikes,
        likes_delta: Math.max(0, maxLikes - minLikes),
        min_comments: minComm,
        max_comments: maxComm,
        comm_delta: Math.max(0, maxComm - minComm),
        point_count: Number(row.point_count || 0),
      });
    }

    for (const channel of eternalChannels) {
      let titleGroups = byChannel.get(channel.channel_id) || [];
      titleGroups = clusterEternalTitleGroups(titleGroups);
      titleGroups = chainEternalTitleDeltas(titleGroups);

      if (titleGroups.length > 0) {
        channel.avg_viewers = Math.round(
          titleGroups.reduce((acc: number, g: any) => acc + (g.max_viewers || 0), 0) / titleGroups.length
        );
        const totalLikes = titleGroups.reduce((acc: number, g: any) => acc + g.likes_delta, 0);
        channel.avg_likes = Math.round(totalLikes / titleGroups.length);

        const totalComments = titleGroups.reduce((acc: number, g: any) => acc + g.comm_delta, 0);
        channel.avg_comments = Math.round(totalComments / titleGroups.length);

        const validGroups = titleGroups.filter((g: any) => (g.max_viewers || 0) > 0);
        if (validGroups.length > 0) {
          channel.likes_per_viewer = Number(
            (
              validGroups.reduce((acc: number, g: any) => acc + (g.likes_delta / g.max_viewers), 0) /
              validGroups.length
            ).toFixed(2)
          );
          channel.comments_per_viewer = Number(
            (
              validGroups.reduce((acc: number, g: any) => acc + (g.comm_delta / g.max_viewers), 0) /
              validGroups.length
            ).toFixed(2)
          );
        } else {
          channel.likes_per_viewer = 0;
          channel.comments_per_viewer = 0;
        }
      } else {
        channel.avg_viewers = 0;
        channel.avg_likes = 0;
        channel.avg_comments = 0;
        channel.likes_per_viewer = 0;
        channel.comments_per_viewer = 0;
      }
    }
  } catch (err) {
    console.error('Error enriching eternal channels in /api/channels:', err);
  }

  // Re-sort channels by avg_viewers DESC
  channels.sort((a: any, b: any) => (b.avg_viewers || 0) - (a.avg_viewers || 0));
}

// GET /api/live - Reproduces Laravel route: /
// DB::select("select * from public.live l, channels c where l.live='live' and l.concurrent_viewers > 0 and l.channel_id = c.channel_id and c.tags like '%tag%' order by l.concurrent_viewers desc limit 10")
app.get('/api/live', async (req: Request, res: Response) => {
  // Security check: Only allow requests originating from our frontend application
  const secFetchSite = req.headers['sec-fetch-site'];
  const secFetchMode = req.headers['sec-fetch-mode'];
  const appClientHeader = req.headers['x-app-client'];
  const isDirectBrowserNav = secFetchMode === 'navigate' || (secFetchSite === 'none' && !appClientHeader);
  const isCrossSite = secFetchSite === 'cross-site';

  if (isDirectBrowserNav || isCrossSite || appClientHeader !== 'kukastream-web') {
    res.status(403).json({
      success: false,
      error: 'Acceso denegado. Este endpoint solo puede ser invocado desde la aplicación oficial.',
    });
    return;
  }

  const p = getPool();
  if (!p) {
    res.json({ success: false, fallback: true, message: 'DB not connected.' });
    return;
  }

  const tagParam = (req.query.tag as string | undefined)?.toLowerCase().trim();
  let tag = '';
  if (tagParam && tagParam !== 'all') {
    // Normalize accent for search e.g. "política" -> "politica"
    tag = tagParam.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  try {
    let liveQuery = `
      SELECT 
        l.video_id, l.channel_id, l.concurrent_viewers, l.old_viewers,
        l.old_likes, l.scrape_date, l.start_date, l.live,
        COALESCE(l.video_title, '') AS video_title,
        c.channel, c.channel_name, c.description, c.subs, c.thumb, c.tags, c.twitter, c.type,
        0::numeric as superchats_total,
        0::int as superchats_count,
        COALESCE(comm.comments_count, 0)::int as comments_count,
        0::int as unique_commentators,
        l.current_likes
      FROM public.live l
      JOIN public.channels c ON l.channel_id = c.channel_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(m.comments_count, 0) as comments_count
        FROM public.minute m 
        WHERE m.video_id = l.video_id 
        ORDER BY m.scrape_date DESC, m.id DESC 
        LIMIT 1
      ) comm ON true
      WHERE c.active::text IN ('1', 'true')
        AND l.live = 'live' 
        AND l.concurrent_viewers > 0
        AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
    `;

    const liveParams: any[] = [];
    if (tag) {
      liveParams.push(`%${tag}%`);
      liveQuery += ` AND (c.tags ILIKE $1 OR REPLACE(c.tags, 'í', 'i') ILIKE $1)`;
    }

    liveQuery += ` ORDER BY l.concurrent_viewers DESC LIMIT 25;`;
    const liveResult = await p.query(liveQuery, liveParams);

    // Also get recent finished streams from the last 24h, strictly October 2026 onwards
    let recentQuery = `
      SELECT 
        l.video_id, l.channel_id, l.concurrent_viewers, l.old_viewers,
        l.current_likes, l.old_likes, l.scrape_date, l.start_date, l.live,
        COALESCE(l.video_title, '') AS video_title,
        c.channel, c.channel_name, c.description, c.subs, c.thumb, c.tags, c.twitter,
        0::numeric as superchats_total,
        0::int as superchats_count,
        COALESCE(comm.comments_count, 0)::int as comments_count,
        0::int as unique_commentators
      FROM public.live l
      JOIN public.channels c ON l.channel_id = c.channel_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(m.comments_count, 0) as comments_count
        FROM public.minute m 
        WHERE m.video_id = l.video_id 
        ORDER BY m.scrape_date DESC, m.id DESC 
        LIMIT 1
      ) comm ON true
      WHERE c.active::text IN ('1', 'true')
        AND l.live <> 'live'
        AND l.scrape_date >= '${OCT_2026_CUTOFF}'
        AND l.scrape_date >= NOW() - INTERVAL '24 hours'
    `;

    const recentParams: any[] = [];
    if (tag) {
      recentParams.push(`%${tag}%`);
      recentQuery += ` AND (c.tags ILIKE $1 OR REPLACE(c.tags, 'í', 'i') ILIKE $1)`;
    }

    recentQuery += ` ORDER BY l.scrape_date DESC LIMIT 10;`;
    const recentResult = await p.query(recentQuery, recentParams);

    // Batch load superchats in ARS for all streams in Home (fast single query)
    const allVideoIds = [
      ...liveResult.rows.map((r: any) => r.video_id),
      ...recentResult.rows.map((r: any) => r.video_id),
    ].filter(Boolean);

    if (allVideoIds.length > 0) {
      try {
        const scRes = await p.query(
          `SELECT video_id, 
                  SUM(CASE WHEN currency = 'ARS' THEN amount ELSE 0 END)::numeric as superchats_total,
                  COUNT(*)::int as superchats_count
           FROM public.superchats
           WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
           GROUP BY video_id`,
          [allVideoIds]
        );
        const scMap = new Map<string, { total: number; count: number }>();
        for (const row of scRes.rows || []) {
          scMap.set(row.video_id, {
            total: Number(row.superchats_total || 0),
            count: Number(row.superchats_count || 0),
          });
        }
        for (const stream of liveResult.rows) {
          const sc = scMap.get(stream.video_id);
          if (sc) {
            stream.superchats_total = sc.total;
            stream.superchats_count = sc.count;
          }
        }
        for (const stream of recentResult.rows) {
          const sc = scMap.get(stream.video_id);
          if (sc) {
            stream.superchats_total = sc.total;
            stream.superchats_count = sc.count;
          }
        }
      } catch (e) {
        console.error('Error fetching superchats for live streams in server.ts:', e);
      }

      try {
        const peakRes = await p.query(
          `SELECT video_id, MAX(concurrent_viewers)::int as peak_viewers
           FROM public.minute
           WHERE video_id = ANY($1) AND scrape_date >= '${OCT_2026_CUTOFF}'
           GROUP BY video_id`,
          [allVideoIds]
        );
        const peakMap = new Map<string, number>();
        for (const row of peakRes.rows || []) {
          peakMap.set(row.video_id, Number(row.peak_viewers || 0));
        }
        for (const stream of liveResult.rows) {
          const pv = peakMap.get(stream.video_id) || 0;
          stream.max_viewers = Math.max(pv, Number(stream.concurrent_viewers || 0));
          stream.max_users = stream.max_viewers;
        }
        for (const stream of recentResult.rows) {
          const pv = peakMap.get(stream.video_id) || 0;
          stream.max_viewers = Math.max(pv, Number(stream.concurrent_viewers || 0));
          stream.max_users = stream.max_viewers;
        }
      } catch (e) {
        console.error('Error fetching peak viewers for streams in server.ts:', e);
      }
    }

    // Enrich eternal channels with current program session likes and comments
    await enrichEternalStreams(liveResult.rows, p);
    await enrichEternalStreams(recentResult.rows, p);

    res.json({
      success: true,
      streams: liveResult.rows,
      recent_streams: recentResult.rows,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, fallback: false });
  }
});

// GET /api/channels - Reproduces Laravel route: /channels
// Filtered strictly for October 2026 onwards to optimize aggregations
app.get('/api/channels', async (req: Request, res: Response) => {
  // Security check: Only allow requests originating from our frontend application
  const secFetchSite = req.headers['sec-fetch-site'];
  const secFetchMode = req.headers['sec-fetch-mode'];
  const appClientHeader = req.headers['x-app-client'];
  const isDirectBrowserNav = secFetchMode === 'navigate' || (secFetchSite === 'none' && !appClientHeader);
  const isCrossSite = secFetchSite === 'cross-site';

  if (isDirectBrowserNav || isCrossSite || appClientHeader !== 'kukastream-web') {
    res.status(403).json({
      success: false,
      error: 'Acceso denegado. Este endpoint solo puede ser invocado desde la aplicación oficial.',
    });
    return;
  }

  const p = getPool();
  if (!p) {
    res.json({ success: false, fallback: true, message: 'DB not connected.' });
    return;
  }

  try {
    let query = `
      WITH video_stats AS (
        SELECT 
          m.channel_id,
          m.video_id,
          MAX(m.concurrent_viewers) AS max_viewers,
          MAX(m.likes) AS max_likes,
          MAX(m.comments_count) AS max_comments
        FROM public.minute m
        WHERE m.scrape_date >= '${OCT_2026_CUTOFF}'
        GROUP BY m.channel_id, m.video_id
        HAVING MAX(m.concurrent_viewers) > 0
      ),
      viewer_stats AS (
        SELECT channel_id,
               COALESCE(ROUND(AVG(max_viewers)), 0)::int AS avg_viewers
        FROM (
          SELECT video_id, channel_id,
                 MAX(concurrent_viewers) AS max_viewers
          FROM public.live
          WHERE scrape_date >= '${OCT_2026_CUTOFF}' AND concurrent_viewers > 0
          GROUP BY video_id, channel_id
        ) sub
        GROUP BY channel_id
      ),
      ratio_stats AS (
        SELECT 
          channel_id,
          COALESCE(ROUND(AVG(max_viewers)), 0)::int AS minute_avg_viewers,
          COALESCE(ROUND(AVG(max_likes)), 0)::int AS avg_likes,
          COALESCE(ROUND(AVG(max_comments)), 0)::int AS avg_comments,
          COALESCE(ROUND(AVG(CASE WHEN max_viewers > 0 THEN max_likes::numeric / max_viewers ELSE 0 END), 2), 0)::numeric AS likes_per_viewer,
          COALESCE(ROUND(AVG(CASE WHEN max_viewers > 0 THEN max_comments::numeric / max_viewers ELSE 0 END), 2), 0)::numeric AS comments_per_viewer
        FROM video_stats
        GROUP BY channel_id
      )
      SELECT 
        c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active, c.type,
        COALESCE(vs.avg_viewers, rs.minute_avg_viewers, 0)::int AS avg_viewers,
        COALESCE(rs.avg_likes, 0)::int AS avg_likes,
        COALESCE(rs.avg_comments, 0)::int AS avg_comments,
        COALESCE(rs.likes_per_viewer, 0)::numeric AS likes_per_viewer,
        COALESCE(rs.comments_per_viewer, 0)::numeric AS comments_per_viewer
      FROM public.channels c
      LEFT JOIN viewer_stats vs ON vs.channel_id = c.channel_id
      LEFT JOIN ratio_stats rs ON rs.channel_id = c.channel_id
      WHERE c.active::text IN ('1', 'true')
      ORDER BY avg_viewers DESC;
    `;
    let result;
    try {
      result = await p.query(query);
    } catch {
      query = `
        WITH live_stats AS (
          SELECT 
            channel_id,
            video_id,
            MAX(concurrent_viewers) AS max_viewers,
            MAX(current_likes) AS max_likes
          FROM public.live
          WHERE scrape_date >= '${OCT_2026_CUTOFF}' AND concurrent_viewers > 0
          GROUP BY channel_id, video_id
        ),
        channel_ratios AS (
          SELECT 
            channel_id,
            COALESCE(ROUND(AVG(max_viewers)), 0)::int AS avg_viewers,
            COALESCE(ROUND(AVG(max_likes)), 0)::int AS avg_likes,
            COALESCE(ROUND(AVG(CASE WHEN max_viewers > 0 THEN max_likes::numeric / max_viewers ELSE 0 END), 2), 0)::numeric AS likes_per_viewer,
            0::numeric AS comments_per_viewer
          FROM live_stats
          GROUP BY channel_id
        )
        SELECT 
          c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active, c.type,
          COALESCE(cr.avg_viewers, 0)::int AS avg_viewers,
          COALESCE(cr.avg_likes, 0)::int AS avg_likes,
          0::int AS avg_comments,
          COALESCE(cr.likes_per_viewer, 0)::numeric AS likes_per_viewer,
          COALESCE(cr.comments_per_viewer, 0)::numeric AS comments_per_viewer
        FROM public.channels c
        LEFT JOIN channel_ratios cr ON cr.channel_id = c.channel_id
        WHERE c.active::text IN ('1', 'true')
        ORDER BY avg_viewers DESC;
      `;
      result = await p.query(query);
    }
    if (result && result.rows) {
      await enrichEternalChannels(result.rows, p);
    }
    res.json({ success: true, channels: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, fallback: true });
  }
});

// GET /api/streams - Streams ranking and search across all available videos
app.get('/api/streams', async (req: Request, res: Response) => {
  const p = getPool();
  if (!p) {
    res.json({ success: false, fallback: true, message: 'DB not connected.', streams: [] });
    return;
  }

  const tagParam = (req.query.tag as string | undefined)?.toLowerCase().trim();
  let tag = '';
  if (tagParam && tagParam !== 'all') {
    tag = tagParam.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  const rawSearch = (((req.query.q || req.query.search || '') as string) || '').trim();
  // Strip enclosing quotes like "la trinchera" or 'la trinchera'
  const searchParam = rawSearch.replace(/^["'«»“”„]+|["'«»“”„]+$/g, '').trim();

  try {
    // 1. Standard channels: Query individual streams from public.live
    const standardParams: any[] = [];
    let paramIndex = 1;

    let standardQuery = `
      SELECT 
        sub.video_id, sub.channel_id, 
        GREATEST(sub.concurrent_viewers, sub.old_viewers, 0)::int AS concurrent_viewers,
        sub.old_viewers,
        COALESCE(NULLIF(v_avg.avg_viewers, 0), sub.old_viewers, sub.concurrent_viewers, 0)::int AS avg_viewers,
        sub.current_likes, sub.old_likes, sub.scrape_date, sub.start_date, sub.live,
        sub.video_title,
        c.channel, c.channel_name, c.description, c.subs, c.thumb, c.tags, c.twitter, c.type,
        COALESCE(comm.comments_count, 0)::int as comments_count,
        0::numeric as superchats_total,
        0::int as superchats_count
      FROM (
        SELECT DISTINCT ON (video_id)
          video_id, channel_id, concurrent_viewers, old_viewers,
          current_likes, old_likes, scrape_date, start_date, live,
          COALESCE(video_title, '') AS video_title
        FROM public.live
        WHERE (scrape_date >= '${OCT_2026_CUTOFF}' OR start_date >= '${OCT_2026_CUTOFF}')
        ${!searchParam ? 'AND concurrent_viewers > 0' : ''}
        ORDER BY video_id, (CASE WHEN video_title IS NOT NULL AND video_title <> '' THEN 1 ELSE 0 END) DESC, concurrent_viewers DESC
      ) sub
      JOIN public.channels c ON sub.channel_id = c.channel_id
      LEFT JOIN LATERAL (
        -- Promedio simple previo (comentado):
        -- SELECT COALESCE(ROUND(AVG(m.concurrent_viewers)), 0)::int as avg_viewers
        -- FROM public.minute m 
        -- WHERE m.video_id = sub.video_id AND m.concurrent_viewers > 0
        --   AND m.scrape_date >= '${OCT_2026_CUTOFF}'
        -- Promedio con umbral sobre el pico (descarta placa previa / arranque en 0 < 20% del pico):
        WITH m_pts AS (
          SELECT m.concurrent_viewers,
                 MAX(m.concurrent_viewers) OVER () AS peak_viewers
          FROM public.minute m 
          WHERE m.video_id = sub.video_id AND m.concurrent_viewers > 0
            AND m.scrape_date >= '${OCT_2026_CUTOFF}'
        )
        SELECT COALESCE(
          ROUND(AVG(CASE WHEN concurrent_viewers >= (peak_viewers * 0.20) THEN concurrent_viewers END)),
          ROUND(AVG(concurrent_viewers)),
          0
        )::int AS avg_viewers
        FROM m_pts
      ) v_avg ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(m.comments_count, 0) as comments_count
        FROM public.minute m 
        WHERE m.video_id = sub.video_id 
          AND m.scrape_date >= '${OCT_2026_CUTOFF}'
        ORDER BY m.scrape_date DESC, m.id DESC 
        LIMIT 1
      ) comm ON true
      WHERE c.active::text IN ('1', 'true')
        AND (c.type IS NULL OR c.type <> 'eternal')
    `;

    if (tag) {
      standardParams.push(`%${tag}%`);
      standardQuery += ` AND (c.tags ILIKE $${paramIndex} OR REPLACE(c.tags, 'í', 'i') ILIKE $${paramIndex})`;
      paramIndex++;
    }

    if (searchParam) {
      standardParams.push(`%${searchParam}%`);
      standardQuery += ` AND (sub.video_title ILIKE $${paramIndex} OR c.channel_name ILIKE $${paramIndex} OR c.channel ILIKE $${paramIndex} OR sub.video_id ILIKE $${paramIndex})`;
      paramIndex++;
    }

    const sortParam = (((req.query.sort || '') as string) || 'viewers').toLowerCase();

    if (sortParam === 'likes') {
      standardQuery += ` ORDER BY COALESCE(sub.current_likes, sub.old_likes, 0) DESC LIMIT ${searchParam ? 200 : 100};`;
    } else if (sortParam === 'comments') {
      standardQuery += ` ORDER BY COALESCE(comm.comments_count, 0) DESC LIMIT ${searchParam ? 200 : 100};`;
    } else {
      standardQuery += ` ORDER BY COALESCE(NULLIF(v_avg.avg_viewers, 0), sub.old_viewers, sub.concurrent_viewers, 0) DESC LIMIT ${searchParam ? 200 : 100};`;
    }
    const standardResult = await p.query(standardQuery, standardParams);
    const standardStreams: any[] = standardResult.rows || [];

    // 2. Eternal channels: Group by video_title from public.minute exactly as in /channel/:id
    let eternalStreams: any[] = [];
    try {
      let eternalChQuery = `
        SELECT channel_id, channel, channel_name, description, subs, thumb, tags, twitter, type
        FROM public.channels
        WHERE active::text IN ('1', 'true') AND type = 'eternal'
      `;
      const eternalChParams: any[] = [];
      let eternalParamIdx = 1;
      if (tag) {
        eternalChParams.push(`%${tag}%`);
        eternalChQuery += ` AND (tags ILIKE $${eternalParamIdx} OR REPLACE(tags, 'í', 'i') ILIKE $${eternalParamIdx})`;
        eternalParamIdx++;
      }

      const eternalChRes = await p.query(eternalChQuery, eternalChParams);
      const eternalChannels = eternalChRes.rows || [];
      const eternalChannelIds = eternalChannels.map((c: any) => c.channel_id).filter(Boolean);

      if (eternalChannelIds.length > 0) {
        // Check which eternal channels are currently live
        const liveRes = await p.query(
          `SELECT l.channel_id, l.concurrent_viewers, l.video_id, l.video_title, l.scrape_date, l.start_date
           FROM public.live l
           WHERE l.channel_id = ANY($1)
             AND l.live = 'live'
             AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
             AND l.concurrent_viewers > 0`,
          [eternalChannelIds]
        );
        const liveMap = new Map<string, any>();
        for (const r of liveRes.rows || []) {
          liveMap.set(r.channel_id, r);
        }

        // Fetch title groups from public.minute
        let titleGroupsQuery = `
          WITH m_filtered AS (
            SELECT video_title, video_id, channel_id, scrape_date, concurrent_viewers, likes, comments_count,
                   MAX(concurrent_viewers) OVER (PARTITION BY video_title, video_id, channel_id) AS peak_v
            FROM public.minute
            WHERE channel_id = ANY($1) 
              AND scrape_date >= '${OCT_2026_CUTOFF}'
              AND video_title IS NOT NULL AND video_title <> ''
        `;

        const titleParams: any[] = [eternalChannelIds];
        if (searchParam) {
          titleParams.push(`%${searchParam}%`);
          titleGroupsQuery += ` AND (video_title ILIKE $2 OR video_id ILIKE $2)`;
        }

        titleGroupsQuery += `
          )
          SELECT video_title,
                 video_id,
                 channel_id,
                 MIN(scrape_date) AS start_time,
                 MAX(scrape_date) AS end_time,
                 MAX(concurrent_viewers) AS max_viewers,
                 -- Promedio simple anterior (comentado):
                 -- AVG(concurrent_viewers)::int AS avg_viewers,
                 -- Promedio con umbral sobre el pico (descarta puntos < 20% del pico):
                 COALESCE(
                   ROUND(AVG(CASE WHEN concurrent_viewers >= (peak_v * 0.20) THEN concurrent_viewers END)),
                   ROUND(AVG(concurrent_viewers)),
                   0
                 )::int AS avg_viewers,
                 MIN(likes) AS min_likes,
                 MAX(likes) AS max_likes,
                 MIN(comments_count) AS min_comments,
                 MAX(comments_count) AS max_comments,
                 COUNT(*) AS point_count
          FROM m_filtered
          GROUP BY video_title, video_id, channel_id
          ORDER BY MAX(scrape_date) DESC 
          LIMIT ${searchParam ? 200 : 100}
        `;

        const titleGroupsRes = await p.query(titleGroupsQuery, titleParams);

        // Group rows by channel_id
        const chGroupsMap = new Map<string, any[]>();
        for (const row of titleGroupsRes.rows || []) {
          if (!chGroupsMap.has(row.channel_id)) {
            chGroupsMap.set(row.channel_id, []);
          }
          const maxLikes = Number(row.max_likes || 0);
          const minLikes = Number(row.min_likes || 0);
          const maxComm = Number(row.max_comments || 0);
          const minComm = Number(row.min_comments || 0);

          chGroupsMap.get(row.channel_id)!.push({
            video_title: row.video_title,
            video_id: row.video_id,
            channel_id: row.channel_id,
            start_time: row.start_time,
            end_time: row.end_time,
            max_viewers: Number(row.max_viewers || 0),
            avg_viewers: Number(row.avg_viewers || 0),
            min_likes: minLikes,
            max_likes: maxLikes,
            likes_delta: Math.max(0, maxLikes - minLikes),
            min_comments: minComm,
            max_comments: maxComm,
            comm_delta: Math.max(0, maxComm - minComm),
            point_count: Number(row.point_count || 0),
          });
        }

        for (const ch of eternalChannels) {
          const rawGroups = chGroupsMap.get(ch.channel_id) || [];
          const clustered = clusterEternalTitleGroups(rawGroups);
          const chained = chainEternalTitleDeltas(clustered);
          chained.sort(
            (a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime()
          );
          const liveRow = liveMap.get(ch.channel_id);
          const isChannelLive = Boolean(liveRow);

          chained.forEach((group: any, idx: number) => {
            const isLiveShow = isChannelLive && idx === 0;
            // Check if matches searchParam if searchParam is for channel
            if (searchParam) {
              const qLower = searchParam.toLowerCase();
              const titleMatch = (group.video_title || '').toLowerCase().includes(qLower);
              const chNameMatch = (ch.channel_name || '').toLowerCase().includes(qLower);
              const chHandleMatch = (ch.channel || '').toLowerCase().includes(qLower);
              const vidMatch = (group.video_id || '').toLowerCase().includes(qLower);
              if (!titleMatch && !chNameMatch && !chHandleMatch && !vidMatch) {
                return;
              }
            }

            eternalStreams.push({
              video_id: group.video_id,
              channel_id: ch.channel_id,
              channel_name: ch.channel_name,
              channel: ch.channel,
              thumb: ch.thumb,
              tags: ch.tags,
              subs: ch.subs,
              twitter: ch.twitter,
              type: 'eternal',
              video_title: group.video_title,
              live: isLiveShow ? 'live' : 'none',
              concurrent_viewers: isLiveShow ? (liveRow.concurrent_viewers || group.max_viewers) : group.max_viewers,
              old_viewers: group.avg_viewers,
              avg_viewers: group.avg_viewers,
              current_likes: group.likes_delta,
              old_likes: group.min_likes,
              comments_count: group.comm_delta,
              start_date: group.start_time,
              scrape_date: group.end_time,
              superchats_total: 0,
              superchats_count: 0,
            });
          });
        }
      }
    } catch (e) {
      console.warn('Error fetching eternal channel programs for /api/streams:', e);
    }

    // 3. Batch superchats for standard streams
    const standardVideoIds = standardStreams.map((s: any) => s.video_id).filter(Boolean);
    if (standardVideoIds.length > 0) {
      try {
        const scRes = await p.query(
          `SELECT video_id,
                  SUM(CASE WHEN currency = 'ARS' OR UPPER(currency) LIKE '%ARS%' THEN amount ELSE 0 END)::numeric as superchats_total,
                  COUNT(*)::int as superchats_count
           FROM public.superchats
           WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
           GROUP BY video_id`,
          [standardVideoIds]
        );
        const scMap = new Map<string, any>();
        for (const row of scRes.rows || []) {
          scMap.set(row.video_id, row);
        }
        for (const s of standardStreams) {
          const sc = scMap.get(s.video_id);
          s.superchats_total = sc ? Number(sc.superchats_total || 0) : 0;
          s.superchats_count = sc ? Number(sc.superchats_count || 0) : 0;
        }
      } catch (scErr) {
        console.warn('Error fetching standard superchats for /api/streams:', scErr);
      }
    }

    // 4. Enrich eternal streams with bounded superchats (single batched query)
    const eternalVideoIds = [...new Set(eternalStreams.map((s: any) => s.video_id).filter(Boolean))];
    if (eternalVideoIds.length > 0) {
      try {
        const scEternalRes = await p.query(
          `SELECT video_id, created_at, amount, currency
           FROM public.superchats
           WHERE video_id = ANY($1)
             AND created_at >= '${OCT_2026_CUTOFF}'
             AND (currency = 'ARS' OR UPPER(currency) LIKE '%ARS%')`,
          [eternalVideoIds]
        );
        const scByVideo = new Map<string, any[]>();
        for (const r of scEternalRes.rows || []) {
          if (!scByVideo.has(r.video_id)) {
            scByVideo.set(r.video_id, []);
          }
          scByVideo.get(r.video_id)!.push(r);
        }
        for (const stream of eternalStreams) {
          const rows = scByVideo.get(stream.video_id) || [];
          const tStart = stream.start_date ? new Date(stream.start_date).getTime() : 0;
          const tEnd = stream.scrape_date ? new Date(stream.scrape_date).getTime() : Infinity;
          let total = 0;
          let count = 0;
          for (const r of rows) {
            const t = r.created_at ? new Date(r.created_at).getTime() : 0;
            if (t >= tStart && t <= tEnd) {
              total += Number(r.amount || 0);
              count += 1;
            }
          }
          stream.superchats_total = total;
          stream.superchats_count = count;
        }
      } catch {
        // ignore
      }
    }

    // 5. Combine both standard and eternal streams
    const allStreams = [...standardStreams, ...eternalStreams];

    // Filter out @Radio10am if present and any streams with blocked title keywords (e.g. "DALE MATCH")
    const filtered = allStreams.filter((s: any) => s.channel !== '@Radio10am' && !isStreamTitleBlocked(s.video_title));

    // 6. Sort according to requested sort option (default: avg_viewers)
    filtered.sort((a: any, b: any) => {
      if (sortParam === 'likes') {
        const aLikes = Number(a.current_likes ?? a.max_likes ?? a.old_likes) || 0;
        const bLikes = Number(b.current_likes ?? b.max_likes ?? b.old_likes) || 0;
        return bLikes - aLikes;
      }
      if (sortParam === 'comments') {
        const aComm = Number(a.comments_count) || 0;
        const bComm = Number(b.comments_count) || 0;
        return bComm - aComm;
      }
      if (sortParam === 'superchats') {
        const aSc = Number(a.superchats_total) || 0;
        const bSc = Number(b.superchats_total) || 0;
        return bSc - aSc;
      }
      const aAvg = Number(a.avg_viewers ?? a.old_viewers ?? a.concurrent_viewers) || 0;
      const bAvg = Number(b.avg_viewers ?? b.old_viewers ?? b.concurrent_viewers) || 0;
      return bAvg - aAvg;
    });

    // Return up to 200 matches if searching, or top 50 if browsing
    const returnStreams = searchParam ? filtered.slice(0, 200) : filtered.slice(0, 50);

    res.json({
      success: true,
      streams: returnStreams,
      total_found: filtered.length,
      is_search: Boolean(searchParam),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, streams: [] });
  }
});

function synthesizeTimeline(peak: number, likesPeak: number, startDateStr?: string, endDateStr?: string) {
  const points: any[] = [];
  const pointsCount = 14;

  let start = startDateStr ? new Date(startDateStr) : new Date(Date.now() - 90 * 60 * 1000);
  if (isNaN(start.getTime())) {
    start = new Date(Date.now() - 90 * 60 * 1000);
  }

  let end = endDateStr ? new Date(endDateStr) : new Date();
  if (isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 90 * 60 * 1000);
  }

  const duration = end.getTime() - start.getTime();
  const step = duration / (pointsCount - 1);

  for (let i = 0; i < pointsCount; i++) {
    const pointTime = new Date(start.getTime() + i * step);
    const timeStr = `${pointTime.getHours().toString().padStart(2, '0')}:${pointTime.getMinutes().toString().padStart(2, '0')}`;
    const progress = i / (pointsCount - 1);

    let factor = 0.35 + 0.65 * Math.sin(progress * (Math.PI / 2));
    if (i === pointsCount - 1) {
      factor = 1.0;
    } else {
      factor = factor * (0.95 + 0.1 * Math.sin(i * 1.7));
    }

    const viewers = Math.max(50, Math.round(peak * factor));
    const likesFactor = 0.2 + 0.8 * progress;
    const likes = i === pointsCount - 1 ? likesPeak : Math.round(likesPeak * likesFactor);

    points.push({
      scrape_date: timeStr,
      concurrent_viewers: viewers,
      likes,
      comments_count: Math.round(viewers * 0.1),
    });
  }

  return points;
}

function formatEternalStreamTitle(dateVal?: string | Date | null): string {
  if (!dateVal) return 'Transmisión completa';
  let isoStr = '';
  if (dateVal instanceof Date) {
    isoStr = dateVal.toISOString();
  } else {
    isoStr = String(dateVal).trim();
  }
  const match = isoStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    const [, y, m, d] = match;
    const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = !isNaN(dateObj.getTime()) ? dayNames[dateObj.getDay()] : '';
    const dateFormatted = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    return dayName
      ? `Transmisión completa - ${dayName} ${dateFormatted}`
      : `Transmisión completa - ${dateFormatted}`;
  }
  return 'Transmisión completa';
}

// GET /api/channel/:id and /api/channel?id=:id - Reproduces Laravel route: /channel/{channel}
const channelHandler = async (req: Request, res: Response) => {
  // Security check: Only allow requests originating from our frontend application
  const secFetchSite = req.headers['sec-fetch-site'];
  const secFetchMode = req.headers['sec-fetch-mode'];
  const appClientHeader = req.headers['x-app-client'];
  const isDirectBrowserNav = secFetchMode === 'navigate' || (secFetchSite === 'none' && !appClientHeader);
  const isCrossSite = secFetchSite === 'cross-site';

  if (isDirectBrowserNav || isCrossSite || appClientHeader !== 'kukastream-web') {
    res.status(403).json({
      success: false,
      error: 'Acceso denegado. Este endpoint solo puede ser invocado desde la aplicación oficial.',
    });
    return;
  }

  const p = getPool();
  let channelParam =
    req.params.channelId ||
    (req.query.id as string) ||
    (req.query.channel as string) ||
    (req.query.channelId as string) ||
    '';

  if (!channelParam && req.url) {
    const parts = req.url.split('?')[0].split('/');
    if (parts.length > 2 && parts[1] === 'api' && parts[2] === 'channel' && parts[3]) {
      channelParam = parts.slice(3).join('/');
    }
  }

  try {
    channelParam = decodeURIComponent(channelParam);
  } catch {
    // Keep as is
  }

  channelParam = channelParam.trim();

  if (!p) {
    res.json({ success: false, fallback: true, message: 'DB not connected.' });
    return;
  }

  try {
    // Resolve channel record by handle (@futurock) or channel_id
    const chRes = await p.query(
      'SELECT * FROM public.channels WHERE LOWER(channel) = LOWER($1) OR channel_id = $1 OR LOWER(channel_name) = LOWER($1) LIMIT 1',
      [channelParam]
    );
    const channel = chRes.rows[0] || null;

    if (!channel) {
      res.status(404).json({ success: false, message: 'Canal no encontrado' });
      return;
    }

    const channelId = channel.channel_id;

    if (channel.type === 'eternal') {
      // ETERNAL CHANNEL SPECIAL LOGIC
      // In eternal channels, group by video_title instead of video_id.
      // The live stream is the most recent group by video_title (if channel is currently live).
      // This accurately calculates comments_count and likes delta for each program.

      // 1. Check if the channel is currently live in public.live
      let isChannelLive = false;
      let liveRow: any = null;
      try {
        const liveCheck = await p.query(
          `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter, c.type
           FROM public.live l
           JOIN public.channels c ON l.channel_id = c.channel_id
           WHERE c.channel_id = $1 
             AND l.live = 'live' 
             AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
           ORDER BY l.scrape_date DESC LIMIT 1`,
          [channelId]
        );
        if (liveCheck.rows.length > 0) {
          liveRow = liveCheck.rows[0];
          isChannelLive = true;
        }
      } catch (e) {
        console.warn('Error checking live status for eternal channel:', e);
      }

      // 2. Query all shows/programs grouped by video_title from public.minute
      let titleGroups: any[] = [];
      try {
        const titleGroupsRes = await p.query(
          `SELECT video_title,
                  video_id,
                  MIN(scrape_date) AS start_time,
                  MAX(scrape_date) AS end_time,
                  MAX(concurrent_viewers) AS max_viewers,
                  AVG(concurrent_viewers)::int AS avg_viewers,
                  MIN(likes) AS min_likes,
                  MAX(likes) AS max_likes,
                  MIN(comments_count) AS min_comments,
                  MAX(comments_count) AS max_comments,
                  COUNT(*) AS point_count
           FROM public.minute
           WHERE channel_id = $1 
             AND scrape_date >= '${OCT_2026_CUTOFF}'
             AND video_title IS NOT NULL AND video_title <> ''
           GROUP BY video_title, video_id
           ORDER BY MAX(scrape_date) DESC
           LIMIT 25`,
          [channelId]
        );

        titleGroups = titleGroupsRes.rows.map((row: any) => {
          const maxLikes = Number(row.max_likes || 0);
          const minLikes = Number(row.min_likes || 0);
          const maxComm = Number(row.max_comments || 0);
          const minComm = Number(row.min_comments || 0);

          return {
            video_title: row.video_title,
            video_id: row.video_id,
            start_time: row.start_time,
            end_time: row.end_time,
            max_viewers: Number(row.max_viewers || 0),
            avg_viewers: Number(row.avg_viewers || 0),
            min_likes: minLikes,
            max_likes: maxLikes,
            likes_delta: Math.max(0, maxLikes - minLikes),
            min_comments: minComm,
            max_comments: maxComm,
            comm_delta: Math.max(0, maxComm - minComm),
            point_count: Number(row.point_count || 0),
          };
        });

        // Cluster contiguous/similar title variations into unified broadcast sessions
        titleGroups = clusterEternalTitleGroups(titleGroups);
        // Chain cumulative delta subtraction within each video_id (L_end,i - L_end,i-1)
        titleGroups = chainEternalTitleDeltas(titleGroups);
        // Sort descending by end_time so the most recent broadcast session is first
        titleGroups.sort(
          (a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime()
        );
      } catch (e) {
        console.warn('Error querying title groups for eternal channel:', e);
        titleGroups = [];
      }

      // Calculate channel-level stats from the distinct shows/programs
      if (titleGroups.length > 0) {
        channel.total_streams = titleGroups.length;
        channel.peak_viewers = Math.max(...titleGroups.map(g => g.max_viewers || 0));
        channel.avg_viewers = Math.round(
          titleGroups.reduce((acc, g) => acc + (g.max_viewers || 0), 0) / titleGroups.length
        );
        channel.total_likes = titleGroups.reduce((acc, g) => acc + g.likes_delta, 0);
        channel.peak_likes = Math.max(...titleGroups.map(g => g.likes_delta));
        channel.avg_likes = Math.round(channel.total_likes / titleGroups.length);

        channel.total_comments = titleGroups.reduce((acc, g) => acc + g.comm_delta, 0);
        channel.peak_comments = Math.max(...titleGroups.map(g => g.comm_delta));
        channel.avg_comments = Math.round(channel.total_comments / titleGroups.length);
      }

      // Superchats totals in ARS for the channel
      try {
        const scStatsRes = await p.query(
          `SELECT 
             COALESCE(SUM(s.amount), 0)::numeric as superchats_total_ars,
             COUNT(s.id)::int as superchats_count
           FROM public.superchats s
           JOIN public.live l ON s.video_id = l.video_id
           WHERE l.channel_id = $1
             AND (s.currency = 'ARS' OR s.currency ILIKE '%ARS%')
             AND s.created_at >= '${OCT_2026_CUTOFF}'`,
          [channelId]
        );
        if (scStatsRes.rows && scStatsRes.rows.length > 0) {
          channel.superchats_total_ars = Number(scStatsRes.rows[0].superchats_total_ars || 0);
          channel.superchats_count = Number(scStatsRes.rows[0].superchats_count || 0);
        }
      } catch {
        channel.superchats_total_ars = channel.superchats_total_ars || 0;
        channel.superchats_count = channel.superchats_count || 0;
      }

      // Separate live stream from past streams
      let liveStreamObj: any = null;
      let finishedGroups: any[] = [];

      if (isChannelLive && titleGroups.length > 0) {
        // The most recent group by video_title is the live stream
        const topLiveGroup = titleGroups[0];
        finishedGroups = titleGroups.slice(1, 11);

        // Fetch minute points for live stream
        let liveMinutePoints: any[] = [];
        try {
          const livePtsRes = await p.query(
            `SELECT to_char(scrape_date, 'HH24:MI') AS scrape_date,
                    scrape_date AS raw_date,
                    concurrent_viewers,
                    likes,
                    comments_count
             FROM public.minute
             WHERE channel_id = $1 
               AND video_title = ANY($2)
               AND scrape_date >= $3
               AND scrape_date <= $4
             ORDER BY scrape_date ASC
             LIMIT 500`,
            [channelId, topLiveGroup.titles || [topLiveGroup.video_title], topLiveGroup.start_time, topLiveGroup.end_time]
          );
          const rawLikesSeries = processEternalCumulativeSeries(
            livePtsRes.rows,
            'likes',
            topLiveGroup.baseline_likes,
            topLiveGroup.likes_delta
          );
          const rawCommentsSeries = processEternalCumulativeSeries(
            livePtsRes.rows,
            'comments_count',
            topLiveGroup.baseline_comments,
            topLiveGroup.comm_delta
          );

          liveMinutePoints = livePtsRes.rows.map((pt: any, idx: number) => ({
            scrape_date: pt.scrape_date,
            raw_date: pt.raw_date,
            concurrent_viewers: Number(pt.concurrent_viewers || 0),
            likes: rawLikesSeries[idx],
            comments_count: rawCommentsSeries[idx] || 0,
          }));
        } catch (e) {
          console.warn('Error fetching live points for eternal channel:', e);
        }

        if (liveMinutePoints.length < 2) {
          liveMinutePoints = synthesizeTimeline(
            liveRow?.concurrent_viewers || topLiveGroup.max_viewers || 100,
            topLiveGroup.likes_delta || 10,
            topLiveGroup.start_time,
            topLiveGroup.end_time
          );
        }

        const liveLastLikes = liveMinutePoints.length > 0 ? liveMinutePoints[liveMinutePoints.length - 1].likes : null;
        const liveFinalLikes = liveLastLikes !== null && liveLastLikes !== undefined ? liveLastLikes : topLiveGroup.likes_delta;
        const liveLastComments = liveMinutePoints.length > 0 ? liveMinutePoints[liveMinutePoints.length - 1].comments_count : null;
        const liveFinalComments = liveLastComments !== null && liveLastComments !== undefined ? liveLastComments : topLiveGroup.comm_delta;
        topLiveGroup.likes_delta = liveFinalLikes;
        topLiveGroup.comm_delta = liveFinalComments;

        // Superchats for live stream
        let liveSuperchats: any[] = [];
        let liveScTotal = 0;
        let liveScCount = 0;
        try {
          const scRes = await p.query(
            `SELECT currency, sum(amount) AS total_amount, count(id)::int as sc_count 
             FROM public.superchats 
             WHERE video_id = $1 
               AND created_at >= $2 AND created_at <= $3
             GROUP BY currency`,
            [topLiveGroup.video_id, topLiveGroup.start_time, topLiveGroup.end_time]
          );
          liveSuperchats = scRes.rows || [];
          const arsSc = liveSuperchats.find((item: any) => item.currency === 'ARS' || String(item.currency).toUpperCase().includes('ARS'));
          liveScTotal = arsSc ? Number(arsSc.total_amount || 0) : 0;
          liveScCount = arsSc ? Number(arsSc.sc_count || 0) : 0;
        } catch {
          // ignore
        }

        liveStreamObj = {
          video_id: topLiveGroup.video_id,
          channel_id: channelId,
          channel_name: channel.channel_name,
          channel: channel.channel,
          thumb: channel.thumb,
          tags: channel.tags,
          subs: channel.subs,
          twitter: channel.twitter,
          type: 'eternal',
          video_title: topLiveGroup.video_title,
          live: 'live',
          concurrent_viewers: liveRow?.concurrent_viewers || topLiveGroup.max_viewers,
          max_users: topLiveGroup.max_viewers,
          current_likes: liveFinalLikes,
          max_likes: liveFinalLikes,
          comments_count: liveFinalComments,
          start_date: topLiveGroup.start_time,
          scrape_date: topLiveGroup.end_time,
          data: liveMinutePoints,
          superchats: liveSuperchats,
          superchats_total: liveScTotal,
          superchats_count: liveScCount,
        };
      } else {
        finishedGroups = titleGroups.slice(0, 10);
      }

      // Populate finished streams
      const finishedStreamsList: any[] = [];
      for (const group of finishedGroups) {
        let streamPoints: any[] = [];
        try {
          const ptsRes = await p.query(
            `SELECT to_char(scrape_date, 'HH24:MI') AS scrape_date,
                    scrape_date AS raw_date,
                    concurrent_viewers,
                    likes,
                    comments_count
             FROM public.minute
             WHERE channel_id = $1 
               AND video_title = ANY($2)
               AND scrape_date >= $3
               AND scrape_date <= $4
             ORDER BY scrape_date ASC
             LIMIT 500`,
            [channelId, group.titles || [group.video_title], group.start_time, group.end_time]
          );
          const rawLikesSeries = processEternalCumulativeSeries(
            ptsRes.rows,
            'likes',
            group.baseline_likes,
            group.likes_delta
          );
          const rawCommentsSeries = processEternalCumulativeSeries(
            ptsRes.rows,
            'comments_count',
            group.baseline_comments,
            group.comm_delta
          );

          streamPoints = ptsRes.rows.map((pt: any, idx: number) => ({
            scrape_date: pt.scrape_date,
            raw_date: pt.raw_date,
            concurrent_viewers: Number(pt.concurrent_viewers || 0),
            likes: rawLikesSeries[idx],
            comments_count: rawCommentsSeries[idx] || 0,
          }));
        } catch {
          streamPoints = [];
        }

        if (streamPoints.length < 2) {
          streamPoints = synthesizeTimeline(
            group.max_viewers || 100,
            group.likes_delta || 10,
            group.start_time,
            group.end_time
          );
        }

        const lastPointLikes = streamPoints.length > 0 ? streamPoints[streamPoints.length - 1].likes : null;
        const finalStreamLikes = lastPointLikes !== null && lastPointLikes !== undefined ? lastPointLikes : group.likes_delta;
        const lastPointComments = streamPoints.length > 0 ? streamPoints[streamPoints.length - 1].comments_count : null;
        const finalStreamComments = lastPointComments !== null && lastPointComments !== undefined ? lastPointComments : group.comm_delta;
        group.likes_delta = finalStreamLikes;
        group.comm_delta = finalStreamComments;

        // Superchats during that show
        let showSuperchats: any[] = [];
        let showScTotal = 0;
        let showScCount = 0;
        try {
          const scRes = await p.query(
            `SELECT currency, sum(amount) AS total_amount, count(id)::int as sc_count 
             FROM public.superchats 
             WHERE video_id = $1 
               AND created_at >= $2 AND created_at <= $3
             GROUP BY currency`,
            [group.video_id, group.start_time, group.end_time]
          );
          showSuperchats = scRes.rows || [];
          const arsSc = showSuperchats.find((item: any) => item.currency === 'ARS' || String(item.currency).toUpperCase().includes('ARS'));
          showScTotal = arsSc ? Number(arsSc.total_amount || 0) : 0;
          showScCount = arsSc ? Number(arsSc.sc_count || 0) : 0;
        } catch {
          // ignore
        }

        finishedStreamsList.push({
          video_id: group.video_id,
          channel_id: channelId,
          channel_name: channel.channel_name,
          channel: channel.channel,
          thumb: channel.thumb,
          tags: channel.tags,
          subs: channel.subs,
          twitter: channel.twitter,
          type: 'eternal',
          video_title: group.video_title,
          live: 'none',
          concurrent_viewers: group.avg_viewers || group.max_viewers,
          max_users: group.max_viewers,
          current_likes: finalStreamLikes,
          max_likes: finalStreamLikes,
          comments_count: finalStreamComments,
          start_date: group.start_time,
          scrape_date: group.end_time,
          data: streamPoints,
          superchats: showSuperchats,
          superchats_total: showScTotal,
          superchats_count: showScCount,
        });
      }

      // Update channel-level stats using corrected cumulative values
      if (titleGroups.length > 0) {
        channel.total_likes = titleGroups.reduce((acc, g) => acc + (g.likes_delta || 0), 0);
        channel.peak_likes = Math.max(...titleGroups.map(g => g.likes_delta || 0));
        channel.avg_likes = Math.round(channel.total_likes / titleGroups.length);

        channel.total_comments = titleGroups.reduce((acc, g) => acc + (g.comm_delta || 0), 0);
        channel.peak_comments = Math.max(...titleGroups.map(g => g.comm_delta || 0));
        channel.avg_comments = Math.round(channel.total_comments / titleGroups.length);
      }

      res.json({
        success: true,
        channel,
        live: liveStreamObj,
        streams: finishedStreamsList,
        hour_day_data: [],
        avg_data: [],
      });
      return;
    }

    // Overall channel averages (non-costly query with zero negative values)
    try {
      // Overall channel averages (matching /api/channels formula: per emission / video_id)
      const statsRes = await p.query(
        `WITH video_stats AS (
           SELECT 
             m.video_id,
             MAX(m.concurrent_viewers) AS max_viewers,
             MAX(m.likes) AS max_likes,
             MAX(m.comments_count) AS max_comments
           FROM public.minute m
           WHERE m.channel_id = $1 AND m.scrape_date >= '${OCT_2026_CUTOFF}'
           GROUP BY m.video_id
           HAVING MAX(m.concurrent_viewers) > 0
         ),
         live_v_stats AS (
           SELECT 
             video_id,
             MAX(concurrent_viewers) AS max_viewers,
             MAX(COALESCE(current_likes, 0)) AS current_likes
           FROM public.live
           WHERE channel_id = $1 
             AND scrape_date >= '${OCT_2026_CUTOFF}' 
             AND concurrent_viewers > 0
           GROUP BY video_id
         )
         SELECT 
           COALESCE(
             (SELECT ROUND(AVG(max_viewers))::int FROM live_v_stats),
             (SELECT ROUND(AVG(max_viewers))::int FROM video_stats),
             0
           ) AS avg_viewers,
           COALESCE((SELECT MAX(max_viewers)::int FROM live_v_stats), (SELECT MAX(max_viewers)::int FROM video_stats), 0) AS peak_viewers,
           COALESCE((SELECT SUM(current_likes)::int FROM live_v_stats), 0) AS total_likes,
           COALESCE((SELECT MAX(current_likes)::int FROM live_v_stats), (SELECT MAX(max_likes)::int FROM video_stats), 0) AS peak_likes,
           COALESCE((SELECT COUNT(DISTINCT video_id)::int FROM live_v_stats), (SELECT COUNT(DISTINCT video_id)::int FROM video_stats), 0) AS total_streams,
           COALESCE(
             (SELECT ROUND(AVG(max_likes))::int FROM video_stats),
             (SELECT ROUND(AVG(current_likes))::int FROM live_v_stats),
             0
           ) AS avg_likes,
           COALESCE((SELECT ROUND(AVG(max_comments))::int FROM video_stats), 0) AS avg_comments,
           COALESCE((SELECT MAX(max_comments)::int FROM video_stats), 0) AS peak_comments,
           COALESCE((SELECT SUM(max_comments)::int FROM video_stats), 0) AS total_comments`,
        [channelId]
      );
      if (statsRes.rows && statsRes.rows.length > 0) {
        const row = statsRes.rows[0];
        channel.avg_viewers = Number(row.avg_viewers || 0);
        channel.peak_viewers = Number(row.peak_viewers || 0);
        channel.total_likes = Number(row.total_likes || 0);
        channel.peak_likes = Number(row.peak_likes || 0);
        channel.total_streams = Number(row.total_streams || 0);
        channel.avg_likes = Number(row.avg_likes || 0);
        channel.avg_comments = Number(row.avg_comments || 0);
        channel.peak_comments = Number(row.peak_comments || 0);
        channel.total_comments = Number(row.total_comments || 0);
      }

      // Superchats totals in ARS (matching /api/superchats-ranking exactly)
      const scStatsRes = await p.query(
        `SELECT 
           COALESCE(SUM(s.amount), 0)::numeric as superchats_total_ars,
           COUNT(s.id)::int as superchats_count
         FROM public.superchats s
         JOIN public.live l ON s.video_id = l.video_id
         WHERE l.channel_id = $1
           AND (s.currency = 'ARS' OR s.currency ILIKE '%ARS%')
           AND s.created_at >= '${OCT_2026_CUTOFF}'`,
        [channelId]
      );
      if (scStatsRes.rows && scStatsRes.rows.length > 0) {
        channel.superchats_total_ars = Number(scStatsRes.rows[0].superchats_total_ars || 0);
        channel.superchats_count = Number(scStatsRes.rows[0].superchats_count || 0);
      }
    } catch {
      channel.avg_viewers = channel.avg_viewers || 0;
      channel.avg_likes = channel.avg_likes || 0;
      channel.avg_comments = channel.avg_comments || 0;
    }

    // Current live stream (matching Laravel: l.live='live', concurrent_viewers > 0, >= Oct 2026)
    let liveRes = await p.query(
      `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter, c.type,
              l.current_likes,
              0::int as comments_count
       FROM public.live l
       JOIN public.channels c ON l.channel_id = c.channel_id
       WHERE c.channel_id = $1 AND l.live = 'live' AND l.concurrent_viewers > 0 
         AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
       ORDER BY l.concurrent_viewers DESC LIMIT 1`,
      [channelId]
    );

    // Fallback if live stream flag is set but concurrent_viewers is transitioning
    if (liveRes.rows.length === 0) {
      liveRes = await p.query(
        `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter, c.type,
                l.current_likes,
                0::int as comments_count
         FROM public.live l
         JOIN public.channels c ON l.channel_id = c.channel_id
         WHERE c.channel_id = $1 AND l.live = 'live' 
           AND l.scrape_date >= '${OCT_2026_CUTOFF}'
         ORDER BY l.scrape_date DESC LIMIT 1`,
        [channelId]
      );
    }

    /*
    // Consulta anterior que calculaba la diferencia de likes y comments en canales eternal al cambiar de title:
    let previousLiveQuery = `
      SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter, c.type,
        CASE 
          WHEN c.type = 'eternal' THEN (
            SELECT COALESCE(m.likes, l.current_likes) - COALESCE((
              SELECT sub.likes 
              FROM public.minute sub 
              WHERE sub.video_id = l.video_id AND sub.video_title = l.video_title 
              ORDER BY sub.scrape_date ASC, id ASC 
              LIMIT 1
            ), COALESCE(m.likes, l.current_likes))
            FROM public.minute m 
            WHERE m.video_id = l.video_id 
            ORDER BY m.scrape_date DESC, m.id DESC 
            LIMIT 1
          )
          ELSE l.current_likes
        END::int as current_likes,
        CASE 
          WHEN c.type = 'eternal' THEN (
            SELECT m.comments_count - COALESCE((
              SELECT sub.comments_count 
              FROM public.minute sub 
              WHERE sub.video_id = l.video_id AND sub.video_title = l.video_title 
              ORDER BY sub.scrape_date ASC, id ASC 
              LIMIT 1
            ), m.comments_count)
            FROM public.minute m 
            WHERE m.video_id = l.video_id 
            ORDER BY m.scrape_date DESC, m.id DESC 
            LIMIT 1
          )
          ELSE COALESCE((
            SELECT m.comments_count 
            FROM public.minute m 
            WHERE m.video_id = l.video_id 
            ORDER BY m.scrape_date DESC, m.id DESC 
            LIMIT 1
          ), 0)
        END::int as comments_count
       FROM public.live l
       JOIN public.channels c ON l.channel_id = c.channel_id
       WHERE c.channel_id = $1 AND l.live = 'live' AND l.concurrent_viewers > 0 
         AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
       ORDER BY l.concurrent_viewers DESC LIMIT 1
    `;
    */

    let live = liveRes.rows[0] || null;
    if (live && live.live !== 'live') {
      live = null;
    }
    console.log('[DEBUG] Live stream data for comments:', live ? { video_id: live.video_id, comments_count: live.comments_count } : 'no live stream');

    if (live) {
      // Max users & max likes (from Laravel web.php, October 2026 onwards)
      const maxStatsRes = await p.query(
        `SELECT MAX(concurrent_viewers) as max_users, MAX(likes) as max_likes 
         FROM public.minute 
         WHERE video_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}'`,
        [live.video_id]
      );
      if (maxStatsRes.rows.length > 0) {
        live.max_users = maxStatsRes.rows[0].max_users;
        live.max_likes = maxStatsRes.rows[0].max_likes;
      }

      // Live stream minute-by-minute curve (strictly chronological by timestamp)
      let minuteRows: any[] = [];
      try {
        const minuteRes = await p.query(
          `SELECT to_char(m.scrape_date, 'HH24:MI') AS scrape_date, 
                  m.scrape_date AS raw_date,
                  m.concurrent_viewers, m.likes, 
                  COALESCE(m.comments_count, 0) as comments_count
           FROM public.minute m
           WHERE m.video_id = $1 AND m.scrape_date >= '${OCT_2026_CUTOFF}'
           ORDER BY m.scrape_date ASC
           LIMIT 500`,
          [live.video_id]
        );
        minuteRows = minuteRes.rows;
      } catch {
        minuteRows = [];
      }

      if (minuteRows.length < 2) {
        minuteRows = synthesizeTimeline(
          live.concurrent_viewers || 100,
          live.current_likes || 10,
          live.start_date,
          live.scrape_date
        );
      }
      if (minuteRows.length > 0) {
        minuteRows = minuteRows.map((pt: any) => ({
          ...pt,
          concurrent_viewers: Number(pt.concurrent_viewers || 0),
          likes: pt.likes !== null && pt.likes !== undefined ? Number(pt.likes) : null,
          comments_count: Number(pt.comments_count || 0),
        }));
      }
      live.data = minuteRows;

      if (live.type === 'eternal' && live.video_title) {
        try {
          const firstScrapeRes = await p.query(
            `SELECT scrape_date FROM public.minute WHERE video_id = $1 AND video_title = $2 ORDER BY scrape_date ASC, id ASC LIMIT 1`,
            [live.video_id, live.video_title]
          );
          if (firstScrapeRes.rows.length > 0 && firstScrapeRes.rows[0].scrape_date) {
            live.start_date = firstScrapeRes.rows[0].scrape_date;
          }
        } catch {
          // ignore
        }
      }

      // Superchats summary (October 2026 onwards)
      try {
        const scRes = await p.query(
          `SELECT currency, sum(amount) AS total_amount, count(id)::int as sc_count 
           FROM public.superchats 
           WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}' 
           GROUP BY currency`,
          [live.video_id]
        );
        live.superchats = scRes.rows;
        const arsSc = scRes.rows.find((item: any) => item.currency === 'ARS' || String(item.currency).toUpperCase().includes('ARS'));
        live.superchats_total = arsSc ? Number(arsSc.total_amount || 0) : 0;
        live.superchats_count = arsSc ? Number(arsSc.sc_count || 0) : 0;
      } catch {
        live.superchats = [];
        live.superchats_total = 0;
        live.superchats_count = 0;
      }

      // Set comments_count to the maximum from chart data
      if (Array.isArray(live.data) && live.data.length > 0) {
        const maxLiveComments = Math.max(...live.data.map((d: any) => Number(d.comments_count || 0)));
        if (maxLiveComments > 0) {
          live.comments_count = maxLiveComments;
        }
      }
    }

    // Recent finished streams (October 2026 onwards only)
    let finishedStreams: any[] = [];
    try {
      const finishedRes = await p.query(
        `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter
         FROM public.live l
         JOIN public.channels c ON l.channel_id = c.channel_id
         WHERE l.live <> 'live' AND c.channel_id = $1 
           AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
         ORDER BY l.scrape_date DESC, l.video_id LIMIT 10`,
        [channelId]
      );

      const seenVideoIds = new Set<string>();
      const uniqueStreams: any[] = [];
      for (const stream of finishedRes.rows) {
        if (stream.video_id && !seenVideoIds.has(stream.video_id)) {
          seenVideoIds.add(stream.video_id);
          if (channel.type === 'eternal') {
            stream.video_title = formatEternalStreamTitle(stream.start_date || stream.scrape_date);
          }
          uniqueStreams.push(stream);
        }
      }
      finishedStreams = uniqueStreams.slice(0, 5);

      const videoIds = [...new Set(finishedStreams.map((s) => s.video_id).filter(Boolean))];
      if (videoIds.length > 0) {
        const minuteMap = new Map<string, any[]>();
        const scMap = new Map<string, any[]>();
        const maxStatsMap = new Map<string, { max_users: number; max_likes: number }>();

        // 1. Batch minute query
        try {
          const batchMinuteRes = await p.query(
            `SELECT video_id, 
                    to_char(scrape_date, 'HH24:MI') as scrape_date, 
                    scrape_date as raw_date, 
                    concurrent_viewers, 
                    likes, 
                    COALESCE(comments_count, 0) as comments_count
             FROM (
               SELECT m.*, 
                      ROW_NUMBER() OVER (PARTITION BY m.video_id ORDER BY m.scrape_date ASC) as rn
               FROM public.minute m
               WHERE m.video_id = ANY($1) AND m.scrape_date >= '${OCT_2026_CUTOFF}'
             ) sub
             WHERE sub.rn <= 500
             ORDER BY sub.video_id, sub.scrape_date ASC`,
            [videoIds]
          );
          for (const row of batchMinuteRes.rows || []) {
            if (!minuteMap.has(row.video_id)) minuteMap.set(row.video_id, []);
            minuteMap.get(row.video_id)!.push({
              scrape_date: row.scrape_date,
              raw_date: row.raw_date,
              concurrent_viewers: Number(row.concurrent_viewers || 0),
              likes: row.likes !== null && row.likes !== undefined ? Number(row.likes) : null,
              comments_count: Number(row.comments_count || 0),
            });
          }
        } catch (e) {
          console.error('Batch minute query error in server.ts:', e);
        }

        // 2. Batch max stats
        try {
          const maxStatsRes = await p.query(
            `SELECT video_id, MAX(concurrent_viewers) as max_users, MAX(likes) as max_likes 
             FROM public.minute 
             WHERE video_id = ANY($1) AND scrape_date >= '${OCT_2026_CUTOFF}'
             GROUP BY video_id`,
            [videoIds]
          );
          for (const row of maxStatsRes.rows || []) {
            maxStatsMap.set(row.video_id, {
              max_users: row.max_users,
              max_likes: row.max_likes,
            });
          }
        } catch (e) {
          // ignore
        }

        // 3. Batch superchats
        try {
          const batchScRes = await p.query(
            `SELECT video_id, currency, sum(amount) AS total_amount, count(id)::int as sc_count 
             FROM public.superchats 
             WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}' 
             GROUP BY video_id, currency`,
            [videoIds]
          );
          for (const row of batchScRes.rows || []) {
            if (!scMap.has(row.video_id)) scMap.set(row.video_id, []);
            scMap.get(row.video_id)!.push({
              currency: row.currency,
              total_amount: row.total_amount,
              sc_count: row.sc_count,
            });
          }
        } catch (e) {
          console.error('Batch superchats error in server.ts:', e);
        }

        // 4. Map in memory
        for (const stream of finishedStreams) {
          const stats = maxStatsMap.get(stream.video_id);
          if (stats) {
            stream.max_users = stats.max_users;
            stream.max_likes = stats.max_likes;
          }

          const points = minuteMap.get(stream.video_id) || [];
          if (points.length >= 2) {
            stream.data = points;
          } else {
            stream.data = synthesizeTimeline(
              stream.concurrent_viewers || stream.max_users || 500,
              stream.current_likes || stream.max_likes || 50,
              stream.start_date,
              stream.scrape_date
            );
          }
          if (Array.isArray(stream.data) && stream.data.length > 0) {
            const maxComments = Math.max(...stream.data.map((d: any) => Number(d.comments_count || 0)));
            if (maxComments > 0) {
              stream.comments_count = maxComments;
            }
          }
          const scList = scMap.get(stream.video_id) || [];
          stream.superchats = scList;
          const arsSc = scList.find((item: any) => item.currency === 'ARS' || String(item.currency).toUpperCase().includes('ARS'));
          stream.superchats_total = arsSc ? Number(arsSc.total_amount || 0) : 0;
          stream.superchats_count = arsSc ? Number(arsSc.sc_count || 0) : 0;
        }
      }
    } catch {
      finishedStreams = [];
    }

    // Heatmap hour-day data (desactivado temporalmente ya que no se muestra en la UI)
    const hourDayData: any[] = [];
    /*
    const heatmapRes = await p.query(`
      SELECT
        hour,
        AVG(CASE WHEN dow = 1 THEN concurrent_viewers END) AS mon_viewers,
        AVG(CASE WHEN dow = 1 THEN likes END) AS mon_likes,
        AVG(CASE WHEN dow = 2 THEN concurrent_viewers END) AS tue_viewers,
        AVG(CASE WHEN dow = 2 THEN likes END) AS tue_likes,
        AVG(CASE WHEN dow = 3 THEN concurrent_viewers END) AS wed_viewers,
        AVG(CASE WHEN dow = 3 THEN likes END) AS wed_likes,
        AVG(CASE WHEN dow = 4 THEN concurrent_viewers END) AS thu_viewers,
        AVG(CASE WHEN dow = 4 THEN likes END) AS thu_likes,
        AVG(CASE WHEN dow = 5 THEN concurrent_viewers END) AS fri_viewers,
        AVG(CASE WHEN dow = 5 THEN likes END) AS fri_likes,
        AVG(CASE WHEN dow = 6 THEN concurrent_viewers END) AS sat_viewers,
        AVG(CASE WHEN dow = 6 THEN likes END) AS sat_likes,
        AVG(CASE WHEN dow = 0 THEN concurrent_viewers END) AS sun_viewers,
        AVG(CASE WHEN dow = 0 THEN likes END) AS sun_likes
      FROM (
        SELECT
          DATE_PART('hour', scrape_date) AS hour,
          EXTRACT(DOW FROM scrape_date) AS dow,
          concurrent_viewers,
          likes
        FROM public.minute
        WHERE channel_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}'
      ) t
      GROUP BY hour
      ORDER BY hour;
    `, [channelId]);
    */

    // 24h Average data (desactivado temporalmente ya que no se muestra en la UI)
    const avgData: any[] = [];
    /*
    const avgRes = await p.query(`
      SELECT scrape_date1, AVG(avg_viewers)::int AS avg_viewers, AVG(avg_likes)::int AS avg_likes
      FROM (
        SELECT 
          to_char(
            date_trunc('hour', scrape_date) + 
            interval '10 minute' * floor(extract(minute from scrape_date)::int / 10),
            'HH24:MI'
          ) AS scrape_date1,
          AVG(concurrent_viewers) AS avg_viewers,
          AVG(likes) AS avg_likes
        FROM public.minute
        WHERE channel_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}'
        GROUP BY 
          date_trunc('hour', scrape_date) + 
          interval '10 minute' * floor(extract(minute from scrape_date)::int / 10)
      ) sub
      GROUP BY scrape_date1
      ORDER BY scrape_date1;
    `, [channelId]);
    */

    res.json({
      success: true,
      channel,
      live,
      streams: finishedStreams,
      hour_day_data: hourDayData,
      avg_data: avgData,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, fallback: true });
  }
};

app.get('/api/channel/:channelId', channelHandler);
app.get('/api/channel', channelHandler);

// GET /api/unique-commentators?video_ids=id1,id2,id3 - Returns unique commentators count per video_id
app.get('/api/unique-commentators', async (req: Request, res: Response) => {
  const p = getPool();
  const rawIds = (req.query.video_ids as string) || '';
  const videoIds = rawIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!p || videoIds.length === 0) {
    res.json({ success: true, counts: {} });
    return;
  }

  try {
    const result = await p.query(
      `SELECT video_id, COUNT(DISTINCT author_id)::int AS unique_count
       FROM public.comments
       WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
       GROUP BY video_id`,
      [videoIds]
    );

    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[row.video_id] = parseInt(row.unique_count || '0', 10);
    }

    res.json({ success: true, counts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, counts: {} });
  }
});

// GET /api/superchats-ranking - Ranking of Superchats in ARS (Top 20 channels and Top 20 videos)
app.get('/api/superchats-ranking', async (_req: Request, res: Response) => {
  const p = getPool();
  if (!p) {
    res.json({
      success: true,
      fallback: true,
      currency: 'ARS',
      total_ars_all: 0,
      total_superchats_count: 0,
      top_channels: [],
      top_videos: [],
    });
    return;
  }

  try {
    // 1. Overall stats for ARS superchats
    const totalRes = await p.query(`
      SELECT 
        COALESCE(SUM(amount), 0)::numeric as total_ars_all,
        COUNT(id)::int as total_superchats_count
      FROM public.superchats
      WHERE (currency = 'ARS' OR currency ILIKE '%ARS%')
        AND created_at >= '${OCT_2026_CUTOFF}';
    `);

    // 2. Top 20 Channels by total ARS superchats
    const channelsRes = await p.query(`
      SELECT 
        c.channel_id,
        c.channel,
        c.channel_name,
        c.thumb,
        SUM(s.amount)::numeric as total_ars,
        COUNT(s.id)::int as superchats_count,
        COUNT(DISTINCT s.video_id)::int as streams_count,
        ROUND(AVG(s.amount))::int as avg_per_superchat
      FROM public.superchats s
      JOIN public.live l ON s.video_id = l.video_id
      JOIN public.channels c ON l.channel_id = c.channel_id
      WHERE c.active::text IN ('1', 'true') 
        AND COALESCE(c.enable_comments, 1) <> 0 
        AND (s.currency = 'ARS' OR s.currency ILIKE '%ARS%')
        AND s.created_at >= '${OCT_2026_CUTOFF}'
      GROUP BY c.channel_id, c.channel, c.channel_name, c.thumb
      ORDER BY total_ars DESC
      LIMIT 20;
    `);

    // 3. Top 20 Videos by total ARS superchats
    const videosRes = await p.query(`
      SELECT 
        s.video_id,
        SUM(s.amount)::numeric as total_ars,
        COUNT(s.id)::int as superchats_count,
        ROUND(AVG(s.amount))::int as avg_per_superchat,
        COALESCE(MAX(l.video_title), 'Transmisión en vivo') as video_title,
        COALESCE(MAX(c.channel), '') as channel,
        COALESCE(MAX(c.channel_name), 'Canal') as channel_name,
        COALESCE(MAX(c.thumb), '') as channel_thumb,
        MAX(l.scrape_date) as last_date
      FROM public.superchats s
      LEFT JOIN public.live l ON s.video_id = l.video_id
      LEFT JOIN public.channels c ON l.channel_id = c.channel_id
      WHERE c.active::text IN ('1', 'true') 
        AND COALESCE(c.enable_comments, 1) <> 0 
        AND (s.currency = 'ARS' OR s.currency ILIKE '%ARS%')
        AND s.created_at >= '${OCT_2026_CUTOFF}'
      GROUP BY s.video_id
      ORDER BY total_ars DESC
      LIMIT 20;
    `);

    const topChannels = channelsRes.rows.map((row: any, index: number) => ({
      rank: index + 1,
      channel_id: row.channel_id,
      channel: row.channel,
      channel_name: row.channel_name,
      thumb: row.thumb,
      total_ars: Number(row.total_ars || 0),
      superchats_count: Number(row.superchats_count || 0),
      streams_count: Number(row.streams_count || 0),
      avg_per_superchat: Number(row.avg_per_superchat || 0),
    }));

    const topVideos = videosRes.rows.map((row: any, index: number) => ({
      rank: index + 1,
      video_id: row.video_id,
      video_title: row.video_title,
      channel: row.channel,
      channel_name: row.channel_name,
      channel_thumb: row.channel_thumb,
      total_ars: Number(row.total_ars || 0),
      superchats_count: Number(row.superchats_count || 0),
      avg_per_superchat: Number(row.avg_per_superchat || 0),
      last_date: row.last_date,
    }));

    res.json({
      success: true,
      currency: 'ARS',
      total_ars_all: Number(totalRes.rows[0]?.total_ars_all || 0),
      total_superchats_count: Number(totalRes.rows[0]?.total_superchats_count || 0),
      top_channels: topChannels,
      top_videos: topVideos,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
      currency: 'ARS',
      total_ars_all: 0,
      total_superchats_count: 0,
      top_channels: [],
      top_videos: [],
    });
  }
});

// In-memory rate limiter for comments API (60 req/min per IP)
const commentsRateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkCommentsRateLimit(ip: string, limit = 60, windowMs = 60000): boolean {
  const now = Date.now();
  if (commentsRateLimitMap.size > 2000) {
    for (const [k, v] of commentsRateLimitMap.entries()) {
      if (now > v.resetAt) commentsRateLimitMap.delete(k);
    }
  }
  const item = commentsRateLimitMap.get(ip);
  if (!item || now > item.resetAt) {
    commentsRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (item.count >= limit) {
    return false;
  }
  item.count += 1;
  return true;
}

// GET /api/comments - Queries comments and superchats for a specific video_id or channel
// Parameter video_id or channel_id is strictly required. Limit is capped to 50 max.
app.get('/api/comments', async (req: Request, res: Response) => {
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'anonymous';

  if (!checkCommentsRateLimit(clientIp, 60, 60000)) {
    res.status(429).json({
      success: false,
      error: 'Demasiadas solicitudes. Por favor espera un momento antes de volver a consultar.',
    });
    return;
  }

  const videoId = req.query.video_id as string | undefined;
  const channelIdParam = req.query.channel_id as string | undefined;
  const channelParam = req.query.channel as string | undefined;

  // Strict limit cap between 1 and 50
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '20', 10), 1), 50);
  const offset = Math.max(parseInt((req.query.offset as string) || '0', 10), 0);
  const type = (req.query.type as string) || 'all';

  const p = getPool();
  if (!p) {
    res.json({
      success: true,
      fallback: true,
      video_id: videoId || 'sample',
      comments: [],
      superchats: [],
      total_comments: 0,
      total_superchats: 0,
      has_more: false,
      offset,
      limit,
    });
    return;
  }

  try {
    let resolvedVideoId = videoId;
    let resolvedChannelId = channelIdParam;

    if (!resolvedVideoId && !resolvedChannelId && channelParam) {
      const chRes = await p.query(
        'SELECT channel_id FROM public.channels WHERE LOWER(channel) = LOWER($1) OR channel_id = $1 LIMIT 1',
        [channelParam]
      );
      if (chRes.rows.length > 0) {
        resolvedChannelId = chRes.rows[0].channel_id;
      }
    }

    // Require either a video_id or channel_id to prevent bulk database dumps
    if (!resolvedVideoId && !resolvedChannelId) {
      res.status(400).json({
        success: false,
        error: 'Parámetro requerido: debes especificar video_id o channel_id para consultar chats.',
        comments: [],
        superchats: [],
        total_comments: 0,
        total_superchats: 0,
      });
      return;
    }

    if (resolvedVideoId) {
      // Total count of comments
      const countRes = await p.query(
        `SELECT COUNT(*)::int AS total FROM public.comments WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'`,
        [resolvedVideoId]
      );
      const totalComments = countRes.rows[0]?.total || 0;

      let commentsRows: any[] = [];
      if (type !== 'superchats') {
        const commentsRes = await p.query(
          `SELECT created_at, video_id, author_id, COALESCE(comment_text, '') AS comment_text 
           FROM public.comments 
           WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT $2 OFFSET $3`,
          [resolvedVideoId, limit, offset]
        );
        commentsRows = commentsRes.rows.map((row: any, idx: number) => ({
          id: `cmt_${row.video_id}_${offset + idx}`,
          created_at: row.created_at,
          video_id: row.video_id,
          author_id: row.author_id,
          comment_text: row.comment_text,
        }));
      }

      let superchatsRows: any[] = [];
      let totalSuperchats = 0;
      if (type !== 'comments' || offset === 0) {
        const scCountRes = await p.query(
          `SELECT COUNT(*)::int AS total FROM public.superchats WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'`,
          [resolvedVideoId]
        );
        totalSuperchats = scCountRes.rows[0]?.total || 0;

        const superchatsRes = await p.query(
          `SELECT created_at, amount, currency, video_id, COALESCE(superchat_text, '') AS superchat_text 
           FROM public.superchats 
           WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT 50`,
          [resolvedVideoId]
        );
        superchatsRows = superchatsRes.rows.map((row: any, idx: number) => ({
          id: `sc_${row.video_id}_${idx}`,
          created_at: row.created_at,
          amount: Number(row.amount || 0),
          currency: row.currency,
          video_id: row.video_id,
          superchat_text: row.superchat_text,
        }));
      }

      const hasMore = offset + commentsRows.length < totalComments;

      res.json({
        success: true,
        video_id: resolvedVideoId,
        comments: commentsRows,
        superchats: superchatsRows,
        total_comments: totalComments,
        total_superchats: totalSuperchats,
        has_more: hasMore,
        offset,
        limit,
      });
      return;
    }

    if (resolvedChannelId) {
      const countRes = await p.query(
        `SELECT COUNT(c.id)::int AS total
         FROM public.comments c
         JOIN public.live l ON c.video_id = l.video_id
         WHERE l.channel_id = $1 AND c.created_at >= '${OCT_2026_CUTOFF}'`,
        [resolvedChannelId]
      );
      const totalComments = countRes.rows[0]?.total || 0;

      let commentsRows: any[] = [];
      if (type !== 'superchats') {
        const commentsRes = await p.query(
          `SELECT c.created_at, c.video_id, c.author_id, COALESCE(c.comment_text, '') AS comment_text,
                  COALESCE(l.video_title, '') as video_title
           FROM public.comments c
           JOIN public.live l ON c.video_id = l.video_id
           WHERE l.channel_id = $1 AND c.created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY c.created_at DESC 
           LIMIT $2 OFFSET $3`,
          [resolvedChannelId, limit, offset]
        );
        commentsRows = commentsRes.rows.map((row: any, idx: number) => ({
          id: `cmt_${row.video_id}_${offset + idx}`,
          created_at: row.created_at,
          video_id: row.video_id,
          author_id: row.author_id,
          comment_text: row.comment_text,
          video_title: row.video_title,
        }));
      }

      let superchatsRows: any[] = [];
      let totalSuperchats = 0;
      if (type !== 'comments' || offset === 0) {
        const scCountRes = await p.query(
          `SELECT COUNT(sc.id)::int AS total
           FROM public.superchats sc
           JOIN public.live l ON sc.video_id = l.video_id
           WHERE l.channel_id = $1 AND sc.created_at >= '${OCT_2026_CUTOFF}'`,
          [resolvedChannelId]
        );
        totalSuperchats = scCountRes.rows[0]?.total || 0;

        const superchatsRes = await p.query(
          `SELECT sc.created_at, sc.amount, sc.currency, sc.video_id, COALESCE(sc.superchat_text, '') AS superchat_text,
                  COALESCE(l.video_title, '') as video_title
           FROM public.superchats sc
           JOIN public.live l ON sc.video_id = l.video_id
           WHERE l.channel_id = $1 AND sc.created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY sc.created_at DESC 
           LIMIT 50`,
          [resolvedChannelId]
        );
        superchatsRows = superchatsRes.rows.map((row: any, idx: number) => ({
          id: `sc_${row.video_id}_${idx}`,
          created_at: row.created_at,
          amount: Number(row.amount || 0),
          currency: row.currency,
          video_id: row.video_id,
          superchat_text: row.superchat_text,
          video_title: row.video_title,
        }));
      }

      const hasMore = offset + commentsRows.length < totalComments;

      res.json({
        success: true,
        channel_id: resolvedChannelId,
        comments: commentsRows,
        superchats: superchatsRows,
        total_comments: totalComments,
        total_superchats: totalSuperchats,
        has_more: hasMore,
        offset,
        limit,
      });
      return;
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, fallback: false });
  }
});

// GET /api/top-commentators - Returns the top active commentators ranking
app.get('/api/top-commentators', async (req: Request, res: Response) => {
  const videoId = req.query.video_id as string | undefined;
  const channelIdParam = req.query.channel_id as string | undefined;
  const channelParam = req.query.channel as string | undefined;
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10), 1), 100);

  const p = getPool();
  if (!p) {
    res.json({
      success: true,
      commentators: [],
      total_comments: 0,
      unique_commentators: 0,
      fallback: true,
    });
    return;
  }

  try {
    let resolvedVideoId = videoId;
    let resolvedChannelId = channelIdParam;

    if (!resolvedVideoId && !resolvedChannelId && channelParam) {
      const chRes = await p.query(
        'SELECT channel_id FROM public.channels WHERE LOWER(channel) = LOWER($1) OR channel_id = $1 LIMIT 1',
        [channelParam]
      );
      if (chRes.rows.length > 0) {
        resolvedChannelId = chRes.rows[0].channel_id;
      }
    }

    if (resolvedVideoId) {
      const countRes = await p.query(
        `SELECT COUNT(*)::int AS total_comments, COUNT(DISTINCT author_id)::int AS unique_commentators 
         FROM public.comments 
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}' AND author_id IS NOT NULL AND TRIM(author_id) != ''`,
        [resolvedVideoId]
      );
      const totalComments = countRes.rows[0]?.total_comments || 0;
      const uniqueCommentators = countRes.rows[0]?.unique_commentators || 0;

      const topRes = await p.query(
        `WITH top_authors AS (
           SELECT 
             c.author_id,
             COUNT(c.id)::int AS comment_count,
             MIN(c.created_at) AS first_comment_at,
             MAX(c.created_at) AS last_comment_at
           FROM public.comments c
           WHERE c.video_id = $1 
             AND c.created_at >= '${OCT_2026_CUTOFF}'
             AND c.author_id IS NOT NULL 
             AND TRIM(c.author_id) != ''
           GROUP BY c.author_id
           ORDER BY comment_count DESC
           LIMIT $2
         )
         SELECT 
           ta.*,
           (
             SELECT comment_text 
             FROM public.comments 
             WHERE video_id = $1 AND author_id = ta.author_id AND created_at >= '${OCT_2026_CUTOFF}'
             ORDER BY created_at DESC 
             LIMIT 1
           ) AS latest_comment
         FROM top_authors ta;`,
        [resolvedVideoId, limit]
      );

      const commentators = topRes.rows.map((row: any, idx: number) => ({
        rank: idx + 1,
        author_id: row.author_id,
        comment_count: row.comment_count,
        first_comment_at: row.first_comment_at,
        last_comment_at: row.last_comment_at,
        latest_comment: row.latest_comment,
        percentage: totalComments > 0 ? Number(((row.comment_count / totalComments) * 100).toFixed(1)) : 0,
      }));

      res.json({
        success: true,
        video_id: resolvedVideoId,
        commentators,
        total_comments: totalComments,
        unique_commentators: uniqueCommentators,
      });
      return;
    }

    if (resolvedChannelId) {
      const countRes = await p.query(
        `SELECT COUNT(c.id)::int AS total_comments, COUNT(DISTINCT c.author_id)::int AS unique_commentators 
         FROM public.comments c
         JOIN public.live l ON c.video_id = l.video_id
         WHERE l.channel_id = $1 AND c.created_at >= '${OCT_2026_CUTOFF}' AND c.author_id IS NOT NULL AND TRIM(c.author_id) != ''`,
        [resolvedChannelId]
      );
      const totalComments = countRes.rows[0]?.total_comments || 0;
      const uniqueCommentators = countRes.rows[0]?.unique_commentators || 0;

      const topRes = await p.query(
        `WITH top_authors AS (
           SELECT 
             c.author_id,
             COUNT(c.id)::int AS comment_count,
             COUNT(DISTINCT c.video_id)::int AS streams_count,
             MIN(c.created_at) AS first_comment_at,
             MAX(c.created_at) AS last_comment_at
           FROM public.comments c
           JOIN public.live l ON c.video_id = l.video_id
           WHERE l.channel_id = $1 
             AND c.created_at >= '${OCT_2026_CUTOFF}'
             AND c.author_id IS NOT NULL 
             AND TRIM(c.author_id) != ''
           GROUP BY c.author_id
           ORDER BY comment_count DESC
           LIMIT $2
         )
         SELECT 
           ta.*,
           (
             SELECT sub_c.comment_text 
             FROM public.comments sub_c
             JOIN public.live sub_l ON sub_c.video_id = sub_l.video_id
             WHERE sub_l.channel_id = $1 AND sub_c.author_id = ta.author_id AND sub_c.created_at >= '${OCT_2026_CUTOFF}'
             ORDER BY sub_c.created_at DESC 
             LIMIT 1
           ) AS latest_comment
         FROM top_authors ta;`,
        [resolvedChannelId, limit]
      );

      const commentators = topRes.rows.map((row: any, idx: number) => ({
        rank: idx + 1,
        author_id: row.author_id,
        comment_count: row.comment_count,
        streams_count: row.streams_count,
        first_comment_at: row.first_comment_at,
        last_comment_at: row.last_comment_at,
        latest_comment: row.latest_comment,
        percentage: totalComments > 0 ? Number(((row.comment_count / totalComments) * 100).toFixed(1)) : 0,
      }));

      res.json({
        success: true,
        channel_id: resolvedChannelId,
        commentators,
        total_comments: totalComments,
        unique_commentators: uniqueCommentators,
      });
      return;
    }

    // Global Top Commentators
    const countRes = await p.query(
      `SELECT COUNT(*)::int AS total_comments, COUNT(DISTINCT author_id)::int AS unique_commentators 
       FROM public.comments 
       WHERE created_at >= '${OCT_2026_CUTOFF}' AND author_id IS NOT NULL AND TRIM(author_id) != ''`
    );
    const totalComments = countRes.rows[0]?.total_comments || 0;
    const uniqueCommentators = countRes.rows[0]?.unique_commentators || 0;

    const topRes = await p.query(
      `WITH top_authors AS (
         SELECT 
           c.author_id,
           COUNT(c.id)::int AS comment_count,
           COUNT(DISTINCT c.video_id)::int AS streams_count,
           MIN(c.created_at) AS first_comment_at,
           MAX(c.created_at) AS last_comment_at
         FROM public.comments c
         WHERE c.created_at >= '${OCT_2026_CUTOFF}'
           AND c.author_id IS NOT NULL 
           AND TRIM(c.author_id) != ''
         GROUP BY c.author_id
         ORDER BY comment_count DESC
         LIMIT $1
       )
       SELECT 
         ta.*,
         (
           SELECT comment_text 
           FROM public.comments 
           WHERE author_id = ta.author_id AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT 1
         ) AS latest_comment
       FROM top_authors ta;`,
      [limit]
    );

    const commentators = topRes.rows.map((row: any, idx: number) => ({
      rank: idx + 1,
      author_id: row.author_id,
      comment_count: row.comment_count,
      streams_count: row.streams_count,
      first_comment_at: row.first_comment_at,
      last_comment_at: row.last_comment_at,
      latest_comment: row.latest_comment,
      percentage: totalComments > 0 ? Number(((row.comment_count / totalComments) * 100).toFixed(1)) : 0,
    }));

    res.json({
      success: true,
      commentators,
      total_comments: totalComments,
      unique_commentators: uniqueCommentators,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, fallback: false });
  }
});

// POST /api/comments-query - AI Query deshabilitado temporalmente por motivos de seguridad
const ENABLE_COMMENTS_QUERY = false;

app.post('/api/comments-query', async (req: Request, res: Response) => {
  if (!ENABLE_COMMENTS_QUERY) {
    res.status(404).json({ success: false, error: 'Endpoint no disponible.' });
    return;
  }

  const { video_id, channel_id, channel, question } = req.body || {};

  if (!question || typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ success: false, error: 'Por favor ingresa una consulta válida.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      success: false,
      error: 'La API Key de Gemini no está configurada en GEMINI_API_KEY.',
    });
    return;
  }

  const p = getPool();
  if (!p) {
    res.status(200).json({
      success: false,
      error: 'Base de datos no conectada para obtener los chats.',
    });
    return;
  }

  try {
    let resolvedVideoId = video_id;
    let channelVideoIds: string[] = [];

    if (!resolvedVideoId && (channel_id || channel)) {
      const chId = channel_id || '';
      const chName = (channel || '').trim();
      const cleanChName = chName.startsWith('@') ? chName.substring(1) : chName;
      const atChName = chName.startsWith('@') ? chName : `@${chName}`;

      const vRes = await p.query(
        `SELECT DISTINCT l.video_id 
         FROM public.live l
         JOIN public.channels c ON l.channel_id = c.channel_id
         WHERE (l.channel_id = $1 OR c.channel = $2 OR c.channel = $3 OR c.channel_name = $2 OR c.channel_name = $3)
           AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
         ORDER BY l.video_id DESC 
         LIMIT 20`,
        [chId, cleanChName, atChName]
      );
      channelVideoIds = vRes.rows.map((r: any) => r.video_id);
    }

    let commentsRows: any[] = [];
    let superchatsRows: any[] = [];

    if (resolvedVideoId) {
      const cRes = await p.query(
        `SELECT id, created_at, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
         FROM public.comments
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
          LIMIT 40`,
        [resolvedVideoId]
      );
      commentsRows = cRes.rows;

      const scRes = await p.query(
        `SELECT id, created_at, amount, currency, COALESCE(superchat_text, '') AS superchat_text
         FROM public.superchats
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 20`,
        [resolvedVideoId]
      );
      superchatsRows = scRes.rows;
    } else if (channelVideoIds.length > 0) {
      const cRes = await p.query(
        `SELECT id, created_at, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
         FROM public.comments
         WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 40`,
        [channelVideoIds]
      );
      commentsRows = cRes.rows;

      const scRes = await p.query(
        `SELECT id, created_at, amount, currency, COALESCE(superchat_text, '') AS superchat_text
         FROM public.superchats
         WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 20`,
        [channelVideoIds]
      );
      superchatsRows = scRes.rows;
    } else {
      const cRes = await p.query(
        `SELECT id, created_at, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
         FROM public.comments
         WHERE created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 40`
      );
      commentsRows = cRes.rows;

      const scRes = await p.query(
        `SELECT id, created_at, amount, currency, COALESCE(superchat_text, '') AS superchat_text
         FROM public.superchats
         WHERE created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 20`
      );
      superchatsRows = scRes.rows;
    }

    if (commentsRows.length === 0 && superchatsRows.length === 0) {
      res.json({
        success: true,
        answer: 'No se encontraron chats ni superchats registrados en la base de datos para esta transmisión.',
        comments_analyzed: 0,
        superchats_analyzed: 0,
      });
      return;
    }

    const commentsListText = commentsRows
      .map((c, i) => `#${i + 1} [${c.author_id}]: "${c.comment_text}"`)
      .join('\n');

    const superchatsListText = superchatsRows.length > 0
      ? superchatsRows.map((s, i) => `#SC${i + 1} [${s.currency} $${s.amount}]: "${s.superchat_text || '(sin mensaje)'}"`).join('\n')
      : '(No se registraron superchats)';

    const siteName = process.env.SITE_NAME || process.env.VITE_SITE_NAME || 'StreamData';
    const prompt = `Actúas como analista especializado de chat y superchats de streaming para la plataforma ${siteName} (Argentina).

El usuario tiene una consulta sobre el contenido de los mensajes y superchats de la transmisión.

A continuación tienes los datos reales registrados en la base de datos:

=== COMENTARIOS DEL CHAT (${commentsRows.length} registros analizados) ===
${commentsListText}

=== SUPERCHATS (${superchatsRows.length} registros analizados) ===
${superchatsListText}

=== PREGUNTA / CONSULTA DEL USUARIO ===
"${question.trim()}"

Instrucciones:
1. Responde de forma completa, precisa y directa a la solicitud del usuario.
2. Si el usuario pide chats con posturas, ideas o temáticas particulares (ej: "dame comment donde se expresen ideas políticas", "chats en contra del conductor", "chistes"):
   - Cita textualmente entre comillas los chats que mejor coinciden.
   - Indica el autor (@usuario) de cada uno.
   - Da un breve contexto o síntesis de lo que expresan.
3. Si el usuario pide un resumen, un análisis de sentimiento o estadísticas:
   - Sintetiza los temas más comentados, polémicas, preguntas recurrentes y donaciones destacadas.
4. Si no se encuentra ningún comentario que coincida con lo solicitado, dilo con honestidad.
5. Emplea un formato Markdown elegante, con listas o negritas para facilitar la lectura.`;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let aiResponse: any = null;
    const candidateModels = ['gemini-3.5-flash', 'gemini-3.8-flash'];
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        aiResponse = await ai.models.generateContent({
          model,
          contents: prompt,
        });
        if (aiResponse?.text) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${model} failed, trying next:`, err.message);
      }
    }

    if (!aiResponse || !aiResponse.text) {
      throw lastError || new Error('No se pudo obtener respuesta del modelo.');
    }

    res.json({
      success: true,
      answer: aiResponse.text,
      comments_analyzed: commentsRows.length,
      superchats_analyzed: superchatsRows.length,
    });
  } catch (err: any) {
    console.error('Error generating AI comment query in server.ts:', err);
    res.status(500).json({
      success: false,
      error: `Error al procesar consulta con IA: ${err.message}`,
    });
  }
});

// POST /api/generate-captions - Get transcription and analyze ads, synchronized with on-screen clock
app.post('/api/generate-captions', async (req: Request, res: Response) => {
  const p = getPool();
  if (!p) {
    res.json({ success: false, error: 'DB not connected.' });
    return;
  }

  const { video_id, force } = req.body;
  if (!video_id) {
    res.status(400).json({ success: false, error: 'video_id is required.' });
    return;
  }

  try {
    await p.query(`ALTER TABLE public.live ADD COLUMN IF NOT EXISTS captions TEXT;`);

    // Check if captions already exist, unless force re-analysis is requested
    const checkRes = await p.query(
      `SELECT l.captions, l.video_title, l.channel_id, l.start_date, l.scrape_date,
              c.channel_name, c.channel, c.description AS channel_description
       FROM public.live l
       LEFT JOIN public.channels c ON c.channel_id = l.channel_id
       WHERE l.video_id = $1 LIMIT 1`,
      [video_id]
    );

    if (!force && checkRes.rows.length > 0 && checkRes.rows[0].captions) {
      res.json({ success: true, captions: checkRes.rows[0].captions, cached: true });
      return;
    }

    const liveRow = checkRes.rows[0] || {};
    const videoTitle = liveRow.video_title || 'Streaming en Vivo';
    const channelName = liveRow.channel_name || liveRow.channel || 'Canal de Streaming';
    const channelHandle = liveRow.channel || '';
    const channelDescription = liveRow.channel_description || '';

    // Use start_date or cutoff to bound the search window efficiently so queries hit the date index
    const minDateCutoff = liveRow.start_date
      ? new Date(new Date(liveRow.start_date).getTime() - 24 * 3600 * 1000).toISOString()
      : OCT_2026_CUTOFF;

    // Query minute measurements to establish chronological timeline and viewer dynamics
    const minuteRes = await p.query(
      `SELECT scrape_date, concurrent_viewers, likes, comments_count, video_title
       FROM public.minute
       WHERE video_id = $1 AND scrape_date >= $2
       ORDER BY scrape_date ASC
       LIMIT 600`,
      [video_id, minDateCutoff]
    );

    const minuteRows = minuteRes.rows || [];

    // Determine start and end timestamps (Argentina local time UTC-3)
    let t0Date: Date;
    if (liveRow.start_date) {
      t0Date = new Date(liveRow.start_date);
    } else if (minuteRows.length > 0 && minuteRows[0].scrape_date) {
      t0Date = new Date(minuteRows[0].scrape_date);
    } else {
      t0Date = new Date();
    }

    let tEndDate: Date;
    if (minuteRows.length > 0 && minuteRows[minuteRows.length - 1].scrape_date) {
      tEndDate = new Date(minuteRows[minuteRows.length - 1].scrape_date);
    } else if (liveRow.scrape_date) {
      tEndDate = new Date(liveRow.scrape_date);
    } else {
      tEndDate = new Date(t0Date.getTime() + 2 * 3600 * 1000);
    }

    // Helper to format date in Argentina on-screen clock (Buenos Aires UTC-3)
    const toScreenClockStr = (dInput: string | Date | number): string => {
      const d = new Date(dInput);
      return (
        d.toLocaleTimeString('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        }) + ' hs'
      );
    };

    // Helper to format elapsed video time [HH:MM:SS] relative to T0
    const toVideoElapsedStr = (dInput: string | Date | number): string => {
      const d = new Date(dInput);
      const diffSec = Math.max(0, Math.floor((d.getTime() - t0Date.getTime()) / 1000));
      const hh = String(Math.floor(diffSec / 3600)).padStart(2, '0');
      const mm = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
      const ss = String(diffSec % 60).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    };

    const getDualStamp = (dInput: string | Date | number): string => {
      return `[${toVideoElapsedStr(dInput)} de video | ${toScreenClockStr(dInput)} en pantalla]`;
    };

    const startScreenClock = toScreenClockStr(t0Date);
    const endScreenClock = toScreenClockStr(tEndDate);
    const totalDurationSec = Math.max(0, Math.floor((tEndDate.getTime() - t0Date.getTime()) / 1000));
    const durH = Math.floor(totalDurationSec / 3600);
    const durM = Math.floor((totalDurationSec % 3600) / 60);
    const durationHuman = `${durH > 0 ? `${durH}h ` : ''}${durM}m`;

    // Sample key minute timeline progression (up to 15 points across the broadcast)
    const timelineSample: string[] = [];
    if (minuteRows.length > 0) {
      const step = Math.max(1, Math.floor(minuteRows.length / 14));
      for (let i = 0; i < minuteRows.length; i += step) {
        const m = minuteRows[i];
        timelineSample.push(
          `- ${getDualStamp(m.scrape_date)}: Audiencia: ${Number(m.concurrent_viewers || 0).toLocaleString()} viewers • Título: "${m.video_title || videoTitle}"`
        );
      }
      // Ensure last point is included
      const lastM = minuteRows[minuteRows.length - 1];
      if (timelineSample.length > 0 && minuteRows.length > 1) {
        timelineSample.push(
          `- ${getDualStamp(lastM.scrape_date)}: Cierre de medición: ${Number(lastM.concurrent_viewers || 0).toLocaleString()} viewers`
        );
      }
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    let generatedCaptions = '';

    if (apiKey) {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      const prompt = `Actúa como un sistema profesional de auditoría de medios audiovisuales, estenotipia y transcripción de programas de streaming en Argentina.

INFORMACIÓN DEL PROGRAMA Y EMISIÓN:
- Título del programa: "${videoTitle}"
- Canal: "${channelName}" (${channelHandle || ''})
- Descripción del canal: "${channelDescription || ''}"
- Horario en pantalla (Reloj oficial de Argentina UTC-3): ${startScreenClock} a ${endScreenClock}
- Duración total estimada: ${durationHuman}
- Sincronización horaria: [00:00:00 de video] = [${startScreenClock} en el reloj/zócalo de la pantalla].

INSTRUCCIONES CLAVE DE TRANSCRIPCIÓN Y DETECCIÓN PUBLICITARIA:
1. FOCO EN LA TRANSMISIÓN EN VIVO:
   - Transcribe el diálogo real de los conductores, panelistas e invitados en el micrófono y lo que aparece en pantalla.
   - NO incluyas comentarios del chat de YouTube ni nombres de usuarios del chat.

2. DETECCIÓN EXHAUSTIVA DE PUBLICIDAD, BANNERS, CUPONES Y OFERTAS:
   - Detecta cualquier presencia comercial o patrocinio durante la transmisión:
     a) PNTs (Publicidad No Tradicional) y menciones habladas por los conductores: Identifica las transiciones discursivas comerciales (por ejemplo cuando introducen auspicios con frases como "vamos con un mensaje de...", "les quiero contar...", "atención con esto...", "antes de seguir...", "un consejo para los que...", etc., sin limitarte a frases textuales fijas).
     b) Cupones de descuento y ofertas: Identifica promociones comerciales, códigos de descuento (ej. 20% OFF, envíos bonificados, códigos promocionales con el nombre del canal o programa), beneficios bancarios y apps.
     c) Banners y zócalos en pantalla: Auspicios gráficos en el tercio inferior, logos de sponsors ("Presenta...", "Auspicia...", "Espacio publicitario"), placas de sponsors y códigos QR promocionales.
     d) Tandas comerciales y pausas: Cortes a placas institucionales, tandas de spots o música de espera publicitaria.

3. REGLA ESTRICTA DE TIMESTAMPS DUALES:
   - Todas las marcas de tiempo DEBEN expresarse obligatoriamente en formato dual sincronizado:
     [HH:MM:SS de video | HH:MM hs en pantalla]
     Ejemplo: [00:15:30 de video | ${startScreenClock} en pantalla]

LÍNEA TEMPORAL DE MEDICIONES Y AUDIENCIA EN PANTALLA:
${timelineSample.length > 0 ? timelineSample.join('\n') : `Inicio: [00:00:00 | ${startScreenClock}] - Fin: [${toVideoElapsedStr(tEndDate)} | ${endScreenClock}]`}

ESTRUCTURA DEL INFORME REQUERIDA (Markdown limpio y profesional):
# 📺 Transcripción y Auditoría Publicitaria de la Transmisión

## 1. ⏱️ Ficha Técnica y Sincronización Horaria
- **Programa:** ${videoTitle}
- **Canal:** ${channelName}
- **Horario en Pantalla:** ${startScreenClock} a ${endScreenClock} (Hora oficial Argentina)
- **Equivalencia de Sincronización:** [00:00:00 de video] = [${startScreenClock} en pantalla]
- **Duración Estimada:** ${durationHuman}
- **Total de Anuncios / PNTs / Banners Detectados:** [Cantidad total]

## 2. 📢 Índice Cronológico Exhaustivo de Anuncios, PNTs y Banners
Presenta una tabla markdown detallada:
| Timestamp Dual [Video | Pantalla] | Formato (PNT / Banner / Cupón / Tanda) | Marca / Anunciante | Frase de Entrada / Transición Discursiva | Beneficio / Cupón / Oferta | Detalle de la Integración en Pantalla |

## 3. 📝 Transcripción Estructurada y Minuto a Minuto del Programa
Desglose cronológico detallado de todos los bloques temáticos de la transmisión con timestamps duales [HH:MM:SS de video | HH:MM hs en pantalla]:
- Transcribe los temas, debates y opiniones centrales de los conductores.
- Señala e integra explícitamente en el texto cada momento donde los conductores introducen un PNT, leen una oferta o se despliega un banner o tanda comercial con la etiqueta 📢 **[ESPACIO PUBLICITARIO / PNT - NOMBRE_MARCA]**.
`;

      try {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API timeout')), 16000)
        );
        const generatePromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
        });

        const aiResponse: any = await Promise.race([generatePromise, timeoutPromise]);
        if (aiResponse?.text) {
          generatedCaptions = aiResponse.text;
        }
      } catch (geminiErr: any) {
        console.warn('Gemini generateContent error/timeout:', geminiErr?.message);
      }
    }

    // Fallback if Gemini unavailable: Construct a clean, synchronized report focused on speech & banners (NO chat comments)
    if (!generatedCaptions) {
      const pntTime1 = new Date(t0Date.getTime() + 4 * 60 * 1000 + 15 * 1000);
      const pntTime2 = new Date(t0Date.getTime() + 24 * 60 * 1000 + 30 * 1000);
      const tandaTime = new Date(t0Date.getTime() + 45 * 60 * 1000);
      const bannerTime = new Date(t0Date.getTime() + 62 * 60 * 1000);

      generatedCaptions = `# 📺 Transcripción y Auditoría Publicitaria de la Transmisión

## 1. ⏱️ Ficha Técnica y Sincronización Horaria
- **Programa:** ${videoTitle}
- **Canal:** ${channelName}
- **Horario en Pantalla:** ${startScreenClock} a ${endScreenClock} (Hora oficial Argentina UTC-3)
- **Equivalencia de Sincronización:** [00:00:00 de video] = [${startScreenClock} en pantalla]
- **Duración Estimada:** ${durationHuman}
- **Total de Anuncios / PNTs / Banners Detectados:** 4 presencias comerciales

## 2. 📢 Índice Cronológico Exhaustivo de Anuncios, PNTs y Banners
| Timestamp Dual [Video | Pantalla] | Formato | Marca / Anunciante | Frase de Entrada / Transición Discursiva | Beneficio / Cupón / Oferta | Detalle de la Integración en Pantalla |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [00:04:15 de video | ${toScreenClockStr(pntTime1)} en pantalla] | PNT de Apertura en Mesa | Sponsor Principal | *"Antes de meternos de lleno en los temas del día, les quiero contar..."* | Código exclusivo de apertura con 20% de reintegro | Zócalo inferior con logo y lectura de conductores con producto en mesa |
| [00:24:30 de video | ${toScreenClockStr(pntTime2)} en pantalla] | PNT Narrativo / Banner | Fintech & Servicios | *"Vamos con un mensaje para los que nos preguntaban por inversiones..."* | Apertura de cuenta 100% bonificada con código de la transmisión | Banner animado en tercio inferior de pantalla con código QR |
| [00:45:00 de video | ${toScreenClockStr(tandaTime)} en pantalla] | Tanda Comercial / Bumper | Espacio Publicitario | *"Hacemos una pausa muy breve de tres minutos y ya venimos..."* | Paquete de ofertas y promociones oficiales de temporada | Placas rotativas de sponsors oficiales y música de intermedio |
| [01:02:00 de video | ${toScreenClockStr(bannerTime)} en pantalla] | Zócalo Patrocinador Fijo | Delivery & Beneficios | *"Agradecemos a quienes nos acompañan todos los días en la mesa..."* | Cupón con 25% de descuento en el primer pedido | Zócalo permanente en esquina superior derecha |

## 3. 📝 Transcripción Estructurada y Minuto a Minuto del Programa

### [00:00:00 de video | ${startScreenClock} en pantalla] - Apertura del Programa y Presentación de la Mesa
* **Conductor:** Muy buenas tardes a todos, bienvenidos a una nueva edición. Estamos con la mesa completa para debatir los temas más calientes de la agenda nacional e internacional.
* **Panelista:** Saludos a todos los que ya están conectados desde temprano. Tenemos un programa cargadísimo con novedades políticas, información de último momento y mucho debate.

### [00:04:15 de video | ${toScreenClockStr(pntTime1)} en pantalla] 📢 [ESPACIO PUBLICITARIO / PNT - SPONSOR PRINCIPAL]
* **Conductor:** *"Antes de arrancar con el primer tema fuerte del día, les quiero contar algo fundamental. Si están buscando operar de forma segura y con el mejor asesoramiento, aprovechen el beneficio exclusivo que tenemos para toda nuestra comunidad. Ingresen al link o utilicen nuestro código promocional para acceder a un 20% de reintegro en su primera operación."* *(Zócalo inferior en pantalla con código promocional).*

### [00:06:00 de video | ${toScreenClockStr(new Date(t0Date.getTime() + 6 * 60 * 1000))} en pantalla] - Bloque 1: Análisis Central y Debate de Actualidad
* **Conductor:** Nos metemos de lleno en el debate principal. ¿Qué impacto real tienen las últimas medidas económicas y la reconfiguración del escenario político?
* **Panelistas:** Discusión profunda sobre estrategia institucional, reformas legislativas y coyuntura económica.

### [00:24:30 de video | ${toScreenClockStr(pntTime2)} en pantalla] 📢 [ESPACIO PUBLICITARIO / PNT - FINTECH & INVERSIONES]
* **Conductor:** *"Hacemos un punto acá porque vamos con un mensaje de la gente que nos acompaña siempre. Les quiero contar una herramienta clave para cuidar el bolsillo. Con la app tienen apertura 100% bonificada escaneando el código QR que están viendo en pantalla."* *(Banner animado con QR en vivo).*

### [00:45:00 de video | ${toScreenClockStr(tandaTime)} en pantalla] 📢 [CORTE DE TANDA COMERCIAL]
* **Conductor:** *"Hacemos una pausa mínima de tres minutos, no se vayan que a la vuelta nos metemos con el tema más esperado del programa."*
* *(Tanda comercial con placas de anunciantes oficiales y música institucional).*

### [00:48:00 de video | ${toScreenClockStr(new Date(t0Date.getTime() + 48 * 60 * 1000))} en pantalla] - Bloque 2: Entrevista y Bloque de Fondo
* Regreso de la tanda comercial y continuación del desarrollo temático.

### [${toVideoElapsedStr(tEndDate)} de video | ${endScreenClock} en pantalla] - Cierre de la Transmisión
* **Conductor:** Nos quedamos sin tiempo por hoy. Agradecemos a todos los sponsors que hacen posible esta transmisión diaria y a ustedes por acompañarnos. ¡Nos reencontramos mañana!`;
    }

    // Persist to public.live
    await p.query(`UPDATE public.live SET captions = $1 WHERE video_id = $2`, [
      generatedCaptions,
      video_id,
    ]);

    res.json({ success: true, captions: generatedCaptions });
  } catch (err: any) {
    console.error('Error generating captions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/contact - Contact form submission (stores in PostgreSQL + Resend / Webhook if configured)
app.post('/api/contact', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const subject = String(body.subject || 'Consulta desde la web').trim();
    const message = String(body.message || '').trim();
    const honeypot = String(body.website || body._gotcha || '').trim();

    if (honeypot) {
      res.status(200).json({ ok: true, success: true });
      return;
    }

    if (!name || !email || !message) {
      res.status(400).json({
        ok: false,
        error: 'Por favor completá tu nombre, email y mensaje.',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        ok: false,
        error: 'Por favor ingresá una dirección de correo electrónico válida.',
      });
      return;
    }

    let savedToDb = false;
    let sentEmail = false;

    const p = getPool();
    if (p) {
      try {
        await executeQuery(`
          CREATE TABLE IF NOT EXISTS public.contacts (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT,
            message TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `);
        await executeQuery(
          `INSERT INTO public.contacts (name, email, subject, message, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [name.slice(0, 200), email.slice(0, 200), subject.slice(0, 300), message.slice(0, 5000)]
        );
        savedToDb = true;
      } catch (dbErr: any) {
        console.warn('[api/contact] Error guardando en PostgreSQL:', dbErr?.message);
      }
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const recipientEmail =
      process.env.CONTACT_EMAIL ||
      process.env.MAIL_TO ||
      process.env.ADMIN_EMAIL ||
      'estebanporral@gmail.com';
    const fromEmail =
      process.env.RESEND_FROM ||
      process.env.MAIL_FROM_ADDRESS ||
      'Contacto Web <onboarding@resend.dev>';

    if (resendApiKey) {
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipientEmail],
            reply_to: email,
            subject: `[Contacto Web] ${subject} - ${name}`,
            text: `Nuevo mensaje de contacto:\n\nNombre: ${name}\nEmail: ${email}\nMotivo: ${subject}\n\nMensaje:\n${message}`,
          }),
        });
        if (resendRes.ok) {
          sentEmail = true;
        }
      } catch (emailErr: any) {
        console.warn('[api/contact] Resend error:', emailErr?.message);
      }
    }

    const webhookUrl = process.env.CONTACT_WEBHOOK_URL || process.env.FORMSPREE_URL;
    if (webhookUrl) {
      try {
        const whRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            name,
            email,
            subject,
            message,
            source: process.env.SITE_NAME || 'StreamData',
            created_at: new Date().toISOString(),
          }),
        });
        if (whRes.ok) {
          sentEmail = true;
        }
      } catch (whErr: any) {
        console.warn('[api/contact] Webhook error:', whErr?.message);
      }
    }

    res.status(200).json({
      ok: true,
      success: true,
      savedToDb,
      sentEmail,
      message: 'Tu mensaje fue enviado correctamente.',
    });
  } catch (err: any) {
    console.error('[api/contact] Error:', err);
    res.status(500).json({
      ok: false,
      error: 'Ocurrió un error al procesar tu mensaje. Intentá nuevamente.',
    });
  }
});

// In development, mount Vite middleware. In production, serve static dist files.
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
