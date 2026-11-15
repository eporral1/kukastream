import { GoogleGenAI, Type } from '@google/genai';
import { getPool } from './serverDb.ts';
import {
  POLITICAL_SECTORS,
  PoliticalAnalysisResult,
  PoliticalSectorAnalysis,
  PoliticalSectorId,
  buildDeterministicPoliticalAnalysis,
  scoreToStance,
} from './politicalAnalysis.ts';

export interface PoliticalAnalysisResponse {
  analysis: PoliticalAnalysisResult;
  cached: boolean;
}

export async function generateVideoPoliticalAnalysis(
  video_id: string,
  force = false
): Promise<PoliticalAnalysisResponse> {
  const p = getPool();
  if (!p) {
    throw new Error('DB not connected.');
  }

  // Intentar crear la columna JSONB si el usuario de DB tiene permisos DDL
  try {
    await p.query(`ALTER TABLE public.live ADD COLUMN IF NOT EXISTS political_analysis JSONB;`);
  } catch {
    // Si no tiene permiso DDL o ya existe, continuar normalmente
  }

  let liveRow: any = {};
  try {
    const checkRes = await p.query(
      `SELECT l.political_analysis, l.video_title, l.channel_id, l.start_date, l.scrape_date,
              c.channel_name, c.channel, c.description AS channel_description
       FROM public.live l
       LEFT JOIN public.channels c ON c.channel_id = l.channel_id
       WHERE l.video_id = $1 LIMIT 1`,
      [video_id]
    );
    liveRow = checkRes.rows[0] || {};
  } catch {
    // Fallback si la columna political_analysis aún no fue creada manualmente en la tabla live
    const fallbackRes = await p.query(
      `SELECT l.video_title, l.channel_id, l.start_date, l.scrape_date,
              c.channel_name, c.channel, c.description AS channel_description
       FROM public.live l
       LEFT JOIN public.channels c ON c.channel_id = l.channel_id
       WHERE l.video_id = $1 LIMIT 1`,
      [video_id]
    );
    liveRow = fallbackRes.rows[0] || {};
  }

  // Si ya está guardado en public.live.political_analysis y no se pidió forzar recálculo, devolver directo para graficar
  if (!force && liveRow.political_analysis) {
    try {
      const parsed =
        typeof liveRow.political_analysis === 'string'
          ? JSON.parse(liveRow.political_analysis)
          : liveRow.political_analysis;
      if (parsed && parsed.compass && Array.isArray(parsed.sectors)) {
        return {
          analysis: parsed as PoliticalAnalysisResult,
          cached: true,
        };
      }
    } catch {
      // Si el JSON guardado fuera inválido, recalcular y sobrescribir
    }
  }

  const videoTitle = liveRow.video_title || 'Transmisión en Vivo';
  const channelName = liveRow.channel_name || liveRow.channel || 'Canal de Streaming';
  const channelHandle = liveRow.channel || '';
  const channelDescription = liveRow.channel_description || '';

  // Fetch recent comments and superchats for this video_id
  const [commentsRes, superchatsRes] = await Promise.all([
    p
      .query(
        `SELECT author_id, comment_text, created_at
         FROM public.comments
         WHERE video_id = $1 AND comment_text IS NOT NULL AND comment_text <> ''
         ORDER BY created_at DESC
         LIMIT 150`,
        [video_id]
      )
      .catch(() => ({ rows: [] })),
    p
      .query(
        `SELECT superchat_text, amount, currency, created_at
         FROM public.superchats
         WHERE video_id = $1 AND superchat_text IS NOT NULL AND superchat_text <> ''
         ORDER BY created_at DESC
         LIMIT 40`,
        [video_id]
      )
      .catch(() => ({ rows: [] })),
  ]);

  const commentRows = commentsRes.rows || [];
  const superchatRows = superchatsRes.rows || [];

  // Base deterministic result as reference and fallback
  const baseResult = buildDeterministicPoliticalAnalysis({
    video_id,
    video_title: videoTitle,
    channel_name: channelName,
    channel: channelHandle,
    channel_description: channelDescription,
    comments: commentRows,
    superchats: superchatRows,
  });

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      const sampleCommentsText = commentRows
        .slice(0, 60)
        .map((c: any) => `- ${String(c.comment_text || '').slice(0, 140)}`)
        .join('\n');

      const sampleSuperchatsText = superchatRows
        .slice(0, 20)
        .map((s: any) => `- [${s.currency || 'ARS'} ${s.amount}]: ${String(s.superchat_text || '').slice(0, 140)}`)
        .join('\n');

      const prompt = `Analiza la tendencia política y de opinión del siguiente video de streaming argentino.

DATOS DEL VIDEO:
- Título: "${videoTitle}"
- Canal: "${channelName}" (${channelHandle})
- Descripción del canal: "${channelDescription}"
- Comentarios de la audiencia (${commentRows.length} analizados):
${sampleCommentsText || '(Sin comentarios registrados aún)'}
- Superchats destacados (${superchatRows.length} analizados):
${sampleSuperchatsText || '(Sin superchats registrados)'}

INSTRUCCIONES DE ANÁLISIS POLÍTICO:
1. Evalúa obligatoriamente cómo son tratados los siguientes 8 sectores/figuras políticas en el video y su comunidad:
   - "milei" (Javier Milei / La Libertad Avanza)
   - "kirchnerismo" (Kirchnerismo)
   - "cristina_kirchner" (Cristina Fernández de Kirchner)
   - "pro" (PRO - Propuesta Republicana)
   - "macri" (Mauricio Macri)
   - "peronismo" (Peronismo / PJ)
   - "ucr" (UCR - Unión Cívica Radical)
   - "izquierda" (Frente de Izquierda / FIT-U)
2. Para cada sector asigna:
   - stance: "defendido", "atacado", "neutral" o "no_mencionado"
   - score: de -100 (fuertemente atacado/criticado) a +100 (fuertemente defendido/apoyado)
   - intensity: de 0 a 100 (nivel de relevancia o protagonismo en el debate)
   - summary: 1 oración clara explicando por qué es defendido, atacado o debatido.
3. Calcula las coordenadas del Compás Político del video:
   - compass_x: de -100 (Izquierda / Nacional y Popular / Kirchnerismo) a +100 (Derecha / Libertario / Pro-Mercado)
   - compass_y: de -100 (Opositor duro al Gobierno de Milei) a +100 (Oficialista / Defensor del Gobierno de Milei)
   - chat_x: de -100 a +100 (tendencia ideológica de los comentarios del chat)
   - chat_y: de -100 a +100 (postura opositora u oficialista del chat)
   - tendency_label: etiqueta breve de la tendencia dominante del video (ej. "Derecha Libertaria / Oficialista", "Nacional y Popular / Kirchnerista Opositor", "Centro-Derecha Republicano", "Debate Plural / Centro", etc.)
   - polarization_score: de 0 a 100.`;

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), 14000)
      );

      const generatePromise = ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              compass_x: { type: Type.NUMBER },
              compass_y: { type: Type.NUMBER },
              chat_x: { type: Type.NUMBER },
              chat_y: { type: Type.NUMBER },
              tendency_label: { type: Type.STRING },
              polarization_score: { type: Type.NUMBER },
              executive_summary: { type: Type.STRING },
              sectors: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    stance: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    intensity: { type: Type.NUMBER },
                    summary: { type: Type.STRING },
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
        const aiSectorsMap = new Map<string, any>();
        if (Array.isArray(parsedAi.sectors)) {
          for (const s of parsedAi.sectors) {
            if (s && s.id) aiSectorsMap.set(String(s.id).toLowerCase(), s);
          }
        }

        const mergedSectors: PoliticalSectorAnalysis[] = POLITICAL_SECTORS.map((def) => {
          const fallbackSector = baseResult.sectors.find((b) => b.id === def.id)!;
          const aiS = aiSectorsMap.get(def.id as PoliticalSectorId);
          if (!aiS) return fallbackSector;

          const score = Math.max(-100, Math.min(100, Math.round(Number(aiS.score ?? fallbackSector.score))));
          const intensity = Math.max(5, Math.min(100, Math.round(Number(aiS.intensity ?? fallbackSector.intensity))));
          const validStances = ['defendido', 'atacado', 'neutral', 'no_mencionado'];
          const stance = validStances.includes(aiS.stance)
            ? aiS.stance
            : scoreToStance(score, fallbackSector.mentions, intensity);

          return {
            ...fallbackSector,
            stance,
            score,
            intensity,
            summary: aiS.summary || fallbackSector.summary,
          };
        });

        const defended = mergedSectors.filter((s) => s.stance === 'defendido').map((s) => s.shortName);
        const attacked = mergedSectors.filter((s) => s.stance === 'atacado').map((s) => s.shortName);

        const finalResult: PoliticalAnalysisResult = {
          ...baseResult,
          analyzed_at: new Date().toISOString(),
          compass: {
            x: Math.max(-100, Math.min(100, Math.round(Number(parsedAi.compass_x ?? baseResult.compass.x)))),
            y: Math.max(-100, Math.min(100, Math.round(Number(parsedAi.compass_y ?? baseResult.compass.y)))),
            chat_x: Math.max(-100, Math.min(100, Math.round(Number(parsedAi.chat_x ?? baseResult.compass.chat_x)))),
            chat_y: Math.max(-100, Math.min(100, Math.round(Number(parsedAi.chat_y ?? baseResult.compass.chat_y)))),
            tendency_label: parsedAi.tendency_label || baseResult.compass.tendency_label,
            polarization_score: Math.max(
              10,
              Math.min(100, Math.round(Number(parsedAi.polarization_score ?? baseResult.compass.polarization_score)))
            ),
            confidence: 95,
          },
          executive_summary: parsedAi.executive_summary || baseResult.executive_summary,
          defended_sectors: defended,
          attacked_sectors: attacked,
          sectors: mergedSectors,
        };

        try {
          await p.query(`UPDATE public.live SET political_analysis = $1 WHERE video_id = $2`, [
            JSON.stringify(finalResult),
            video_id,
          ]);
        } catch (saveErr: any) {
          console.warn('[politicalAnalysis] Could not persist to public.live.political_analysis:', saveErr?.message);
        }

        return {
          analysis: finalResult,
          cached: false,
        };
      }
    } catch (err: any) {
      console.warn('[politicalAnalysis] Using calibrated fallback analyzer:', err?.message);
    }
  }

  try {
    await p.query(`UPDATE public.live SET political_analysis = $1 WHERE video_id = $2`, [
      JSON.stringify(baseResult),
      video_id,
    ]);
  } catch (saveErr: any) {
    console.warn('[politicalAnalysis] Could not persist fallback to public.live.political_analysis:', saveErr?.message);
  }

  return {
    analysis: baseResult,
    cached: false,
  };
}
