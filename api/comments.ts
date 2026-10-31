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
      console.warn('Comments pool error:', err.message);
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
    console.warn('Comments pool error:', err.message);
    pool = null;
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

  const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '20', 10), 1), 100);
  const offset = Math.max(parseInt((req.query.offset as string) || '0', 10), 0);
  const type = (req.query.type as string) || 'all';

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: true,
      fallback: true,
      message: 'Base de datos no configurada en Vercel.',
      video_id: videoId || 'sample',
      comments: [],
      superchats: [],
      total_comments: 0,
      total_superchats: 0,
      has_more: false,
      offset,
      limit,
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
         LIMIT 30`,
        [chId, cleanChName, atChName]
      );
      channelVideoIds = vRes.rows.map((r: any) => r.video_id);
    }

    let commentsRows: any[] = [];
    let superchatsRows: any[] = [];
    let totalComments = 0;
    let totalSuperchats = 0;

    if (resolvedVideoId) {
      // Total count of comments
      const countRes = await p.query(
        `SELECT COUNT(*)::int AS total FROM public.comments WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'`,
        [resolvedVideoId]
      );
      totalComments = countRes.rows[0]?.total || 0;

      // Paginated comments
      if (type !== 'superchats') {
        const commentsRes = await p.query(
          `SELECT id, created_at, video_id, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
           FROM public.comments
           WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT $2 OFFSET $3`,
          [resolvedVideoId, limit, offset]
        );
        commentsRows = commentsRes.rows;
      }

      // Superchats (fetch on initial load or if explicitly requested)
      if (type !== 'comments' || offset === 0) {
        const scCountRes = await p.query(
          `SELECT COUNT(*)::int AS total FROM public.superchats WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'`,
          [resolvedVideoId]
        );
        totalSuperchats = scCountRes.rows[0]?.total || 0;

        const scRes = await p.query(
          `SELECT id, created_at, amount, currency, video_id, superchat_id, COALESCE(superchat_text, '') AS superchat_text
           FROM public.superchats
           WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT 100`,
          [resolvedVideoId]
        );
        superchatsRows = scRes.rows;
      }
    } else if (channelVideoIds.length > 0) {
      // Total count of comments for channel
      const countRes = await p.query(
        `SELECT COUNT(*)::int AS total FROM public.comments WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'`,
        [channelVideoIds]
      );
      totalComments = countRes.rows[0]?.total || 0;

      if (type !== 'superchats') {
        const commentsRes = await p.query(
          `SELECT id, created_at, video_id, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
           FROM public.comments
           WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT $2 OFFSET $3`,
          [channelVideoIds, limit, offset]
        );
        commentsRows = commentsRes.rows;
      }

      if (type !== 'comments' || offset === 0) {
        const scCountRes = await p.query(
          `SELECT COUNT(*)::int AS total FROM public.superchats WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'`,
          [channelVideoIds]
        );
        totalSuperchats = scCountRes.rows[0]?.total || 0;

        const scRes = await p.query(
          `SELECT id, created_at, amount, currency, video_id, superchat_id, COALESCE(superchat_text, '') AS superchat_text
           FROM public.superchats
           WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT 100`,
          [channelVideoIds]
        );
        superchatsRows = scRes.rows;
      }
    } else {
      // General recent comments
      const countRes = await p.query(
        `SELECT COUNT(*)::int AS total FROM public.comments WHERE created_at >= '${OCT_2026_CUTOFF}'`
      );
      totalComments = countRes.rows[0]?.total || 0;

      const commentsRes = await p.query(
        `SELECT id, created_at, video_id, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
         FROM public.comments
         WHERE created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      commentsRows = commentsRes.rows;

      if (offset === 0) {
        const scCountRes = await p.query(
          `SELECT COUNT(*)::int AS total FROM public.superchats WHERE created_at >= '${OCT_2026_CUTOFF}'`
        );
        totalSuperchats = scCountRes.rows[0]?.total || 0;

        const scRes = await p.query(
          `SELECT id, created_at, amount, currency, video_id, superchat_id, COALESCE(superchat_text, '') AS superchat_text
           FROM public.superchats
           WHERE created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT 60`
        );
        superchatsRows = scRes.rows;
      }
    }

    const hasMore = offset + commentsRows.length < totalComments;

    return res.status(200).json({
      success: true,
      video_id: resolvedVideoId || 'all',
      comments: commentsRows,
      superchats: superchatsRows,
      total_comments: totalComments,
      total_superchats: totalSuperchats,
      has_more: hasMore,
      offset,
      limit,
    });
  } catch (err: any) {
    console.error('Error fetching comments in /api/comments:', err);
    return res.status(200).json({
      success: false,
      error: `Error al consultar comentarios: ${err.message}`,
      comments: [],
      superchats: [],
      total_comments: 0,
      total_superchats: 0,
      has_more: false,
    });
  }
}
