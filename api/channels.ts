import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

let pool: Pool | null = null;
const OCT_2026_CUTOFF = '2026-10-01 00:00:00';

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
      console.warn('Retrying channels query after connection reset:', err.message);
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

  if (containment >= 0.70 && common >= 2) return true;
  if (jaccard >= 0.55 && common >= 2) return true;

  return false;
}

function clusterEternalTitleGroups(rawGroups: any[]): any[] {
  const sorted = [...rawGroups].sort(
    (a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime()
  );

  const clusters: any[] = [];

  for (const group of sorted) {
    let merged = false;
    for (const cluster of clusters) {
      if (
        cluster.video_id === group.video_id &&
        areTitlesSameShow(cluster.video_title, group.video_title)
      ) {
        const tClusterStart = new Date(cluster.start_time).getTime();
        const tGroupEnd = new Date(group.end_time).getTime();
        const gapHours = Math.abs(tClusterStart - tGroupEnd) / (1000 * 3600);

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

async function enrichEternalChannels(channels: any[]) {
  if (!channels || channels.length === 0) return;
  const eternalChannels = channels.filter((c: any) => c.type === 'eternal');
  if (eternalChannels.length === 0) return;

  await Promise.all(
    eternalChannels.map(async (channel: any) => {
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
          [channel.channel_id]
        );

        let titleGroups = (titleGroupsRes.rows || []).map((row: any) => {
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
        } else {
          channel.avg_viewers = 0;
          channel.avg_likes = 0;
          channel.avg_comments = 0;
        }
      } catch (err) {
        console.error(`Error enriching eternal channel ${channel.channel}:`, err);
      }
    })
  );

  channels.sort((a: any, b: any) => (b.avg_viewers || 0) - (a.avg_viewers || 0));
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

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: false,
      configured: false,
      error: 'Base de datos no configurada en Vercel.',
      channels: [],
    });
  }

  try {
    let query = `
      WITH comm_stats AS (
        SELECT channel_id,
               COALESCE(ROUND(AVG(comments_rate)), 0)::int AS avg_comments
        FROM (
          SELECT video_id, channel_id,
                 (MAX(comments_count) - MIN(comments_count))::numeric / 
                 GREATEST(0.25, EXTRACT(EPOCH FROM (MAX(scrape_date) - MIN(scrape_date))) / 3600.0) AS comments_rate
          FROM public.minute
          WHERE scrape_date >= '${OCT_2026_CUTOFF}' AND comments_count > 0
          GROUP BY video_id, channel_id
          HAVING MAX(scrape_date) > MIN(scrape_date)
        ) sub
        GROUP BY channel_id
      )
      SELECT 
        c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active, c.type,
        COALESCE(AVG(l.concurrent_viewers), 0)::int AS avg_viewers,
        COALESCE(AVG(CASE WHEN l.current_likes > l.old_likes THEN (l.current_likes - l.old_likes) * 6 END), 0)::int AS avg_likes,
        COALESCE(cs.avg_comments, 0)::int AS avg_comments
      FROM public.channels c
      LEFT JOIN public.live l ON l.channel_id = c.channel_id 
        AND l.scrape_date >= '${OCT_2026_CUTOFF}' 
        AND l.concurrent_viewers > 0
      LEFT JOIN comm_stats cs ON cs.channel_id = c.channel_id
      WHERE c.active::text IN ('1', 'true')
      GROUP BY c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active, c.type, cs.avg_comments
      ORDER BY avg_viewers DESC;
    `;
    let result: any;
    try {
      result = await executeQuery(query);
    } catch {
      query = `
        WITH comm_stats AS (
          SELECT channel_id,
                 COALESCE(ROUND(AVG(comments_rate)), 0)::int AS avg_comments
        FROM (
          SELECT video_id, channel_id,
                 (MAX(comments_count) - MIN(comments_count))::numeric / 
                 GREATEST(0.25, EXTRACT(EPOCH FROM (MAX(scrape_date) - MIN(scrape_date))) / 3600.0) AS comments_rate
          FROM public.minute
          WHERE scrape_date >= '${OCT_2026_CUTOFF}' AND comments_count > 0
          GROUP BY video_id, channel_id
          HAVING MAX(scrape_date) > MIN(scrape_date)
        ) sub
        GROUP BY channel_id
      )
      SELECT 
        c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active, c.type,
        COALESCE(AVG(l.concurrent_viewers), 0)::int AS avg_viewers,
        COALESCE(AVG(CASE WHEN l.current_likes > l.old_likes THEN (l.current_likes - l.old_likes) * 6 END), 0)::int AS avg_likes,
        COALESCE(cs.avg_comments, 0)::int AS avg_comments
      FROM public.channels c
      LEFT JOIN public.live l ON l.channel_id = c.channel_id 
        AND l.scrape_date >= '${OCT_2026_CUTOFF}' 
        AND l.concurrent_viewers > 0
      LEFT JOIN comm_stats cs ON cs.channel_id = c.channel_id
      WHERE c.active = 1
      GROUP BY c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active, c.type, cs.avg_comments
      ORDER BY avg_viewers DESC;
    `;
      result = await executeQuery(query);
    }
    if (result && result.rows) {
      await enrichEternalChannels(result.rows);
    }
    return res.status(200).json({ success: true, channels: result.rows });
  } catch (err: any) {
    console.error('Error in /api/channels:', err);
    return res.status(200).json({
      success: false,
      error: `Error al consultar canales: ${err.message}`,
      channels: [],
    });
  }
}
