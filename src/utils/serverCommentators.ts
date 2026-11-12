import { executeQuery, getPool, getCachedResponse, setCachedResponse } from './serverDb.ts';
import {
  analyzeCommentatorBotRisk,
  CrossChannelUserItem,
  UserChannelBreakdown,
} from './botAnalysis.ts';

const OCT_2026_CUTOFF = '2026-10-01 00:00:00';

export interface GlobalCommentatorsResponse {
  success: boolean;
  total_comments: number;
  unique_commentators: number;
  multi_channel_users_count: number;
  suspected_bots_count: number;
  top_commentators: CrossChannelUserItem[];
  cross_channel_commentators: CrossChannelUserItem[];
  commentators: any[];
  fallback?: boolean;
}

export async function fetchGlobalCrossChannelCommentators(
  limit = 20
): Promise<GlobalCommentatorsResponse> {
  const cacheKey = `top-commentators:global:${limit}`;
  const cached = getCachedResponse<GlobalCommentatorsResponse>(cacheKey);
  if (cached) {
    return cached;
  }

  const p = getPool();
  if (!p) {
    return {
      success: true,
      total_comments: 0,
      unique_commentators: 0,
      multi_channel_users_count: 0,
      suspected_bots_count: 0,
      top_commentators: [],
      cross_channel_commentators: [],
      commentators: [],
      fallback: true,
    };
  }

  // 1. Global summary counts + multi-channel count
  const summaryRes: any = await executeQuery(`
    WITH video_channel_map AS (
      SELECT DISTINCT ON (l.video_id)
        l.video_id,
        l.channel_id
      FROM public.live l
      JOIN public.channels ch ON l.channel_id = ch.channel_id
      WHERE ch.active::text IN ('1', 'true')
        AND ch.channel <> '@Radio10am'
      ORDER BY l.video_id, l.scrape_date DESC
    ),
    user_ch_counts AS (
      SELECT
        c.author_id,
        COUNT(c.id)::int AS msg_count,
        COUNT(DISTINCT vcm.channel_id)::int AS ch_count
      FROM public.comments c
      JOIN video_channel_map vcm ON c.video_id = vcm.video_id
      WHERE c.created_at >= '${OCT_2026_CUTOFF}'
        AND c.author_id IS NOT NULL
        AND TRIM(c.author_id) <> ''
      GROUP BY c.author_id
    )
    SELECT
      COALESCE(SUM(msg_count), 0)::int AS total_comments,
      COUNT(*)::int AS unique_commentators,
      COUNT(*) FILTER (WHERE ch_count >= 2)::int AS multi_channel_users_count
    FROM user_ch_counts;
  `);

  const totalComments = Number(summaryRes.rows?.[0]?.total_comments || 0);
  const uniqueCommentators = Number(summaryRes.rows?.[0]?.unique_commentators || 0);
  const multiChannelUsersCount = Number(summaryRes.rows?.[0]?.multi_channel_users_count || 0);

  // 2. Single batched query for Top N overall AND Top N multi-channel (channels_count >= 2)
  //    with per-channel breakdown and bot analysis metrics
  const candidatesRes: any = await executeQuery(
    `
    WITH video_channel_map AS (
      SELECT DISTINCT ON (l.video_id)
        l.video_id,
        l.channel_id,
        ch.channel,
        ch.channel_name,
        ch.thumb
      FROM public.live l
      JOIN public.channels ch ON l.channel_id = ch.channel_id
      WHERE ch.active::text IN ('1', 'true')
        AND ch.channel <> '@Radio10am'
      ORDER BY l.video_id, l.scrape_date DESC
    ),
    author_channel_stats AS (
      SELECT
        c.author_id,
        vcm.channel_id,
        vcm.channel,
        vcm.channel_name,
        vcm.thumb,
        COUNT(c.id)::int AS channel_comment_count,
        COUNT(DISTINCT c.video_id)::int AS channel_streams_count,
        MAX(c.created_at) AS last_channel_comment_at
      FROM public.comments c
      JOIN video_channel_map vcm ON c.video_id = vcm.video_id
      WHERE c.created_at >= '${OCT_2026_CUTOFF}'
        AND c.author_id IS NOT NULL
        AND TRIM(c.author_id) <> ''
      GROUP BY c.author_id, vcm.channel_id, vcm.channel, vcm.channel_name, vcm.thumb
    ),
    author_totals AS (
      SELECT
        acs.author_id,
        SUM(acs.channel_comment_count)::int AS total_comments,
        COUNT(DISTINCT acs.channel_id)::int AS channels_count,
        SUM(acs.channel_streams_count)::int AS streams_count,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'channel_id', acs.channel_id,
            'channel', acs.channel,
            'channel_name', acs.channel_name,
            'thumb', acs.thumb,
            'comment_count', acs.channel_comment_count,
            'streams_count', acs.channel_streams_count,
            'last_comment_at', acs.last_channel_comment_at
          )
          ORDER BY acs.channel_comment_count DESC
        ) AS channels_breakdown
      FROM author_channel_stats acs
      GROUP BY acs.author_id
    ),
    selected_authors AS (
      (
        SELECT author_id
        FROM author_totals
        ORDER BY total_comments DESC
        LIMIT $1
      )
      UNION
      (
        SELECT author_id
        FROM author_totals
        WHERE channels_count >= 2
        ORDER BY total_comments DESC, channels_count DESC
        LIMIT $1
      )
    ),
    author_behavior AS (
      SELECT
        c.author_id,
        COUNT(DISTINCT LOWER(TRIM(c.comment_text)))::int AS unique_texts_count,
        COUNT(DISTINCT DATE_TRUNC('minute', c.created_at))::int AS active_minutes,
        MIN(c.created_at) AS first_comment_at,
        MAX(c.created_at) AS last_comment_at,
        COALESCE(ROUND(AVG(LENGTH(c.comment_text)))::int, 0) AS avg_length,
        COUNT(*) FILTER (
          WHERE LENGTH(TRIM(c.comment_text)) >= 6
            AND c.comment_text = UPPER(c.comment_text)
            AND c.comment_text <> LOWER(c.comment_text)
        )::int AS all_caps_count,
        (ARRAY_AGG(c.comment_text ORDER BY c.created_at DESC))[1:4] AS sample_comments
      FROM public.comments c
      WHERE c.created_at >= '${OCT_2026_CUTOFF}'
        AND c.author_id IN (SELECT author_id FROM selected_authors)
      GROUP BY c.author_id
    )
    SELECT
      at.author_id,
      at.total_comments,
      at.channels_count,
      at.streams_count,
      at.channels_breakdown,
      ab.unique_texts_count,
      ab.active_minutes,
      ab.first_comment_at,
      ab.last_comment_at,
      ab.avg_length,
      ab.all_caps_count,
      ab.sample_comments
    FROM author_totals at
    JOIN author_behavior ab ON at.author_id = ab.author_id
    ORDER BY at.total_comments DESC;
    `,
    [Math.max(limit, 25)]
  );

  const enrichedPool: CrossChannelUserItem[] = (candidatesRes.rows || []).map(
    (row: any, idx: number) => {
      const totalUserComments = Number(row.total_comments || 0);
      const rawBreakdown: any[] = Array.isArray(row.channels_breakdown)
        ? row.channels_breakdown
        : [];

      const channelsBreakdown: UserChannelBreakdown[] = rawBreakdown.map((ch) => {
        const chCount = Number(ch.comment_count || 0);
        return {
          channel_id: String(ch.channel_id || ''),
          channel: String(ch.channel || ''),
          channel_name: String(ch.channel_name || ch.channel || 'Canal'),
          thumb: String(ch.thumb || ''),
          comment_count: chCount,
          streams_count: Number(ch.streams_count || 1),
          percentage:
            totalUserComments > 0 ? Number(((chCount / totalUserComments) * 100).toFixed(1)) : 0,
          last_comment_at: ch.last_comment_at,
        };
      });

      const sampleComments: string[] = Array.isArray(row.sample_comments)
        ? row.sample_comments.filter(Boolean).slice(0, 4)
        : [];

      const botAnalysis = analyzeCommentatorBotRisk({
        author_id: row.author_id,
        total_comments: totalUserComments,
        channels_count: Number(row.channels_count || channelsBreakdown.length || 1),
        streams_count: Number(row.streams_count || 1),
        unique_texts_count: Number(row.unique_texts_count || totalUserComments),
        active_minutes: Number(row.active_minutes || 1),
        avg_length: Number(row.avg_length || 25),
        all_caps_count: Number(row.all_caps_count || 0),
        channels_breakdown: channelsBreakdown,
      });

      return {
        rank: idx + 1,
        author_id: row.author_id,
        total_comments: totalUserComments,
        channels_count: Number(row.channels_count || channelsBreakdown.length || 1),
        streams_count: Number(row.streams_count || 1),
        first_comment_at: row.first_comment_at,
        last_comment_at: row.last_comment_at,
        latest_comment: sampleComments[0] || '',
        sample_comments: sampleComments,
        channels_breakdown: channelsBreakdown,
        bot_analysis: botAnalysis,
      };
    }
  );

  // Top 20 Overall by total comments
  const topCommentators = [...enrichedPool]
    .sort((a, b) => b.total_comments - a.total_comments)
    .slice(0, limit)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  // Top 20 Cross-channel users (channels_count >= 2)
  const crossChannelCommentators = [...enrichedPool]
    .filter((u) => u.channels_count >= 2)
    .sort((a, b) => b.total_comments - a.total_comments || b.channels_count - a.channels_count)
    .slice(0, limit)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  const suspectedBotsCount = topCommentators.filter(
    (u) => u.bot_analysis.verdict === 'probable_bot' || u.bot_analysis.verdict === 'suspicious'
  ).length;

  // Backwards-compatible array for legacy consumers
  const legacyCommentators = topCommentators.map((u) => ({
    rank: u.rank,
    author_id: u.author_id,
    comment_count: u.total_comments,
    streams_count: u.streams_count,
    first_comment_at: u.first_comment_at,
    last_comment_at: u.last_comment_at,
    latest_comment: u.latest_comment,
    percentage:
      totalComments > 0 ? Number(((u.total_comments / totalComments) * 100).toFixed(1)) : 0,
  }));

  const responsePayload: GlobalCommentatorsResponse = {
    success: true,
    total_comments: totalComments,
    unique_commentators: uniqueCommentators,
    multi_channel_users_count: multiChannelUsersCount,
    suspected_bots_count: suspectedBotsCount,
    top_commentators: topCommentators,
    cross_channel_commentators: crossChannelCommentators,
    commentators: legacyCommentators,
  };

  setCachedResponse(cacheKey, responsePayload, 60_000);
  return responsePayload;
}
