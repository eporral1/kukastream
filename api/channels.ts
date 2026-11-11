import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, executeQuery, getCachedResponse, setCachedResponse } from '../src/utils/serverDb.ts';

const OCT_2026_CUTOFF = '2026-10-01 00:00:00';

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

async function enrichEternalChannels(channels: any[]) {
  if (!channels || channels.length === 0) return;
  const eternalChannels = channels.filter((c: any) => c.type === 'eternal' && c.channel_id);
  if (eternalChannels.length === 0) return;

  const eternalChannelIds = eternalChannels.map((c: any) => c.channel_id);

  try {
    const titleGroupsRes: any = await executeQuery(
      `SELECT channel_id,
              video_title,
              video_id,
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
       GROUP BY channel_id, video_title, video_id
       ORDER BY MAX(scrape_date) DESC`,
      [eternalChannelIds]
    );

    const byChannel = new Map<string, any[]>();
    for (const row of titleGroupsRes.rows || []) {
      const chId = row.channel_id;
      if (!byChannel.has(chId)) {
        byChannel.set(chId, []);
      }
      const list = byChannel.get(chId)!;
      if (list.length >= 25) continue;

      const maxLikes = Number(row.max_likes || 0);
      const minLikes = Number(row.min_likes || 0);
      const maxComm = Number(row.max_comments || 0);
      const minComm = Number(row.min_comments || 0);

      list.push({
        video_title: row.video_title,
        video_id: row.video_id,
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

    for (const channel of eternalChannels) {
      let titleGroups = byChannel.get(channel.channel_id) || [];
      titleGroups = clusterEternalTitleGroups(titleGroups);
      titleGroups = chainEternalTitleDeltas(titleGroups);

      if (titleGroups.length > 0) {
        channel.avg_viewers = Math.round(
          titleGroups.reduce((acc: number, g: any) => acc + (g.max_viewers || 0), 0) / titleGroups.length
        );
        const totalLikes = titleGroups.reduce((acc: number, g: any) => acc + g.likes_delta, 0);
        channel.avg_likes = Math.round(totalLikes / titleGroups.length);

        const totalComments = titleGroups.reduce((acc: number, g: any) => acc + g.comm_delta, 0);
        channel.avg_comments = Math.round(totalComments / titleGroups.length);

        const validGroups = titleGroups.filter((g: any) => (g.max_viewers || 0) > 0);
        if (validGroups.length > 0) {
          channel.likes_per_viewer = Number(
            (
              validGroups.reduce((acc: number, g: any) => acc + (g.likes_delta / g.max_viewers), 0) /
              validGroups.length
            ).toFixed(2)
          );
          channel.comments_per_viewer = Number(
            (
              validGroups.reduce((acc: number, g: any) => acc + (g.comm_delta / g.max_viewers), 0) /
              validGroups.length
            ).toFixed(2)
          );
        } else {
          channel.likes_per_viewer = 0;
          channel.comments_per_viewer = 0;
        }
      } else {
        channel.avg_viewers = 0;
        channel.avg_likes = 0;
        channel.avg_comments = 0;
        channel.likes_per_viewer = 0;
        channel.comments_per_viewer = 0;
      }
    }
  } catch (err) {
    console.error('Error enriching eternal channels in /api/channels:', err);
  }

  channels.sort((a: any, b: any) => (b.avg_viewers || 0) - (a.avg_viewers || 0));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Client');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Security check: Only allow requests originating from our frontend application
  const secFetchSite = req.headers['sec-fetch-site'];
  const secFetchMode = req.headers['sec-fetch-mode'];
  const appClientHeader = req.headers['x-app-client'];
  const isDirectBrowserNav = secFetchMode === 'navigate' || (secFetchSite === 'none' && !appClientHeader);
  const isCrossSite = secFetchSite === 'cross-site';

  if (isDirectBrowserNav || isCrossSite || appClientHeader !== 'kukastream-web') {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Este endpoint solo puede ser invocado desde la aplicación oficial.',
    });
  }

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: false,
      configured: false,
      error: 'Base de datos no configurada en Vercel.',
      channels: [],
    });
  }

  const cacheKey = 'api:channels:all';
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=40');
    return res.status(200).json(cached);
  }

  try {
    let query = `
      WITH video_stats AS (
        SELECT 
          m.channel_id,
          m.video_id,
          MAX(m.concurrent_viewers) AS max_viewers,
          MAX(m.likes) AS max_likes,
          MAX(m.comments_count) AS max_comments
        FROM public.minute m
        WHERE m.scrape_date >= '${OCT_2026_CUTOFF}'
        GROUP BY m.channel_id, m.video_id
        HAVING MAX(m.concurrent_viewers) > 0
      ),
      viewer_stats AS (
        SELECT channel_id,
               COALESCE(ROUND(AVG(max_viewers)), 0)::int AS avg_viewers
        FROM (
          SELECT video_id, channel_id,
                 MAX(concurrent_viewers) AS max_viewers
          FROM public.live
          WHERE scrape_date >= '${OCT_2026_CUTOFF}' AND concurrent_viewers > 0
          GROUP BY video_id, channel_id
        ) sub
        GROUP BY channel_id
      ),
      ratio_stats AS (
        SELECT 
          channel_id,
          COALESCE(ROUND(AVG(max_viewers)), 0)::int AS minute_avg_viewers,
          COALESCE(ROUND(AVG(max_likes)), 0)::int AS avg_likes,
          COALESCE(ROUND(AVG(max_comments)), 0)::int AS avg_comments,
          COALESCE(ROUND(AVG(CASE WHEN max_viewers > 0 THEN max_likes::numeric / max_viewers ELSE 0 END), 2), 0)::numeric AS likes_per_viewer,
          COALESCE(ROUND(AVG(CASE WHEN max_viewers > 0 THEN max_comments::numeric / max_viewers ELSE 0 END), 2), 0)::numeric AS comments_per_viewer
        FROM video_stats
        GROUP BY channel_id
      )
      SELECT 
        c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active, c.type,
        COALESCE(vs.avg_viewers, rs.minute_avg_viewers, 0)::int AS avg_viewers,
        COALESCE(rs.avg_likes, 0)::int AS avg_likes,
        COALESCE(rs.avg_comments, 0)::int AS avg_comments,
        COALESCE(rs.likes_per_viewer, 0)::numeric AS likes_per_viewer,
        COALESCE(rs.comments_per_viewer, 0)::numeric AS comments_per_viewer
      FROM public.channels c
      LEFT JOIN viewer_stats vs ON vs.channel_id = c.channel_id
      LEFT JOIN ratio_stats rs ON rs.channel_id = c.channel_id
      WHERE c.active::text IN ('1', 'true')
      ORDER BY avg_viewers DESC;
    `;
    let result: any;
    try {
      result = await executeQuery(query);
    } catch {
      query = `
        WITH live_stats AS (
          SELECT 
            channel_id,
            video_id,
            MAX(concurrent_viewers) AS max_viewers,
            MAX(current_likes) AS max_likes
          FROM public.live
          WHERE scrape_date >= '${OCT_2026_CUTOFF}' AND concurrent_viewers > 0
          GROUP BY channel_id, video_id
        ),
        channel_ratios AS (
          SELECT 
            channel_id,
            COALESCE(ROUND(AVG(max_viewers)), 0)::int AS avg_viewers,
            COALESCE(ROUND(AVG(max_likes)), 0)::int AS avg_likes,
            COALESCE(ROUND(AVG(CASE WHEN max_viewers > 0 THEN max_likes::numeric / max_viewers ELSE 0 END), 2), 0)::numeric AS likes_per_viewer,
            0::numeric AS comments_per_viewer
          FROM live_stats
          GROUP BY channel_id
        )
        SELECT 
          c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active, c.type,
          COALESCE(cr.avg_viewers, 0)::int AS avg_viewers,
          COALESCE(cr.avg_likes, 0)::int AS avg_likes,
          0::int AS avg_comments,
          COALESCE(cr.likes_per_viewer, 0)::numeric AS likes_per_viewer,
          COALESCE(cr.comments_per_viewer, 0)::numeric AS comments_per_viewer
        FROM public.channels c
        LEFT JOIN channel_ratios cr ON cr.channel_id = c.channel_id
        WHERE c.active::text IN ('1', 'true')
        ORDER BY avg_viewers DESC;
      `;
      result = await executeQuery(query);
    }
    if (result && result.rows) {
      await enrichEternalChannels(result.rows);
    }
    const payload = { success: true, channels: result.rows };
    setCachedResponse(cacheKey, payload, 15000);
    res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=40');
    return res.status(200).json(payload);
  } catch (err: any) {
    console.error('Error in /api/channels:', err);
    return res.status(200).json({
      success: false,
      error: `Error al consultar canales: ${err.message}`,
      channels: [],
    });
  }
}
