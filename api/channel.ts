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

  let channelParam =
    (req.query.id as string) ||
    (req.query.channel as string) ||
    (req.query.channelId as string) ||
    '';

  try {
    channelParam = decodeURIComponent(channelParam);
  } catch {
    // Keep as is if decode fails
  }

  channelParam = channelParam.trim();

  if (!channelParam) {
    return res.status(400).json({ success: false, message: 'Parámetro de canal requerido' });
  }

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: false,
      configured: false,
      error: 'Base de datos no configurada en Vercel.',
      channel: null,
      liveStream: null,
      history: [],
      stats: { totalSuperchats: 0, totalComments: 0, maxViewers: 0, avgViewers: 0 },
    });
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
      return res.status(200).json({
        success: false,
        error: `Canal '${channelParam}' no encontrado en la base de datos.`,
        channel: null,
        liveStream: null,
        history: [],
        stats: { totalSuperchats: 0, totalComments: 0, maxViewers: 0, avgViewers: 0 },
      });
    }

    const channelId = channel.channel_id;

    // Check active live stream for this channel (must have live = 'live' and strictly October 2026 onwards)
    const liveRes = await p.query(
      `SELECT 
        l.video_id, l.channel_id, l.concurrent_viewers, l.old_viewers,
        l.current_likes, l.old_likes, l.scrape_date, l.start_date, l.live,
        COALESCE(l.video_title, '') AS video_title,
        COALESCE(sc.total_superchats, 0)::numeric as superchats_total,
        COALESCE(sc.superchats_count, 0)::int as superchats_count,
        COALESCE(comm.comments_count, 0)::int as comments_count
      FROM public.live l
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
      WHERE l.channel_id = $1 
        AND l.live = 'live'
        AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
      ORDER BY l.scrape_date DESC 
      LIMIT 1`,
      [channelId]
    );
    const liveStream = liveRes.rows[0] || null;

    // History: past streams from live table strictly October 2026 onwards
    const histRes = await p.query(
      `SELECT 
        l.video_id, l.concurrent_viewers, l.current_likes, l.scrape_date, l.start_date, l.live,
        COALESCE(l.video_title, '') AS video_title,
        COALESCE(sc.total_superchats, 0)::numeric as superchats_total,
        COALESCE(comm.comments_count, 0)::int as comments_count
      FROM public.live l
      LEFT JOIN (
        SELECT video_id, SUM(amount) as total_superchats
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
      WHERE l.channel_id = $1 
        AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
      ORDER BY l.scrape_date DESC 
      LIMIT 50`,
      [channelId]
    );

    // Timeline chart data: minute records for this channel strictly October 2026 onwards
    const currentVideoId = liveStream ? liveStream.video_id : histRes.rows[0]?.video_id;
    let timelineRows: any[] = [];

    if (currentVideoId) {
      const timeRes = await p.query(
        `SELECT video_id, viewers, likes, date 
         FROM public.minute 
         WHERE video_id = $1 
           AND date >= '${OCT_2026_CUTOFF}'
         ORDER BY date ASC 
         LIMIT 300`,
        [currentVideoId]
      );
      timelineRows = timeRes.rows;
    }

    if (timelineRows.length === 0 && histRes.rows.length > 0) {
      timelineRows = histRes.rows.slice(0, 30).reverse().map((r: any) => ({
        video_id: r.video_id,
        viewers: r.concurrent_viewers,
        likes: r.current_likes,
        date: r.scrape_date || r.start_date,
      }));
    }

    // Stats aggregation strictly October 2026 onwards
    const statsRes = await p.query(
      `SELECT 
        COALESCE(SUM(s.amount), 0)::numeric as total_superchats,
        COALESCE(COUNT(DISTINCT s.id), 0)::int as superchat_count
      FROM public.superchats s
      WHERE s.video_id IN (
        SELECT video_id FROM public.live WHERE channel_id = $1 AND (scrape_date >= '${OCT_2026_CUTOFF}' OR start_date >= '${OCT_2026_CUTOFF}')
      ) AND s.created_at >= '${OCT_2026_CUTOFF}'`,
      [channelId]
    );

    const commStatsRes = await p.query(
      `SELECT COUNT(id)::int as total_comments
      FROM public.comments
      WHERE video_id IN (
        SELECT video_id FROM public.live WHERE channel_id = $1 AND (scrape_date >= '${OCT_2026_CUTOFF}' OR start_date >= '${OCT_2026_CUTOFF}')
      ) AND created_at >= '${OCT_2026_CUTOFF}'`,
      [channelId]
    );

    const viewerStatsRes = await p.query(
      `SELECT 
        COALESCE(MAX(concurrent_viewers), 0)::int as max_viewers,
        COALESCE(AVG(concurrent_viewers), 0)::int as avg_viewers
      FROM public.live
      WHERE channel_id = $1 
        AND concurrent_viewers > 0
        AND (scrape_date >= '${OCT_2026_CUTOFF}' OR start_date >= '${OCT_2026_CUTOFF}')`,
      [channelId]
    );

    return res.status(200).json({
      success: true,
      channel,
      liveStream,
      history: histRes.rows,
      timeline: timelineRows,
      stats: {
        totalSuperchats: Number(statsRes.rows[0]?.total_superchats || 0),
        superchatCount: Number(statsRes.rows[0]?.superchat_count || 0),
        totalComments: Number(commStatsRes.rows[0]?.total_comments || 0),
        maxViewers: Number(viewerStatsRes.rows[0]?.max_viewers || 0),
        avgViewers: Number(viewerStatsRes.rows[0]?.avg_viewers || 0),
      },
    });
  } catch (err: any) {
    console.error(`Error fetching channel ${channelParam}:`, err);
    return res.status(200).json({
      success: false,
      error: `Error al consultar canal: ${err.message}`,
      channel: null,
      liveStream: null,
      history: [],
      stats: { totalSuperchats: 0, totalComments: 0, maxViewers: 0, avgViewers: 0 },
    });
  }
}
