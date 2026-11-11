import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, executeQuery } from '../src/utils/serverDb.ts';

const OCT_2026_CUTOFF = '2026-10-01 00:00:00';

// In-memory rate limiting (max 60 req/min per IP)
const commentsRateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkCommentsRateLimit(ip: string, limit = 60, windowMs = 60000): boolean {
  const now = Date.now();
  if (commentsRateLimitMap.size > 2000) {
    for (const [k, v] of commentsRateLimitMap.entries()) {
      if (now > v.resetAt) commentsRateLimitMap.delete(k);
    }
  }
  const item = commentsRateLimitMap.get(ip);
  if (!item || now > item.resetAt) {
    commentsRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (item.count >= limit) {
    return false;
  }
  item.count += 1;
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    'anonymous';

  if (!checkCommentsRateLimit(clientIp, 60, 60000)) {
    return res.status(429).json({
      success: false,
      error: 'Demasiadas solicitudes. Por favor espera un momento antes de volver a consultar.',
    });
  }

  const videoId = req.query.video_id as string | undefined;
  const channelIdParam = req.query.channel_id as string | undefined;
  const channelParam = req.query.channel as string | undefined;

  // Strict limit cap between 1 and 50
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '20', 10), 1), 50);
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

  // Require either video_id, channel_id, or channel to prevent unauthorized bulk database scraping
  if (!videoId && !channelIdParam && !channelParam) {
    return res.status(400).json({
      success: false,
      error: 'Parámetro requerido: debes especificar video_id o channel_id para consultar comentarios.',
      comments: [],
      superchats: [],
      total_comments: 0,
      total_superchats: 0,
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

      const vRes = await executeQuery(
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

      if (channelVideoIds.length === 0) {
        return res.status(200).json({
          success: true,
          video_id: 'none',
          comments: [],
          superchats: [],
          total_comments: 0,
          total_superchats: 0,
          has_more: false,
          offset,
          limit,
        });
      }
    }

    let commentsRows: any[] = [];
    let superchatsRows: any[] = [];
    let totalComments = 0;
    let totalSuperchats = 0;

    if (resolvedVideoId) {
      // Total count of comments
      const countRes = await executeQuery(
        `SELECT COUNT(*)::int AS total FROM public.comments WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'`,
        [resolvedVideoId]
      );
      totalComments = countRes.rows[0]?.total || 0;

      // Paginated comments without leaking internal DB row IDs
      if (type !== 'superchats') {
        const commentsRes = await executeQuery(
          `SELECT created_at, video_id, author_id, COALESCE(comment_text, '') AS comment_text
           FROM public.comments
           WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT $2 OFFSET $3`,
          [resolvedVideoId, limit, offset]
        );
        commentsRows = commentsRes.rows.map((r: any, idx: number) => ({
          id: `cmt_${r.video_id}_${offset + idx}`,
          created_at: r.created_at,
          video_id: r.video_id,
          author_id: r.author_id,
          comment_text: r.comment_text,
        }));
      }

      // Superchats capped to 50
      if (type !== 'comments' || offset === 0) {
        const scCountRes = await executeQuery(
          `SELECT COUNT(*)::int AS total FROM public.superchats WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'`,
          [resolvedVideoId]
        );
        totalSuperchats = scCountRes.rows[0]?.total || 0;

        const scRes = await executeQuery(
          `SELECT created_at, amount, currency, video_id, COALESCE(superchat_text, '') AS superchat_text
           FROM public.superchats
           WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT 50`,
          [resolvedVideoId]
        );
        superchatsRows = scRes.rows.map((r: any, idx: number) => ({
          id: `sc_${r.video_id}_${idx}`,
          created_at: r.created_at,
          amount: Number(r.amount || 0),
          currency: r.currency,
          video_id: r.video_id,
          superchat_text: r.superchat_text,
        }));
      }
    } else if (channelVideoIds.length > 0) {
      // Total count of comments for channel
      const countRes = await executeQuery(
        `SELECT COUNT(*)::int AS total FROM public.comments WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'`,
        [channelVideoIds]
      );
      totalComments = countRes.rows[0]?.total || 0;

      if (type !== 'superchats') {
        const commentsRes = await executeQuery(
          `SELECT created_at, video_id, author_id, COALESCE(comment_text, '') AS comment_text
           FROM public.comments
           WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT $2 OFFSET $3`,
          [channelVideoIds, limit, offset]
        );
        commentsRows = commentsRes.rows.map((r: any, idx: number) => ({
          id: `cmt_${r.video_id}_${offset + idx}`,
          created_at: r.created_at,
          video_id: r.video_id,
          author_id: r.author_id,
          comment_text: r.comment_text,
        }));
      }

      if (type !== 'comments' || offset === 0) {
        const scCountRes = await executeQuery(
          `SELECT COUNT(*)::int AS total FROM public.superchats WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'`,
          [channelVideoIds]
        );
        totalSuperchats = scCountRes.rows[0]?.total || 0;

        const scRes = await executeQuery(
          `SELECT created_at, amount, currency, video_id, COALESCE(superchat_text, '') AS superchat_text
           FROM public.superchats
           WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT 50`,
          [channelVideoIds]
        );
        superchatsRows = scRes.rows.map((r: any, idx: number) => ({
          id: `sc_${r.video_id}_${idx}`,
          created_at: r.created_at,
          amount: Number(r.amount || 0),
          currency: r.currency,
          video_id: r.video_id,
          superchat_text: r.superchat_text,
        }));
      }
    }

    const hasMore = offset + commentsRows.length < totalComments;

    return res.status(200).json({
      success: true,
      video_id: resolvedVideoId || 'channel',
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
    return res.status(500).json({
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
