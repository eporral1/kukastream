import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, OCT_2026_CUTOFF } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const p = getPool();
  if (!p) {
    return res.json({ success: false, fallback: true, message: 'DB not configured' });
  }

  const tagParam = (req.query.tag as string | undefined)?.toLowerCase().trim();
  let tag = '';
  if (tagParam && tagParam !== 'all') {
    tag = tagParam.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  try {
    let liveQuery = `
      SELECT 
        l.video_id, l.channel_id, l.concurrent_viewers, l.old_viewers,
        l.current_likes, l.old_likes, l.scrape_date, l.start_date, l.live,
        COALESCE(l.video_title, '') AS video_title,
        c.channel, c.channel_name, c.description, c.subs, c.thumb, c.tags, c.twitter,
        COALESCE(sc.total_superchats, 0)::numeric as superchats_total,
        COALESCE(sc.superchats_count, 0)::int as superchats_count,
        COALESCE(comm.comments_count, 0)::int as comments_count
      FROM public.live l
      JOIN public.channels c ON l.channel_id = c.channel_id
      LEFT JOIN (
        SELECT video_id, SUM(amount) as total_superchats, COUNT(id) as superchats_count
        FROM public.superchats
        WHERE created_at >= '${OCT_2026_CUTOFF}'
        GROUP BY video_id
      ) sc ON sc.video_id = l.video_id
      LEFT JOIN (
        SELECT video_id, COUNT(id) as comments_count
        FROM public.comments
        WHERE created_at >= '${OCT_2026_CUTOFF}'
        GROUP BY video_id
      ) comm ON comm.video_id = l.video_id
      WHERE l.live = 'live' 
        AND l.concurrent_viewers > 0
        AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
    `;

    const liveParams: any[] = [];
    if (tag) {
      liveParams.push(`%${tag}%`);
      liveQuery += ` AND (c.tags ILIKE $1 OR REPLACE(c.tags, 'í', 'i') ILIKE $1)`;
    }

    liveQuery += ` ORDER BY l.concurrent_viewers DESC LIMIT 25;`;
    const liveResult = await p.query(liveQuery, liveParams);

    // Also get recent finished streams from the last 24h (strictly October 2026 onwards)
    let recentQuery = `
      SELECT 
        l.video_id, l.channel_id, l.concurrent_viewers, l.old_viewers,
        l.current_likes, l.old_likes, l.scrape_date, l.start_date, l.live,
        COALESCE(l.video_title, '') AS video_title,
        c.channel, c.channel_name, c.description, c.subs, c.thumb, c.tags, c.twitter,
        COALESCE(sc.total_superchats, 0)::numeric as superchats_total,
        COALESCE(sc.superchats_count, 0)::int as superchats_count,
        COALESCE(comm.comments_count, 0)::int as comments_count
      FROM public.live l
      JOIN public.channels c ON l.channel_id = c.channel_id
      LEFT JOIN (
        SELECT video_id, SUM(amount) as total_superchats, COUNT(id) as superchats_count
        FROM public.superchats
        WHERE created_at >= '${OCT_2026_CUTOFF}'
        GROUP BY video_id
      ) sc ON sc.video_id = l.video_id
      LEFT JOIN (
        SELECT video_id, COUNT(id) as comments_count
        FROM public.comments
        WHERE created_at >= '${OCT_2026_CUTOFF}'
        GROUP BY video_id
      ) comm ON comm.video_id = l.video_id
      WHERE l.live <> 'live'
        AND l.scrape_date >= '${OCT_2026_CUTOFF}'
        AND l.scrape_date >= NOW() - INTERVAL '24 hours'
    `;

    const recentParams: any[] = [];
    if (tag) {
      recentParams.push(`%${tag}%`);
      recentQuery += ` AND (c.tags ILIKE $1 OR REPLACE(c.tags, 'í', 'i') ILIKE $1)`;
    }

    recentQuery += ` ORDER BY l.scrape_date DESC LIMIT 10;`;
    const recentResult = await p.query(recentQuery, recentParams);

    return res.json({
      success: true,
      streams: liveResult.rows,
      recent_streams: recentResult.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, fallback: false });
  }
}
