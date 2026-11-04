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
        c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active,
        COALESCE(AVG(l.concurrent_viewers), 0)::int AS avg_viewers,
        COALESCE(AVG(CASE WHEN l.current_likes > l.old_likes THEN (l.current_likes - l.old_likes) * 6 END), 0)::int AS avg_likes,
        COALESCE(cs.avg_comments, 0)::int AS avg_comments
      FROM public.channels c
      LEFT JOIN public.live l ON l.channel_id = c.channel_id 
        AND l.scrape_date >= '${OCT_2026_CUTOFF}' 
        AND l.concurrent_viewers > 0
      LEFT JOIN comm_stats cs ON cs.channel_id = c.channel_id
      WHERE c.active::text IN ('1', 'true')
      GROUP BY c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active, cs.avg_comments
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
          c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active,
          COALESCE(AVG(l.concurrent_viewers), 0)::int AS avg_viewers,
          COALESCE(AVG(CASE WHEN l.current_likes > l.old_likes THEN (l.current_likes - l.old_likes) * 6 END), 0)::int AS avg_likes,
          COALESCE(cs.avg_comments, 0)::int AS avg_comments
        FROM public.channels c
        LEFT JOIN public.live l ON l.channel_id = c.channel_id 
          AND l.scrape_date >= '${OCT_2026_CUTOFF}' 
          AND l.concurrent_viewers > 0
        LEFT JOIN comm_stats cs ON cs.channel_id = c.channel_id
        WHERE c.active = 1
        GROUP BY c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active, cs.avg_comments
        ORDER BY avg_viewers DESC;
      `;
      result = await executeQuery(query);
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
