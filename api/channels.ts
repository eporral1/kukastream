import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (pool) return pool;

  const host = process.env.DB_HOST;
  const user = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_DATABASE;
  const port = parseInt(process.env.DB_PORT || '5432', 10);

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
    connectionTimeoutMillis: 5000,
  });

  return pool;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const p = getPool();
  if (!p) {
    return res.json({ success: false, fallback: true, message: 'DB not configured' });
  }

  try {
    const query = `
      SELECT 
        c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter,
        COALESCE(AVG(l.concurrent_viewers), 0)::int AS avg_viewers,
        COALESCE(AVG((l.current_likes - l.old_likes) * 6), 0)::int AS avg_likes
      FROM public.channels c
      LEFT JOIN public.live l ON l.channel_id = c.channel_id 
        AND l.scrape_date >= NOW() - INTERVAL '30 days' 
        AND l.concurrent_viewers > 0
      GROUP BY c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter
      ORDER BY avg_viewers DESC;
    `;
    const result = await p.query(query);
    return res.json({ success: true, channels: result.rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, fallback: true });
  }
}
