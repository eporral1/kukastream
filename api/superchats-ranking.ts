import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, executeQuery, getCachedResponse, setCachedResponse } from '../src/utils/serverDb.ts';

const OCT_2026_CUTOFF = '2026-10-01 00:00:00';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: true,
      fallback: true,
      currency: 'ARS',
      total_ars_all: 0,
      total_superchats_count: 0,
      top_channels: [],
      top_videos: [],
    });
  }

  try {
    // 1. Overall stats for ARS superchats
    const totalRes: any = await executeQuery(`
      SELECT 
        COALESCE(SUM(amount), 0)::numeric as total_ars_all,
        COUNT(id)::int as total_superchats_count
      FROM public.superchats
      WHERE (currency = 'ARS' OR currency ILIKE '%ARS%')
        AND created_at >= '${OCT_2026_CUTOFF}';
    `);

    // 2. Top 20 Channels by total ARS superchats
    const channelsRes: any = await executeQuery(`
      SELECT 
        c.channel_id,
        c.channel,
        c.channel_name,
        c.thumb,
        SUM(s.amount)::numeric as total_ars,
        COUNT(s.id)::int as superchats_count,
        COUNT(DISTINCT s.video_id)::int as streams_count,
        ROUND(AVG(s.amount))::int as avg_per_superchat
      FROM public.superchats s
      JOIN public.live l ON s.video_id = l.video_id
      JOIN public.channels c ON l.channel_id = c.channel_id
      WHERE c.active::text IN ('1', 'true') 
        AND COALESCE(c.enable_comments, 1) <> 0 
        AND (s.currency = 'ARS' OR s.currency ILIKE '%ARS%')
        AND s.created_at >= '${OCT_2026_CUTOFF}'
      GROUP BY c.channel_id, c.channel, c.channel_name, c.thumb
      ORDER BY total_ars DESC
      LIMIT 20;
    `);

    // 3. Top 20 Videos by total ARS superchats
    const videosRes: any = await executeQuery(`
      SELECT 
        s.video_id,
        SUM(s.amount)::numeric as total_ars,
        COUNT(s.id)::int as superchats_count,
        ROUND(AVG(s.amount))::int as avg_per_superchat,
        COALESCE(MAX(l.video_title), 'Transmisión en vivo') as video_title,
        COALESCE(MAX(c.channel), '') as channel,
        COALESCE(MAX(c.channel_name), 'Canal') as channel_name,
        COALESCE(MAX(c.thumb), '') as channel_thumb,
        MAX(l.scrape_date) as last_date
      FROM public.superchats s
      LEFT JOIN public.live l ON s.video_id = l.video_id
      LEFT JOIN public.channels c ON l.channel_id = c.channel_id
      WHERE c.active::text IN ('1', 'true') 
        AND COALESCE(c.enable_comments, 1) <> 0 
        AND (s.currency = 'ARS' OR s.currency ILIKE '%ARS%')
        AND s.created_at >= '${OCT_2026_CUTOFF}'
      GROUP BY s.video_id
      ORDER BY total_ars DESC
      LIMIT 20;
    `);

    const topChannels = (channelsRes.rows || []).map((row: any, index: number) => ({
      rank: index + 1,
      channel_id: row.channel_id,
      channel: row.channel,
      channel_name: row.channel_name,
      thumb: row.thumb,
      total_ars: Number(row.total_ars || 0),
      superchats_count: Number(row.superchats_count || 0),
      streams_count: Number(row.streams_count || 0),
      avg_per_superchat: Number(row.avg_per_superchat || 0),
    }));

    const topVideos = (videosRes.rows || []).map((row: any, index: number) => ({
      rank: index + 1,
      video_id: row.video_id,
      video_title: row.video_title,
      channel: row.channel,
      channel_name: row.channel_name,
      channel_thumb: row.channel_thumb,
      total_ars: Number(row.total_ars || 0),
      superchats_count: Number(row.superchats_count || 0),
      avg_per_superchat: Number(row.avg_per_superchat || 0),
      last_date: row.last_date,
    }));

    return res.status(200).json({
      success: true,
      currency: 'ARS',
      total_ars_all: Number(totalRes.rows?.[0]?.total_ars_all || 0),
      total_superchats_count: Number(totalRes.rows?.[0]?.total_superchats_count || 0),
      top_channels: topChannels,
      top_videos: topVideos,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message,
      currency: 'ARS',
      total_ars_all: 0,
      total_superchats_count: 0,
      top_channels: [],
      top_videos: [],
    });
  }
}
