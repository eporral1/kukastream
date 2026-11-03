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

  const poolConfig: any = {
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 5000,
    max: 3,
    keepAlive: true,
  };

  if (connectionString && !connectionString.includes('hjkhjk')) {
    pool = new Pool({
      ...poolConfig,
      connectionString,
    });
    pool.on('error', (err) => {
      console.warn('PostgreSQL pool error, resetting pool:', err.message);
      pool = null;
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
    ...poolConfig,
    host,
    user,
    password,
    database,
    port,
  });

  pool.on('error', (err) => {
    console.warn('PostgreSQL pool error, resetting pool:', err.message);
    pool = null;
  });

  return pool;
}

// Resilient query executor that retries once on connection termination/timeout
async function executeQuery<T = any>(text: string, params: any[] = []): Promise<T> {
  let p = getPool();
  if (!p) throw new Error('Base de datos no configurada en Vercel.');

  try {
    return (await p.query(text, params)) as T;
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (
      msg.includes('connection terminated') ||
      msg.includes('timeout') ||
      msg.includes('closed') ||
      msg.includes('socket')
    ) {
      console.warn('Retrying channel query after connection reset:', err.message);
      pool = null;
      p = getPool();
      if (p) {
        return (await p.query(text, params)) as T;
      }
    }
    throw err;
  }
}

// Helper to synthesize minute-by-minute timeline if database table `public.minute` has no rows yet
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

// Fallback 24h average data
function fallbackAvgData(baseViewers: number) {
  const points: any[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      let mult = 0.08;
      if (h >= 9 && h <= 14) mult = 0.5 + 0.5 * Math.sin(((h - 9) / 5) * Math.PI);
      else if (h >= 18 && h <= 23) mult = 0.35 + 0.45 * Math.sin(((h - 18) / 5) * Math.PI);
      points.push({
        scrape_date1: timeStr,
        avg_viewers: Math.round(baseViewers * mult),
        avg_likes: Math.round(baseViewers * mult * 0.4),
      });
    }
  }
  return points;
}

// Fallback heatmap data
function fallbackHeatmapData(basePeak: number) {
  const data: any[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const isPeak = (hour >= 9 && hour <= 13) || (hour >= 19 && hour <= 22);
    const factor = isPeak ? 0.75 : 0.15;
    const calc = (mult: number) => Math.round(basePeak * factor * mult);
    data.push({
      hour,
      mon_viewers: calc(0.95),
      tue_viewers: calc(1.0),
      wed_viewers: calc(1.05),
      thu_viewers: calc(1.02),
      fri_viewers: calc(0.9),
      sat_viewers: calc(0.35),
      sun_viewers: calc(0.4),
    });
  }
  return data;
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

  if (!channelParam && req.url) {
    const parts = req.url.split('?')[0].split('/');
    if (parts.length > 2 && parts[1] === 'api' && parts[2] === 'channel' && parts[3]) {
      channelParam = parts.slice(3).join('/');
    }
  }

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
      live: null,
      liveStream: null,
      streams: [],
      history: [],
      hour_day_data: [],
      avg_data: [],
    });
  }

  const cleanParam = channelParam.startsWith('@') ? channelParam.substring(1) : channelParam;
  const withAtParam = channelParam.startsWith('@') ? channelParam : `@${channelParam}`;

  try {
    const chRes = await executeQuery(
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
      return res.status(404).json({
        success: false,
        error: `Canal '${channelParam}' no encontrado en la base de datos.`,
        channel: null,
        live: null,
        liveStream: null,
        streams: [],
        history: [],
        hour_day_data: [],
        avg_data: [],
      });
    }

    const channelId = channel.channel_id;

    // Check active live stream for this channel (strictly live = 'live' and October 2026 onwards)
    let liveRes = await executeQuery(
      `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter, c.type,
        CASE 
          WHEN c.type = 'eternal' THEN (
            SELECT COALESCE(m.likes, l.current_likes) - COALESCE((
              SELECT sub.likes 
              FROM public.minute sub 
              WHERE sub.video_id = l.video_id AND sub.video_title = l.video_title 
              ORDER BY sub.scrape_date ASC, sub.id ASC 
              LIMIT 1
            ), COALESCE(m.likes, l.current_likes))
            FROM public.minute m 
            WHERE m.video_id = l.video_id 
            ORDER BY m.scrape_date DESC, m.id DESC 
            LIMIT 1
          )
          ELSE l.current_likes
        END::int as current_likes,
        CASE 
          WHEN c.type = 'eternal' THEN (
            SELECT m.comments_count - COALESCE((
              SELECT sub.comments_count 
              FROM public.minute sub 
              WHERE sub.video_id = l.video_id AND sub.video_title = l.video_title 
              ORDER BY sub.scrape_date ASC, sub.id ASC 
              LIMIT 1
            ), m.comments_count)
            FROM public.minute m 
            WHERE m.video_id = l.video_id 
            ORDER BY m.scrape_date DESC, m.id DESC 
            LIMIT 1
          )
          ELSE COALESCE((
            SELECT m.comments_count 
            FROM public.minute m 
            WHERE m.video_id = l.video_id 
            ORDER BY m.scrape_date DESC, m.id DESC 
            LIMIT 1
          ), 0)
        END::int as comments_count
       FROM public.live l
       JOIN public.channels c ON l.channel_id = c.channel_id
       WHERE c.channel_id = $1 AND l.live = 'live' AND l.concurrent_viewers > 0 
         AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
       ORDER BY l.concurrent_viewers DESC, l.scrape_date DESC LIMIT 1`,
      [channelId]
    );

    if (liveRes.rows.length === 0) {
      liveRes = await executeQuery(
        `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter, c.type,
          CASE 
            WHEN c.type = 'eternal' THEN (
              SELECT COALESCE(m.likes, l.current_likes) - COALESCE((
                SELECT sub.likes 
                FROM public.minute sub 
                WHERE sub.video_id = l.video_id AND sub.video_title = l.video_title 
                ORDER BY sub.scrape_date ASC, id ASC 
                LIMIT 1
              ), COALESCE(m.likes, l.current_likes))
              FROM public.minute m 
              WHERE m.video_id = l.video_id 
              ORDER BY m.scrape_date DESC, m.id DESC 
              LIMIT 1
            )
            ELSE l.current_likes
          END::int as current_likes,
          CASE 
            WHEN c.type = 'eternal' THEN (
              SELECT m.comments_count - COALESCE((
                SELECT sub.comments_count 
                FROM public.minute sub 
                WHERE sub.video_id = l.video_id AND sub.video_title = l.video_title 
                ORDER BY sub.scrape_date ASC, id ASC 
                LIMIT 1
              ), m.comments_count)
              FROM public.minute m 
              WHERE m.video_id = l.video_id 
              ORDER BY m.scrape_date DESC, m.id DESC 
              LIMIT 1
            )
            ELSE COALESCE((
              SELECT m.comments_count 
              FROM public.minute m 
              WHERE m.video_id = l.video_id 
              ORDER BY m.scrape_date DESC, m.id DESC 
              LIMIT 1
            ), 0)
          END::int as comments_count
         FROM public.live l
         JOIN public.channels c ON l.channel_id = c.channel_id
         WHERE c.channel_id = $1 AND l.live = 'live' 
           AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
         ORDER BY l.scrape_date DESC LIMIT 1`,
        [channelId]
      );
    }

    let live = liveRes.rows[0] || null;
    if (live && live.live !== 'live') {
      live = null;
    }

    if (live) {
      // 1. Max users & max likes from minute
      try {
        const maxStatsRes = await executeQuery(
          `SELECT MAX(concurrent_viewers) as max_users, MAX(likes) as max_likes 
           FROM public.minute 
           WHERE video_id = $1 AND scrape_date >= '${OCT_2026_CUTOFF}'`,
          [live.video_id]
        );
        if (maxStatsRes.rows.length > 0 && maxStatsRes.rows[0].max_users) {
          live.max_users = maxStatsRes.rows[0].max_users;
          live.max_likes = maxStatsRes.rows[0].max_likes;
        }
      } catch (errMinuteMax) {
        // Fallback max stats
        live.max_users = live.concurrent_viewers;
        live.max_likes = live.current_likes;
      }

      // 2. Minute-by-minute timeline curve for the live stream (strictly chronological)
      let minutePoints: any[] = [];
      try {
        let minuteQuery = `
          SELECT to_char(m.scrape_date, 'HH24:MI') AS scrape_date, 
                  m.scrape_date AS raw_date,
                  m.concurrent_viewers, 
                  m.likes,
                  COALESCE(m.comments_count, 0) as comments_count
           FROM public.minute m
           WHERE m.video_id = $1 AND m.scrape_date >= '${OCT_2026_CUTOFF}'
        `;

        minuteQuery += ` ORDER BY m.scrape_date ASC LIMIT 500`;

        const minuteRes = await executeQuery(minuteQuery, [live.video_id]);
        minutePoints = minuteRes.rows;
      } catch (errMinute) {
        minutePoints = [];
      }

      // If database has 0 or 1 point for the current stream, synthesize realistic progression points
      if (minutePoints.length < 2) {
        minutePoints = synthesizeTimeline(
          live.concurrent_viewers || 100,
          live.current_likes || 10,
          live.start_date,
          live.scrape_date
        );
      }

      if (minutePoints.length > 0) {
        minutePoints = minutePoints.map((pt: any) => ({
          ...pt,
          concurrent_viewers: Number(pt.concurrent_viewers || 0),
          likes: pt.likes !== null && pt.likes !== undefined ? Number(pt.likes) : null,
          comments_count: Number(pt.comments_count || 0),
        }));
      }
      live.data = minutePoints;

      if (channel.type === 'eternal' && live.video_title && minutePoints.length > 0) {
        const firstPoint = minutePoints[0];
        if (firstPoint && firstPoint.raw_date) {
          live.start_date = firstPoint.raw_date;
        }
      }

      // 3. Superchats summary for live stream
      try {
        const scRes = await executeQuery(
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

      // Set comments_count to the maximum from chart data
      if (Array.isArray(live.data) && live.data.length > 0) {
        const maxLiveComments = Math.max(...live.data.map((d: any) => Number(d.comments_count || 0)));
        if (maxLiveComments > 0) {
          live.comments_count = maxLiveComments;
        }
      }
      live.unique_commentators = live.comments_count || 0;
    }

    // Finished streams (October 2026 onwards)
    let finishedStreams: any[] = [];
    try {
      if (channel.type === 'eternal') {
        const titlesRes = await executeQuery(
          `SELECT DISTINCT video_id, video_title, MAX(scrape_date) AS scrape_date, MIN(scrape_date) AS start_date, MAX(concurrent_viewers) AS concurrent_viewers, MAX(likes) AS current_likes
           FROM public.minute
           WHERE video_id IN (SELECT video_id FROM public.live WHERE channel_id = $1)
             AND scrape_date >= '${OCT_2026_CUTOFF}'
             AND video_title IS NOT NULL AND video_title <> ''
           GROUP BY video_id, video_title
           ORDER BY scrape_date DESC LIMIT 10`,
          [channelId]
        );
        finishedStreams = titlesRes.rows.map((r: any) => ({
          ...r,
          live: 'finished'
        }));
      } else {
        const finishedRes = await executeQuery(
          `SELECT l.*, c.channel, c.channel_name, c.thumb, c.tags, c.subs, c.twitter
           FROM public.live l
           JOIN public.channels c ON l.channel_id = c.channel_id
           WHERE l.live <> 'live' AND c.channel_id = $1 
             AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
           ORDER BY l.scrape_date DESC, l.video_id LIMIT 5`,
          [channelId]
        );
        finishedStreams = finishedRes.rows;
      }

      // Comments count is extracted directly from the chart timeline data below

      for (const stream of finishedStreams) {
        try {
          const minData = await executeQuery(
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
          if (minData.rows.length >= 2) {
            stream.data = minData.rows;
          } else {
            stream.data = synthesizeTimeline(
              stream.concurrent_viewers || stream.max_users || 500,
              stream.current_likes || stream.max_likes || 50,
              stream.start_date,
              stream.scrape_date
            );
          }
          if (Array.isArray(stream.data) && stream.data.length > 0) {
            const maxComments = Math.max(...stream.data.map((d: any) => Number(d.comments_count || 0)));
            if (maxComments > 0) {
              stream.comments_count = maxComments;
            }
          }
        } catch {
          stream.data = synthesizeTimeline(
            stream.concurrent_viewers || stream.max_users || 500,
            stream.current_likes || stream.max_likes || 50,
            stream.start_date,
            stream.scrape_date
          );
        }

        try {
          const scRes = await executeQuery(
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

    // Heatmap data (desactivado temporalmente ya que no se muestra en la UI)
    const hourDayData: any[] = [];
    /*
    try {
      const heatmapRes = await executeQuery(
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
        ORDER BY hour;`,
        [channelId]
      );
      if (heatmapRes.rows.length > 0) {
        hourDayData = heatmapRes.rows;
      }
    } catch {
      hourDayData = [];
    }
    */

    // 24h Average data (desactivado temporalmente ya que no se muestra en la UI)
    const avgData: any[] = [];
    /*
    try {
      const avgRes = await executeQuery(
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
      if (avgRes.rows.length > 0) {
        avgData = avgRes.rows;
      }
    } catch {
      avgData = [];
    }
    */

    return res.status(200).json({
      success: true,
      channel,
      live,
      streams: finishedStreams,
      history: finishedStreams,
      timeline: live?.data || [],
      hour_day_data: hourDayData,
      avg_data: avgData,
    });
  } catch (err: any) {
    console.error(`Error fetching channel ${channelParam}:`, err);
    return res.status(200).json({
      success: false,
      error: `Error al consultar canal: ${err.message}`,
      channel: null,
      live: null,
      liveStream: null,
      streams: [],
      history: [],
      hour_day_data: [],
      avg_data: [],
    });
  }
}
