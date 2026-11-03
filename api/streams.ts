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
        0::numeric as superchats_total,
        0::int as superchats_count
      FROM public.live l
      JOIN public.channels c ON l.channel_id = c.channel_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(m.comments_count, 0) as comments_count
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

    streamsQuery += ` ORDER BY l.concurrent_viewers DESC LIMIT 10;`;
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
