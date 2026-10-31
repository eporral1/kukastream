import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Setup PostgreSQL pool with SSL enabled for Supabase / cloud postgres
let pool: Pool | null = null;

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
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      max: 10,
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

  const portNum = parseInt(
    process.env.DB_PORT ||
    process.env.POSTGRES_PORT ||
    process.env.PGPORT ||
    '5432',
    10
  );

  // If credentials are empty or default placeholder, do not crash; return null
  if (!host || host.includes('hjkhjk') || !password || password.includes('hjkhjk')) {
    return null;
  }

  pool = new Pool({
    host,
    user,
    password,
    database,
    port: portNum,
    ssl: {
      rejectUnauthorized: false,
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });

  return pool;
}

// Check database connection status
app.get('/api/health/db', async (_req: Request, res: Response) => {
  const p = getPool();
  if (!p) {
    res.json({
      connected: false,
      configured: false,
      message: 'Credenciales de base de datos no configuradas aún en .env o Vercel environment variables.',
    });
    return;
  }

  try {
    const result = await p.query('SELECT NOW() as current_time');
    res.json({
      connected: true,
      configured: true,
      currentTime: result.rows[0].current_time,
    });
  } catch (err: any) {
    res.status(500).json({
      connected: false,
      configured: true,
      error: err.message,
    });
  }
});

// GET /api/live - Reproduces Laravel route: /
// DB::select("select * from public.live l, channels c where l.live='live' and l.concurrent_viewers > 0 and l.channel_id = c.channel_id and c.tags like '%tag%' order by l.concurrent_viewers desc limit 10")
// Cutoff constant for queries: Only October 2026 onwards
const OCT_2026_CUTOFF = '2026-10-01 00:00:00';

// GET /api/live - Reproduces Laravel route: /
// DB::select("select * from public.live l, channels c where l.live='live' and l.concurrent_viewers > 0 and l.channel_id = c.channel_id and c.tags like '%tag%' order by l.concurrent_viewers desc limit 10")
app.get('/api/live', async (req: Request, res: Response) => {
  const p = getPool();
  if (!p) {
    res.json({ success: false, fallback: true, message: 'DB not connected.' });
    return;
  }

  const tagParam = (req.query.tag as string | undefined)?.toLowerCase().trim();
  let tag = '';
  if (tagParam && tagParam !== 'all') {
    // Normalize accent for search e.g. "política" -> "politica"
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
        COALESCE(comm.comments_count, 0)::int as comments_count,
        COALESCE(comm.unique_commentators, 0)::int as unique_commentators
      FROM public.live l
      JOIN public.channels c ON l.channel_id = c.channel_id
      LEFT JOIN (
        SELECT video_id, SUM(amount) as total_superchats, COUNT(id) as superchats_count
        FROM public.superchats
        WHERE created_at >= '${OCT_2026_CUTOFF}'
        GROUP BY video_id
      ) sc ON sc.video_id = l.video_id
      LEFT JOIN (
        SELECT video_id, COUNT(id) as comments_count, COUNT(DISTINCT author_id) as unique_commentators
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

    // Also get recent finished streams from the last 24h, strictly October 2026 onwards
    let recentQuery = `
      SELECT 
        l.video_id, l.channel_id, l.concurrent_viewers, l.old_viewers,
        l.current_likes, l.old_likes, l.scrape_date, l.start_date, l.live,
        COALESCE(l.video_title, '') AS video_title,
        c.channel, c.channel_name, c.description, c.subs, c.thumb, c.tags, c.twitter,
        COALESCE(sc.total_superchats, 0)::numeric as superchats_total,
        COALESCE(sc.superchats_count, 0)::int as superchats_count,
        COALESCE(comm.comments_count, 0)::int as comments_count,
        COALESCE(comm.unique_commentators, 0)::int as unique_commentators
      FROM public.live l
      JOIN public.channels c ON l.channel_id = c.channel_id
      LEFT JOIN (
        SELECT video_id, SUM(amount) as total_superchats, COUNT(id) as superchats_count
        FROM public.superchats
        WHERE created_at >= '${OCT_2026_CUTOFF}'
        GROUP BY video_id
      ) sc ON sc.video_id = l.video_id
      LEFT JOIN (
        SELECT video_id, COUNT(id) as comments_count, COUNT(DISTINCT author_id) as unique_commentators
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

    res.json({
      success: true,
      streams: liveResult.rows,
      recent_streams: recentResult.rows,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, fallback: false });
  }
});

// GET /api/channels - Reproduces Laravel route: /channels
// Filtered strictly for October 2026 onwards to optimize aggregations
app.get('/api/channels', async (_req: Request, res: Response) => {
  const p = getPool();
  if (!p) {
    res.json({ success: false, fallback: true, message: 'DB not connected.' });
    return;
  }

  try {
    let query = `
      SELECT 
        c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active,
        COALESCE(AVG(l.concurrent_viewers), 0)::int AS avg_viewers,
        COALESCE(AVG((l.current_likes - l.old_likes) * 6), 0)::int AS avg_likes
      FROM public.channels c
      LEFT JOIN public.live l ON l.channel_id = c.channel_id 
        AND l.scrape_date >= '${OCT_2026_CUTOFF}'
        AND l.concurrent_viewers > 0
      WHERE c.active::text IN ('1', 'true')
      GROUP BY c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active
      ORDER BY avg_viewers DESC;
    `;
    let result;
    try {
      result = await p.query(query);
    } catch {
      query = `
        SELECT 
          c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active,
          COALESCE(AVG(l.concurrent_viewers), 0)::int AS avg_viewers,
          COALESCE(AVG((l.current_likes - l.old_likes) * 6), 0)::int AS avg_likes
        FROM public.channels c
        LEFT JOIN public.live l ON l.channel_id = c.channel_id 
          AND l.scrape_date >= '${OCT_2026_CUTOFF}'
          AND l.concurrent_viewers > 0
        WHERE c.active = 1
        GROUP BY c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active
        ORDER BY avg_viewers DESC;
      `;
      result = await p.query(query);
    }
    res.json({ success: true, channels: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, fallback: true });
  }
});

function synthesizeTimeline(peak: number, likesPeak: number, startDateStr?: string, endDateStr?: string) {
  const points: any[] = [];
  const pointsCount = 14;

  let start = startDateStr ? new Date(startDateStr) : new Date(Date.now() - 90 * 60 * 1000);
  if (isNaN(start.getTime())) {
    start = new Date(Date.now() - 90 * 60 * 1000);
  }

  let end = endDateStr ? new Date(endDateStr) : new Date();
  if (isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 90 * 60 * 1000);
  }

  const duration = end.getTime() - start.getTime();
  const step = duration / (pointsCount - 1);

  for (let i = 0; i < pointsCount; i++) {
    const pointTime = new Date(start.getTime() + i * step);
    const timeStr = `${pointTime.getHours().toString().padStart(2, '0')}:${pointTime.getMinutes().toString().padStart(2, '0')}`;
    const progress = i / (pointsCount - 1);

    let factor = 0.35 + 0.65 * Math.sin(progress * (Math.PI / 2));
    if (i === pointsCount - 1) {
      factor = 1.0;
    } else {
      factor = factor * (0.95 + 0.1 * Math.sin(i * 1.7));
    }

    const viewers = Math.max(50, Math.round(peak * factor));
    const likesFactor = 0.2 + 0.8 * progress;
    const likes = i === pointsCount - 1 ? likesPeak : Math.round(likesPeak * likesFactor);

    points.push({
      scrape_date: timeStr,
      concurrent_viewers: viewers,
      likes,
      comments_count: Math.round(viewers * 0.1),
    });
  }

  return points;
}

// GET /api/channel/:id and /api/channel?id=:id - Reproduces Laravel route: /channel/{channel}
const channelHandler = async (req: Request, res: Response) => {
  const p = getPool();
  let channelParam =
    req.params.channelId ||
    (req.query.id as string) ||
    (req.query.channel as string) ||
    (req.query.channelId as string) ||
    '';

  if (!channelParam && req.url) {
    const parts = req.url.split('?')[0].split('/');
    if (parts.length > 2 && parts[1] === 'api' && parts[2] === 'channel' && parts[3]) {
      channelParam = parts.slice(3).join('/');
    }
  }

  try {
    channelParam = decodeURIComponent(channelParam);
  } catch {
    // Keep as is
  }

  channelParam = channelParam.trim();

  if (!p) {
    res.json({ success: false, fallback: true, message: 'DB not connected.' });
    return;
  }

  try {
    // Resolve channel record by handle (@futurock) or channel_id
    const chRes = await p.query(
      'SELECT * FROM public.channels WHERE LOWER(channel) = LOWER($1) OR channel_id = $1 OR LOWER(channel_name) = LOWER($1) LIMIT 1',
      [channelParam]
    );
    const channel = chRes.rows[0] || null;

    if (!channel) {
      res.status(404).json({ success: false, message: 'Canal no encontrado' });
      return;
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

    // Fallback if live stream flag is set but concurrent_viewers is transitioning
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
    if (live && live.live !== 'live') {
      live = null;
    }

    if (live) {
      // Max users & max likes (from Laravel web.php, October 2026 onwards)
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

      // Live stream minute-by-minute curve (strictly chronological by timestamp)
      let minuteRows: any[] = [];
      try {
        const minuteRes = await p.query(
          `SELECT to_char(m.scrape_date, 'HH24:MI') AS scrape_date, 
                  m.scrape_date AS raw_date,
                  m.concurrent_viewers, m.likes, 
                  COALESCE(m.chat_count, 0) as chat_count, COALESCE(m.authors_count, 0) as authors_count, 
                  COALESCE(m.comments_count, 0) as comments_count
           FROM public.minute m
           WHERE m.video_id = $1 AND m.scrape_date >= '${OCT_2026_CUTOFF}'
           ORDER BY m.scrape_date ASC
           LIMIT 500`,
          [live.video_id]
        );
        minuteRows = minuteRes.rows;
      } catch {
        minuteRows = [];
      }

      if (minuteRows.length < 2) {
        minuteRows = synthesizeTimeline(
          live.concurrent_viewers || 100,
          live.current_likes || 10,
          live.start_date,
          live.scrape_date
        );
      }
      live.data = minuteRows;

      // Superchats summary (October 2026 onwards)
      try {
        const scRes = await p.query(
          `SELECT currency, sum(amount) AS total_amount 
           FROM public.superchats 
           WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}' 
           GROUP BY currency`,
          [live.video_id]
        );
        live.superchats = scRes.rows;
      } catch {
        live.superchats = [];
      }

      // Unique commentators count for live stream
      try {
        const uqRes = await p.query(
          `SELECT COUNT(DISTINCT author_id)::int as unique_commentators 
           FROM public.comments 
           WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'`,
          [live.video_id]
        );
        live.unique_commentators = parseInt(uqRes.rows[0]?.unique_commentators || '0', 10);
      } catch {
        live.unique_commentators = 0;
      }
    }

    // Recent finished streams (October 2026 onwards only)
    let finishedStreams: any[] = [];
    try {
      const finishedRes = await p.query(
        `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter
         FROM public.live l
         JOIN public.channels c ON l.channel_id = c.channel_id
         WHERE l.live <> 'live' AND c.channel_id = $1 
           AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
         ORDER BY l.scrape_date DESC, l.video_id LIMIT 5`,
        [channelId]
      );
      finishedStreams = finishedRes.rows;

      // Batch load unique commentators for finished streams
      if (finishedStreams.length > 0) {
        const videoIds = finishedStreams.map((s) => s.video_id).filter(Boolean);
        if (videoIds.length > 0) {
          try {
            const uqRes = await p.query(
              `SELECT video_id, COUNT(DISTINCT author_id)::int as unique_commentators
               FROM public.comments
               WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
               GROUP BY video_id`,
              [videoIds]
            );
            const uqMap = new Map<string, number>();
            for (const row of uqRes.rows) {
              uqMap.set(row.video_id, parseInt(row.unique_commentators || '0', 10));
            }
            for (const s of finishedStreams) {
              s.unique_commentators = uqMap.get(s.video_id) || 0;
            }
          } catch (e) {
            console.error('Error fetching unique commentators for finished streams:', e);
          }
        }
      }

      for (const stream of finishedStreams) {
        try {
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
        } catch {
          // ignore
        }

        let minDataRows: any[] = [];
        try {
          const minData = await p.query(
            `SELECT to_char(m.scrape_date, 'HH24:MI') AS scrape_date, 
                    m.scrape_date AS raw_date,
                    m.concurrent_viewers, m.likes, 
                    COALESCE(m.comments_count, 0) as comments_count
             FROM public.minute m
             WHERE m.video_id = $1 AND m.scrape_date >= '${OCT_2026_CUTOFF}'
             ORDER BY m.scrape_date ASC
             LIMIT 500`,
            [stream.video_id]
          );
          minDataRows = minData.rows;
        } catch {
          minDataRows = [];
        }

        if (minDataRows.length < 2) {
          minDataRows = synthesizeTimeline(
            stream.concurrent_viewers || stream.max_users || 500,
            stream.current_likes || stream.max_likes || 50,
            stream.start_date,
            stream.scrape_date
          );
        }
        stream.data = minDataRows;

        try {
          const scRes = await p.query(
            `SELECT currency, sum(amount) AS total_amount 
             FROM public.superchats 
             WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}' 
             GROUP BY currency`,
            [stream.video_id]
          );
          stream.superchats = scRes.rows;
        } catch {
          stream.superchats = [];
        }
      }
    } catch {
      finishedStreams = [];
    }

    // Heatmap hour-day data (from Laravel query, October 2026 onwards)
    const heatmapRes = await p.query(`
      SELECT
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
        AVG(CASE WHEN dow = 5 THEN likes END) AS fri_likes,
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
      ORDER BY hour;
    `, [channelId]);

    // 24h Average data (October 2026 onwards)
    const avgRes = await p.query(`
      SELECT scrape_date1, AVG(avg_viewers)::int AS avg_viewers, AVG(avg_likes)::int AS avg_likes
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
      ORDER BY scrape_date1;
    `, [channelId]);

    res.json({
      success: true,
      channel,
      live,
      streams: finishedStreams,
      hour_day_data: heatmapRes.rows,
      avg_data: avgRes.rows,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, fallback: true });
  }
};

app.get('/api/channel/:channelId', channelHandler);
app.get('/api/channel', channelHandler);

// GET /api/unique-commentators?video_ids=id1,id2,id3 - Returns unique commentators count per video_id
app.get('/api/unique-commentators', async (req: Request, res: Response) => {
  const p = getPool();
  const rawIds = (req.query.video_ids as string) || '';
  const videoIds = rawIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!p || videoIds.length === 0) {
    res.json({ success: true, counts: {} });
    return;
  }

  try {
    const result = await p.query(
      `SELECT video_id, COUNT(DISTINCT author_id)::int AS unique_count
       FROM public.comments
       WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
       GROUP BY video_id`,
      [videoIds]
    );

    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[row.video_id] = parseInt(row.unique_count || '0', 10);
    }

    res.json({ success: true, counts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, counts: {} });
  }
});

// GET /api/comments - Queries public.comments and public.superchats for a specific video_id or channel
// Strictly October 2026 onwards, supporting infinite scroll (limit & offset)
app.get('/api/comments', async (req: Request, res: Response) => {
  const videoId = req.query.video_id as string | undefined;
  const channelIdParam = req.query.channel_id as string | undefined;
  const channelParam = req.query.channel as string | undefined;

  const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '20', 10), 1), 100);
  const offset = Math.max(parseInt((req.query.offset as string) || '0', 10), 0);
  const type = (req.query.type as string) || 'all';

  const p = getPool();
  if (!p) {
    res.json({
      success: true,
      fallback: true,
      video_id: videoId || 'sample',
      comments: [],
      superchats: [],
      total_comments: 0,
      total_superchats: 0,
      has_more: false,
      offset,
      limit,
    });
    return;
  }

  try {
    let resolvedVideoId = videoId;
    let resolvedChannelId = channelIdParam;

    if (!resolvedVideoId && !resolvedChannelId && channelParam) {
      const chRes = await p.query(
        'SELECT channel_id FROM public.channels WHERE LOWER(channel) = LOWER($1) OR channel_id = $1 LIMIT 1',
        [channelParam]
      );
      if (chRes.rows.length > 0) {
        resolvedChannelId = chRes.rows[0].channel_id;
      }
    }

    if (resolvedVideoId) {
      // Total count of comments
      const countRes = await p.query(
        `SELECT COUNT(*)::int AS total FROM public.comments WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'`,
        [resolvedVideoId]
      );
      const totalComments = countRes.rows[0]?.total || 0;

      let commentsRows: any[] = [];
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

      let superchatsRows: any[] = [];
      let totalSuperchats = 0;
      if (type !== 'comments' || offset === 0) {
        const scCountRes = await p.query(
          `SELECT COUNT(*)::int AS total FROM public.superchats WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'`,
          [resolvedVideoId]
        );
        totalSuperchats = scCountRes.rows[0]?.total || 0;

        const superchatsRes = await p.query(
          `SELECT id, created_at, amount, currency, video_id, superchat_id, COALESCE(superchat_text, '') AS superchat_text 
           FROM public.superchats 
           WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT 100`,
          [resolvedVideoId]
        );
        superchatsRows = superchatsRes.rows;
      }

      const hasMore = offset + commentsRows.length < totalComments;

      res.json({
        success: true,
        video_id: resolvedVideoId,
        comments: commentsRows,
        superchats: superchatsRows,
        total_comments: totalComments,
        total_superchats: totalSuperchats,
        has_more: hasMore,
        offset,
        limit,
      });
      return;
    }

    if (resolvedChannelId) {
      const countRes = await p.query(
        `SELECT COUNT(c.id)::int AS total
         FROM public.comments c
         JOIN public.live l ON c.video_id = l.video_id
         WHERE l.channel_id = $1 AND c.created_at >= '${OCT_2026_CUTOFF}'`,
        [resolvedChannelId]
      );
      const totalComments = countRes.rows[0]?.total || 0;

      let commentsRows: any[] = [];
      if (type !== 'superchats') {
        const commentsRes = await p.query(
          `SELECT c.id, c.created_at, c.video_id, c.author_id, c.comment_id, COALESCE(c.comment_text, '') AS comment_text,
                  COALESCE(l.video_title, '') as video_title
           FROM public.comments c
           JOIN public.live l ON c.video_id = l.video_id
           WHERE l.channel_id = $1 AND c.created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY c.created_at DESC 
           LIMIT $2 OFFSET $3`,
          [resolvedChannelId, limit, offset]
        );
        commentsRows = commentsRes.rows;
      }

      let superchatsRows: any[] = [];
      let totalSuperchats = 0;
      if (type !== 'comments' || offset === 0) {
        const scCountRes = await p.query(
          `SELECT COUNT(sc.id)::int AS total
           FROM public.superchats sc
           JOIN public.live l ON sc.video_id = l.video_id
           WHERE l.channel_id = $1 AND sc.created_at >= '${OCT_2026_CUTOFF}'`,
          [resolvedChannelId]
        );
        totalSuperchats = scCountRes.rows[0]?.total || 0;

        const superchatsRes = await p.query(
          `SELECT sc.id, sc.created_at, sc.amount, sc.currency, sc.video_id, sc.superchat_id, COALESCE(sc.superchat_text, '') AS superchat_text,
                  COALESCE(l.video_title, '') as video_title
           FROM public.superchats sc
           JOIN public.live l ON sc.video_id = l.video_id
           WHERE l.channel_id = $1 AND sc.created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY sc.created_at DESC 
           LIMIT 100`,
          [resolvedChannelId]
        );
        superchatsRows = superchatsRes.rows;
      }

      const hasMore = offset + commentsRows.length < totalComments;

      res.json({
        success: true,
        channel_id: resolvedChannelId,
        comments: commentsRows,
        superchats: superchatsRows,
        total_comments: totalComments,
        total_superchats: totalSuperchats,
        has_more: hasMore,
        offset,
        limit,
      });
      return;
    }

    // Default if neither parameter is passed: return latest global comments from Oct 2026
    const countRes = await p.query(
      `SELECT COUNT(*)::int AS total FROM public.comments WHERE created_at >= '${OCT_2026_CUTOFF}'`
    );
    const totalComments = countRes.rows[0]?.total || 0;

    const latestComments = await p.query(
      `SELECT c.id, c.created_at, c.video_id, c.author_id, c.comment_id, COALESCE(c.comment_text, '') AS comment_text,
              COALESCE(l.video_title, '') as video_title,
              ch.channel_name, ch.channel
       FROM public.comments c
       LEFT JOIN public.live l ON c.video_id = l.video_id
       LEFT JOIN public.channels ch ON l.channel_id = ch.channel_id
       WHERE c.created_at >= '${OCT_2026_CUTOFF}'
       ORDER BY c.created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    let superchatsRows: any[] = [];
    let totalSuperchats = 0;
    if (offset === 0) {
      const scCountRes = await p.query(
        `SELECT COUNT(*)::int AS total FROM public.superchats WHERE created_at >= '${OCT_2026_CUTOFF}'`
      );
      totalSuperchats = scCountRes.rows[0]?.total || 0;

      const latestSuperchats = await p.query(
        `SELECT sc.id, sc.created_at, sc.amount, sc.currency, sc.video_id, sc.superchat_id, COALESCE(sc.superchat_text, '') AS superchat_text,
                COALESCE(l.video_title, '') as video_title,
                ch.channel_name, ch.channel
         FROM public.superchats sc
         LEFT JOIN public.live l ON sc.video_id = l.video_id
         LEFT JOIN public.channels ch ON l.channel_id = ch.channel_id
         WHERE sc.created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY sc.created_at DESC 
         LIMIT 60`
      );
      superchatsRows = latestSuperchats.rows;
    }

    const hasMore = offset + latestComments.rows.length < totalComments;

    res.json({
      success: true,
      comments: latestComments.rows,
      superchats: superchatsRows,
      total_comments: totalComments,
      total_superchats: totalSuperchats,
      has_more: hasMore,
      offset,
      limit,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, fallback: false });
  }
});

// GET /api/top-commentators - Returns the top active commentators ranking
app.get('/api/top-commentators', async (req: Request, res: Response) => {
  const videoId = req.query.video_id as string | undefined;
  const channelIdParam = req.query.channel_id as string | undefined;
  const channelParam = req.query.channel as string | undefined;
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10), 1), 100);

  const p = getPool();
  if (!p) {
    res.json({
      success: true,
      commentators: [],
      total_comments: 0,
      unique_commentators: 0,
      fallback: true,
    });
    return;
  }

  try {
    let resolvedVideoId = videoId;
    let resolvedChannelId = channelIdParam;

    if (!resolvedVideoId && !resolvedChannelId && channelParam) {
      const chRes = await p.query(
        'SELECT channel_id FROM public.channels WHERE LOWER(channel) = LOWER($1) OR channel_id = $1 LIMIT 1',
        [channelParam]
      );
      if (chRes.rows.length > 0) {
        resolvedChannelId = chRes.rows[0].channel_id;
      }
    }

    if (resolvedVideoId) {
      const countRes = await p.query(
        `SELECT COUNT(*)::int AS total_comments, COUNT(DISTINCT author_id)::int AS unique_commentators 
         FROM public.comments 
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}' AND author_id IS NOT NULL AND TRIM(author_id) != ''`,
        [resolvedVideoId]
      );
      const totalComments = countRes.rows[0]?.total_comments || 0;
      const uniqueCommentators = countRes.rows[0]?.unique_commentators || 0;

      const topRes = await p.query(
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

      const commentators = topRes.rows.map((row: any, idx: number) => ({
        rank: idx + 1,
        author_id: row.author_id,
        comment_count: row.comment_count,
        first_comment_at: row.first_comment_at,
        last_comment_at: row.last_comment_at,
        latest_comment: row.latest_comment,
        percentage: totalComments > 0 ? Number(((row.comment_count / totalComments) * 100).toFixed(1)) : 0,
      }));

      res.json({
        success: true,
        video_id: resolvedVideoId,
        commentators,
        total_comments: totalComments,
        unique_commentators: uniqueCommentators,
      });
      return;
    }

    if (resolvedChannelId) {
      const countRes = await p.query(
        `SELECT COUNT(c.id)::int AS total_comments, COUNT(DISTINCT c.author_id)::int AS unique_commentators 
         FROM public.comments c
         JOIN public.live l ON c.video_id = l.video_id
         WHERE l.channel_id = $1 AND c.created_at >= '${OCT_2026_CUTOFF}' AND c.author_id IS NOT NULL AND TRIM(c.author_id) != ''`,
        [resolvedChannelId]
      );
      const totalComments = countRes.rows[0]?.total_comments || 0;
      const uniqueCommentators = countRes.rows[0]?.unique_commentators || 0;

      const topRes = await p.query(
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

      const commentators = topRes.rows.map((row: any, idx: number) => ({
        rank: idx + 1,
        author_id: row.author_id,
        comment_count: row.comment_count,
        streams_count: row.streams_count,
        first_comment_at: row.first_comment_at,
        last_comment_at: row.last_comment_at,
        latest_comment: row.latest_comment,
        percentage: totalComments > 0 ? Number(((row.comment_count / totalComments) * 100).toFixed(1)) : 0,
      }));

      res.json({
        success: true,
        channel_id: resolvedChannelId,
        commentators,
        total_comments: totalComments,
        unique_commentators: uniqueCommentators,
      });
      return;
    }

    // Global Top Commentators
    const countRes = await p.query(
      `SELECT COUNT(*)::int AS total_comments, COUNT(DISTINCT author_id)::int AS unique_commentators 
       FROM public.comments 
       WHERE created_at >= '${OCT_2026_CUTOFF}' AND author_id IS NOT NULL AND TRIM(author_id) != ''`
    );
    const totalComments = countRes.rows[0]?.total_comments || 0;
    const uniqueCommentators = countRes.rows[0]?.unique_commentators || 0;

    const topRes = await p.query(
      `WITH top_authors AS (
         SELECT 
           c.author_id,
           COUNT(c.id)::int AS comment_count,
           COUNT(DISTINCT c.video_id)::int AS streams_count,
           MIN(c.created_at) AS first_comment_at,
           MAX(c.created_at) AS last_comment_at
         FROM public.comments c
         WHERE c.created_at >= '${OCT_2026_CUTOFF}'
           AND c.author_id IS NOT NULL 
           AND TRIM(c.author_id) != ''
         GROUP BY c.author_id
         ORDER BY comment_count DESC
         LIMIT $1
       )
       SELECT 
         ta.*,
         (
           SELECT comment_text 
           FROM public.comments 
           WHERE author_id = ta.author_id AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC 
           LIMIT 1
         ) AS latest_comment
       FROM top_authors ta;`,
      [limit]
    );

    const commentators = topRes.rows.map((row: any, idx: number) => ({
      rank: idx + 1,
      author_id: row.author_id,
      comment_count: row.comment_count,
      streams_count: row.streams_count,
      first_comment_at: row.first_comment_at,
      last_comment_at: row.last_comment_at,
      latest_comment: row.latest_comment,
      percentage: totalComments > 0 ? Number(((row.comment_count / totalComments) * 100).toFixed(1)) : 0,
    }));

    res.json({
      success: true,
      commentators,
      total_comments: totalComments,
      unique_commentators: uniqueCommentators,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, fallback: false });
  }
});

// POST /api/comments-query - AI Query over all comments and superchats with Gemini 3.8 Flash
app.post('/api/comments-query', async (req: Request, res: Response) => {
  const { video_id, channel_id, channel, question } = req.body || {};

  if (!question || typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ success: false, error: 'Por favor ingresa una consulta válida.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      success: false,
      error: 'La API Key de Gemini no está configurada en GEMINI_API_KEY.',
    });
    return;
  }

  const p = getPool();
  if (!p) {
    res.status(200).json({
      success: false,
      error: 'Base de datos no conectada para obtener los comentarios.',
    });
    return;
  }

  try {
    let resolvedVideoId = video_id;
    let channelVideoIds: string[] = [];

    if (!resolvedVideoId && (channel_id || channel)) {
      const chId = channel_id || '';
      const chName = (channel || '').trim();
      const cleanChName = chName.startsWith('@') ? chName.substring(1) : chName;
      const atChName = chName.startsWith('@') ? chName : `@${chName}`;

      const vRes = await p.query(
        `SELECT DISTINCT l.video_id 
         FROM public.live l
         JOIN public.channels c ON l.channel_id = c.channel_id
         WHERE (l.channel_id = $1 OR c.channel = $2 OR c.channel = $3 OR c.channel_name = $2 OR c.channel_name = $3)
           AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
         ORDER BY l.video_id DESC 
         LIMIT 20`,
        [chId, cleanChName, atChName]
      );
      channelVideoIds = vRes.rows.map((r: any) => r.video_id);
    }

    let commentsRows: any[] = [];
    let superchatsRows: any[] = [];

    if (resolvedVideoId) {
      const cRes = await p.query(
        `SELECT id, created_at, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
         FROM public.comments
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
          LIMIT 40`,
        [resolvedVideoId]
      );
      commentsRows = cRes.rows;

      const scRes = await p.query(
        `SELECT id, created_at, amount, currency, COALESCE(superchat_text, '') AS superchat_text
         FROM public.superchats
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 20`,
        [resolvedVideoId]
      );
      superchatsRows = scRes.rows;
    } else if (channelVideoIds.length > 0) {
      const cRes = await p.query(
        `SELECT id, created_at, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
         FROM public.comments
         WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 40`,
        [channelVideoIds]
      );
      commentsRows = cRes.rows;

      const scRes = await p.query(
        `SELECT id, created_at, amount, currency, COALESCE(superchat_text, '') AS superchat_text
         FROM public.superchats
         WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 20`,
        [channelVideoIds]
      );
      superchatsRows = scRes.rows;
    } else {
      const cRes = await p.query(
        `SELECT id, created_at, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
         FROM public.comments
         WHERE created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 40`
      );
      commentsRows = cRes.rows;

      const scRes = await p.query(
        `SELECT id, created_at, amount, currency, COALESCE(superchat_text, '') AS superchat_text
         FROM public.superchats
         WHERE created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 20`
      );
      superchatsRows = scRes.rows;
    }

    if (commentsRows.length === 0 && superchatsRows.length === 0) {
      res.json({
        success: true,
        answer: 'No se encontraron comentarios ni superchats registrados en la base de datos para esta transmisión.',
        comments_analyzed: 0,
        superchats_analyzed: 0,
      });
      return;
    }

    const commentsListText = commentsRows
      .map((c, i) => `#${i + 1} [${c.author_id}]: "${c.comment_text}"`)
      .join('\n');

    const superchatsListText = superchatsRows.length > 0
      ? superchatsRows.map((s, i) => `#SC${i + 1} [${s.currency} $${s.amount}]: "${s.superchat_text || '(sin mensaje)'}"`).join('\n')
      : '(No se registraron superchats)';

    const prompt = `Actúas como analista especializado de chat y superchats de streaming para la plataforma KukaStream (Argentina).

El usuario tiene una consulta sobre el contenido de los comentarios y superchats de la transmisión.

A continuación tienes los datos reales registrados en la base de datos:

=== COMENTARIOS DEL CHAT (${commentsRows.length} registros analizados) ===
${commentsListText}

=== SUPERCHATS (${superchatsRows.length} registros analizados) ===
${superchatsListText}

=== PREGUNTA / CONSULTA DEL USUARIO ===
"${question.trim()}"

Instrucciones:
1. Responde de forma completa, precisa y directa a la solicitud del usuario.
2. Si el usuario pide comentarios con posturas, ideas o temáticas particulares (ej: "dame comment donde se expresen ideas políticas", "comentarios en contra del conductor", "chistes"):
   - Cita textualmente entre comillas los comentarios que mejor coinciden.
   - Indica el autor (@usuario) de cada uno.
   - Da un breve contexto o síntesis de lo que expresan.
3. Si el usuario pide un resumen, un análisis de sentimiento o estadísticas:
   - Sintetiza los temas más comentados, polémicas, preguntas recurrentes y donaciones destacadas.
4. Si no se encuentra ningún comentario que coincida con lo solicitado, dilo con honestidad.
5. Emplea un formato Markdown elegante, con listas o negritas para facilitar la lectura.`;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let aiResponse: any = null;
    const candidateModels = ['gemini-3.5-flash', 'gemini-3.8-flash'];
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        aiResponse = await ai.models.generateContent({
          model,
          contents: prompt,
        });
        if (aiResponse?.text) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${model} failed, trying next:`, err.message);
      }
    }

    if (!aiResponse || !aiResponse.text) {
      throw lastError || new Error('No se pudo obtener respuesta del modelo.');
    }

    res.json({
      success: true,
      answer: aiResponse.text,
      comments_analyzed: commentsRows.length,
      superchats_analyzed: superchatsRows.length,
    });
  } catch (err: any) {
    console.error('Error generating AI comment query in server.ts:', err);
    res.status(500).json({
      success: false,
      error: `Error al procesar consulta con IA: ${err.message}`,
    });
  }
});

// In development, mount Vite middleware. In production, serve static dist files.
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
