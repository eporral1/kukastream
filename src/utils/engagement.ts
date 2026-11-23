import { Channel, Stream } from '../types.ts';

/**
 * Calcula el sub-puntaje de volumen de espectadores (0 a 1)
 * Combinación 70% potencial (techo 45k) y 30% logarítmica (techo 100k)
 * para darle un peso decisivo al tamaño real de la audiencia.
 */
function computeAudienceVolumeScore(viewers: number): number {
  if (!viewers || viewers <= 0) return 0;
  const logPart = Math.min(1, Math.log10(viewers + 1) / 5.0);
  const powerPart = Math.min(1, Math.pow(viewers / 45000, 0.55));
  return 0.30 * logPart + 0.70 * powerPart;
}

/**
 * Calcula el Índice de Engagement (0 a 100) para un stream individual (en vivo o finalizado).
 * Pesos:
 * - 75% Volumen de Espectadores (concurrentes en vivo, o promedio/pico en finalizados)
 * - 13% % Usuarios únicos en el chat sobre pico (benchmark 25%)
 * - 6% % Likes sobre pico (benchmark 60%)
 * - 6% Mensajes por espectador pico (benchmark 3.0 msg/esp)
 */
export function calculateStreamEngagement(stream: Partial<Stream> & { subs?: number }): number {
  if (!stream) return 0;

  if (typeof stream.engagement_score === 'number' && !Number.isNaN(stream.engagement_score)) {
    return stream.engagement_score;
  }

  const isLive = stream.live === 'live';
  const concurrent = Number(stream.concurrent_viewers || 0);
  const avgViewers = Number(stream.avg_viewers || stream.old_viewers || concurrent || 0);
  const baseViewers = isLive ? (concurrent || avgViewers) : (avgViewers || concurrent);

  const peakViewers = Math.max(
    Number(stream.max_viewers || 0),
    Number(stream.max_users || 0),
    concurrent,
    avgViewers
  );

  if (peakViewers <= 0 && baseViewers <= 0) return 0;
  const denom = Math.max(peakViewers, baseViewers, 1);

  const likes = Math.max(
    0,
    Number(stream.current_likes ?? stream.max_likes ?? stream.old_likes ?? 0)
  );
  const comments = Math.max(0, Number(stream.comments_count || 0));
  const uniqueUsers = Math.max(0, Number(stream.unique_commentators || 0));

  const sAudience = computeAudienceVolumeScore(baseViewers || denom);
  const sChatUsers = Math.min(1, (uniqueUsers / denom) / 0.25);
  const sLikes = Math.min(1, (likes / denom) / 0.60);
  const sMsgs = Math.min(1, (comments / denom) / 3.0);

  const rawScore =
    100 *
    (0.75 * sAudience +
      0.13 * sChatUsers +
      0.06 * sLikes +
      0.06 * sMsgs);

  // Factor de confianza para streams con muy pocos espectadores (< 100)
  const confidence = Math.min(1, denom / 100);

  return Number((rawScore * confidence).toFixed(1));
}

/**
 * Calcula el Índice de Engagement (0 a 100) para un canal completo (/channels).
 * Pesos:
 * - 75% Volumen de Espectadores del canal (70% avg_viewers + 30% peak_viewers)
 * - 13% % Usuarios únicos en chat por emisión sobre avg_viewers (benchmark 25%)
 * - 6% % Likes por emisión sobre avg_viewers (benchmark 60%)
 * - 6% Mensajes por espectador (avg_comments / avg_viewers, benchmark 3.0)
 */
export function calculateChannelEngagement(channel: Partial<Channel>): number {
  if (!channel) return 0;

  if (typeof channel.engagement_score === 'number' && !Number.isNaN(channel.engagement_score)) {
    return channel.engagement_score;
  }

  const avgViewers = Math.max(0, Number(channel.avg_viewers || 0));
  const peakViewers = Math.max(avgViewers, Number(channel.peak_viewers || avgViewers));
  if (avgViewers <= 0 && peakViewers <= 0) return 0;

  const weightedViewers = 0.70 * avgViewers + 0.30 * peakViewers;
  const denom = Math.max(avgViewers, 1);

  const avgLikes = Math.max(0, Number(channel.avg_likes || 0));
  const avgComments = Math.max(0, Number(channel.avg_comments || 0));
  const avgUniqueUsers = Math.max(0, Number(channel.avg_unique_commentators || 0));

  const cAudience = computeAudienceVolumeScore(weightedViewers);
  const cChatUsers = Math.min(1, (avgUniqueUsers / denom) / 0.25);
  const cLikes = Math.min(1, (avgLikes / denom) / 0.60);
  const cMsgs = Math.min(1, (avgComments / denom) / 3.0);

  const rawScore =
    100 *
    (0.75 * cAudience +
      0.13 * cChatUsers +
      0.06 * cLikes +
      0.06 * cMsgs);

  const confidence = Math.min(1, denom / 100);

  return Number((rawScore * confidence).toFixed(1));
}
