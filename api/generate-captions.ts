import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../src/utils/serverDb.ts';
import { generateVideoPoliticalAnalysis } from '../src/utils/serverPoliticalAnalysis.ts';

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

  const { video_id, force } = req.body || {};
  if (!video_id) {
    return res.status(400).json({ success: false, error: 'video_id is required.' });
  }

  try {
    // =========================================================================
    // NUEVO: Análisis de Tendencia Política y Compás Ideológico
    // (Identifica sectores defendidos o atacados: Milei, Kirchnerismo,
    // Cristina Kirchner, PRO, Macri, Peronismo, UCR, Izquierda)
    // =========================================================================
    const { analysis, cached } = await generateVideoPoliticalAnalysis(String(video_id), Boolean(force));
    return res.json({
      success: true,
      political_analysis: analysis,
      cached,
    });

    /*
    // =========================================================================
    // COMENTADO: Análisis y Detección de Publicidad / Transcripción de Anuncios
    // =========================================================================
    await p.query(`ALTER TABLE public.live ADD COLUMN IF NOT EXISTS captions TEXT;`);

    const checkRes = await p.query(
      `SELECT l.captions, l.video_title, l.channel_id, l.start_date, l.scrape_date,
              c.channel_name, c.channel, c.description AS channel_description
       FROM public.live l
       LEFT JOIN public.channels c ON c.channel_id = l.channel_id
       WHERE l.video_id = $1 LIMIT 1`,
      [video_id]
    );

    if (!force && checkRes.rows.length > 0 && checkRes.rows[0].captions) {
      return res.json({ success: true, captions: checkRes.rows[0].captions, cached: true });
    }
    */
  } catch (err: any) {
    console.error('Error generating political analysis in serverless:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
