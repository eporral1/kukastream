import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, OCT_2026_CUTOFF } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const videoId = req.query.video_id as string | undefined;
  const channelIdParam = req.query.channel_id as string | undefined;
  const channelParam = req.query.channel as string | undefined;

  const p = getPool();
  if (!p) {
    // Return schema-accurate mock data (matching exact DB tables comments & superchats, all October 2026)
    return res.json({
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
        {
          id: 934374,
          created_at: '2026-10-30T03:03:55.670Z',
          video_id: videoId || 'sample',
          author_id: '@mariana_rosario',
          comment_id: 'LCC.EhwKGkNLZWtZdVVHUG5ORXBqUkVaSFdnaUEx',
          comment_text: 'Comunidad prendida',
        },
        {
          id: 934373,
          created_at: '2026-10-30T03:02:11.890Z',
          video_id: videoId || 'sample',
          author_id: '@juanpablo_ba',
          comment_id: 'LCC.EhwKGkNLZWhZdVVHUG5ORXBqUkVaSFdnaEEy',
          comment_text: 'Saludos a todo el equipo',
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
          superchat_text: 'Aguante el streaming!',
        },
        {
          id: 13886,
          created_at: '2026-10-29T16:45:22.100Z',
          amount: 1000,
          currency: 'ARS',
          video_id: videoId || 'sample',
          superchat_id: 'LCC.EhwKGkNLcWl3X0xUMzVjREZTMnZjZ3FDeEF4',
          superchat_text: 'Un aporte para la producción del programa, genios!',
        },
      ],
    });
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

      return res.json({
        success: true,
        video_id: resolvedVideoId,
        comments: commentsRes.rows,
        superchats: superchatsRes.rows,
      });
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

      return res.json({
        success: true,
        channel_id: resolvedChannelId,
        comments: commentsRes.rows,
        superchats: superchatsRes.rows,
      });
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

    return res.json({
      success: true,
      comments: latestComments.rows,
      superchats: latestSuperchats.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, fallback: false });
  }
}
