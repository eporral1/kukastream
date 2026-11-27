import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, executeQuery, getCachedResponse, setCachedResponse } from '../utils/serverDb.ts';
import { calculateChannelEngagement } from '../utils/engagement.ts';
import { isStreamTitleBlocked, getBlockedTitleSqlClause } from '../config/streamFilters.ts';

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
          cluster.min_authors = Math.min(cluster.min_authors ?? 0, group.min_authors ?? 0);
          cluster.max_authors = Math.max(cluster.max_authors ?? 0, group.max_authors ?? 0);
          cluster.authors_delta = Math.max(0, cluster.max_authors - cluster.min_authors);
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
 * Chains cumulative metrics (likes, comments, authors) across sequential shows within each video_id.
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
    let prevLastAuthors: number | null = null;

    for (let i = 0; i < videoGroups.length; i++) {
      const g = videoGroups[i];
      const curMaxLikes = Number(g.max_likes || 0);
      const curMinLikes = Number(g.min_likes || 0);
      const curMaxComm = Number(g.max_comments || 0);
      const curMinComm = Number(g.min_comments || 0);
      const curMaxAuth = Number(g.max_authors || 0);
      const curMinAuth = Number(g.min_authors || 0);

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

      let baselineAuthors: number;
      if (i === 0 || prevLastAuthors === null) {
        baselineAuthors = curMinAuth;
      } else {
        baselineAuthors = curMaxAuth >= prevLastAuthors ? prevLastAuthors : curMinAuth;
      }

      g.baseline_likes = baselineLikes;
      g.baseline_comments = baselineComments;
      g.baseline_authors = baselineAuthors;
      g.likes_delta = Math.max(0, curMaxLikes - baselineLikes);
      g.comm_delta = Math.max(0, curMaxComm - baselineComments);
      g.authors_delta = Math.max(0, curMaxAuth - baselineAuthors);

      prevLastLikes = curMaxLikes;
      prevLastComments = curMaxComm;
      prevLastAuthors = curMaxAuth;
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
      `WITH last_7_business_days AS (
         SELECT DISTINCT scrape_date::date AS bday
         FROM public.live
         WHERE scrape_date >= '${OCT_2026_CUTOFF}'
           AND GREATEST(COALESCE(concurrent_viewers, 0), COALESCE(old_viewers, 0)) > 0
           AND EXTRACT(ISODOW FROM scrape_date) BETWEEN 1 AND 5
         ORDER BY bday DESC
         LIMIT 7
       )
       SELECT channel_id,
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
              MIN(COALESCE(authors_count, 0)) AS min_authors,
              MAX(COALESCE(authors_count, 0)) AS max_authors,
              COUNT(*) AS point_count
       FROM public.minute
       WHERE channel_id = ANY($1)
         AND scrape_date >= COALESCE((SELECT MIN(bday)::timestamp FROM last_7_business_days), '${OCT_2026_CUTOFF}'::timestamp)
         AND scrape_date::date IN (SELECT bday FROM last_7_business_days)
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

      const maxLikes = Number(row.max_likes || 0);
      const minLikes = Number(row.min_likes || 0);
      const maxComm = Number(row.max_comments || 0);
      const minComm = Number(row.min_comments || 0);
      const maxAuth = Number(row.max_authors || 0);
      const minAuth = Number(row.min_authors || 0);

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
        min_authors: minAuth,
        max_authors: maxAuth,
        authors_delta: Math.max(0, maxAuth - minAuth),
        point_count: Number(row.point_count || 0),
      });
    }

    for (const channel of eternalChannels) {
      let titleGroups = byChannel.get(channel.channel_id) || [];
      titleGroups = clusterEternalTitleGroups(titleGroups);
      titleGroups = chainEternalTitleDeltas(titleGroups);
      titleGroups = titleGroups.filter(
        (g: any) =>
          !isStreamTitleBlocked(g.video_title) &&
          !(Array.isArray(g.titles) && g.titles.some((t: string) => isStreamTitleBlocked(t)))
      );

      if (titleGroups.length > 0) {
        channel.avg_viewers = Math.round(
          titleGroups.reduce((acc: number, g: any) => acc + (g.max_viewers || 0), 0) / titleGroups.length
        );
        const totalLikes = titleGroups.reduce((acc: number, g: any) => acc + g.likes_delta, 0);
        channel.avg_likes = Math.round(totalLikes / titleGroups.length);

        const totalComments = titleGroups.reduce((acc: number, g: any) => acc + g.comm_delta, 0);
        channel.avg_comments = Math.round(totalComments / titleGroups.length);

        const totalAuthors = titleGroups.reduce((acc: number, g: any) => acc + (g.authors_delta || 0), 0);
        channel.avg_unique_commentators = Math.round(totalAuthors / titleGroups.length);

        const validGroups = titleGroups.filter((g: any) => (g.avg_viewers || g.max_viewers || 0) > 0);
        if (validGroups.length > 0) {
          channel.likes_per_viewer = Number(
            (
              validGroups.reduce((acc: number, g: any) => acc + (g.likes_delta / (g.avg_viewers || g.max_viewers)), 0) /
              validGroups.length
            ).toFixed(4)
          );
          channel.comments_per_viewer = Number(
            (
              validGroups.reduce((acc: number, g: any) => acc + (g.comm_delta / (g.avg_viewers || g.max_viewers)), 0) /
              validGroups.length
            ).toFixed(4)
          );
          channel.chatters_per_viewer = Number(
            (
              validGroups.reduce((acc: number, g: any) => {
                const denom = g.avg_viewers || g.max_viewers || 1;
                return acc + Math.min(1, (g.authors_delta || 0) / denom);
              }, 0) /
              validGroups.length
            ).toFixed(4)
          );
          const groupsWithAuthors = validGroups.filter((g: any) => (g.authors_delta || 0) > 0);
          channel.comments_per_user = groupsWithAuthors.length > 0
            ? Number(
                (
                  groupsWithAuthors.reduce((acc: number, g: any) => acc + (g.comm_delta / g.authors_delta), 0) /
                  groupsWithAuthors.length
                ).toFixed(2)
              )
            : 0;
        } else {
          channel.likes_per_viewer = 0;
          channel.comments_per_viewer = 0;
          channel.chatters_per_viewer = 0;
          channel.comments_per_user = 0;
        }
      } else {
        channel.avg_viewers = 0;
        channel.avg_likes = 0;
        channel.avg_comments = 0;
        channel.likes_per_viewer = 0;
        channel.comments_per_viewer = 0;
        channel.chatters_per_viewer = 0;
        channel.comments_per_user = 0;
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

  const sortParam = (((req.query.sort || '') as string) || 'engagement').toLowerCase();
  const cacheKey = 'api:channels:v7:7bdays';
  const cached = getCachedResponse(cacheKey);
  if (cached && Array.isArray(cached.channels)) {
    const sortedChannels = [...cached.channels].sort((a: any, b: any) => {
      if (sortParam === 'viewers') return (Number(b.avg_viewers) || 0) - (Number(a.avg_viewers) || 0);
      if (sortParam === 'likes') return (Number(b.avg_likes) || 0) - (Number(a.avg_likes) || 0);
      if (sortParam === 'comments') return (Number(b.comments_per_user) || 0) - (Number(a.comments_per_user) || 0);
      if (sortParam === 'chat_users') return (Number(b.chatters_per_viewer) || 0) - (Number(a.chatters_per_viewer) || 0);
      return (Number(b.engagement_score) || 0) - (Number(a.engagement_score) || 0) || (Number(b.avg_viewers) || 0) - (Number(a.avg_viewers) || 0);
    });
    res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=40');
    return res.status(200).json({ ...cached, channels: sortedChannels });
  }

  try {
    let query = `
      WITH last_7_business_days AS (
        SELECT DISTINCT scrape_date::date AS bday
        FROM public.live
        WHERE scrape_date >= '${OCT_2026_CUTOFF}'
          AND GREATEST(COALESCE(concurrent_viewers, 0), COALESCE(old_viewers, 0)) > 0
          AND EXTRACT(ISODOW FROM scrape_date) BETWEEN 1 AND 5
        ORDER BY bday DESC
        LIMIT 7
      ),
      video_stats AS (
        SELECT 
          m.channel_id,
          m.video_id,
          MAX(m.concurrent_viewers) AS max_viewers,
          COALESCE(ROUND(AVG(CASE WHEN m.concurrent_viewers > 0 THEN m.concurrent_viewers END)), MAX(m.concurrent_viewers), 0)::int AS avg_viewers,
          MAX(m.likes) AS max_likes,
          MAX(m.comments_count) AS max_comments,
          COALESCE((ARRAY_AGG(m.authors_count ORDER BY m.scrape_date DESC, m.id DESC) FILTER (WHERE m.authors_count IS NOT NULL))[1], 0)::int AS last_authors_count,
          COALESCE(ROUND(AVG(CASE WHEN m.concurrent_viewers > 0 AND m.authors_count IS NOT NULL THEN LEAST(1.0, m.authors_count::numeric / m.concurrent_viewers) END), 4), 0)::numeric AS pt_chatters_ratio
        FROM public.minute m
        WHERE m.scrape_date >= COALESCE((SELECT MIN(bday)::timestamp FROM last_7_business_days), '${OCT_2026_CUTOFF}'::timestamp)
          AND m.scrape_date::date IN (SELECT bday FROM last_7_business_days)
          ${getBlockedTitleSqlClause('m.video_title')}
          AND NOT EXISTS (
            SELECT 1 FROM public.live bl
            WHERE bl.video_id = m.video_id
              AND NOT (1=1 ${getBlockedTitleSqlClause('bl.video_title')})
          )
        GROUP BY m.channel_id, m.video_id
        HAVING MAX(m.concurrent_viewers) > 0
      ),
      recent_videos AS (
        SELECT video_id, channel_id,
               MAX(GREATEST(COALESCE(concurrent_viewers, 0), COALESCE(old_viewers, 0))) AS max_viewers,
               MAX(GREATEST(COALESCE(current_likes, 0), COALESCE(old_likes, 0))) AS max_likes
        FROM public.live
        WHERE scrape_date >= COALESCE((SELECT MIN(bday)::timestamp FROM last_7_business_days), '${OCT_2026_CUTOFF}'::timestamp)
          AND scrape_date::date IN (SELECT bday FROM last_7_business_days)
          AND GREATEST(COALESCE(concurrent_viewers, 0), COALESCE(old_viewers, 0)) > 0
          ${getBlockedTitleSqlClause('video_title')}
        GROUP BY video_id, channel_id
      ),
      all_channel_videos AS (
        SELECT
          COALESCE(rv.channel_id, vs.channel_id) AS channel_id,
          COALESCE(rv.video_id, vs.video_id) AS video_id,
          GREATEST(COALESCE(rv.max_viewers, 0), COALESCE(vs.max_viewers, 0)) AS max_viewers,
          COALESCE(NULLIF(vs.avg_viewers, 0), GREATEST(COALESCE(rv.max_viewers, 0), COALESCE(vs.max_viewers, 0))) AS avg_viewers,
          GREATEST(COALESCE(vs.max_likes, 0), COALESCE(rv.max_likes, 0)) AS max_likes,
          COALESCE(vs.max_comments, 0) AS max_comments,
          COALESCE(vs.last_authors_count, 0) AS unique_commentators,
          COALESCE(vs.pt_chatters_ratio, 0) AS pt_chatters_ratio
        FROM recent_videos rv
        FULL OUTER JOIN video_stats vs
          ON rv.channel_id = vs.channel_id AND rv.video_id = vs.video_id
      ),
      channel_stats AS (
        SELECT 
          acv.channel_id,
          COALESCE(ROUND(AVG(acv.max_viewers)), 0)::int AS avg_viewers,
          COALESCE(ROUND(AVG(acv.max_likes)), 0)::int AS avg_likes,
          COALESCE(ROUND(AVG(acv.max_comments)), 0)::int AS avg_comments,
          COALESCE(ROUND(AVG(acv.unique_commentators)), 0)::int AS avg_unique_commentators,
          COALESCE(ROUND(AVG(CASE WHEN acv.avg_viewers > 0 THEN acv.max_likes::numeric / acv.avg_viewers ELSE 0 END), 4), 0)::numeric AS likes_per_viewer,
          COALESCE(ROUND(AVG(CASE WHEN acv.avg_viewers > 0 THEN acv.max_comments::numeric / acv.avg_viewers ELSE 0 END), 4), 0)::numeric AS comments_per_viewer,
          COALESCE(ROUND(AVG(
            CASE
              WHEN acv.unique_commentators >= acv.avg_viewers AND acv.pt_chatters_ratio > 0 THEN acv.pt_chatters_ratio
              WHEN acv.avg_viewers > 0 THEN LEAST(1.0, acv.unique_commentators::numeric / acv.avg_viewers)
              ELSE 0
            END
          ), 4), 0)::numeric AS chatters_per_viewer,
          COALESCE(ROUND(AVG(CASE WHEN acv.unique_commentators > 0 THEN acv.max_comments::numeric / acv.unique_commentators ELSE NULL END), 2), 0)::numeric AS comments_per_user
        FROM all_channel_videos acv
        GROUP BY acv.channel_id
      )
      SELECT 
        c.channel, c.channel_name, c.description, c.subs, c.channel_id, c.thumb, c.tags, c.twitter, c.active, c.type,
        COALESCE(cs.avg_viewers, 0)::int AS avg_viewers,
        COALESCE(cs.avg_likes, 0)::int AS avg_likes,
        COALESCE(cs.avg_comments, 0)::int AS avg_comments,
        COALESCE(cs.avg_unique_commentators, 0)::int AS avg_unique_commentators,
        COALESCE(cs.likes_per_viewer, 0)::numeric AS likes_per_viewer,
        COALESCE(cs.comments_per_viewer, 0)::numeric AS comments_per_viewer,
        COALESCE(cs.chatters_per_viewer, 0)::numeric AS chatters_per_viewer,
        COALESCE(cs.comments_per_user, 0)::numeric AS comments_per_user
      FROM public.channels c
      LEFT JOIN channel_stats cs ON cs.channel_id = c.channel_id
      WHERE c.active::text IN ('1', 'true')
      ORDER BY avg_viewers DESC;
    `;
    let result: any;
    try {
      result = await executeQuery(query);
    } catch {
      query = `
        WITH last_7_business_days AS (
          SELECT DISTINCT scrape_date::date AS bday
          FROM public.live
          WHERE scrape_date >= '${OCT_2026_CUTOFF}'
            AND GREATEST(COALESCE(concurrent_viewers, 0), COALESCE(old_viewers, 0)) > 0
            AND EXTRACT(ISODOW FROM scrape_date) BETWEEN 1 AND 5
          ORDER BY bday DESC
          LIMIT 7
        ),
        live_stats AS (
          SELECT 
            channel_id,
            video_id,
            MAX(GREATEST(COALESCE(concurrent_viewers, 0), COALESCE(old_viewers, 0))) AS max_viewers,
            MAX(GREATEST(COALESCE(current_likes, 0), COALESCE(old_likes, 0))) AS max_likes
          FROM public.live
          WHERE scrape_date >= COALESCE((SELECT MIN(bday)::timestamp FROM last_7_business_days), '${OCT_2026_CUTOFF}'::timestamp)
            AND scrape_date::date IN (SELECT bday FROM last_7_business_days)
            AND GREATEST(COALESCE(concurrent_viewers, 0), COALESCE(old_viewers, 0)) > 0
            ${getBlockedTitleSqlClause('video_title')}
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
          0::int AS avg_unique_commentators,
          COALESCE(cr.likes_per_viewer, 0)::numeric AS likes_per_viewer,
          COALESCE(cr.comments_per_viewer, 0)::numeric AS comments_per_viewer,
          0::numeric AS chatters_per_viewer,
          0::numeric AS comments_per_user
        FROM public.channels c
        LEFT JOIN channel_ratios cr ON cr.channel_id = c.channel_id
        WHERE c.active::text IN ('1', 'true')
        ORDER BY avg_viewers DESC;
      `;
      result = await executeQuery(query);
    }
    if (result && result.rows) {
      await enrichEternalChannels(result.rows);
      for (const ch of result.rows) {
        ch.engagement_score = calculateChannelEngagement(ch);
      }
      result.rows.sort((a: any, b: any) => {
        if (sortParam === 'viewers') return (Number(b.avg_viewers) || 0) - (Number(a.avg_viewers) || 0);
        if (sortParam === 'likes') return (Number(b.avg_likes) || 0) - (Number(a.avg_likes) || 0);
        if (sortParam === 'comments') return (Number(b.avg_comments) || 0) - (Number(a.avg_comments) || 0);
        if (sortParam === 'chat_users') return (Number(b.avg_unique_commentators) || 0) - (Number(a.avg_unique_commentators) || 0);
        return (Number(b.engagement_score) || 0) - (Number(a.engagement_score) || 0) || (Number(b.avg_viewers) || 0) - (Number(a.avg_viewers) || 0);
      });
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
