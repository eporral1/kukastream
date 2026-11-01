import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { GoogleGenAI } from '@google/genai';

let pool: Pool | null = null;
const OCT_2026_CUTOFF = '2026-10-01 00:00:00';

function getPool(): Pool | null {
  if (pool) return pool;

  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DB_URL;

  const poolConfig: any = {
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 5000,
    max: 3,
    keepAlive: true,
  };

  if (connectionString && !connectionString.includes('hjkhjk')) {
    pool = new Pool({
      ...poolConfig,
      connectionString,
    });
    return pool;
  }

  const host =
    process.env.DB_HOST ||
    process.env.POSTGRES_HOST ||
    process.env.PGHOST;

  const user =
    process.env.DB_USERNAME ||
    process.env.DB_USER ||
    process.env.POSTGRES_USER ||
    process.env.PGUSER;

  const password =
    process.env.DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.PGPASSWORD;

  const database =
    process.env.DB_DATABASE ||
    process.env.DB_NAME ||
    process.env.POSTGRES_DATABASE ||
    process.env.PGDATABASE;

  const port = parseInt(
    process.env.DB_PORT ||
    process.env.POSTGRES_PORT ||
    process.env.PGPORT ||
    '5432',
    10
  );

  if (!host || !password || host.includes('hjkhjk') || password.includes('hjkhjk')) {
    return null;
  }

  pool = new Pool({
    ...poolConfig,
    host,
    user,
    password,
    database,
    port,
  });

  return pool;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Utilizar POST.' });
  }

  const { video_id, channel_id, channel, question } = req.body || {};

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ success: false, error: 'Por favor ingresa una pregunta o consulta válida.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'La API Key de Gemini no está configurada en las variables de entorno (GEMINI_API_KEY).',
    });
  }

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: false,
      error: 'Base de datos no configurada en Vercel para recuperar los comentarios.',
    });
  }

  try {
    let resolvedVideoId = video_id;
    let channelVideoIds: string[] = [];

    if (!resolvedVideoId && (channel_id || channel)) {
      const chId = channel_id || '';
      const chName = (channel || '').trim();
      const cleanChName = chName.startsWith('@') ? chName.substring(1) : chName;
      const atChName = chName.startsWith('@') ? chName : `@${chName}`;

      const vRes = await p.query(
        `SELECT DISTINCT l.video_id 
         FROM public.live l
         JOIN public.channels c ON l.channel_id = c.channel_id
         WHERE (l.channel_id = $1 OR c.channel = $2 OR c.channel = $3 OR c.channel_name = $2 OR c.channel_name = $3)
           AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
         ORDER BY l.video_id DESC 
         LIMIT 20`,
        [chId, cleanChName, atChName]
      );
      channelVideoIds = vRes.rows.map((r: any) => r.video_id);
    }

    // Retrieve up to 400 recent comments and up to 100 superchats for comprehensive analysis
    let commentsRows: any[] = [];
    let superchatsRows: any[] = [];

    if (resolvedVideoId) {
      const cRes = await p.query(
        `SELECT id, created_at, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
         FROM public.comments
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 40`,
        [resolvedVideoId]
      );
      commentsRows = cRes.rows;

      const scRes = await p.query(
        `SELECT id, created_at, amount, currency, COALESCE(superchat_text, '') AS superchat_text
         FROM public.superchats
         WHERE video_id = $1 AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 20`,
        [resolvedVideoId]
      );
      superchatsRows = scRes.rows;
    } else if (channelVideoIds.length > 0) {
      const cRes = await p.query(
        `SELECT id, created_at, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
         FROM public.comments
         WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 40`,
        [channelVideoIds]
      );
      commentsRows = cRes.rows;

      const scRes = await p.query(
        `SELECT id, created_at, amount, currency, COALESCE(superchat_text, '') AS superchat_text
         FROM public.superchats
         WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 20`,
        [channelVideoIds]
      );
      superchatsRows = scRes.rows;
    } else {
      const cRes = await p.query(
        `SELECT id, created_at, author_id, comment_id, COALESCE(comment_text, '') AS comment_text
         FROM public.comments
         WHERE created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 40`
      );
      commentsRows = cRes.rows;

      const scRes = await p.query(
        `SELECT id, created_at, amount, currency, COALESCE(superchat_text, '') AS superchat_text
         FROM public.superchats
         WHERE created_at >= '${OCT_2026_CUTOFF}'
         ORDER BY created_at DESC
         LIMIT 20`
      );
      superchatsRows = scRes.rows;
    }

    if (commentsRows.length === 0 && superchatsRows.length === 0) {
      return res.status(200).json({
        success: true,
        answer: 'No se encontraron comentarios ni superchats registrados en la base de datos para esta transmisión.',
        comments_analyzed: 0,
        superchats_analyzed: 0,
      });
    }

    // Format for Gemini prompt
    const commentsListText = commentsRows
      .map((c, i) => `#${i + 1} [${c.author_id}]: "${c.comment_text}"`)
      .join('\n');

    const superchatsListText = superchatsRows.length > 0
      ? superchatsRows.map((s, i) => `#SC${i + 1} [${s.currency} $${s.amount}]: "${s.superchat_text || '(sin mensaje)'}"`).join('\n')
      : '(No se registraron superchats)';

    const prompt = `Actúas como analista especializado de chat y superchats de streaming para la plataforma (Argentina).

El usuario tiene una consulta sobre el contenido de los comentarios y superchats de la transmisión.

A continuación tienes los datos reales registrados en la base de datos:

=== COMENTARIOS DEL CHAT (${commentsRows.length} registros analizados) ===
${commentsListText}

=== SUPERCHATS (${superchatsRows.length} registros analizados) ===
${superchatsListText}

=== PREGUNTA / CONSULTA DEL USUARIO ===
"${question.trim()}"

Instrucciones:
1. Responde de forma completa, precisa y directa a la solicitud del usuario.
2. Si el usuario pide comentarios con posturas, ideas o temáticas particulares (ej: "dame comment donde se expresen ideas políticas", "comentarios en contra del conductor", "chistes"):
   - Cita textualmente entre comillas los comentarios que mejor coinciden.
   - Indica el autor (@usuario) de cada uno.
   - Da un breve contexto o síntesis de lo que expresan.
3. Si el usuario pide un resumen, un análisis de sentimiento o estadísticas:
   - Sintetiza los temas más comentados, polémicas, preguntas recurrentes y donaciones destacadas.
4. Si no se encuentra ningún comentario que coincida con lo solicitado, dilo con honestidad.
5. Emplea un formato Markdown elegante, con listas o negritas para facilitar la lectura.`;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let aiResponse: any = null;
    const candidateModels = ['gemini-3.5-flash', 'gemini-3.8-flash'];
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        aiResponse = await ai.models.generateContent({
          model,
          contents: prompt,
        });
        if (aiResponse?.text) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${model} failed, trying next:`, err.message);
      }
    }

    if (!aiResponse || !aiResponse.text) {
      throw lastError || new Error('No se pudo obtener respuesta del modelo.');
    }

    return res.status(200).json({
      success: true,
      answer: aiResponse.text,
      comments_analyzed: commentsRows.length,
      superchats_analyzed: superchatsRows.length,
    });
  } catch (err: any) {
    console.error('Error generating AI comment query:', err);
    return res.status(500).json({
      success: false,
      error: `Error al procesar consulta con IA: ${err.message}`,
    });
  }
}
