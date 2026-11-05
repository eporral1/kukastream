import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

let pool: Pool | null = null;
const OCT_2026_CUTOFF = '2026-10-31 23:59:59';

function getPool(): Pool | null {
  if (pool) return pool;

  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (connectionString) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
    return pool;
  }

  const host = process.env.DB_HOST;
  const user = process.env.DB_USERNAME || process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_DATABASE || process.env.DB_NAME;
  const port = parseInt(process.env.DB_PORT || '5432', 10);

  if (host && user && password && database) {
    pool = new Pool({
      host,
      user,
      password,
      database,
      port,
      ssl: { rejectUnauthorized: false },
    });
    return pool;
  }

  return null;
}

async function executeQuery(query: string, params: any[] = []): Promise<any> {
  const p = getPool();
  if (!p) throw new Error('Database not configured');
  return p.query(query, params);
}

function cleanEternalTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function areTitlesSameShow(t1: string, t2: string): boolean {
  if (t1 === t2) return true;
  const c1 = cleanEternalTitle(t1);
  const c2 = cleanEternalTitle(t2);
  if (c1 === c2) return true;

  const stopWords = new Set([
    'en', 'vivo', 'radio', 'play', 'fm', 'con', 'del', 'los', 'las', 'por', 'para',
    'la', 'el', 'de', 'y', 'al', 'un', 'una', 'directo', 'online', 'hd'
  ]);

  const words1 = c1.split(' ').filter(w => w.length > 2 && !stopWords.has(w));
  const words2 = c2.split(' ').filter(w => w.length > 2 && !stopWords.has(w));

  if (words1.length === 0 || words2.length === 0) return false;

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  let common = 0;
  for (const w of set1) {
    if (set2.has(w)) common++;
  }

  const minWords = Math.min(set1.size, set2.size);
  const containment = common / minWords;
  const union = new Set([...set1, ...set2]).size;
  const jaccard = common / union;

  if (containment >= 0.70 && common >= 2) return true;
  if (jaccard >= 0.55 && common >= 2) return true;

  return false;
}

function clusterEternalTitleGroups(rawGroups: any[]): any[] {
  const sorted = [...rawGroups].sort(
    (a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime()
  );

  const clusters: any[] = [];

  for (const group of sorted) {
    let merged = false;
    for (const cluster of clusters) {
      if (
        cluster.video_id === group.video_id &&
        areTitlesSameShow(cluster.video_title, group.video_title)
      ) {
        const tClusterStart = new Date(cluster.start_time).getTime();
        const tGroupEnd = new Date(group.end_time).getTime();
        const gapHours = Math.abs(tClusterStart - tGroupEnd) / (1000 * 3600);

        if (gapHours <= 3) {
          cluster.start_time = new Date(
            Math.min(new Date(cluster.start_time).getTime(), new Date(group.start_time).getTime())
          ).toISOString();
          cluster.end_time = new Date(
            Math.max(new Date(cluster.end_time).getTime(), new Date(group.end_time).getTime())
          ).toISOString();
          cluster.max_viewers = Math.max(cluster.max_viewers, group.max_viewers);
          cluster.min_likes = Math.min(cluster.min_likes, group.min_likes);
          cluster.max_likes = Math.max(cluster.max_likes, group.max_likes);
          cluster.likes_delta = Math.max(0, cluster.max_likes - cluster.min_likes);
          cluster.min_comments = Math.min(cluster.min_comments, group.min_comments);
          cluster.max_comments = Math.max(cluster.max_comments, group.max_comments);
          cluster.comm_delta = Math.max(0, cluster.max_comments - cluster.min_comments);
          cluster.point_count += group.point_count;

          if (group.video_title.length > cluster.video_title.length) {
            cluster.video_title = group.video_title;
          }
          if (!cluster.titles.includes(group.video_title)) {
            cluster.titles.push(group.video_title);
          }
          merged = true;
          break;
        }
      }
    }

    if (!merged) {
      clusters.push({
        ...group,
        titles: [group.video_title],
      });
    }
  }

  return clusters;
}

async function enrichEternalStreams(streams: any[]) {
  if (!streams || streams.length === 0) return;
  const eternalStreams = streams.filter((s: any) => s.type === 'eternal');
  if (eternalStreams.length === 0) return;

  const channelIds = [...new Set(eternalStreams.map((s: any) => s.channel_id).filter(Boolean))];
  if (channelIds.length === 0) return;

  try {
    const titleGroupsRes: any = await executeQuery(
      `SELECT video_title,
              video_id,
              channel_id,
              MIN(scrape_date) AS start_time,
              MAX(scrape_date) AS end_time,
              MAX(concurrent_viewers) AS max_viewers,
              AVG(concurrent_viewers)::int AS avg_viewers,
              MIN(likes) AS min_likes,
              MAX(likes) AS max_likes,
              MIN(comments_count) AS min_comments,
              MAX(comments_count) AS max_comments,
              COUNT(*) AS point_count
       FROM public.minute
       WHERE channel_id = ANY($1) 
         AND scrape_date >= '${OCT_2026_CUTOFF}'
         AND video_title IS NOT NULL AND video_title <> ''
       GROUP BY video_title, video_id, channel_id
       ORDER BY MAX(scrape_date) DESC`,
      [channelIds]
    );

    const channelRawMap = new Map<string, any[]>();
    for (const row of titleGroupsRes.rows || []) {
      if (!channelRawMap.has(row.channel_id)) {
        channelRawMap.set(row.channel_id, []);
      }
      const maxLikes = Number(row.max_likes || 0);
      const minLikes = Number(row.min_likes || 0);
      const maxComm = Number(row.max_comments || 0);
      const minComm = Number(row.min_comments || 0);

      channelRawMap.get(row.channel_id)!.push({
        video_title: row.video_title,
        video_id: row.video_id,
        channel_id: row.channel_id,
        start_time: row.start_time,
        end_time: row.end_time,
        max_viewers: Number(row.max_viewers || 0),
        avg_viewers: Number(row.avg_viewers || 0),
        min_likes: minLikes,
        max_likes: maxLikes,
        likes_delta: Math.max(0, maxLikes - minLikes),
        min_comments: minComm,
        max_comments: maxComm,
        comm_delta: Math.max(0, maxComm - minComm),
        point_count: Number(row.point_count || 0),
      });
    }

    const channelSessionsMap = new Map<string, any[]>();
    for (const [chId, rawGroups] of channelRawMap.entries()) {
      channelSessionsMap.set(chId, clusterEternalTitleGroups(rawGroups));
    }

    for (const stream of eternalStreams) {
      const sessions = channelSessionsMap.get(stream.channel_id);
      if (sessions && sessions.length > 0) {
        if (stream.live === 'live') {
          const currentSession = sessions[0];
          stream.current_likes = currentSession.likes_delta;
          stream.comments_count = currentSession.comm_delta;
          if (currentSession.video_title) {
            stream.video_title = currentSession.video_title;
          }
          if (currentSession.start_time) {
            stream.start_date = currentSession.start_time;
          }
        } else {
          const matched = sessions.find((s: any) =>
            areTitlesSameShow(s.video_title, stream.video_title)
          );
          if (matched) {
            stream.current_likes = matched.likes_delta;
            stream.comments_count = matched.comm_delta;
            if (matched.video_title) {
              stream.video_title = matched.video_title;
            }
            if (matched.start_time) {
              stream.start_date = matched.start_time;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error enriching eternal streams in /api/streams ranking:', err);
  }
}

function formatEternalStreamTitle(dateVal?: string | Date | null): string {
  if (!dateVal) return 'Transmisión completa';
  let isoStr = '';
  if (dateVal instanceof Date) {
    isoStr = dateVal.toISOString();
  } else {
    isoStr = String(dateVal).trim();
  }
  const match = isoStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    const [, y, m, d] = match;
    const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = !isNaN(dateObj.getTime()) ? dayNames[dateObj.getDay()] : '';
    const dateFormatted = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    return dayName
      ? `Transmisión completa - ${dayName} ${dateFormatted}`
      : `Transmisión completa - ${dateFormatted}`;
  }
  return 'Transmisión completa';
}

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
      success: false,
      configured: false,
      error: 'Base de datos no configurada en Vercel.',
      streams: [],
    });
  }

  const tagParam = (req.query.tag as string | undefined)?.toLowerCase().trim();
  let tag = '';
  if (tagParam && tagParam !== 'all') {
    tag = tagParam.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  try {
    let streamsQuery = `
      SELECT 
        l.video_id, l.channel_id, l.concurrent_viewers, l.old_viewers,
        l.current_likes, l.old_likes, l.scrape_date, l.start_date, l.live,
        COALESCE(l.video_title, '') AS video_title,
        c.channel, c.channel_name, c.description, c.subs, c.thumb, c.tags, c.twitter, c.type, c.active,
        COALESCE(comm.comments_count, 0)::int as comments_count,
        comm.avg_viewers::int as avg_viewers,
        0::numeric as superchats_total,
        0::int as superchats_count
      FROM public.live l
      JOIN public.channels c ON l.channel_id = c.channel_id
      LEFT JOIN LATERAL (
        SELECT 
            COALESCE(m.comments_count, 0) as comments_count,
            (SELECT AVG(sub.concurrent_viewers)::int 
             FROM public.minute sub 
             WHERE sub.video_id = l.video_id) as avg_viewers
        FROM public.minute m 
        WHERE m.video_id = l.video_id 
        ORDER BY m.scrape_date DESC, m.id DESC 
        LIMIT 1
      ) comm ON true
      WHERE c.active::text IN ('1', 'true') and (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
        AND l.concurrent_viewers > 0
    `;

    const params: any[] = [];
    if (tag) {
      params.push(`%${tag}%`);
      streamsQuery += ` AND (c.tags ILIKE $1 OR REPLACE(c.tags, 'í', 'i') ILIKE $1)`;
    }

    streamsQuery += ` ORDER BY comm.avg_viewers DESC LIMIT 10;`;
    const streamsRes: any = await executeQuery(streamsQuery, params);

    const videoIds = streamsRes.rows.map((r: any) => r.video_id).filter(Boolean);
    if (videoIds.length > 0) {
      try {
        const scRes: any = await executeQuery(
          `SELECT video_id, 
                  SUM(CASE WHEN currency = 'ARS' THEN amount ELSE 0 END)::numeric as superchats_total,
                  COUNT(*)::int as superchats_count
           FROM public.superchats
           WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
           GROUP BY video_id`,
          [videoIds]
        );
        const scMap = new Map<string, { total: number; count: number }>();
        for (const row of scRes.rows || []) {
          scMap.set(row.video_id, {
            total: Number(row.superchats_total || 0),
            count: Number(row.superchats_count || 0),
          });
        }
        for (const stream of streamsRes.rows) {
          const sc = scMap.get(stream.video_id);
          if (sc) {
            stream.superchats_total = sc.total;
            stream.superchats_count = sc.count;
          }
          if (stream.type === 'eternal' && stream.live !== 'live') {
            stream.video_title = formatEternalStreamTitle(stream.start_date || stream.scrape_date);
          }
        }
      } catch (e) {
        console.error('Error fetching superchats for streams ranking:', e);
      }
    }

    // Enrich eternal streams with session metrics so likes and comments reflect show deltas
    await enrichEternalStreams(streamsRes.rows);

    return res.status(200).json({
      success: true,
      streams: streamsRes.rows,
    });
  } catch (err: any) {
    console.error('Error in /api/streams:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
      streams: [],
    });
  }
}
