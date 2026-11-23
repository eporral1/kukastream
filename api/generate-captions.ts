import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../src/utils/serverDb.ts';
import { generateVideoHateSpeechAnalysis } from '../src/utils/serverPoliticalAnalysis.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const p = getPool();
  if (!p) {
    return res.status(500).json({ success: false, error: 'DB not connected.' });
  }

  const { video_id, force, start_date, end_date, is_live, video_title } = req.body || {};
  if (!video_id) {
    return res.status(400).json({ success: false, error: 'video_id is required.' });
  }

  try {
    // =========================================================================
    // NUEVO: Análisis de Mensajes de Odio y Lista Completa de Mensajes del Video
    // (Considera canales eternal mediante su ventana start_date / end_date)
    // =========================================================================
    const { analysis, cached } = await generateVideoHateSpeechAnalysis({
      video_id: String(video_id),
      force: Boolean(force),
      start_date: start_date ? String(start_date) : null,
      end_date: end_date ? String(end_date) : null,
      is_live: Boolean(is_live),
      video_title: video_title ? String(video_title) : undefined,
    });

    return res.json({
      success: true,
      hate_speech_analysis: analysis,
      messages: analysis.messages,
      total_messages: analysis.summary.total_messages,
      cached,
    });

    /*
    // =========================================================================
    // COMENTADO: Análisis de Tendencia Política y Compás Ideológico
    // (Identifica sectores defendidos o atacados: Milei, Kirchnerismo,
    // Cristina Kirchner, PRO, Macri, Peronismo, UCR, Izquierda)
    // =========================================================================
    const { analysis, cached } = await generateVideoPoliticalAnalysis(String(video_id), Boolean(force));
    return res.json({
      success: true,
      political_analysis: analysis,
      cached,
    });
    */

    /*
    // =========================================================================
    // COMENTADO: Análisis y Detección de Publicidad / Transcripción de Anuncios
    // =========================================================================
    await p.query(`ALTER TABLE public.live ADD COLUMN IF NOT EXISTS captions TEXT;`);
    */
  } catch (err: any) {
    console.error('Error generating hate speech analysis in serverless:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
