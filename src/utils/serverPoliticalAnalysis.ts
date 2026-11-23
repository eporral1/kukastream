import { GoogleGenAI, Type } from '@google/genai';
import { getPool } from './serverDb.ts';
import {
  HateSpeechAnalysisResult,
  HateSpeechCategoryId,
  HateSpeechSeverity,
  HATE_SPEECH_CATEGORIES,
  buildDeterministicHateSpeechAnalysis,
  extractMentionedTargets,
  recomputeHateSpeechSummary,
} from './hateSpeechAnalysis.ts';

const OCT_2026_CUTOFF = '2026-10-01 00:00:00';

export interface HateSpeechAnalysisOptions {
  video_id: string;
  force?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  is_live?: boolean;
  video_title?: string;
}

export interface HateSpeechAnalysisResponse {
  analysis: HateSpeechAnalysisResult;
  cached: boolean;
}

/*
// =========================================================================
// COMENTADO: Análisis de Tendencia Política y Compás Ideológico
// =========================================================================
import {
  POLITICAL_SECTORS,
  PoliticalAnalysisResult,
  PoliticalSectorAnalysis,
  PoliticalSectorId,
  buildDeterministicPoliticalAnalysis,
  scoreToStance,
} from './politicalAnalysis.ts';
*/

export async function generateVideoHateSpeechAnalysis(
  options: HateSpeechAnalysisOptions
): Promise<HateSpeechAnalysisResponse> {
  const p = getPool();
  if (!p) {
    throw new Error('DB not connected.');
  }

  const { video_id } = options;

  let liveRow: any = {};
  try {
    const checkRes = await p.query(
      `SELECT l.video_title, l.channel_id, l.start_date, l.scrape_date, l.live,
              c.channel_name, c.channel, c.type AS channel_type, c.description AS channel_description
       FROM public.live l
       LEFT JOIN public.channels c ON c.channel_id = l.channel_id
       WHERE l.video_id = $1 LIMIT 1`,
      [video_id]
    );
    liveRow = checkRes.rows[0] || {};
  } catch {
    liveRow = {};
  }

  let resolvedStartDate: string | null = options.start_date || null;
  let resolvedEndDate: string | null = options.end_date || null;
  let isEternalEmission =
    Boolean(resolvedStartDate) || String(liveRow.channel_type || '').toLowerCase() === 'eternal';
  let detectedEternalTitle: string | null = null;

  if (!resolvedStartDate) {
    try {
      const etRes = await p.query(
        `SELECT m.video_title,
                MIN(m.scrape_date) AS start_time,
                MAX(m.scrape_date) AS end_time
         FROM public.minute m
         JOIN public.channels c ON m.channel_id = c.channel_id
         WHERE m.video_id = $1
           AND c.type = 'eternal'
           AND m.video_title IS NOT NULL AND m.video_title <> ''
         GROUP BY m.video_title
         ORDER BY MAX(m.scrape_date) DESC
         LIMIT 1`,
        [video_id]
      );
      if (etRes.rows.length > 0) {
        isEternalEmission = true;
        resolvedStartDate = etRes.rows[0].start_time;
        resolvedEndDate = etRes.rows[0].end_time;
        detectedEternalTitle = etRes.rows[0].video_title;
      }
    } catch {
      // continue as standard stream
    }
  }

  const videoTitle =
    options.video_title ||
    detectedEternalTitle ||
    liveRow.video_title ||
    'Transmisión en Vivo';
  const channelName = liveRow.channel_name || liveRow.channel || 'Canal de Streaming';
  const channelHandle = liveRow.channel || '';

  let commentRows: any[] = [];
  let superchatRows: any[] = [];

  if (isEternalEmission && resolvedStartDate) {
    const effectiveEndDate = options.is_live ? null : resolvedEndDate;
    const [commentsRes, superchatsRes] = await Promise.all([
      p
        .query(
          `SELECT created_at, video_id, author_id, COALESCE(comment_text, '') AS comment_text
           FROM public.comments
           WHERE video_id = $1
             AND created_at >= ($2::timestamptz - INTERVAL '5 minutes')
             AND ($3::timestamptz IS NULL OR created_at <= ($3::timestamptz + INTERVAL '5 minutes'))
           ORDER BY created_at DESC`,
          [video_id, resolvedStartDate, effectiveEndDate]
        )
        .catch(() => ({ rows: [] })),
      p
        .query(
          `SELECT created_at, amount, currency, video_id, COALESCE(superchat_text, '') AS superchat_text
           FROM public.superchats
           WHERE video_id = $1
             AND created_at >= ($2::timestamptz - INTERVAL '5 minutes')
             AND ($3::timestamptz IS NULL OR created_at <= ($3::timestamptz + INTERVAL '5 minutes'))
           ORDER BY created_at DESC`,
          [video_id, resolvedStartDate, effectiveEndDate]
        )
        .catch(() => ({ rows: [] })),
    ]);

    commentRows = (commentsRes.rows || []).map((r: any, idx: number) => ({
      id: `cmt_${r.video_id}_${idx}`,
      created_at: r.created_at,
      video_id: r.video_id,
      author_id: r.author_id,
      comment_text: r.comment_text,
    }));

    superchatRows = (superchatsRes.rows || []).map((r: any, idx: number) => ({
      id: `sc_${r.video_id}_${idx}`,
      created_at: r.created_at,
      amount: Number(r.amount || 0),
      currency: r.currency || 'ARS',
      video_id: r.video_id,
      superchat_text: r.superchat_text,
    }));
  } else {
    const [commentsRes, superchatsRes] = await Promise.all([
      p
        .query(
          `SELECT created_at, video_id, author_id, COALESCE(comment_text, '') AS comment_text
           FROM public.comments
           WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC`,
          [video_id]
        )
        .catch(() => ({ rows: [] })),
      p
        .query(
          `SELECT created_at, amount, currency, video_id, COALESCE(superchat_text, '') AS superchat_text
           FROM public.superchats
           WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
           ORDER BY created_at DESC`,
          [video_id]
        )
        .catch(() => ({ rows: [] })),
    ]);

    commentRows = (commentsRes.rows || []).map((r: any, idx: number) => ({
      id: `cmt_${r.video_id}_${idx}`,
      created_at: r.created_at,
      video_id: r.video_id,
      author_id: r.author_id,
      comment_text: r.comment_text,
    }));

    superchatRows = (superchatsRes.rows || []).map((r: any, idx: number) => ({
      id: `sc_${r.video_id}_${idx}`,
      created_at: r.created_at,
      amount: Number(r.amount || 0),
      currency: r.currency || 'ARS',
      video_id: r.video_id,
      superchat_text: r.superchat_text,
    }));
  }

  // Deterministic classification across ALL messages of the analyzed video
  // (Only flags messages that explicitly mention a target group or person being hated)
  const baseResult = buildDeterministicHateSpeechAnalysis({
    video_id,
    video_title: videoTitle,
    channel_name: channelName,
    channel: channelHandle,
    is_eternal: isEternalEmission,
    start_date: resolvedStartDate,
    end_date: resolvedEndDate,
    comments: commentRows,
    superchats: superchatRows,
  });

  // Optionally enrich with Gemini AI ONLY for messages that explicitly mention a target person or group
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (apiKey && baseResult.messages.length > 0) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      const sampleForAi = baseResult.messages
        .filter((m) => m.comment_text && m.comment_text.trim().length > 4)
        .slice(0, 120)
        .map(
          (m) =>
            `[${m.id}] @${m.author_id}: ${String(m.comment_text || '')
              .replace(/\s+/g, ' ')
              .slice(0, 160)}`
        )
        .join('\n');

      const validCategoryIds = HATE_SPEECH_CATEGORIES.map((c) => c.id);

      const prompt = `Analiza los mensajes de chat del siguiente video de streaming argentino para detectar discurso de odio.

REGLA OBLIGATORIA DE FILTRADO:
- SOLO debes contar y marcar un mensaje como discurso de odio si en el propio texto del mensaje SE MENCIONA EXPLÍCITAMENTE al grupo, colectivo o persona específica a la que se está odiando o atacando (por ejemplo: Milei, libertarios, kirchneristas, Cristina, kukas, Macri, zurdos, periodistas, un conductor por nombre, jubilados, mujeres, un usuario @handle, etc.).
- NO marques insultos sueltos, malas palabras genéricas o quejas donde NO se mencione al grupo o persona destinataria del odio.

DATOS DE LA EMISIÓN:
- Título: "${videoTitle}"
- Canal: "${channelName}" (${channelHandle})
- Total de mensajes del video: ${baseResult.messages.length}
- Muestra de mensajes con su ID:
${sampleForAi}

INSTRUCCIONES:
1. Redacta un "executive_summary" (2 a 3 oraciones en español) indicando cuántos mensajes contienen discurso de odio dirigido a personas o grupos específicos y cuáles son los principales grupos o figuras atacadas.
2. En "flagged_messages", incluye ÚNICAMENTE los mensajes que expresen odio Y mencionen explícitamente al grupo o persona atacada, indicando:
   - id: el ID exacto entre corchetes (ej. "cmt_...")
   - target: el nombre exacto de la persona o grupo mencionado en el mensaje al que se dirige el odio (OBLIGATORIO; si no menciona a nadie explícitamente en el texto, NO lo incluyas)
   - severity: "alto", "medio" o "bajo"
   - category: una de ${JSON.stringify(validCategoryIds)}
   - reason: breve explicación en español indicando contra quién se dirige el ataque.`;

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), 12000)
      );

      const generatePromise = ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executive_summary: { type: Type.STRING },
              flagged_messages: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    target: { type: Type.STRING },
                    severity: { type: Type.STRING },
                    category: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const aiRes: any = await Promise.race([generatePromise, timeoutPromise]);
      if (aiRes?.text) {
        const parsedAi = JSON.parse(aiRes.text.trim());
        const flaggedMap = new Map<string, any>();
        if (Array.isArray(parsedAi.flagged_messages)) {
          for (const fm of parsedAi.flagged_messages) {
            const targetStr = String(fm?.target || '').trim();
            if (
              fm &&
              fm.id &&
              targetStr &&
              !['ninguno', 'nadie', 'n/a', 'general', 'indefinido', 'no especificado'].includes(
                targetStr.toLowerCase()
              )
            ) {
              flaggedMap.set(String(fm.id).trim(), { ...fm, target: targetStr });
            }
          }
        }

        const mergedMessages = baseResult.messages.map((msg) => {
          const aiFlag = flaggedMap.get(msg.id);
          if (!aiFlag) return msg;

          // Verify that the message either has deterministic targets or actually mentions the AI-extracted target in its text
          const extracted = extractMentionedTargets(msg.comment_text);
          const normMsg = (msg.comment_text || '').toLowerCase();
          const aiTargetWords = String(aiFlag.target)
            .toLowerCase()
            .split(/[\s,/()-]+/)
            .filter((w) => w.length >= 3);
          const mentionsAiTargetInText = aiTargetWords.some((w) => normMsg.includes(w));

          if (extracted.targetLabels.length === 0 && !mentionsAiTargetInText) {
            return msg;
          }

          const combinedTargets = Array.from(
            new Set([
              ...msg.hate_targets,
              ...extracted.targetLabels,
              ...(extracted.targetLabels.length === 0 && aiFlag.target ? [aiFlag.target] : []),
            ])
          );

          if (combinedTargets.length === 0) {
            return msg;
          }

          const validSev: HateSpeechSeverity[] = ['alto', 'medio', 'bajo'];
          const aiSev: HateSpeechSeverity = validSev.includes(aiFlag.severity)
            ? aiFlag.severity
            : 'medio';

          const aiCat = validCategoryIds.includes(aiFlag.category)
            ? (aiFlag.category as HateSpeechCategoryId)
            : 'insultos_agresiones';

          const categories = Array.from(new Set([...msg.categories, aiCat]));
          const sevRank: Record<HateSpeechSeverity, number> = {
            ninguno: 0,
            bajo: 1,
            medio: 2,
            alto: 3,
          };
          const finalSeverity =
            sevRank[aiSev] > sevRank[msg.severity]
              ? aiSev
              : msg.severity === 'ninguno'
              ? aiSev
              : msg.severity;
          const scoreBySev = finalSeverity === 'alto' ? 85 : finalSeverity === 'medio' ? 55 : 30;

          return {
            ...msg,
            is_hate_speech: true,
            severity: finalSeverity,
            hate_score: Math.max(msg.hate_score, scoreBySev),
            categories,
            hate_targets: combinedTargets,
            reason:
              aiFlag.reason ||
              msg.reason ||
              `Dirigido contra [${combinedTargets.join(', ')}]`,
          };
        });

        const finalResult = recomputeHateSpeechSummary({
          video_id,
          video_title: videoTitle,
          channel_name: channelName,
          channel: channelHandle,
          is_eternal: isEternalEmission,
          start_date: resolvedStartDate,
          end_date: resolvedEndDate,
          messages: mergedMessages,
          total_comments: commentRows.length,
          total_superchats: superchatRows.length,
        });

        return {
          analysis: finalResult,
          cached: false,
        };
      }
    } catch (err: any) {
      console.warn('[hateSpeechAnalysis] Using deterministic hate speech analyzer:', err?.message);
    }
  }

  return {
    analysis: baseResult,
    cached: false,
  };
}
