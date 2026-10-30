import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, OCT_2026_CUTOFF } from './_db';

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
        AND l.scrape_date >= '${OCT_2026_CUTOFF}' 
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
