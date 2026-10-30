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
      error: 'Base de datos no configurada en Vercel.',
      channels: [],
    });
  }

  try {
    let query = `
      SELECT 
        c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active,
        COALESCE(AVG(l.concurrent_viewers), 0)::int AS avg_viewers,
        COALESCE(AVG((l.current_likes - l.old_likes) * 6), 0)::int AS avg_likes
      FROM public.channels c
      LEFT JOIN public.live l ON l.channel_id = c.channel_id 
        AND l.scrape_date >= '${OCT_2026_CUTOFF}' 
        AND l.concurrent_viewers > 0
      WHERE c.active::text IN ('1', 'true')
      GROUP BY c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active
      ORDER BY avg_viewers DESC;
    `;
    let result;
    try {
      result = await p.query(query);
    } catch {
      query = `
        SELECT 
          c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active,
          COALESCE(AVG(l.concurrent_viewers), 0)::int AS avg_viewers,
          COALESCE(AVG((l.current_likes - l.old_likes) * 6), 0)::int AS avg_likes
        FROM public.channels c
        LEFT JOIN public.live l ON l.channel_id = c.channel_id 
          AND l.scrape_date >= '${OCT_2026_CUTOFF}' 
          AND l.concurrent_viewers > 0
        WHERE c.active = 1
        GROUP BY c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active
        ORDER BY avg_viewers DESC;
      `;
      result = await p.query(query);
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
