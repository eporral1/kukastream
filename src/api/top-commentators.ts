import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, executeQuery } from '../utils/serverDb.ts';
import { fetchGlobalCrossChannelCommentators } from '../utils/serverCommentators.ts';
import { getBlockedTitleSqlClause } from '../config/streamFilters.ts';

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
  const startDateParam = req.query.start_date as string | undefined;
  const endDateParam = req.query.end_date as string | undefined;
  const isLiveParam = req.query.is_live as string | undefined;
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
      let resolvedStartDate: string | null = startDateParam || null;
      let resolvedEndDate: string | null = endDateParam || null;
      let isEternalEmission = Boolean(resolvedStartDate);

      if (!isEternalEmission) {
        const etRes: any = await executeQuery(
          `SELECT m.video_title,
                  MIN(m.scrape_date) AS start_time,
                  MAX(m.scrape_date) AS end_time
           FROM public.minute m
           JOIN public.channels c ON m.channel_id = c.channel_id
           WHERE m.video_id = $1
             AND c.type = 'eternal'
             AND m.video_title IS NOT NULL AND m.video_title <> ''
           GROUP BY m.video_title
           ORDER BY MAX(m.scrape_date) DESC
           LIMIT 1`,
          [resolvedVideoId]
        );
        if (etRes.rows.length > 0) {
          isEternalEmission = true;
          resolvedStartDate = etRes.rows[0].start_time;
          resolvedEndDate = etRes.rows[0].end_time;
        }
      }

      let totalComments = 0;
      let uniqueCommentators = 0;
      let topRes: any;

      if (isEternalEmission && resolvedStartDate) {
        const effectiveEndDate = isLiveParam === '1' ? null : resolvedEndDate;
        const countRes: any = await executeQuery(
          `SELECT 
             COALESCE((
               SELECT MAX(comments_count)
               FROM public.minute
               WHERE video_id = $1
                 AND scrape_date >= $2::timestamptz
                 AND ($3::timestamptz IS NULL OR scrape_date <= $3::timestamptz)
             ), 0)::int AS max_c,
             COALESCE((
               SELECT comments_count
               FROM public.minute
               WHERE video_id = $1
                 AND scrape_date < $2::timestamptz
               ORDER BY scrape_date DESC, id DESC
               LIMIT 1
             ), 0)::int AS prev_c,
             COALESCE((
               SELECT MIN(comments_count)
               FROM public.minute
               WHERE video_id = $1
                 AND scrape_date >= $2::timestamptz
                 AND ($3::timestamptz IS NULL OR scrape_date <= $3::timestamptz)
             ), 0)::int AS min_c,
             COALESCE((
               SELECT MAX(authors_count)
               FROM public.minute
               WHERE video_id = $1
                 AND scrape_date >= $2::timestamptz
                 AND ($3::timestamptz IS NULL OR scrape_date <= $3::timestamptz)
             ), 0)::int AS max_a,
             COALESCE((
               SELECT authors_count
               FROM public.minute
               WHERE video_id = $1
                 AND scrape_date < $2::timestamptz
               ORDER BY scrape_date DESC, id DESC
               LIMIT 1
             ), 0)::int AS prev_a,
             COALESCE((
               SELECT MIN(authors_count)
               FROM public.minute
               WHERE video_id = $1
                 AND scrape_date >= $2::timestamptz
                 AND ($3::timestamptz IS NULL OR scrape_date <= $3::timestamptz)
             ), 0)::int AS min_a,
             EXISTS(
               SELECT 1 FROM public.minute WHERE video_id = $1 AND scrape_date < $2::timestamptz
             ) AS has_prev`,
          [resolvedVideoId, resolvedStartDate, effectiveEndDate]
        );
        const row = countRes.rows[0] || {};
        const maxC = Number(row.max_c || 0);
        const minC = Number(row.min_c || 0);
        const prevC = Number(row.prev_c || 0);
        const baselineC = row.has_prev && maxC >= prevC ? prevC : minC;
        totalComments = Math.max(0, maxC - baselineC);

        const maxA = Number(row.max_a || 0);
        const minA = Number(row.min_a || 0);
        const prevA = Number(row.prev_a || 0);
        const baselineA = row.has_prev && maxA >= prevA ? prevA : minA;
        uniqueCommentators = Math.max(0, maxA - baselineA);

        topRes = await executeQuery(
          `WITH top_authors AS (
             SELECT 
               c.author_id,
               COUNT(c.id)::int AS comment_count,
               MIN(c.created_at) AS first_comment_at,
               MAX(c.created_at) AS last_comment_at
             FROM public.comments c
             WHERE c.video_id = $1 
               AND c.created_at >= ($2::timestamptz - INTERVAL '5 minutes')
               AND ($3::timestamptz IS NULL OR c.created_at <= ($3::timestamptz + INTERVAL '5 minutes'))
               AND c.author_id IS NOT NULL 
               AND TRIM(c.author_id) != ''
             GROUP BY c.author_id
             ORDER BY comment_count DESC
             LIMIT $4
           )
           SELECT 
             ta.*,
             (
               SELECT comment_text 
               FROM public.comments 
               WHERE video_id = $1 
                 AND author_id = ta.author_id 
                 AND created_at >= ($2::timestamptz - INTERVAL '5 minutes')
                 AND ($3::timestamptz IS NULL OR created_at <= ($3::timestamptz + INTERVAL '5 minutes'))
               ORDER BY created_at DESC 
               LIMIT 1
             ) AS latest_comment
           FROM top_authors ta;`,
          [resolvedVideoId, resolvedStartDate, effectiveEndDate, limit]
        );
      } else {
        const countRes: any = await executeQuery(
          `SELECT COALESCE(comments_count, 0)::int AS total_comments, COALESCE(authors_count, 0)::int AS unique_commentators 
           FROM public.minute 
           WHERE video_id = $1
           ORDER BY scrape_date DESC, id DESC
           LIMIT 1`,
          [resolvedVideoId]
        );
        totalComments = countRes.rows[0]?.total_comments || 0;
        uniqueCommentators = countRes.rows[0]?.unique_commentators || 0;

        topRes = await executeQuery(
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
      }

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
        `WITH latest_minute AS (
           SELECT DISTINCT ON (m.video_id)
             COALESCE(m.comments_count, 0)::int AS comments_count,
             COALESCE(m.authors_count, 0)::int AS authors_count
           FROM public.minute m
           JOIN public.live l ON m.video_id = l.video_id
           WHERE l.channel_id = $1 AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
             ${getBlockedTitleSqlClause('l.video_title')}
             ${getBlockedTitleSqlClause('m.video_title')}
           ORDER BY m.video_id, m.scrape_date DESC, m.id DESC
         )
         SELECT 
           COALESCE(SUM(comments_count), 0)::int AS total_comments,
           COALESCE(SUM(authors_count), 0)::int AS unique_commentators
         FROM latest_minute`,
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
             ${getBlockedTitleSqlClause('l.video_title')}
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
               ${getBlockedTitleSqlClause('sub_l.video_title')}
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
