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
