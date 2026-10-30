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

  const videoId = req.query.video_id as string | undefined;
  const channelIdParam = req.query.channel_id as string | undefined;
  const channelParam = req.query.channel as string | undefined;

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: true,
      fallback: true,
      message: 'Base de datos no configurada en Vercel.',
      video_id: videoId || 'sample',
      comments: [],
      superchats: [],
    });
  }

  try {
    let resolvedVideoId = videoId;
    let channelVideoIds: string[] = [];

    // If channel or channel_id provided, find the video IDs belonging to that channel (strictly October 2026 onwards)
    if (!resolvedVideoId && (channelIdParam || channelParam)) {
      const chId = channelIdParam || '';
      const chName = (channelParam || '').trim();
      const cleanChName = chName.startsWith('@') ? chName.substring(1) : chName;
      const atChName = chName.startsWith('@') ? chName : `@${chName}`;

      const vRes = await p.query(
        `SELECT DISTINCT l.video_id 
         FROM public.live l
         JOIN public.channels c ON l.channel_id = c.channel_id
         WHERE (l.channel_id = $1 OR c.channel = $2 OR c.channel = $3 OR c.channel_name = $2 OR c.channel_name = $3)
           AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
         ORDER BY l.video_id DESC 
         LIMIT 20`,
        [chId, cleanChName, atChName]
      );
      channelVideoIds = vRes.rows.map((r: any) => r.video_id);
    }

    let commentsQuery = '';
    let commentsParams: any[] = [];
    let scQuery = '';
    let scParams: any[] = [];

    if (resolvedVideoId) {
      commentsQuery = `
        SELECT id, created_at, video_id, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
        FROM public.comments
        WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
        ORDER BY created_at DESC 
        LIMIT 60
      `;
      commentsParams = [resolvedVideoId];

      scQuery = `
        SELECT id, created_at, amount, currency, video_id, superchat_id
        FROM public.superchats
        WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
        ORDER BY created_at DESC 
        LIMIT 40
      `;
      scParams = [resolvedVideoId];
    } else if (channelVideoIds.length > 0) {
      commentsQuery = `
        SELECT id, created_at, video_id, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
        FROM public.comments
        WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
        ORDER BY created_at DESC 
        LIMIT 60
      `;
      commentsParams = [channelVideoIds];

      scQuery = `
        SELECT id, created_at, amount, currency, video_id, superchat_id
        FROM public.superchats
        WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
        ORDER BY created_at DESC 
        LIMIT 40
      `;
      scParams = [channelVideoIds];
    } else {
      // Recent general comments and superchats strictly October 2026 onwards
      commentsQuery = `
        SELECT id, created_at, video_id, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
        FROM public.comments
        WHERE created_at >= '${OCT_2026_CUTOFF}'
        ORDER BY created_at DESC 
        LIMIT 50
      `;
      scQuery = `
        SELECT id, created_at, amount, currency, video_id, superchat_id
        FROM public.superchats
        WHERE created_at >= '${OCT_2026_CUTOFF}'
        ORDER BY created_at DESC 
        LIMIT 30
      `;
    }

    const commentsRes = await p.query(commentsQuery, commentsParams);
    const scRes = await p.query(scQuery, scParams);

    return res.status(200).json({
      success: true,
      video_id: resolvedVideoId || 'all',
      comments: commentsRes.rows,
      superchats: scRes.rows,
    });
  } catch (err: any) {
    console.error('Error fetching comments in /api/comments:', err);
    return res.status(200).json({
      success: false,
      error: `Error al consultar comentarios: ${err.message}`,
      comments: [],
      superchats: [],
    });
  }
}
