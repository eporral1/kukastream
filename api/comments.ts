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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const videoId = (req.query.video_id as string) || '';

  if (!videoId) {
    return res.status(400).json({ success: false, message: 'video_id is required' });
  }

  const p = getPool();
  if (!p) {
    // Return schema-accurate mock data (matching exact DB tables comments & superchats)
    return res.json({
      success: true,
      fallback: true,
      video_id: videoId,
      comments: [
        {
          id: 934377,
          created_at: '2026-10-30T03:05:42.773Z',
          video_id: videoId,
          author_id: '@GeSe20',
          comment_id: 'LCC.EhwKGkNPWHN0b1hoNEpjREZSMjJtY3lncWdDeEF3',
        },
        {
          id: 934376,
          created_at: '2026-10-30T03:05:42.453Z',
          video_id: videoId,
          author_id: '@misterghoul6633',
          comment_id: 'LCC.EhwKGkNLZW5ZdVVHUG5ORXBqUkVaSFdnaEF3',
        },
        {
          id: 934375,
          created_at: '2026-10-30T03:04:18.112Z',
          video_id: videoId,
          author_id: '@lucas_cordoba',
          comment_id: 'LCC.EhwKGkNLZW1ZdVVHUG5ORXBqUkVaSFdnYEF4',
        },
        {
          id: 934374,
          created_at: '2026-10-30T03:03:55.670Z',
          video_id: videoId,
          author_id: '@mariana_rosario',
          comment_id: 'LCC.EhwKGkNLZWtZdVVHUG5ORXBqUkVaSFdnaUEx',
        },
        {
          id: 934373,
          created_at: '2026-10-30T03:02:11.890Z',
          video_id: videoId,
          author_id: '@juanpablo_ba',
          comment_id: 'LCC.EhwKGkNLZWhZdVVHUG5ORXBqUkVaSFdnaEEy',
        },
      ],
      superchats: [
        {
          id: 13885,
          created_at: '2026-10-29T16:34:09.895Z',
          amount: 100,
          currency: 'ARS',
          video_id: videoId,
          superchat_id: 'LCC.EhwKGkNLdk53X0xUMzVjREZTMnZjZ3FDeEF3',
        },
        {
          id: 13886,
          created_at: '2026-10-29T16:45:22.100Z',
          amount: 500,
          currency: 'ARS',
          video_id: videoId,
          superchat_id: 'LCC.EhwKGkNLcWl3X0xUMzVjREZTMnZjZ3FDeEF4',
        },
      ],
    });
  }

  try {
    const commentsRes = await p.query(
      `SELECT id, created_at, video_id, author_id, comment_id 
       FROM public.comments 
       WHERE video_id = $1 
       ORDER BY created_at DESC 
       LIMIT 100`,
      [videoId]
    );

    const superchatsRes = await p.query(
      `SELECT id, created_at, amount, currency, video_id, superchat_id 
       FROM public.superchats 
       WHERE video_id = $1 
       ORDER BY created_at DESC 
       LIMIT 100`,
      [videoId]
    );

    return res.json({
      success: true,
      video_id: videoId,
      comments: commentsRes.rows,
      superchats: superchatsRes.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, fallback: true });
  }
}
