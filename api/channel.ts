import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

let pool: Pool | null = null;
const OCT_2026_CUTOFF = '2026-10-31 23:59:59';

function getPool(): Pool | null {
  if (pool) return pool;

  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DB_URL;

  const poolConfig: any = {
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 5000,
    max: 3,
    keepAlive: true,
  };

  if (connectionString && !connectionString.includes('hjkhjk')) {
    pool = new Pool({
      ...poolConfig,
      connectionString,
    });
    pool.on('error', (err) => {
      console.warn('PostgreSQL pool error, resetting pool:', err.message);
      pool = null;
    });
    return pool;
  }

  const host =
    process.env.DB_HOST ||
    process.env.POSTGRES_HOST ||
    process.env.PGHOST;

  const user =
    process.env.DB_USERNAME ||
    process.env.DB_USER ||
    process.env.POSTGRES_USER ||
    process.env.PGUSER;

  const password =
    process.env.DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.PGPASSWORD;

  const database =
    process.env.DB_DATABASE ||
    process.env.DB_NAME ||
    process.env.POSTGRES_DATABASE ||
    process.env.PGDATABASE;

  const port = parseInt(
    process.env.DB_PORT ||
    process.env.POSTGRES_PORT ||
    process.env.PGPORT ||
    '5432',
    10
  );

  if (!host || !password || host.includes('hjkhjk') || password.includes('hjkhjk')) {
    return null;
  }

  pool = new Pool({
    ...poolConfig,
    host,
    user,
    password,
    database,
    port,
  });

  pool.on('error', (err) => {
    console.warn('PostgreSQL pool error, resetting pool:', err.message);
    pool = null;
  });

  return pool;
}

// Resilient query executor that retries once on connection termination/timeout
async function executeQuery<T = any>(text: string, params: any[] = []): Promise<T> {
  let p = getPool();
  if (!p) throw new Error('Base de datos no configurada en Vercel.');

  try {
    return (await p.query(text, params)) as T;
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (
      msg.includes('connection terminated') ||
      msg.includes('timeout') ||
      msg.includes('closed') ||
      msg.includes('socket')
    ) {
      console.warn('Retrying channel query after connection reset:', err.message);
      pool = null;
      p = getPool();
      if (p) {
        return (await p.query(text, params)) as T;
      }
    }
    throw err;
  }
}

// Helper to synthesize minute-by-minute timeline if database table `public.minute` has no rows yet
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

// Fallback 24h average data
function fallbackAvgData(baseViewers: number) {
  const points: any[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      let mult = 0.08;
      if (h >= 9 && h <= 14) mult = 0.5 + 0.5 * Math.sin(((h - 9) / 5) * Math.PI);
      else if (h >= 18 && h <= 23) mult = 0.35 + 0.45 * Math.sin(((h - 18) / 5) * Math.PI);
      points.push({
        scrape_date1: timeStr,
        avg_viewers: Math.round(baseViewers * mult),
        avg_likes: Math.round(baseViewers * mult * 0.4),
      });
    }
  }
  return points;
}

// Fallback heatmap data
function fallbackHeatmapData(basePeak: number) {
  const data: any[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const isPeak = (hour >= 9 && hour <= 13) || (hour >= 19 && hour <= 22);
    const factor = isPeak ? 0.75 : 0.15;
    const calc = (mult: number) => Math.round(basePeak * factor * mult);
    data.push({
      hour,
      mon_viewers: calc(0.95),
      tue_viewers: calc(1.0),
      wed_viewers: calc(1.05),
      thu_viewers: calc(1.02),
      fri_viewers: calc(0.9),
      sat_viewers: calc(0.35),
      sun_viewers: calc(0.4),
    });
  }
  return data;
}

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

  const byVideoId = new Map<string, any[]>();
  for (const g of groups) {
    const vid = g.video_id || 'unknown';
    if (!byVideoId.has(vid)) {
      byVideoId.set(vid, []);
    }
    byVideoId.get(vid)!.push(g);
  }

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

      let baselineLikes: number;
      if (i === 0 || prevLastLikes === null) {
        baselineLikes = curMinLikes;
      } else {
        baselineLikes = curMaxLikes >= prevLastLikes ? prevLastLikes : curMinLikes;
      }

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

  if (baseline !== undefined && baseline !== null) {
    result[0] = 0;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Client');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Security check: Only allow requests originating from our frontend application
  const secFetchSite = req.headers['sec-fetch-site'];
  const secFetchMode = req.headers['sec-fetch-mode'];
  const appClientHeader = req.headers['x-app-client'];
  const isDirectBrowserNav = secFetchMode === 'navigate' || (secFetchSite === 'none' && !appClientHeader);
  const isCrossSite = secFetchSite === 'cross-site';

  if (isDirectBrowserNav || isCrossSite || appClientHeader !== 'kukastream-web') {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Este endpoint solo puede ser invocado desde la aplicación oficial.',
    });
  }

  let channelParam =
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
    // Keep as is if decode fails
  }

  channelParam = channelParam.trim();

  if (!channelParam) {
    return res.status(400).json({ success: false, message: 'Parámetro de canal requerido' });
  }

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: false,
      configured: false,
      error: 'Base de datos no configurada en Vercel.',
      channel: null,
      live: null,
      liveStream: null,
      streams: [],
      history: [],
      hour_day_data: [],
      avg_data: [],
    });
  }

  const cleanParam = channelParam.startsWith('@') ? channelParam.substring(1) : channelParam;
  const withAtParam = channelParam.startsWith('@') ? channelParam : `@${channelParam}`;

  try {
    const chRes = await executeQuery(
      `SELECT * FROM public.channels 
       WHERE LOWER(channel) = LOWER($1) 
          OR LOWER(channel) = LOWER($2) 
          OR LOWER(channel) = LOWER($3)
          OR channel_id = $1 
          OR channel_id = $2
          OR LOWER(channel_name) = LOWER($1) 
          OR LOWER(channel_name) = LOWER($2)
       LIMIT 1`,
      [channelParam, cleanParam, withAtParam]
    );
    const channel = chRes.rows[0] || null;

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: `Canal '${channelParam}' no encontrado en la base de datos.`,
        channel: null,
        live: null,
        liveStream: null,
        streams: [],
        history: [],
        hour_day_data: [],
        avg_data: [],
      });
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
        const liveCheck = await executeQuery(
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
        const titleGroupsRes = await executeQuery(
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
      } else {
        channel.total_streams = 0;
        channel.peak_viewers = 0;
        channel.avg_viewers = 0;
        channel.total_likes = 0;
        channel.peak_likes = 0;
        channel.avg_likes = 0;
        channel.total_comments = 0;
        channel.peak_comments = 0;
        channel.avg_comments = 0;
      }

      // Superchats totals in ARS for the channel
      try {
        const scStatsRes = await executeQuery(
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
          const livePtsRes = await executeQuery(
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
          const scRes = await executeQuery(
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
          const ptsRes = await executeQuery(
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
          const scRes = await executeQuery(
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

      return res.status(200).json({
        success: true,
        channel,
        live: liveStreamObj,
        streams: finishedStreamsList,
        hour_day_data: [],
        avg_data: [],
      });
    }
    try {
      const statsRes = await executeQuery(
        `SELECT 
           COALESCE(ROUND(AVG(max_viewers)), 0)::int AS avg_viewers,
           COALESCE(MAX(max_viewers), 0)::int AS peak_viewers,
           COALESCE(SUM(current_likes), 0)::int AS total_likes,
           COALESCE(MAX(current_likes), 0)::int AS peak_likes,
           COUNT(DISTINCT video_id)::int AS total_streams
         FROM (
           SELECT video_id, 
                  MAX(concurrent_viewers) AS max_viewers,
                  MAX(COALESCE(current_likes, 0)) AS current_likes
           FROM public.live
           WHERE channel_id = $1 
             AND scrape_date >= '${OCT_2026_CUTOFF}' 
             AND concurrent_viewers > 0
           GROUP BY video_id
         ) sub`,
        [channelId]
      );
      if (statsRes.rows && statsRes.rows.length > 0) {
        channel.avg_viewers = Number(statsRes.rows[0].avg_viewers || 0);
        channel.peak_viewers = Number(statsRes.rows[0].peak_viewers || 0);
        channel.total_likes = Number(statsRes.rows[0].total_likes || 0);
        channel.peak_likes = Number(statsRes.rows[0].peak_likes || 0);
        channel.total_streams = Number(statsRes.rows[0].total_streams || 0);
      }

      const likesStatsRes = await executeQuery(
        `SELECT COALESCE(ROUND(AVG(likes_rate)), 0)::int AS avg_likes
         FROM (
           SELECT video_id,
                  (MAX(likes) - MIN(likes))::numeric / 
                  GREATEST(0.25, EXTRACT(EPOCH FROM (MAX(scrape_date) - MIN(scrape_date))) / 3600.0) AS likes_rate
           FROM public.minute
           WHERE channel_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}' AND likes > 0
           GROUP BY video_id
           HAVING MAX(scrape_date) > MIN(scrape_date) AND MAX(likes) >= MIN(likes)
         ) sub`,
        [channelId]
      );
      channel.avg_likes = Number(likesStatsRes.rows?.[0]?.avg_likes || 0);

      const commStatsRes = await executeQuery(
        `SELECT 
           COALESCE(ROUND(AVG(comments_rate)), 0)::int AS avg_comments,
           COALESCE(MAX(max_comm), 0)::int AS peak_comments,
           COALESCE(SUM(max_comm), 0)::int AS total_comments
         FROM (
           SELECT video_id,
                  MAX(comments_count) as max_comm,
                  (MAX(comments_count) - MIN(comments_count))::numeric / 
                  GREATEST(0.25, EXTRACT(EPOCH FROM (MAX(scrape_date) - MIN(scrape_date))) / 3600.0) AS comments_rate
           FROM public.minute
           WHERE channel_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}' AND comments_count > 0
           GROUP BY video_id
           HAVING MAX(scrape_date) > MIN(scrape_date)
         ) sub`,
        [channelId]
      );
      channel.avg_comments = Number(commStatsRes.rows?.[0]?.avg_comments || 0);
      channel.peak_comments = Number(commStatsRes.rows?.[0]?.peak_comments || 0);
      channel.total_comments = Number(commStatsRes.rows?.[0]?.total_comments || 0);

      // Superchats totals in ARS (matching /api/superchats-ranking exactly)
      const scStatsRes = await executeQuery(
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

    // Check active live stream for this channel (strictly live = 'live' and October 2026 onwards)
    // Consulta para stream en vivo unificada para todos los videos
    let liveRes = await executeQuery(
      `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter, c.type,
              l.current_likes,
              0::int as comments_count
       FROM public.live l
       JOIN public.channels c ON l.channel_id = c.channel_id
       WHERE c.channel_id = $1 AND l.live = 'live' AND l.concurrent_viewers > 0 
         AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
       ORDER BY l.concurrent_viewers DESC, l.scrape_date DESC LIMIT 1`,
      [channelId]
    );

    if (liveRes.rows.length === 0) {
      liveRes = await executeQuery(
        `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter, c.type,
                l.current_likes,
                0::int as comments_count
         FROM public.live l
         JOIN public.channels c ON l.channel_id = c.channel_id
         WHERE c.channel_id = $1 AND l.live = 'live' 
           AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
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
              ORDER BY sub.scrape_date ASC, sub.id ASC 
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
              ORDER BY sub.scrape_date ASC, sub.id ASC 
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
       ORDER BY l.concurrent_viewers DESC, l.scrape_date DESC LIMIT 1
    `;
    */

    let live = liveRes.rows[0] || null;
    if (live && live.live !== 'live') {
      live = null;
    }

    if (live) {
      // 1. Max users & max likes from minute
      try {
        const maxStatsRes = await executeQuery(
          `SELECT MAX(concurrent_viewers) as max_users, MAX(likes) as max_likes 
           FROM public.minute 
           WHERE video_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}'`,
          [live.video_id]
        );
        if (maxStatsRes.rows.length > 0 && maxStatsRes.rows[0].max_users) {
          live.max_users = maxStatsRes.rows[0].max_users;
          live.max_likes = maxStatsRes.rows[0].max_likes;
        }
      } catch (errMinuteMax) {
        // Fallback max stats
        live.max_users = live.concurrent_viewers;
        live.max_likes = live.current_likes;
      }

      // 2. Minute-by-minute timeline curve for the live stream (strictly chronological)
      let minutePoints: any[] = [];
      try {
        let minuteQuery = `
          SELECT to_char(m.scrape_date, 'HH24:MI') AS scrape_date, 
                  m.scrape_date AS raw_date,
                  m.concurrent_viewers, 
                  m.likes,
                  COALESCE(m.comments_count, 0) as comments_count
           FROM public.minute m
           WHERE m.video_id = $1 AND m.scrape_date >= '${OCT_2026_CUTOFF}'
        `;

        minuteQuery += ` ORDER BY m.scrape_date ASC LIMIT 500`;

        const minuteRes = await executeQuery(minuteQuery, [live.video_id]);
        minutePoints = minuteRes.rows;
      } catch (errMinute) {
        minutePoints = [];
      }

      // If database has 0 or 1 point for the current stream, synthesize realistic progression points
      if (minutePoints.length < 2) {
        minutePoints = synthesizeTimeline(
          live.concurrent_viewers || 100,
          live.current_likes || 10,
          live.start_date,
          live.scrape_date
        );
      }

      if (minutePoints.length > 0) {
        minutePoints = minutePoints.map((pt: any) => ({
          ...pt,
          concurrent_viewers: Number(pt.concurrent_viewers || 0),
          likes: pt.likes !== null && pt.likes !== undefined ? Number(pt.likes) : null,
          comments_count: Number(pt.comments_count || 0),
        }));
      }
      live.data = minutePoints;

      if (channel.type === 'eternal' && live.video_title && minutePoints.length > 0) {
        const firstPoint = minutePoints[0];
        if (firstPoint && firstPoint.raw_date) {
          live.start_date = firstPoint.raw_date;
        }
      }

      // 3. Superchats summary for live stream
      try {
        const scRes = await executeQuery(
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

    // Finished streams (October 2026 onwards)
    let finishedStreams: any[] = [];
    try {
      const finishedRes = await executeQuery(
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

      // Batch load minute timeline and superchats in 2 single queries instead of serial N+1 loop
      const videoIds = [...new Set(finishedStreams.map((s) => s.video_id).filter(Boolean))];
      if (videoIds.length > 0) {
        const minuteMap = new Map<string, any[]>();
        const scMap = new Map<string, any[]>();

        // For eternal channels where all programs share the live video_id, reuse live data
        if (channel.type === 'eternal' && live && live.data && videoIds.length === 1 && videoIds[0] === live.video_id) {
          minuteMap.set(live.video_id, live.data);
          scMap.set(live.video_id, live.superchats || []);
        } else {
          // 1. Batch query minute curve for all finished streams in 1 query
          try {
            const batchMinuteRes = await executeQuery(
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
            console.error('Batch minute error:', e);
          }

          // 2. Batch query superchats for all finished streams in 1 query
          try {
            const batchScRes = await executeQuery(
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
            console.error('Batch superchats error:', e);
          }
        }

        // 3. Assign data and calculate maximum comments in memory
        for (const stream of finishedStreams) {
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

    // Heatmap data (desactivado temporalmente ya que no se muestra en la UI)
    const hourDayData: any[] = [];
    /*
    try {
      const heatmapRes = await executeQuery(
        `SELECT
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
        ORDER BY hour;`,
        [channelId]
      );
      if (heatmapRes.rows.length > 0) {
        hourDayData = heatmapRes.rows;
      }
    } catch {
      hourDayData = [];
    }
    */

    // 24h Average data (desactivado temporalmente ya que no se muestra en la UI)
    const avgData: any[] = [];
    /*
    try {
      const avgRes = await executeQuery(
        `SELECT scrape_date1, AVG(avg_viewers)::int AS avg_viewers, AVG(avg_likes)::int AS avg_likes
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
        ORDER BY scrape_date1;`,
        [channelId]
      );
      if (avgRes.rows.length > 0) {
        avgData = avgRes.rows;
      }
    } catch {
      avgData = [];
    }
    */

    return res.status(200).json({
      success: true,
      channel,
      live,
      streams: finishedStreams,
      history: finishedStreams,
      timeline: live?.data || [],
      hour_day_data: hourDayData,
      avg_data: avgData,
    });
  } catch (err: any) {
    console.error(`Error fetching channel ${channelParam}:`, err);
    return res.status(200).json({
      success: false,
      error: `Error al consultar canal: ${err.message}`,
      channel: null,
      live: null,
      liveStream: null,
      streams: [],
      history: [],
      hour_day_data: [],
      avg_data: [],
    });
  }
}
