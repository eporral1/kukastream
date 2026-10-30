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

  if (connectionString && !connectionString.includes('hjkhjk')) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 6000,
      idleTimeoutMillis: 10000,
      max: 4,
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
    host,
    user,
    password,
    database,
    port,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
    idleTimeoutMillis: 10000,
    max: 4,
  });

  return pool;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS and JSON headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
        l.current_likes, l.old_likes, l.scrape_date, l.start_date, l.live,
        COALESCE(l.video_title, '') AS video_title,
        c.channel, c.channel_name, c.description, c.subs, c.thumb, c.tags, c.twitter,
        COALESCE(sc.total_superchats, 0)::numeric as superchats_total,
        COALESCE(sc.superchats_count, 0)::int as superchats_count,
        COALESCE(comm.comments_count, 0)::int as comments_count
      FROM public.live l
      JOIN public.channels c ON l.channel_id = c.channel_id
      LEFT JOIN (
        SELECT video_id, SUM(amount) as total_superchats, COUNT(id) as superchats_count
        FROM public.superchats
        WHERE created_at >= '${OCT_2026_CUTOFF}'
        GROUP BY video_id
      ) sc ON sc.video_id = l.video_id
      LEFT JOIN (
        SELECT video_id, COUNT(id) as comments_count
        FROM public.comments
        WHERE created_at >= '${OCT_2026_CUTOFF}'
        GROUP BY video_id
      ) comm ON comm.video_id = l.video_id
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
    const liveResult = await p.query(liveQuery, liveParams);

    // Also get recent finished streams from the last 24h (strictly October 2026 onwards)
    let recentQuery = `
      SELECT 
        l.video_id, l.channel_id, l.concurrent_viewers, l.old_viewers,
        l.current_likes, l.old_likes, l.scrape_date, l.start_date, l.live,
        COALESCE(l.video_title, '') AS video_title,
        c.channel, c.channel_name, c.description, c.subs, c.thumb, c.tags, c.twitter,
        COALESCE(sc.total_superchats, 0)::numeric as superchats_total,
        COALESCE(sc.superchats_count, 0)::int as superchats_count,
        COALESCE(comm.comments_count, 0)::int as comments_count
      FROM public.live l
      JOIN public.channels c ON l.channel_id = c.channel_id
      LEFT JOIN (
        SELECT video_id, SUM(amount) as total_superchats, COUNT(id) as superchats_count
        FROM public.superchats
        WHERE created_at >= '${OCT_2026_CUTOFF}'
        GROUP BY video_id
      ) sc ON sc.video_id = l.video_id
      LEFT JOIN (
        SELECT video_id, COUNT(id) as comments_count
        FROM public.comments
        WHERE created_at >= '${OCT_2026_CUTOFF}'
        GROUP BY video_id
      ) comm ON comm.video_id = l.video_id
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
    const recentResult = await p.query(recentQuery, recentParams);

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
