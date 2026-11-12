export interface UserChannelBreakdown {
  channel_id: string;
  channel: string;
  channel_name: string;
  thumb: string;
  comment_count: number;
  streams_count: number;
  percentage: number;
  last_comment_at?: string;
}

export interface BotAnalysisResult {
  bot_score: number; // 0 to 99
  verdict: 'probable_bot' | 'suspicious' | 'human';
  label: string;
  summary: string;
  signals: string[];
  metrics: {
    repetition_rate: number; // 0-100%
    unique_messages: number;
    comments_per_active_minute: number;
    comments_per_stream: number;
    all_caps_rate: number; // 0-100%
    avg_message_length: number;
    cross_channel_dispersion: number; // 0-100% (% outside primary channel)
  };
}

export interface CrossChannelUserItem {
  rank: number;
  author_id: string;
  total_comments: number;
  channels_count: number;
  streams_count: number;
  first_comment_at?: string;
  last_comment_at?: string;
  latest_comment?: string;
  sample_comments: string[];
  channels_breakdown: UserChannelBreakdown[];
  bot_analysis: BotAnalysisResult;
}

export interface RawAuthorAnalysisInput {
  author_id: string;
  total_comments: number;
  channels_count: number;
  streams_count: number;
  unique_texts_count: number;
  active_minutes: number;
  avg_length: number;
  all_caps_count: number;
  channels_breakdown: UserChannelBreakdown[];
}

export function analyzeCommentatorBotRisk(input: RawAuthorAnalysisInput): BotAnalysisResult {
  const total = Math.max(input.total_comments, 1);
  const uniqueTexts = Math.max(1, Math.min(input.unique_texts_count || total, total));
  const activeMins = Math.max(1, input.active_minutes || Math.ceil(total / 1.5));
  const streamsCount = Math.max(1, input.streams_count || 1);

  const repetitionRate = Math.max(0, Math.min(100, Math.round(((total - uniqueTexts) / total) * 100)));
  const commentsPerActiveMinute = Number((total / activeMins).toFixed(2));
  const commentsPerStream = Math.round(total / streamsCount);
  const allCapsRate = Math.max(0, Math.min(100, Math.round(((input.all_caps_count || 0) / total) * 100)));
  const avgLength = input.avg_length || 28;

  const sortedChannels = [...(input.channels_breakdown || [])].sort(
    (a, b) => b.comment_count - a.comment_count
  );
  const topChannelCount = sortedChannels[0]?.comment_count || total;
  const dominantShare = Math.round((topChannelCount / total) * 100);
  const crossChannelDispersion = Math.max(0, 100 - dominantShare);

  let score = 8;
  const signals: string[] = [];

  // 1. Repetición de texto (Copy-Paste / Spam)
  if (repetitionRate >= 65 && total >= 8) {
    score += 38;
    signals.push(
      `Alta repetición de texto: el ${repetitionRate}% de sus comentarios son mensajes idénticos o copy-paste (${uniqueTexts} textos únicos sobre ${total}).`
    );
  } else if (repetitionRate >= 35 && total >= 8) {
    score += 22;
    signals.push(
      `Repetición moderada: el ${repetitionRate}% de sus comentarios repiten exactamente la misma frase.`
    );
  } else if (repetitionRate >= 20 && total >= 15) {
    score += 10;
    signals.push(`Reiteración de consignas (${repetitionRate}% de mensajes repetidos).`);
  }

  // 2. Cadencia / Velocidad de envío por minuto activo
  if (commentsPerActiveMinute >= 3.8) {
    score += 30;
    signals.push(
      `Cadencia tipo script/ráfaga: promedia ${commentsPerActiveMinute} comentarios por minuto activo.`
    );
  } else if (commentsPerActiveMinute >= 2.2) {
    score += 18;
    signals.push(
      `Alta velocidad de publicación: ${commentsPerActiveMinute} mensajes por minuto en momentos de actividad.`
    );
  }

  // 3. Actividad en múltiples canales (Cross-chat)
  if (input.channels_count >= 4) {
    score += 20;
    signals.push(
      `Presencia multicanal intensiva: comenta en ${input.channels_count} canales de streaming diferentes (${crossChannelDispersion}% fuera de su canal principal).`
    );
  } else if (input.channels_count === 3) {
    score += 14;
    signals.push(
      `Actividad cruzada en 3 canales distintos (${crossChannelDispersion}% de sus mensajes en canales secundarios).`
    );
  } else if (input.channels_count === 2 && crossChannelDispersion >= 20) {
    score += 8;
    signals.push(
      `Participación repartida entre 2 canales (${dominantShare}% / ${crossChannelDispersion}%).`
    );
  }

  // 4. Volumen por transmisión (Insistencia)
  if (commentsPerStream >= 60) {
    score += 18;
    signals.push(
      `Volumen extremo por emisión: promedia ${commentsPerStream} comentarios por cada transmisión en vivo.`
    );
  } else if (commentsPerStream >= 30) {
    score += 10;
    signals.push(`Alta insistencia por vivo: promedia ${commentsPerStream} mensajes por stream.`);
  }

  // 5. Patrón de nombre de usuario y formato (ALL CAPS / sufijos numéricos)
  const cleanHandle = (input.author_id || '').replace(/^@/, '');
  if (/\d{4,}$/.test(cleanHandle) || /[a-z]+[-_][a-z0-9]{5,}$/i.test(cleanHandle)) {
    score += 12;
    signals.push(
      `Handle con patrón autogenerado o sufijo numérico en serie (${input.author_id}).`
    );
  }

  if (allCapsRate >= 55 && total >= 10) {
    score += 10;
    signals.push(`Uso sistemático de mayúsculas (${allCapsRate}% de sus mensajes en ALL CAPS).`);
  }

  const finalScore = Math.min(98, Math.max(5, score));

  if (signals.length === 0) {
    signals.push(
      `Variedad léxica alta (${100 - repetitionRate}% de mensajes únicos) y cadencia compatible con escritura manual.`
    );
  }

  let verdict: 'probable_bot' | 'suspicious' | 'human' = 'human';
  let label = 'Humano Activo';
  let summary =
    'Patrón de escritura orgánico: alta diversidad de mensajes y ritmo compatible con un espectador real muy participativo.';

  if (finalScore >= 65) {
    verdict = 'probable_bot';
    label = 'Posible Bot / Script';
    summary =
      'Alta probabilidad de automatización, spam coordinado o copy-paste sistemático en el chat en vivo.';
  } else if (finalScore >= 38) {
    verdict = 'suspicious';
    label = 'Sospechoso / Spammer';
    summary =
      'Comportamiento hiperactivo o repetitivo (posible troll manual o uso parcial de portapapeles en múltiples chats).';
  }

  return {
    bot_score: finalScore,
    verdict,
    label,
    summary,
    signals,
    metrics: {
      repetition_rate: repetitionRate,
      unique_messages: uniqueTexts,
      comments_per_active_minute: commentsPerActiveMinute,
      comments_per_stream: commentsPerStream,
      all_caps_rate: allCapsRate,
      avg_message_length: avgLength,
      cross_channel_dispersion: crossChannelDispersion,
    },
  };
}
