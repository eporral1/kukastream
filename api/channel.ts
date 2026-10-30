import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, OCT_2026_CUTOFF } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Support both /api/channel?id=... and /api/channel/:id (via rewrite or query)
  let channelParam =
    (req.query.id as string) ||
    (req.query.channel as string) ||
    (req.query.channelId as string) ||
    '';

  try {
    channelParam = decodeURIComponent(channelParam);
  } catch {
    // Keep as is if decodeURIComponent fails
  }

  channelParam = channelParam.trim();

  if (!channelParam) {
    return res.status(400).json({ success: false, message: 'Parámetro de canal requerido' });
  }

  const p = getPool();
  if (!p) {
    return res.json({ success: false, fallback: true, message: 'DB not configured' });
  }

  const cleanParam = channelParam.startsWith('@') ? channelParam.substring(1) : channelParam;
  const withAtParam = channelParam.startsWith('@') ? channelParam : `@${channelParam}`;

  try {
    const chRes = await p.query(
      `SELECT * FROM public.channels 
       WHERE LOWER(channel) = LOWER($1) 
          OR LOWER(channel) = LOWER($2) 
          OR LOWER(channel) = LOWER($3)
          OR channel_id = $1 
          OR channel_id = $2
          OR LOWER(channel_name) = LOWER($1) 
          OR LOWER(channel_name) = LOWER($2)
       LIMIT 1`,
      [channelParam, cleanParam, withAtParam]
    );
    const channel = chRes.rows[0] || null;

    if (!channel) {
      return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    }

    const channelId = channel.channel_id;

    // Current live stream (matching Laravel: l.live='live', concurrent_viewers > 0, >= Oct 2026)
    let liveRes = await p.query(
      `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter
       FROM public.live l
       JOIN public.channels c ON l.channel_id = c.channel_id
       WHERE c.channel_id = $1 AND l.live = 'live' AND l.concurrent_viewers > 0 
         AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
       ORDER BY l.concurrent_viewers DESC LIMIT 1`,
      [channelId]
    );

    if (liveRes.rows.length === 0) {
      liveRes = await p.query(
        `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter
         FROM public.live l
         JOIN public.channels c ON l.channel_id = c.channel_id
         WHERE c.channel_id = $1 AND l.live = 'live'
           AND l.scrape_date >= '${OCT_2026_CUTOFF}'
         ORDER BY l.scrape_date DESC LIMIT 1`,
        [channelId]
      );
    }

    let live = liveRes.rows[0] || null;

    if (live) {
      const maxStatsRes = await p.query(
        `SELECT MAX(concurrent_viewers) as max_users, MAX(likes) as max_likes 
         FROM public.minute 
         WHERE video_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}'`,
        [live.video_id]
      );
      if (maxStatsRes.rows.length > 0) {
        live.max_users = maxStatsRes.rows[0].max_users;
        live.max_likes = maxStatsRes.rows[0].max_likes;
      }

      const minuteRes = await p.query(
        `SELECT to_char(scrape_date, 'HH24:MI') AS scrape_date, concurrent_viewers, likes, chat_count, authors_count, comments_count
         FROM public.minute 
         WHERE video_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}'
         ORDER BY scrape_date ASC
         LIMIT 500`,
        [live.video_id]
      );
      live.data = minuteRes.rows;

      const scRes = await p.query(
        `SELECT currency, sum(amount) AS total_amount 
         FROM public.superchats 
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}' 
         GROUP BY currency`,
        [live.video_id]
      );
      live.superchats = scRes.rows;
    }

    const finishedRes = await p.query(
      `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter
       FROM public.live l
       JOIN public.channels c ON l.channel_id = c.channel_id
       WHERE l.live <> 'live' AND c.channel_id = $1 
         AND l.scrape_date >= '${OCT_2026_CUTOFF}'
       ORDER BY l.scrape_date DESC, l.video_id LIMIT 5`,
      [channelId]
    );
    const finishedStreams = finishedRes.rows;

    for (const stream of finishedStreams) {
      const maxStatsRes = await p.query(
        `SELECT MAX(concurrent_viewers) as max_users, MAX(likes) as max_likes 
         FROM public.minute 
         WHERE video_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}'`,
        [stream.video_id]
      );
      if (maxStatsRes.rows.length > 0) {
        stream.max_users = maxStatsRes.rows[0].max_users;
        stream.max_likes = maxStatsRes.rows[0].max_likes;
      }

      const minData = await p.query(
        `SELECT to_char(scrape_date, 'HH24:MI') AS scrape_date, concurrent_viewers, likes, comments_count
         FROM public.minute
         WHERE video_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}'
         ORDER BY scrape_date ASC
         LIMIT 500`,
        [stream.video_id]
      );
      stream.data = minData.rows;

      const scRes = await p.query(
        `SELECT currency, sum(amount) AS total_amount 
         FROM public.superchats 
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}' 
         GROUP BY currency`,
        [stream.video_id]
      );
      stream.superchats = scRes.rows;
    }

    const heatmapRes = await p.query(
      `SELECT
        hour,
        AVG(CASE WHEN dow = 1 THEN concurrent_viewers END) AS mon_viewers,
        AVG(CASE WHEN dow = 1 THEN likes END) AS mon_likes,
        AVG(CASE WHEN dow = 2 THEN concurrent_viewers END) AS tue_viewers,
        AVG(CASE WHEN dow = 2 THEN likes END) AS tue_likes,
        AVG(CASE WHEN dow = 3 THEN concurrent_viewers END) AS wed_viewers,
        AVG(CASE WHEN dow = 3 THEN likes END) AS wed_likes,
        AVG(CASE WHEN dow = 4 THEN concurrent_viewers END) AS thu_viewers,
        AVG(CASE WHEN dow = 4 THEN likes END) AS thu_likes,
        AVG(CASE WHEN dow = 5 THEN concurrent_viewers END) AS fri_viewers,
        AVG(CASE WHEN dow = 5 THEN fri_likes END) AS fri_likes,
        AVG(CASE WHEN dow = 6 THEN concurrent_viewers END) AS sat_viewers,
        AVG(CASE WHEN dow = 6 THEN likes END) AS sat_likes,
        AVG(CASE WHEN dow = 0 THEN concurrent_viewers END) AS sun_viewers,
        AVG(CASE WHEN dow = 0 THEN likes END) AS sun_likes
      FROM (
        SELECT
          DATE_PART('hour', scrape_date) AS hour,
          EXTRACT(DOW FROM scrape_date) AS dow,
          concurrent_viewers,
          likes
        FROM public.minute
        WHERE channel_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}'
      ) t
      GROUP BY hour
      ORDER BY hour;`,
      [channelId]
    );

    const avgRes = await p.query(
      `SELECT scrape_date1, AVG(avg_viewers)::int AS avg_viewers, AVG(avg_likes)::int AS avg_likes
      FROM (
        SELECT 
          to_char(
            date_trunc('hour', scrape_date) + 
            interval '10 minute' * floor(extract(minute from scrape_date)::int / 10),
            'HH24:MI'
          ) AS scrape_date1,
          AVG(concurrent_viewers) AS avg_viewers,
          AVG(likes) AS avg_likes
        FROM public.minute
        WHERE channel_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}'
        GROUP BY 
          date_trunc('hour', scrape_date) + 
          interval '10 minute' * floor(extract(minute from scrape_date)::int / 10)
      ) sub
      GROUP BY scrape_date1
      ORDER BY scrape_date1;`,
      [channelId]
    );

    return res.json({
      success: true,
      channel,
      live,
      streams: finishedStreams,
      hour_day_data: heatmapRes.rows,
      avg_data: avgRes.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, fallback: true });
  }
}
