import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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
    process.env.POSTGRES_PRISMA_URL;

  if (connectionString && !connectionString.includes('hjkhjk')) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      max: 10,
      idleTimeoutMillis: 30000,
    });
    return pool;
  }

  const host = process.env.DB_HOST;
  const user = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_DATABASE;
  const portNum = parseInt(process.env.DB_PORT || '5432', 10);

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
    connectionTimeoutMillis: 5000,
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

    // Also get recent finished streams from the last 24h, strictly October 2026 onwards
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
    res.json({ success: true, channels: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, fallback: true });
  }
});

// GET /api/channel/:id - Reproduces Laravel route: /channel/{channel}
app.get('/api/channel/:channelId', async (req: Request, res: Response) => {
  const p = getPool();
  let channelParam = req.params.channelId;

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

      // Live stream minute-by-minute curve (October 2026 onwards)
      const minuteRes = await p.query(
        `SELECT to_char(scrape_date, 'HH24:MI') AS scrape_date, concurrent_viewers, likes, chat_count, authors_count, comments_count
         FROM public.minute 
         WHERE video_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}'
         ORDER BY scrape_date ASC
         LIMIT 500`,
        [live.video_id]
      );
      live.data = minuteRes.rows;

      // Superchats summary (October 2026 onwards)
      const scRes = await p.query(
        `SELECT currency, sum(amount) AS total_amount 
         FROM public.superchats 
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}' 
         GROUP BY currency`,
        [live.video_id]
      );
      live.superchats = scRes.rows;
    }

    // Recent finished streams (October 2026 onwards only)
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
});

// GET /api/comments - Queries public.comments and public.superchats for a specific video_id or channel
// Strictly October 2026 onwards
app.get('/api/comments', async (req: Request, res: Response) => {
  const videoId = req.query.video_id as string | undefined;
  const channelIdParam = req.query.channel_id as string | undefined;
  const channelParam = req.query.channel as string | undefined;

  const p = getPool();
  if (!p) {
    res.json({
      success: true,
      fallback: true,
      video_id: videoId || 'sample',
      comments: [
        {
          id: 934377,
          created_at: '2026-10-30T03:05:42.773Z',
          video_id: videoId || 'sample',
          author_id: '@GeSe20',
          comment_id: 'LCC.EhwKGkNPWHN0b1hoNEpjREZSMjJtY3lncWdDeEF3',
          comment_text: 'Excelente programa y análisis en vivo!',
        },
        {
          id: 934376,
          created_at: '2026-10-30T03:05:42.453Z',
          video_id: videoId || 'sample',
          author_id: '@misterghoul6633',
          comment_id: 'LCC.EhwKGkNLZW5ZdVVHUG5ORXBqUkVaSFdnaEF3',
          comment_text: 'Saludos desde Córdoba capital, prendidos a la radio!',
        },
        {
          id: 934375,
          created_at: '2026-10-30T03:04:18.112Z',
          video_id: videoId || 'sample',
          author_id: '@lucas_cordoba',
          comment_id: 'LCC.EhwKGkNLZW1ZdVVHUG5ORXBqUkVaSFdnYEF4',
          comment_text: 'Que temazo pusieron recién',
        },
      ],
      superchats: [
        {
          id: 13885,
          created_at: '2026-10-29T16:34:09.895Z',
          amount: 500,
          currency: 'ARS',
          video_id: videoId || 'sample',
          superchat_id: 'LCC.EhwKGkNLdk53X0xUMzVjREZTMnZjZ3FDeEF3',
          superchat_text: 'Un aporte para la producción del programa, genios!',
        },
      ],
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
      const commentsRes = await p.query(
        `SELECT id, created_at, video_id, author_id, comment_id, comment_text 
         FROM public.comments 
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC 
         LIMIT 200`,
        [resolvedVideoId]
      );

      const superchatsRes = await p.query(
        `SELECT id, created_at, amount, currency, video_id, superchat_id, superchat_text 
         FROM public.superchats 
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC 
         LIMIT 200`,
        [resolvedVideoId]
      );

      res.json({
        success: true,
        video_id: resolvedVideoId,
        comments: commentsRes.rows,
        superchats: superchatsRes.rows,
      });
      return;
    }

    if (resolvedChannelId) {
      const commentsRes = await p.query(
        `SELECT c.id, c.created_at, c.video_id, c.author_id, c.comment_id, c.comment_text,
                COALESCE(l.video_title, '') as video_title
         FROM public.comments c
         JOIN public.live l ON c.video_id = l.video_id
         WHERE l.channel_id = $1 AND c.created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY c.created_at DESC 
         LIMIT 200`,
        [resolvedChannelId]
      );

      const superchatsRes = await p.query(
        `SELECT sc.id, sc.created_at, sc.amount, sc.currency, sc.video_id, sc.superchat_id, sc.superchat_text,
                COALESCE(l.video_title, '') as video_title
         FROM public.superchats sc
         JOIN public.live l ON sc.video_id = l.video_id
         WHERE l.channel_id = $1 AND sc.created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY sc.created_at DESC 
         LIMIT 200`,
        [resolvedChannelId]
      );

      res.json({
        success: true,
        channel_id: resolvedChannelId,
        comments: commentsRes.rows,
        superchats: superchatsRes.rows,
      });
      return;
    }

    // Default if neither parameter is passed: return latest global comments from Oct 2026
    const latestComments = await p.query(
      `SELECT c.id, c.created_at, c.video_id, c.author_id, c.comment_id, c.comment_text,
              COALESCE(l.video_title, '') as video_title,
              ch.channel_name, ch.channel
       FROM public.comments c
       LEFT JOIN public.live l ON c.video_id = l.video_id
       LEFT JOIN public.channels ch ON l.channel_id = ch.channel_id
       WHERE c.created_at >= '${OCT_2026_CUTOFF}'
       ORDER BY c.created_at DESC 
       LIMIT 100`
    );

    const latestSuperchats = await p.query(
      `SELECT sc.id, sc.created_at, sc.amount, sc.currency, sc.video_id, sc.superchat_id, sc.superchat_text,
              COALESCE(l.video_title, '') as video_title,
              ch.channel_name, ch.channel
       FROM public.superchats sc
       LEFT JOIN public.live l ON sc.video_id = l.video_id
       LEFT JOIN public.channels ch ON l.channel_id = ch.channel_id
       WHERE sc.created_at >= '${OCT_2026_CUTOFF}'
       ORDER BY sc.created_at DESC 
       LIMIT 100`
    );

    res.json({
      success: true,
      comments: latestComments.rows,
      superchats: latestSuperchats.rows,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, fallback: false });
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
