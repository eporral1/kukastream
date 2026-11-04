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
    connectionTimeoutMillis: 15000, // 15s to avoid cold start timeouts
    idleTimeoutMillis: 5000,
    max: 3,
    keepAlive: true,
  };

  if (connectionString && !connectionString.includes('hjkhjk')) {
    pool = new Pool({
      ...poolConfig,
      connectionString,
    });
  } else {
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
  }

  // Handle client error to prevent stale broken sockets in serverless
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
      console.warn('Retrying query after connection reset:', err.message);
      pool = null;
      p = getPool();
      if (p) {
        return (await p.query(text, params)) as T;
      }
    }
    throw err;
  }
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

  // Common prefix check before ':' or '|' or '-'
  const prefix1 = t1.split(/[:|\-]/)[0].trim().toLowerCase();
  const prefix2 = t2.split(/[:|\-]/)[0].trim().toLowerCase();
  if (prefix1.length > 8 && prefix1 === prefix2) return true;

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

// Universal enrichment function for eternal channels in Home and Streams ranking
async function enrichEternalStreams(streams: any[]) {
  if (!streams || streams.length === 0) return;
  const eternalStreams = streams.filter((s: any) => s.type === 'eternal');
  if (eternalStreams.length === 0) return;

  const channelIds = [...new Set(eternalStreams.map((s: any) => s.channel_id).filter(Boolean))];
  if (channelIds.length === 0) return;

  try {
    const titleGroupsRes: any = await executeQuery(
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
      channelSessionsMap.set(chId, clusterEternalTitleGroups(rawGroups));
    }

    for (const stream of eternalStreams) {
      const sessions = channelSessionsMap.get(stream.channel_id);
      if (sessions && sessions.length > 0) {
        if (stream.live === 'live') {
          const currentSession = sessions[0];
          stream.current_likes = currentSession.likes_delta;
          stream.comments_count = currentSession.comm_delta;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS and JSON headers
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

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: false,
      configured: false,
      error: 'Base de datos no configurada en Vercel. Faltan las variables de entorno (DATABASE_URL o DB_HOST / DB_PASSWORD) en Settings -> Environment Variables de tu proyecto en Vercel.',
      streams: [],
      recent_streams: [],
    });
  }

  const tagParam = (req.query.tag as string | undefined)?.toLowerCase().trim();
  let tag = '';
  if (tagParam && tagParam !== 'all') {
    tag = tagParam.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
      WHERE l.live = 'live' 
        AND l.concurrent_viewers > 0
        AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
    `;

    const liveParams: any[] = [];
    if (tag) {
      liveParams.push(`%${tag}%`);
      liveQuery += ` AND (c.tags ILIKE $1 OR REPLACE(c.tags, 'í', 'i') ILIKE $1)`;
    }

    liveQuery += ` ORDER BY l.concurrent_viewers DESC LIMIT 25;`;
    const liveResult: any = await executeQuery(liveQuery, liveParams);

    // For eternal channels in Home (live): group by video_title and keep the latest group
    const eternalChannelIds = liveResult.rows
      .filter((s: any) => s.type === 'eternal' && s.channel_id)
      .map((s: any) => s.channel_id);

    if (eternalChannelIds.length > 0) {
      try {
        const eternalTitlesRes: any = await executeQuery(
          `SELECT DISTINCT ON (sub.channel_id)
                  sub.channel_id,
                  sub.video_id,
                  sub.video_title,
                  sub.start_time,
                  sub.end_time,
                  sub.max_viewers,
                  sub.min_likes,
                  sub.max_likes,
                  sub.min_comments,
                  sub.max_comments
           FROM (
             SELECT channel_id,
                    video_id,
                    video_title,
                    MIN(scrape_date) AS start_time,
                    MAX(scrape_date) AS end_time,
                    MAX(concurrent_viewers) AS max_viewers,
                    MIN(likes) AS min_likes,
                    MAX(likes) AS max_likes,
                    MIN(comments_count) AS min_comments,
                    MAX(comments_count) AS max_comments
             FROM public.minute
             WHERE channel_id = ANY($1)
               AND scrape_date >= '${OCT_2026_CUTOFF}'
               AND video_title IS NOT NULL AND video_title <> ''
             GROUP BY channel_id, video_id, video_title
           ) sub
           ORDER BY sub.channel_id, sub.end_time DESC`,
          [eternalChannelIds]
        );

        const eternalMap = new Map<string, any>();
        for (const row of eternalTitlesRes.rows || []) {
          eternalMap.set(row.channel_id, row);
        }

        for (const stream of liveResult.rows) {
          if (stream.type === 'eternal' && eternalMap.has(stream.channel_id)) {
            const grp = eternalMap.get(stream.channel_id);
            if (grp.video_title) {
              stream.video_title = grp.video_title;
            }
            if (grp.start_time) {
              stream.start_date = grp.start_time;
            }
            const maxLikes = Number(grp.max_likes || 0);
            const minLikes = Number(grp.min_likes || 0);
            const maxComm = Number(grp.max_comments || 0);
            const minComm = Number(grp.min_comments || 0);

            stream.current_likes = Math.max(0, maxLikes - minLikes);
            stream.comments_count = Math.max(0, maxComm - minComm);
          }
        }
      } catch (err: any) {
        console.warn('Error fetching latest video_title groups for eternal channels in Home:', err.message);
      }
    }

    // Also get recent finished streams from the last 24h (strictly October 2026 onwards)
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
      WHERE l.live <> 'live'
        AND l.scrape_date >= '${OCT_2026_CUTOFF}'
        AND l.scrape_date >= NOW() - INTERVAL '24 hours'
    `;

    const recentParams: any[] = [];
    if (tag) {
      recentParams.push(`%${tag}%`);
      recentQuery += ` AND (c.tags ILIKE $1 OR REPLACE(c.tags, 'í', 'i') ILIKE $1)`;
    }

    recentQuery += ` ORDER BY l.scrape_date DESC LIMIT 10;`;
    const recentResult: any = await executeQuery(recentQuery, recentParams);

    // Batch load superchats in ARS for all streams in Home (fast single query)
    const allVideoIds = [
      ...liveResult.rows.map((r: any) => r.video_id),
      ...recentResult.rows.map((r: any) => r.video_id),
    ].filter(Boolean);

    if (allVideoIds.length > 0) {
      try {
        const scRes = await executeQuery(
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
        console.error('Error fetching superchats for live streams:', e);
      }
    }

    // Enrich eternal streams with session metrics so likes and comments reflect the current show delta
    await enrichEternalStreams(liveResult.rows);
    await enrichEternalStreams(recentResult.rows);

    return res.status(200).json({
      success: true,
      streams: liveResult.rows,
      recent_streams: recentResult.rows,
    });
  } catch (err: any) {
    console.error('Database query error in /api/live:', err);
    return res.status(200).json({
      success: false,
      error: `Error al consultar la base de datos: ${err.message}`,
      streams: [],
      recent_streams: [],
    });
  }
}
