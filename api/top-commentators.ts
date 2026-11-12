import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, executeQuery } from '../src/utils/serverDb.ts';
import { fetchGlobalCrossChannelCommentators } from '../src/utils/serverCommentators.ts';

const OCT_2026_CUTOFF = '2026-10-01 00:00:00';

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
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10), 1), 100);

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: true,
      commentators: [],
      total_comments: 0,
      unique_commentators: 0,
      fallback: true,
    });
  }

  try {
    let resolvedVideoId = videoId;
    let resolvedChannelId = channelIdParam;

    if (!resolvedVideoId && !resolvedChannelId && channelParam) {
      const chRes: any = await executeQuery(
        'SELECT channel_id FROM public.channels WHERE LOWER(channel) = LOWER($1) OR channel_id = $1 LIMIT 1',
        [channelParam]
      );
      if (chRes.rows.length > 0) {
        resolvedChannelId = chRes.rows[0].channel_id;
      }
    }

    if (resolvedVideoId) {
      const countRes: any = await executeQuery(
        `SELECT COUNT(*)::int AS total_comments, COUNT(DISTINCT author_id)::int AS unique_commentators 
         FROM public.comments 
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}' AND author_id IS NOT NULL AND TRIM(author_id) != ''`,
        [resolvedVideoId]
      );
      const totalComments = countRes.rows[0]?.total_comments || 0;
      const uniqueCommentators = countRes.rows[0]?.unique_commentators || 0;

      const topRes: any = await executeQuery(
        `WITH top_authors AS (
           SELECT 
             c.author_id,
             COUNT(c.id)::int AS comment_count,
             MIN(c.created_at) AS first_comment_at,
             MAX(c.created_at) AS last_comment_at
           FROM public.comments c
           WHERE c.video_id = $1 
             AND c.created_at >= '${OCT_2026_CUTOFF}'
             AND c.author_id IS NOT NULL 
             AND TRIM(c.author_id) != ''
           GROUP BY c.author_id
           ORDER BY comment_count DESC
           LIMIT $2
         )
         SELECT 
           ta.*,
           (
             SELECT comment_text 
             FROM public.comments 
             WHERE video_id = $1 AND author_id = ta.author_id AND created_at >= '${OCT_2026_CUTOFF}'
             ORDER BY created_at DESC 
             LIMIT 1
           ) AS latest_comment
         FROM top_authors ta;`,
        [resolvedVideoId, limit]
      );

      const commentators = (topRes.rows || []).map((row: any, idx: number) => ({
        rank: idx + 1,
        author_id: row.author_id,
        comment_count: row.comment_count,
        first_comment_at: row.first_comment_at,
        last_comment_at: row.last_comment_at,
        latest_comment: row.latest_comment,
        percentage: totalComments > 0 ? Number(((row.comment_count / totalComments) * 100).toFixed(1)) : 0,
      }));

      return res.status(200).json({
        success: true,
        video_id: resolvedVideoId,
        commentators,
        total_comments: totalComments,
        unique_commentators: uniqueCommentators,
      });
    }

    if (resolvedChannelId) {
      const countRes: any = await executeQuery(
        `SELECT COUNT(c.id)::int AS total_comments, COUNT(DISTINCT c.author_id)::int AS unique_commentators 
         FROM public.comments c
         JOIN public.live l ON c.video_id = l.video_id
         WHERE l.channel_id = $1 AND c.created_at >= '${OCT_2026_CUTOFF}' AND c.author_id IS NOT NULL AND TRIM(c.author_id) != ''`,
        [resolvedChannelId]
      );
      const totalComments = countRes.rows[0]?.total_comments || 0;
      const uniqueCommentators = countRes.rows[0]?.unique_commentators || 0;

      const topRes: any = await executeQuery(
        `WITH top_authors AS (
           SELECT 
             c.author_id,
             COUNT(c.id)::int AS comment_count,
             COUNT(DISTINCT c.video_id)::int AS streams_count,
             MIN(c.created_at) AS first_comment_at,
             MAX(c.created_at) AS last_comment_at
           FROM public.comments c
           JOIN public.live l ON c.video_id = l.video_id
           WHERE l.channel_id = $1 
             AND c.created_at >= '${OCT_2026_CUTOFF}'
             AND c.author_id IS NOT NULL 
             AND TRIM(c.author_id) != ''
           GROUP BY c.author_id
           ORDER BY comment_count DESC
           LIMIT $2
         )
         SELECT 
           ta.*,
           (
             SELECT sub_c.comment_text 
             FROM public.comments sub_c
             JOIN public.live sub_l ON sub_c.video_id = sub_l.video_id
             WHERE sub_l.channel_id = $1 AND sub_c.author_id = ta.author_id AND sub_c.created_at >= '${OCT_2026_CUTOFF}'
             ORDER BY sub_c.created_at DESC 
             LIMIT 1
           ) AS latest_comment
         FROM top_authors ta;`,
        [resolvedChannelId, limit]
      );

      const commentators = (topRes.rows || []).map((row: any, idx: number) => ({
        rank: idx + 1,
        author_id: row.author_id,
        comment_count: row.comment_count,
        streams_count: row.streams_count,
        first_comment_at: row.first_comment_at,
        last_comment_at: row.last_comment_at,
        latest_comment: row.latest_comment,
        percentage: totalComments > 0 ? Number(((row.comment_count / totalComments) * 100).toFixed(1)) : 0,
      }));

      return res.status(200).json({
        success: true,
        channel_id: resolvedChannelId,
        commentators,
        total_comments: totalComments,
        unique_commentators: uniqueCommentators,
      });
    }

    // Global Top Commentators + Cross-Channel Breakdown + Bot Analysis
    const globalData = await fetchGlobalCrossChannelCommentators(limit);
    return res.status(200).json(globalData);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, fallback: false });
  }
}
