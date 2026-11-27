import { GoogleGenAI, Type } from '@google/genai';
import { getPool, executeQuery } from './serverDb.ts';
import { getVideoCaptions, VideoCaptionCue } from './serverVideoCaptions.ts';

export interface DetectedAd {
  id: string;
  brand: string;
  category: string;
  ad_type: 'PNT' | 'Spot / Tanda' | 'Auspicio' | 'Mención / Chivo';
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  excerpt: string;
  confidence: 'alta' | 'media';
  clock_offset_sec?: number;
}

export interface VideoAdsAnalysisResult {
  video_id: string;
  total_ads: number;
  unique_brands: string[];
  total_ad_seconds: number;
  caption_cues_analyzed: number;
  ads: DetectedAd[];
  engine: 'gemini' | 'heuristic';
  model?: string;
  cached?: boolean;
  clock_offset_sec?: number;
  analyzed_at: string;
}

const CACHE_VERSION = 'ads_v1';
let adsTableInitialized = false;
const inFlightAnalyses = new Map<string, Promise<VideoAdsAnalysisResult>>();

async function ensureAdsTable(): Promise<void> {
  if (adsTableInitialized) return;
  const p = getPool();
  if (!p) return;
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS public.video_ads_cache (
        video_id VARCHAR(64) PRIMARY KEY,
        result_json TEXT NOT NULL,
        engine VARCHAR(32) NOT NULL DEFAULT 'gemini',
        version VARCHAR(32) NOT NULL DEFAULT 'ads_v1',
        clock_offset_sec INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await executeQuery(
      `ALTER TABLE public.video_ads_cache ADD COLUMN IF NOT EXISTS version VARCHAR(32) NOT NULL DEFAULT 'ads_v1';`
    );
    await executeQuery(
      `ALTER TABLE public.video_ads_cache ADD COLUMN IF NOT EXISTS clock_offset_sec INTEGER NOT NULL DEFAULT 0;`
    );
    adsTableInitialized = true;
  } catch (err) {
    console.warn('[adDetector] Could not ensure video_ads_cache table:', err);
  }
}

function formatSecLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

interface CompactBlock {
  startSec: number;
  endSec: number;
  text: string;
}

/**
 * Compacts thousands of overlapping YouTube ASR cues into clean ~18-second timestamped lines
 * so an entire 2-3 hour broadcast fits comfortably in ONE single Gemini text call.
 */
function buildCompactTranscriptBlocks(cues: VideoCaptionCue[]): CompactBlock[] {
  if (!cues || cues.length === 0) return [];

  const blocks: CompactBlock[] = [];
  let curStart = cues[0].start;
  let curEnd = cues[0].end;
  let curTexts: string[] = [];

  for (const cue of cues) {
    const clean = String(cue.text || '').replace(/\s+/g, ' ').trim();
    if (!clean) continue;

    if (curTexts.length > 0 && cue.start - curStart >= 18) {
      blocks.push({
        startSec: Math.floor(curStart),
        endSec: Math.ceil(curEnd),
        text: curTexts.join(' '),
      });
      curStart = cue.start;
      curEnd = cue.end;
      curTexts = [clean];
    } else {
      curEnd = Math.max(curEnd, cue.end);
      curTexts.push(clean);
    }
  }

  if (curTexts.length > 0) {
    blocks.push({
      startSec: Math.floor(curStart),
      endSec: Math.ceil(curEnd),
      text: curTexts.join(' '),
    });
  }

  return blocks;
}

function serializeBlocksForPrompt(blocks: CompactBlock[]): string {
  return blocks
    .map((b) => `[${b.startSec}s | ${formatSecLabel(b.startSec)}] ${b.text}`)
    .join('\n');
}

function normalizeAdType(raw: string): DetectedAd['ad_type'] {
  const s = String(raw || '').toLowerCase();
  if (s.includes('spot') || s.includes('tanda')) return 'Spot / Tanda';
  if (s.includes('auspic')) return 'Auspicio';
  if (s.includes('menci') || s.includes('chivo')) return 'Mención / Chivo';
  return 'PNT';
}

/**
 * Smart deterministic Spanish PNT / Sponsor fallback detector over exact timestamped captions
 * (used only if Gemini is unavailable or temporarily hits 429 Free Tier quota).
 */
function detectAdsHeuristically(blocks: CompactBlock[]): DetectedAd[] {
  const STRONG_PHRASES: RegExp[] = [
    /\bcuotas sin inter[eé]s\b/i,
    /\bc[oó]digo de descuento\b/i,
    /\bcon el c[oó]digo\b/i,
    /\bdescarg[aá] la app\b/i,
    /\bbajate la app\b/i,
    /\blink en la descripci[oó]n\b/i,
    /\benlace en la descripci[oó]n\b/i,
    /\bescane[aá] el qr\b/i,
    /\bqr en pantalla\b/i,
    /\bpromoci[oó]n v[aá]lida\b/i,
    /\bbases y condiciones\b/i,
    /\btope de reintegro\b/i,
    /\b\d{1,2}\s*%\s*(de descuento|off|de reintegro)\b/i,
    /\benv[ií]o gratis\b/i,
    /\bauspicia(n|do)?\b/i,
    /\bnos acompa[ñn]a(n)?\b/i,
    /\bgracias a (nuestros amigos de|la gente de)\b/i,
    /\b\.com\.ar\b/i,
    /\bwww\.[a-z0-9-]+\./i,
    /\bpedilo por\b/i,
    /\bcon tu tarjeta\b/i,
    /\babr[ií] tu cuenta\b/i,
  ];

  const KNOWN_SPONSORS: Array<{ pattern: RegExp; brand: string; category: string }> = [
    { pattern: /\bmercado\s*pago\b/i, brand: 'Mercado Pago', category: 'Fintech / Bancos' },
    { pattern: /\bmodo\b/i, brand: 'MODO', category: 'Fintech / Bancos' },
    { pattern: /\bbanco\s*(macro|galicia|santander|bbva|naci[oó]n|provincia|ciudad|patagonia|supervielle|hipotecario|icbc)\b/i, brand: 'Banco', category: 'Fintech / Bancos' },
    { pattern: /\bnaranja\s*x\b/i, brand: 'Naranja X', category: 'Fintech / Bancos' },
    { pattern: /\bual[aá]\b/i, brand: 'Ualá', category: 'Fintech / Bancos' },
    { pattern: /\bpersonal\s*pay\b/i, brand: 'Personal Pay', category: 'Fintech / Bancos' },
    { pattern: /\bpedidos\s*ya\b/i, brand: 'PedidosYa', category: 'Delivery' },
    { pattern: /\brappi\b/i, brand: 'Rappi', category: 'Delivery' },
    { pattern: /\bbetsson\b/i, brand: 'Betsson', category: 'Apuestas' },
    { pattern: /\bcodere\b/i, brand: 'Codere', category: 'Apuestas' },
    { pattern: /\bbplay\b/i, brand: 'bplay', category: 'Apuestas' },
    { pattern: /\bbetwarrior\b/i, brand: 'BetWarrior', category: 'Apuestas' },
    { pattern: /\b1xbet\b/i, brand: '1xBet', category: 'Apuestas' },
    { pattern: /\bquilmes\b/i, brand: 'Quilmes', category: 'Bebidas' },
    { pattern: /\bbrahma\b/i, brand: 'Brahma', category: 'Bebidas' },
    { pattern: /\bheineken\b/i, brand: 'Heineken', category: 'Bebidas' },
    { pattern: /\bstella\s*artois\b/i, brand: 'Stella Artois', category: 'Bebidas' },
    { pattern: /\bcoca[\s-]*cola\b/i, brand: 'Coca-Cola', category: 'Bebidas' },
    { pattern: /\bspeed\s*unlimited\b/i, brand: 'Speed Unlimited', category: 'Bebidas' },
    { pattern: /\bshell\b/i, brand: 'Shell', category: 'Energía / Combustible' },
    { pattern: /\baxion\b/i, brand: 'Axion Energy', category: 'Energía / Combustible' },
    { pattern: /\bflow\b/i, brand: 'Flow', category: 'Telecomunicaciones' },
    { pattern: /\btelecentro\b/i, brand: 'Telecentro', category: 'Telecomunicaciones' },
    { pattern: /\bmovistar\b/i, brand: 'Movistar', category: 'Telecomunicaciones' },
    { pattern: /\bclaro\b/i, brand: 'Claro', category: 'Telecomunicaciones' },
    { pattern: /\bfr[aá]vega\b/i, brand: 'Frávega', category: 'Retail' },
    { pattern: /\bcetrog?ar\b/i, brand: 'Cetrogar', category: 'Retail' },
    { pattern: /\bdespegar\b/i, brand: 'Despegar', category: 'Turismo' },
    { pattern: /\balmundo\b/i, brand: 'Almundo', category: 'Turismo' },
    { pattern: /\bswiss\s*medical\b/i, brand: 'Swiss Medical', category: 'Salud' },
    { pattern: /\bosde\b/i, brand: 'OSDE', category: 'Salud' },
    { pattern: /\bgaleno\b/i, brand: 'Galeno', category: 'Salud' },
    { pattern: /\btiendamia\b/i, brand: 'Tiendamia', category: 'E-commerce' },
    { pattern: /\bsamsung\b/i, brand: 'Samsung', category: 'Tecnología' },
    { pattern: /\bmotorola\b/i, brand: 'Motorola', category: 'Tecnología' },
  ];

  const hits: Array<{
    startSec: number;
    endSec: number;
    brand: string;
    category: string;
    excerpt: string;
    score: number;
  }> = [];

  for (const b of blocks) {
    const phraseMatches = STRONG_PHRASES.filter((rx) => rx.test(b.text)).length;
    let matchedSponsor: { brand: string; category: string } | null = null;

    for (const sp of KNOWN_SPONSORS) {
      const m = b.text.match(sp.pattern);
      if (m) {
        matchedSponsor = {
          brand: sp.brand === 'Banco' ? m[0].replace(/\s+/g, ' ').trim() : sp.brand,
          category: sp.category,
        };
        break;
      }
    }

    // Require strong commercial call-to-action OR sponsor + commercial cue
    if (phraseMatches >= 2 || (matchedSponsor && phraseMatches >= 1)) {
      hits.push({
        startSec: b.startSec,
        endSec: b.endSec,
        brand: matchedSponsor ? matchedSponsor.brand : 'Anunciante / PNT detectado',
        category: matchedSponsor ? matchedSponsor.category : 'Publicidad / PNT',
        excerpt: b.text.slice(0, 220),
        score: phraseMatches + (matchedSponsor ? 2 : 0),
      });
    }
  }

  // Merge adjacent hits within 40 seconds into a single ad block
  const merged: DetectedAd[] = [];
  for (const h of hits) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      h.startSec - prev.end_sec <= 40 &&
      (prev.brand === h.brand ||
        prev.brand === 'Anunciante / PNT detectado' ||
        h.brand === 'Anunciante / PNT detectado')
    ) {
      prev.end_sec = Math.max(prev.end_sec, h.endSec);
      prev.duration_sec = Math.max(5, Math.round(prev.end_sec - prev.start_sec));
      if (prev.brand === 'Anunciante / PNT detectado' && h.brand !== 'Anunciante / PNT detectado') {
        prev.brand = h.brand;
        prev.category = h.category;
      }
    } else {
      merged.push({
        id: `heur-${merged.length}-${h.startSec}`,
        brand: h.brand,
        category: h.category,
        ad_type: 'PNT',
        start_sec: h.startSec,
        end_sec: Math.max(h.startSec + 10, h.endSec),
        duration_sec: Math.max(10, Math.round(h.endSec - h.startSec)),
        excerpt: h.excerpt,
        confidence: h.score >= 3 ? 'alta' : 'media',
      });
    }
  }

  return merged;
}

/**
 * Runs ONE single Gemini text call (per segment if > 110k chars) over the native YouTube captions
 * to detect every real commercial ad, PNT, sponsorship, promo code, or spot.
 */
async function detectAdsWithGemini(
  blocks: CompactBlock[],
  videoTitle?: string
): Promise<{ ads: DetectedAd[]; model: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Partition into chunks of max ~90,000 chars (most 2-hour streams fit in 1 single call!)
  const segments: CompactBlock[][] = [];
  let curSeg: CompactBlock[] = [];
  let curChars = 0;

  for (const b of blocks) {
    const lineLen = b.text.length + 22;
    if (curSeg.length > 0 && curChars + lineLen > 90000) {
      segments.push(curSeg);
      curSeg = [b];
      curChars = lineLen;
    } else {
      curSeg.push(b);
      curChars += lineLen;
    }
  }
  if (curSeg.length > 0) segments.push(curSeg);

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      ads: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            brand: { type: Type.STRING },
            category: { type: Type.STRING },
            ad_type: { type: Type.STRING },
            start_sec: { type: Type.INTEGER },
            end_sec: { type: Type.INTEGER },
            excerpt: { type: Type.STRING },
            confidence: { type: Type.STRING },
          },
          required: ['brand', 'category', 'ad_type', 'start_sec', 'end_sec', 'excerpt', 'confidence'],
        },
      },
    },
    required: ['ads'],
  };

  // Prefer gemini-3.1-flash-lite first (fast + generous free-tier quota), then gemini-4-hydrogen
  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen', 'gemini-3-flash-preview'];
  let workingModel: string | null = null;
  const allAds: DetectedAd[] = [];

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segBlocks = segments[segIdx];
    const transcriptText = serializeBlocksForPrompt(segBlocks);
    const minSec = segBlocks[0].startSec;
    const maxSec = segBlocks[segBlocks.length - 1].endSec;

    const prompt = `Sos un auditor experto en pauta publicitaria y PNT (publicidad no tradicional) de programas de streaming y radio de Argentina.
Analizá la siguiente transcripción oficial de YouTube con marcas de tiempo en segundos ([123s | 02:03]) ${
      videoTitle ? `del programa "${videoTitle}"` : ''
    }.

Tu objetivo es detectar TODOS los anuncios comerciales reales presentes en el texto:
- PNT (publicidad no tradicional leída en vivo por los conductores).
- Auspicios / Presentaciones ("este bloque es presentado por...", "nos acompaña...", "gracias a...").
- Spots / Tandas comerciales grabadas.
- Menciones comerciales / Chivos / Códigos de descuento / Links o QR promocionales / Sorteos con marca / Pauta oficial de gobiernos o municipios.

REGLAS ESTRICTAS PARA EVITAR FALSOS POSITIVOS:
1. NO marques noticias, análisis periodísticos, política ni charlas cotidianas donde se mencione una empresa o entidad de pasada (por ejemplo: hablar en una noticia de YPF, Aerolíneas, Banco Central, Mercado Libre o un político NO es publicidad).
2. Solo incluí casos donde haya una clara intención publicitaria, promocional, agradecimiento de sponsor o llamado a la acción comercial.
3. "start_sec" y "end_sec" deben ser números enteros en segundos exactos sacados de los prefijos [XXXs | ...] del bloque donde empieza y termina cada anuncio (entre ${minSec} y ${maxSec}).
4. "brand": nombre limpio y normalizado de la marca o anunciante (ej: "Banco Macro", "PedidosYa", "Betsson", "Quilmes", "Gobierno de la Provincia de Buenos Aires").
5. "category": rubro breve (ej: "Fintech / Bancos", "Apuestas", "Delivery", "Bebidas", "Telecomunicaciones", "Retail", "Salud", "Automotriz", "Turismo", "Gobierno / Pauta", "Eventos / Shows", "Tecnología", "Otros").
6. "ad_type": exactamente uno de "PNT", "Spot / Tanda", "Auspicio", "Mención / Chivo".
7. "excerpt": cita literal breve (máximo 180 caracteres) sacada del caption que demuestra el anuncio.
8. "confidence": "alta" o "media".
9. Si realmente no hay ningún anuncio en este tramo, devolvé {"ads": []}.

TRANSCRIPCIÓN:
${transcriptText}`;

    const modelsToTry: string[] = workingModel ? [workingModel] : candidateModels;
    let segSuccess = false;

    for (const model of modelsToTry) {
      try {
        const resp = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema,
            temperature: 0.1,
          },
        });

        const rawText = resp?.text || '';
        if (!rawText) continue;

        const parsed = JSON.parse(rawText);
        const list: any[] = Array.isArray(parsed?.ads) ? parsed.ads : [];
        workingModel = model;
        segSuccess = true;

        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const brand = String(item?.brand || '').trim();
          const excerpt = String(item?.excerpt || '').replace(/\s+/g, ' ').trim();
          if (!brand || !excerpt) continue;

          const startSec = Math.max(0, Math.round(Number(item.start_sec || 0)));
          const endSec = Math.max(startSec + 5, Math.round(Number(item.end_sec || startSec + 20)));

          allAds.push({
            id: `ad-${segIdx}-${i}-${startSec}`,
            brand,
            category: String(item.category || 'Otros').trim(),
            ad_type: normalizeAdType(item.ad_type),
            start_sec: startSec,
            end_sec: endSec,
            duration_sec: Math.max(5, endSec - startSec),
            excerpt: excerpt.slice(0, 220),
            confidence: String(item.confidence || '').toLowerCase() === 'media' ? 'media' : 'alta',
          });
        }
        break;
      } catch (err: any) {
        const msg = String(err?.message || '');
        const isQuota = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
        console.warn(
          `[adDetector] ${model} failed (${isQuota ? '429 quota' : 'error'}) on seg ${segIdx}:`,
          msg.slice(0, 160)
        );
      }
    }

    if (!segSuccess) {
      return null; // Fall back cleanly to heuristic if all models failed
    }
  }

  // Deduplicate & sort chronologically
  allAds.sort((a, b) => a.start_sec - b.start_sec);
  const deduped: DetectedAd[] = [];
  for (const ad of allAds) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.brand.toLowerCase() === ad.brand.toLowerCase() &&
      ad.start_sec <= prev.end_sec + 20
    ) {
      prev.end_sec = Math.max(prev.end_sec, ad.end_sec);
      prev.duration_sec = Math.max(5, prev.end_sec - prev.start_sec);
    } else {
      deduped.push(ad);
    }
  }

  return { ads: deduped, model: workingModel || 'gemini-3.1-flash-lite' };
}

function finalizeResult(
  videoId: string,
  ads: DetectedAd[],
  cueCount: number,
  engine: 'gemini' | 'heuristic',
  model?: string,
  clockOffsetSec = 0
): VideoAdsAnalysisResult {
  const uniqueBrands = Array.from(
    new Set(ads.map((a) => a.brand).filter((b) => b && b !== 'Anunciante / PNT detectado'))
  );
  const totalAdSeconds = ads.reduce((sum, a) => sum + (Number(a.duration_sec) || 0), 0);

  return {
    video_id: videoId,
    total_ads: ads.length,
    unique_brands: uniqueBrands,
    total_ad_seconds: totalAdSeconds,
    caption_cues_analyzed: cueCount,
    ads,
    engine,
    model,
    cached: false,
    clock_offset_sec: Math.round(Number(clockOffsetSec) || 0),
    analyzed_at: new Date().toISOString(),
  };
}

/**
 * Fast read-only lookup of a cached PNT/ad analysis and its saved clock_offset_sec from PostgreSQL.
 */
export async function getCachedVideoAds(videoId: string): Promise<VideoAdsAnalysisResult | null> {
  await ensureAdsTable();
  try {
    const cachedRes: any = await executeQuery(
      `SELECT result_json, engine, COALESCE(clock_offset_sec, 0) AS clock_offset_sec
       FROM public.video_ads_cache
       WHERE video_id = $1 AND version = $2
       LIMIT 1`,
      [videoId, CACHE_VERSION]
    );
    if (cachedRes.rows?.length > 0) {
      const row = cachedRes.rows[0];
      const parsed = JSON.parse(row.result_json);
      if (parsed && Array.isArray(parsed.ads)) {
        const savedOffset = Math.round(Number(row.clock_offset_sec) || 0);
        return {
          ...parsed,
          clock_offset_sec: savedOffset,
          cached: true,
        };
      }
    }
  } catch {
    // ignore cache read error
  }
  return null;
}

/**
 * Persists a new manual clock_offset_sec (in seconds) on an already-cached PNT analysis row.
 */
export async function updateVideoAdsClockOffset(
  videoId: string,
  clockOffsetSec: number
): Promise<{ updated: boolean; clock_offset_sec: number }> {
  await ensureAdsTable();
  const safeOffset = Math.round(Number(clockOffsetSec) || 0);
  try {
    const existing: any = await executeQuery(
      `SELECT result_json FROM public.video_ads_cache WHERE video_id = $1 LIMIT 1`,
      [videoId]
    );
    if (!existing.rows?.length) {
      return { updated: false, clock_offset_sec: safeOffset };
    }

    let updatedJson = existing.rows[0].result_json;
    try {
      const parsed = JSON.parse(updatedJson);
      if (parsed && typeof parsed === 'object') {
        parsed.clock_offset_sec = safeOffset;
        updatedJson = JSON.stringify(parsed);
      }
    } catch {
      // keep original json if parse fails
    }

    await executeQuery(
      `UPDATE public.video_ads_cache
       SET clock_offset_sec = $2, result_json = $3, updated_at = NOW()
       WHERE video_id = $1`,
      [videoId, safeOffset, updatedJson]
    );
    return { updated: true, clock_offset_sec: safeOffset };
  } catch (err) {
    console.warn('[adDetector] Could not update clock_offset_sec:', err);
    return { updated: false, clock_offset_sec: safeOffset };
  }
}

/**
 * Updates fields on a single detected ad inside `public.video_ads_cache.result_json`
 * (video start_sec/end_sec, individual clock_offset_sec, and/or brand name)
 * without altering the global `clock_offset_sec` or any other ad row.
 */
export async function updateSingleAd(
  videoId: string,
  adId: string,
  patch: {
    start_sec?: number;
    end_sec?: number;
    clock_offset_sec?: number;
    brand?: string;
  }
): Promise<{
  updated: boolean;
  ad_id: string;
  ad?: DetectedAd;
  unique_brands?: string[];
}> {
  await ensureAdsTable();

  try {
    const existing: any = await executeQuery(
      `SELECT result_json FROM public.video_ads_cache WHERE video_id = $1 LIMIT 1`,
      [videoId]
    );
    if (!existing.rows?.length) {
      return { updated: false, ad_id: adId };
    }

    const parsed = JSON.parse(existing.rows[0].result_json) as VideoAdsAnalysisResult;
    if (!parsed || !Array.isArray(parsed.ads)) {
      return { updated: false, ad_id: adId };
    }

    let updatedAd: DetectedAd | undefined;
    parsed.ads = parsed.ads.map((ad) => {
      if (ad.id !== adId) return ad;

      const next: DetectedAd = { ...ad };

      if (patch.start_sec !== undefined && Number.isFinite(Number(patch.start_sec))) {
        const safeStart = Math.max(0, Math.round(Number(patch.start_sec)));
        const origDuration = Math.max(
          5,
          Number(ad.duration_sec) || Math.max(5, ad.end_sec - ad.start_sec)
        );
        const safeEnd =
          patch.end_sec !== undefined && Number.isFinite(Number(patch.end_sec))
            ? Math.max(safeStart + 5, Math.round(Number(patch.end_sec)))
            : safeStart + origDuration;
        next.start_sec = safeStart;
        next.end_sec = safeEnd;
        next.duration_sec = Math.max(5, safeEnd - safeStart);
      } else if (patch.end_sec !== undefined && Number.isFinite(Number(patch.end_sec))) {
        const safeEnd = Math.max(next.start_sec + 5, Math.round(Number(patch.end_sec)));
        next.end_sec = safeEnd;
        next.duration_sec = Math.max(5, safeEnd - next.start_sec);
      }

      if (patch.clock_offset_sec !== undefined && Number.isFinite(Number(patch.clock_offset_sec))) {
        const safeClockOffset = Math.round(Number(patch.clock_offset_sec));
        if (safeClockOffset === 0) {
          delete next.clock_offset_sec;
        } else {
          next.clock_offset_sec = safeClockOffset;
        }
      }

      if (patch.brand !== undefined) {
        const cleanBrand = String(patch.brand).trim().slice(0, 120);
        if (cleanBrand.length > 0) {
          next.brand = cleanBrand;
        }
      }

      updatedAd = next;
      return next;
    });

    if (!updatedAd) {
      return { updated: false, ad_id: adId };
    }

    parsed.unique_brands = Array.from(
      new Set(
        parsed.ads
          .map((a) => String(a.brand || '').trim())
          .filter((b) => b && b !== 'Anunciante / PNT detectado')
      )
    );
    parsed.total_ad_seconds = parsed.ads.reduce((s, a) => s + (Number(a.duration_sec) || 0), 0);

    await executeQuery(
      `UPDATE public.video_ads_cache
       SET result_json = $2, updated_at = NOW()
       WHERE video_id = $1`,
      [videoId, JSON.stringify(parsed)]
    );

    return {
      updated: true,
      ad_id: adId,
      ad: updatedAd,
      unique_brands: parsed.unique_brands,
    };
  } catch (err) {
    console.warn('[adDetector] Could not update single ad:', err);
    return { updated: false, ad_id: adId };
  }
}

export async function updateSingleAdTimestamp(
  videoId: string,
  adId: string,
  startSec: number,
  endSec?: number
): Promise<{ updated: boolean; ad_id: string; start_sec: number; end_sec: number }> {
  const res = await updateSingleAd(videoId, adId, { start_sec: startSec, end_sec: endSec });
  return {
    updated: res.updated,
    ad_id: adId,
    start_sec: res.ad?.start_sec ?? Math.max(0, Math.round(Number(startSec) || 0)),
    end_sec: res.ad?.end_sec ?? Math.max(5, Math.round(Number(endSec ?? startSec + 15))),
  };
}

/**
 * Deletes the cached commercial ad measurement for a video_id from PostgreSQL
 * so the broadcast is removed from /brands and resets to unmeasured state.
 */
export async function deleteVideoAdsCache(
  videoId: string
): Promise<{ deleted: boolean; video_id: string }> {
  await ensureAdsTable();
  try {
    const res: any = await executeQuery(
      `DELETE FROM public.video_ads_cache WHERE video_id = $1`,
      [videoId]
    );
    return { deleted: (res?.rowCount || 0) > 0, video_id: videoId };
  } catch (err) {
    console.warn('[adDetector] Could not delete video_ads_cache row:', err);
    throw err;
  }
}

/**
 * Detects commercial ads / PNTs / sponsors in a YouTube broadcast using its native YouTube captions
 * (from public.video_captions_cache / SUPADATA_API_KEY / public.live.captions), cached in PostgreSQL
 * together with the manual real-clock offset (clock_offset_sec).
 */
export async function detectVideoAds(options: {
  video_id: string;
  force?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  video_title?: string;
  clock_offset_sec?: number | null;
  save_offset?: boolean;
}): Promise<VideoAdsAnalysisResult> {
  const {
    video_id,
    force = false,
    start_date,
    end_date,
    video_title,
    clock_offset_sec,
    save_offset = false,
  } = options;
  await ensureAdsTable();

  const hasExplicitOffset =
    clock_offset_sec !== undefined &&
    clock_offset_sec !== null &&
    Number.isFinite(Number(clock_offset_sec));
  const requestedOffset = hasExplicitOffset ? Math.round(Number(clock_offset_sec)) : 0;

  // 1. Check PostgreSQL cache first (unless force re-analyze requested)
  let previousSavedOffset: number | null = null;
  try {
    const cachedRes: any = await executeQuery(
      `SELECT result_json, engine, COALESCE(clock_offset_sec, 0) AS clock_offset_sec
       FROM public.video_ads_cache
       WHERE video_id = $1 AND version = $2
       LIMIT 1`,
      [video_id, CACHE_VERSION]
    );
    if (cachedRes.rows?.length > 0) {
      const row = cachedRes.rows[0];
      previousSavedOffset = Math.round(Number(row.clock_offset_sec) || 0);
      if (!force) {
        const parsed = JSON.parse(row.result_json);
        if (parsed && Array.isArray(parsed.ads)) {
          // If the user explicitly adjusted the offset before clicking analyze, persist it too
          if (save_offset && hasExplicitOffset && requestedOffset !== previousSavedOffset) {
            await updateVideoAdsClockOffset(video_id, requestedOffset);
            return { ...parsed, clock_offset_sec: requestedOffset, cached: true };
          }
          return { ...parsed, clock_offset_sec: previousSavedOffset, cached: true };
        }
      }
    }
  } catch {
    // ignore cache read error
  }

  // On force re-analysis, preserve existing offset if caller didn't explicitly send one
  const effectiveOffset = hasExplicitOffset
    ? requestedOffset
    : previousSavedOffset !== null
    ? previousSavedOffset
    : 0;

  const dedupeKey = `${video_id}:${force ? 'force' : 'normal'}`;
  const existing = inFlightAnalyses.get(dedupeKey);
  if (existing) return existing;

  const promise = (async (): Promise<VideoAdsAnalysisResult> => {
    // 2. Fetch the video's native YouTube captions (reuses public.video_captions_cache instantly!)
    const captionData = await getVideoCaptions({
      video_id,
      start_date,
      end_date,
      download_all: true,
    });

    if (!captionData.cues || captionData.cues.length === 0) {
      throw new Error(
        captionData.reason === 'youtube_ip_blocked'
          ? 'No se pudieron obtener los subtítulos nativos de YouTube para analizar anuncios (verificá SUPADATA_API_KEY o YOUTUBE_PROXY_URL).'
          : 'Este video no tiene subtítulos disponibles para analizar anuncios.'
      );
    }

    const blocks = buildCompactTranscriptBlocks(captionData.cues);

    // 3. Analyze with ONE Gemini text call over the compact timestamped captions
    const geminiResult = await detectAdsWithGemini(blocks, video_title);

    let result: VideoAdsAnalysisResult;
    if (geminiResult) {
      result = finalizeResult(
        video_id,
        geminiResult.ads,
        captionData.cues.length,
        'gemini',
        geminiResult.model,
        effectiveOffset
      );
      // Persist Gemini results + clock_offset_sec permanently in PostgreSQL
      try {
        await executeQuery(
          `INSERT INTO public.video_ads_cache (video_id, result_json, engine, version, clock_offset_sec, updated_at)
           VALUES ($1, $2, 'gemini', $3, $4, NOW())
           ON CONFLICT (video_id)
           DO UPDATE SET
             result_json = EXCLUDED.result_json,
             engine = EXCLUDED.engine,
             version = EXCLUDED.version,
             clock_offset_sec = EXCLUDED.clock_offset_sec,
             updated_at = NOW()`,
          [video_id, JSON.stringify(result), CACHE_VERSION, effectiveOffset]
        );
      } catch {
        // ignore cache write error
      }
    } else {
      // Graceful fallback if Gemini hits daily quota
      const heuristicAds = detectAdsHeuristically(blocks);
      result = finalizeResult(
        video_id,
        heuristicAds,
        captionData.cues.length,
        'heuristic',
        undefined,
        effectiveOffset
      );
    }

    return result;
  })();

  inFlightAnalyses.set(dedupeKey, promise);
  try {
    return await promise;
  } finally {
    inFlightAnalyses.delete(dedupeKey);
  }
}
