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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: true,
      fallback: true,
      currency: 'ARS',
      total_ars_all: 0,
      total_superchats_count: 0,
      top_channels: [],
      top_videos: [],
    });
  }

  try {
    // 1. Overall stats for ARS superchats
    const totalRes: any = await executeQuery(`
      SELECT 
        COALESCE(SUM(amount), 0)::numeric as total_ars_all,
        COUNT(id)::int as total_superchats_count
      FROM public.superchats
      WHERE (currency = 'ARS' OR currency ILIKE '%ARS%')
        AND created_at >= '${OCT_2026_CUTOFF}';
    `);

    // 2. Top 20 Channels by total ARS superchats
    const channelsRes: any = await executeQuery(`
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
    const videosRes: any = await executeQuery(`
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

    const topChannels = (channelsRes.rows || []).map((row: any, index: number) => ({
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

    const topVideos = (videosRes.rows || []).map((row: any, index: number) => ({
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

    return res.status(200).json({
      success: true,
      currency: 'ARS',
      total_ars_all: Number(totalRes.rows?.[0]?.total_ars_all || 0),
      total_superchats_count: Number(totalRes.rows?.[0]?.total_superchats_count || 0),
      top_channels: topChannels,
      top_videos: topVideos,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message,
      currency: 'ARS',
      total_ars_all: 0,
      total_superchats_count: 0,
      top_channels: [],
      top_videos: [],
    });
  }
}
