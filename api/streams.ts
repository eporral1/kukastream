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

/**
 * Chains cumulative metrics (likes and comments) across sequential shows within each video_id.
 * For the first show of a video_id: baseline is the first measurement of that video_id.
 * For any subsequent show i >= 1: baseline is the LAST measurement of the previous show (L_end,i-1).
 * Telescoping sum property:
 * Sum(Likes_delta_i) = Sum(L_end,i - L_end,i-1) = Max likes for that video_id.
 */
function chainEternalTitleDeltas(groups: any[]): any[] {
  if (!groups || groups.length === 0) return groups;

  const byVideoId = new Map<string, any[]>();
  for (const g of groups) {
    const vid = g.video_id || 'unknown';
    if (!byVideoId.has(vid)) {
      byVideoId.set(vid, []);
    }
    byVideoId.get(vid)!.push(g);
  }

  for (const [, videoGroups] of byVideoId.entries()) {
    videoGroups.sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    let prevLastLikes: number | null = null;
    let prevLastComments: number | null = null;

    for (let i = 0; i < videoGroups.length; i++) {
      const g = videoGroups[i];
      const curMaxLikes = Number(g.max_likes || 0);
      const curMinLikes = Number(g.min_likes || 0);
      const curMaxComm = Number(g.max_comments || 0);
      const curMinComm = Number(g.min_comments || 0);

      let baselineLikes: number;
      if (i === 0 || prevLastLikes === null) {
        baselineLikes = curMinLikes;
      } else {
        baselineLikes = curMaxLikes >= prevLastLikes ? prevLastLikes : curMinLikes;
      }

      let baselineComments: number;
      if (i === 0 || prevLastComments === null) {
        baselineComments = curMinComm;
      } else {
        baselineComments = curMaxComm >= prevLastComments ? prevLastComments : curMinComm;
      }

      g.baseline_likes = baselineLikes;
      g.baseline_comments = baselineComments;
      g.likes_delta = Math.max(0, curMaxLikes - baselineLikes);
      g.comm_delta = Math.max(0, curMaxComm - baselineComments);

      prevLastLikes = curMaxLikes;
      prevLastComments = curMaxComm;
    }
  }

  return groups;
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
      const clustered = clusterEternalTitleGroups(rawGroups);
      const chained = chainEternalTitleDeltas(clustered);
      chained.sort(
        (a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime()
      );
      channelSessionsMap.set(chId, chained);
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

  const rawSearch = (((req.query.q || req.query.search || '') as string) || '').trim();
  // Strip enclosing quotes like "la trinchera" or 'la trinchera'
  const searchParam = rawSearch.replace(/^["'«»“”„]+|["'«»“”„]+$/g, '').trim();

  try {
    // 1. Standard channels: Query individual streams from public.live
    const standardParams: any[] = [];
    let paramIndex = 1;

    let standardQuery = `
      SELECT 
        sub.video_id, sub.channel_id, 
        GREATEST(sub.concurrent_viewers, sub.old_viewers, 0)::int AS concurrent_viewers,
        sub.old_viewers,
        COALESCE(NULLIF(v_avg.avg_viewers, 0), sub.old_viewers, sub.concurrent_viewers, 0)::int AS avg_viewers,
        sub.current_likes, sub.old_likes, sub.scrape_date, sub.start_date, sub.live,
        sub.video_title,
        c.channel, c.channel_name, c.description, c.subs, c.thumb, c.tags, c.twitter, c.type,
        COALESCE(comm.comments_count, 0)::int as comments_count,
        0::numeric as superchats_total,
        0::int as superchats_count
      FROM (
        SELECT DISTINCT ON (video_id)
          video_id, channel_id, concurrent_viewers, old_viewers,
          current_likes, old_likes, scrape_date, start_date, live,
          COALESCE(video_title, '') AS video_title
        FROM public.live
        WHERE (scrape_date >= '${OCT_2026_CUTOFF}' OR start_date >= '${OCT_2026_CUTOFF}')
        ${!searchParam ? 'AND concurrent_viewers > 0' : ''}
        ORDER BY video_id, (CASE WHEN video_title IS NOT NULL AND video_title <> '' THEN 1 ELSE 0 END) DESC, concurrent_viewers DESC
      ) sub
      JOIN public.channels c ON sub.channel_id = c.channel_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(ROUND(AVG(m.concurrent_viewers)), 0)::int as avg_viewers
        FROM public.minute m 
        WHERE m.video_id = sub.video_id AND m.concurrent_viewers > 0
          AND m.scrape_date >= '${OCT_2026_CUTOFF}'
      ) v_avg ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(m.comments_count, 0) as comments_count
        FROM public.minute m 
        WHERE m.video_id = sub.video_id 
          AND m.scrape_date >= '${OCT_2026_CUTOFF}'
        ORDER BY m.scrape_date DESC, m.id DESC 
        LIMIT 1
      ) comm ON true
      WHERE c.active::text IN ('1', 'true')
        AND (c.type IS NULL OR c.type <> 'eternal')
    `;

    if (tag) {
      standardParams.push(`%${tag}%`);
      standardQuery += ` AND (c.tags ILIKE $${paramIndex} OR REPLACE(c.tags, 'í', 'i') ILIKE $${paramIndex})`;
      paramIndex++;
    }

    if (searchParam) {
      standardParams.push(`%${searchParam}%`);
      standardQuery += ` AND (sub.video_title ILIKE $${paramIndex} OR c.channel_name ILIKE $${paramIndex} OR c.channel ILIKE $${paramIndex} OR sub.video_id ILIKE $${paramIndex})`;
      paramIndex++;
    }

    standardQuery += ` ORDER BY COALESCE(NULLIF(v_avg.avg_viewers, 0), sub.old_viewers, sub.concurrent_viewers, 0) DESC LIMIT ${searchParam ? 200 : 100};`;
    const standardRes: any = await executeQuery(standardQuery, standardParams);
    const standardStreams: any[] = standardRes.rows || [];

    // 2. Eternal channels: Group by video_title from public.minute exactly as in /channel/:id
    let eternalStreams: any[] = [];
    try {
      let eternalChQuery = `
        SELECT channel_id, channel, channel_name, description, subs, thumb, tags, twitter, type
        FROM public.channels
        WHERE active::text IN ('1', 'true') AND type = 'eternal'
      `;
      const eternalChParams: any[] = [];
      let eternalParamIdx = 1;
      if (tag) {
        eternalChParams.push(`%${tag}%`);
        eternalChQuery += ` AND (tags ILIKE $${eternalParamIdx} OR REPLACE(tags, 'í', 'i') ILIKE $${eternalParamIdx})`;
        eternalParamIdx++;
      }

      const eternalChRes: any = await executeQuery(eternalChQuery, eternalChParams);
      const eternalChannels = eternalChRes.rows || [];
      const eternalChannelIds = eternalChannels.map((c: any) => c.channel_id).filter(Boolean);

      if (eternalChannelIds.length > 0) {
        const liveRes: any = await executeQuery(
          `SELECT l.channel_id, l.concurrent_viewers, l.video_id, l.video_title, l.scrape_date, l.start_date
           FROM public.live l
           WHERE l.channel_id = ANY($1)
             AND l.live = 'live'
             AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
             AND l.concurrent_viewers > 0`,
          [eternalChannelIds]
        );
        const liveMap = new Map<string, any>();
        for (const r of liveRes.rows || []) {
          liveMap.set(r.channel_id, r);
        }

        let titleGroupsQuery = `
          SELECT video_title,
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
        `;

        const titleParams: any[] = [eternalChannelIds];
        if (searchParam) {
          titleParams.push(`%${searchParam}%`);
          titleGroupsQuery += ` AND (video_title ILIKE $2 OR video_id ILIKE $2)`;
        }

        titleGroupsQuery += ` GROUP BY video_title, video_id, channel_id ORDER BY MAX(scrape_date) DESC LIMIT ${searchParam ? 200 : 100}`;

        const titleGroupsRes: any = await executeQuery(titleGroupsQuery, titleParams);

        const chGroupsMap = new Map<string, any[]>();
        for (const row of titleGroupsRes.rows || []) {
          if (!chGroupsMap.has(row.channel_id)) {
            chGroupsMap.set(row.channel_id, []);
          }
          const maxLikes = Number(row.max_likes || 0);
          const minLikes = Number(row.min_likes || 0);
          const maxComm = Number(row.max_comments || 0);
          const minComm = Number(row.min_comments || 0);

          chGroupsMap.get(row.channel_id)!.push({
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

        for (const ch of eternalChannels) {
          const rawGroups = chGroupsMap.get(ch.channel_id) || [];
          const clustered = clusterEternalTitleGroups(rawGroups);
          const chained = chainEternalTitleDeltas(clustered);
          chained.sort(
            (a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime()
          );
          const liveRow = liveMap.get(ch.channel_id);
          const isChannelLive = Boolean(liveRow);

          chained.forEach((group: any, idx: number) => {
            const isLiveShow = isChannelLive && idx === 0;
            if (searchParam) {
              const qLower = searchParam.toLowerCase();
              const titleMatch = (group.video_title || '').toLowerCase().includes(qLower);
              const chNameMatch = (ch.channel_name || '').toLowerCase().includes(qLower);
              const chHandleMatch = (ch.channel || '').toLowerCase().includes(qLower);
              const vidMatch = (group.video_id || '').toLowerCase().includes(qLower);
              if (!titleMatch && !chNameMatch && !chHandleMatch && !vidMatch) {
                return;
              }
            }

            eternalStreams.push({
              video_id: group.video_id,
              channel_id: ch.channel_id,
              channel_name: ch.channel_name,
              channel: ch.channel,
              thumb: ch.thumb,
              tags: ch.tags,
              subs: ch.subs,
              twitter: ch.twitter,
              type: 'eternal',
              video_title: group.video_title,
              live: isLiveShow ? 'live' : 'none',
              concurrent_viewers: isLiveShow ? (liveRow.concurrent_viewers || group.max_viewers) : group.max_viewers,
              old_viewers: group.avg_viewers,
              avg_viewers: group.avg_viewers,
              current_likes: group.likes_delta,
              old_likes: group.min_likes,
              comments_count: group.comm_delta,
              start_date: group.start_time,
              scrape_date: group.end_time,
              superchats_total: 0,
              superchats_count: 0,
            });
          });
        }
      }
    } catch (e) {
      console.warn('Error fetching eternal channel programs for /api/streams:', e);
    }

    const allStreams = [...standardStreams, ...eternalStreams];
    const filtered = allStreams.filter((s: any) => s.channel !== '@Radio10am');
    filtered.sort((a: any, b: any) => {
      const aAvg = Number(a.avg_viewers ?? a.old_viewers ?? a.concurrent_viewers) || 0;
      const bAvg = Number(b.avg_viewers ?? b.old_viewers ?? b.concurrent_viewers) || 0;
      return bAvg - aAvg;
    });

    const returnStreams = searchParam ? filtered.slice(0, 200) : filtered.slice(0, 50);

    const scLimit = Math.min(returnStreams.length, 25);
    for (let i = 0; i < scLimit; i++) {
      const stream = returnStreams[i];
      try {
        if (stream.type === 'eternal') {
          const scRes: any = await executeQuery(
            `SELECT currency, SUM(amount)::numeric AS total_amount, COUNT(id)::int AS sc_count
             FROM public.superchats
             WHERE video_id = $1 AND created_at >= $2 AND created_at <= $3
             GROUP BY currency`,
            [stream.video_id, stream.start_date, stream.scrape_date]
          );
          const arsSc = (scRes.rows || []).find((item: any) =>
            item.currency === 'ARS' || String(item.currency).toUpperCase().includes('ARS')
          );
          stream.superchats_total = arsSc ? Number(arsSc.total_amount || 0) : 0;
          stream.superchats_count = arsSc ? Number(arsSc.sc_count || 0) : 0;
        } else {
          const scRes: any = await executeQuery(
            `SELECT SUM(CASE WHEN currency = 'ARS' THEN amount ELSE 0 END)::numeric as superchats_total,
                    COUNT(*)::int as superchats_count
             FROM public.superchats
             WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'`,
            [stream.video_id]
          );
          if (scRes.rows && scRes.rows.length > 0) {
            stream.superchats_total = Number(scRes.rows[0].superchats_total || 0);
            stream.superchats_count = Number(scRes.rows[0].superchats_count || 0);
          }
        }
      } catch {
        // ignore
      }
    }

    return res.status(200).json({
      success: true,
      streams: returnStreams,
      total_found: filtered.length,
      is_search: Boolean(searchParam),
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
