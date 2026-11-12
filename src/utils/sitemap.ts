import { executeQuery, getPool, getCachedResponse, setCachedResponse } from './serverDb.ts';

export interface SitemapChannelEntry {
  channel: string;
  channel_name?: string;
}

/**
 * Lista de canales activos conocidos en producción (respaldo si la DB no responde en un entorno aislado).
 * Cuando la base de datos está conectada, se combinan y actualizan dinámicamente desde `public.channels`.
 */
export const PRODUCTION_CHANNELS_FALLBACK: SitemapChannelEntry[] = [
  { channel: '@agustinlajeok', channel_name: 'Agustín Laje Arrigoni' },
  { channel: '@Infobae', channel_name: 'Infobae' },
  { channel: '@BreakPointMP', channel_name: 'BREAK POINT' },
  { channel: '@UrbanaPlayFM', channel_name: 'Urbana Play 104.3 FM' },
  { channel: '@ElDestapeTV', channel_name: 'El Destape' },
  { channel: '@SomosGelatina', channel_name: 'GELATINA' },
  { channel: '@estoesblender', channel_name: 'BLENDER' },
  { channel: '@NeuraMedia', channel_name: 'Neura Media' },
  { channel: '@elprestook', channel_name: 'El Presto' },
  { channel: '@TipitoEnojado', channel_name: 'Tipito Enojado' },
  { channel: '@RadioConVos89.9', channel_name: 'Radio Con Vos 89.9' },
  { channel: '@futurock', channel_name: 'Futurock FM' },
  { channel: '@carajostream', channel_name: 'Carajo' },
  { channel: '@santiagocuneo_oficial', channel_name: 'Santiago Cúneo - Oficial' },
  { channel: '@ElObservador107.9', channel_name: 'El Observador 107.9' },
  { channel: '@CarnavalStream', channel_name: 'Carnaval Stream' },
  { channel: '@LongobardiM', channel_name: 'Marcelo Longobardi' },
  { channel: '@elduka', channel_name: 'El Duka' },
  { channel: '@border.periodismo', channel_name: 'BorderPeriodismo' },
  { channel: '@Cenitalcom', channel_name: 'Cenital' },
  { channel: '@nicoguthmann', channel_name: 'Nico Guthmann' },
  { channel: '@KalinaAnn', channel_name: 'Kalina EN VIVO' },
  { channel: '@planmmaximontenegro', channel_name: 'Plan M - Maxi Montenegro' },
  { channel: '@Ahora_Play', channel_name: 'AHORA PLAY' },
  { channel: '@lhdapodcast', channel_name: 'LHDA PODCAST' },
  { channel: '@AnimaDigital-yt', channel_name: 'Anima en Vivo' },
  { channel: '@maledelosrios', channel_name: 'Malena de los Ríos' },
  { channel: '@lacasadelstreaming', channel_name: 'La Casa del Streaming' },
  { channel: '@Veredictumm', channel_name: 'Veredictum: reus' },
  { channel: '@LauraDiMarco_', channel_name: 'Laura Di Marco' },
];

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Obtiene la URL base del sitio a partir del request actual o variables de entorno.
 */
export function resolveBaseUrl(headers?: Record<string, string | string[] | undefined>): string {
  const explicitSiteUrl = process.env.SITE_URL || process.env.PUBLIC_SITE_URL;
  if (explicitSiteUrl) {
    return explicitSiteUrl.replace(/\/+$/, '');
  }

  if (headers) {
    const rawHost = headers['x-forwarded-host'] || headers['host'];
    const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost)?.split(',')[0]?.trim();
    if (host && !host.includes('localhost') && !host.startsWith('127.0.0.1')) {
      const rawProto = headers['x-forwarded-proto'];
      const protoHeader = Array.isArray(rawProto) ? rawProto[0] : rawProto;
      const protocol = protoHeader?.split(',')[0]?.trim() || 'https';
      return `${protocol}://${host}`.replace(/\/+$/, '');
    }
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/+$/, '');
  }

  if (
    process.env.APP_URL &&
    !process.env.APP_URL.includes('localhost') &&
    !process.env.APP_URL.includes('MY_APP_URL')
  ) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }

  if (headers) {
    const rawHost = headers['x-forwarded-host'] || headers['host'];
    const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost)?.split(',')[0]?.trim();
    if (host) {
      return `http://${host}`.replace(/\/+$/, '');
    }
  }

  return 'http://localhost:3000';
}

/**
 * Obtiene todos los canales activos desde PostgreSQL (o el listado de producción como respaldo).
 */
export async function getSitemapChannels(): Promise<SitemapChannelEntry[]> {
  const cached = getCachedResponse<SitemapChannelEntry[]>('sitemap:channels');
  if (cached && cached.length > 0) {
    return cached;
  }

  const pool = getPool();
  if (pool) {
    try {
      const query = `
        SELECT channel, channel_name
        FROM public.channels
        WHERE active::text IN ('1', 'true')
          AND channel IS NOT NULL
          AND channel <> ''
          AND channel <> '@Radio10am'
        ORDER BY subs DESC NULLS LAST;
      `;
      const result: any = await executeQuery(query);
      if (result?.rows && result.rows.length > 0) {
        const seen = new Set<string>();
        const channels: SitemapChannelEntry[] = [];
        for (const row of result.rows) {
          const rawHandle = String(row.channel || '').trim();
          if (!rawHandle) continue;
          const normalized = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
          const lowerKey = normalized.toLowerCase();
          if (!seen.has(lowerKey)) {
            seen.add(lowerKey);
            channels.push({
              channel: normalized,
              channel_name: row.channel_name || normalized,
            });
          }
        }
        if (channels.length > 0) {
          setCachedResponse('sitemap:channels', channels, 300_000);
          return channels;
        }
      }
    } catch (err: any) {
      console.warn('[sitemap] Fallback to static production channel list:', err?.message);
    }
  }

  // Deduplicate fallback list just in case
  const seen = new Set<string>();
  const fallback: SitemapChannelEntry[] = [];
  for (const ch of PRODUCTION_CHANNELS_FALLBACK) {
    const normalized = ch.channel.startsWith('@') ? ch.channel : `@${ch.channel}`;
    const lowerKey = normalized.toLowerCase();
    if (!seen.has(lowerKey)) {
      seen.add(lowerKey);
      fallback.push({ channel: normalized, channel_name: ch.channel_name });
    }
  }
  return fallback;
}

/**
 * Genera el documento XML completo del sitemap incluyendo todas las secciones y canales.
 */
export async function generateSitemapXml(baseUrl: string): Promise<string> {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const nowIso = new Date().toISOString().split('T')[0];

  const staticSections = [
    { path: '/', changefreq: 'always', priority: '1.0' },
    { path: '/channels', changefreq: 'hourly', priority: '0.9' },
    { path: '/streams', changefreq: 'hourly', priority: '0.9' },
    { path: '/superchats', changefreq: 'hourly', priority: '0.8' },
    { path: '/face-off', changefreq: 'daily', priority: '0.8' },
    { path: '/contacto', changefreq: 'monthly', priority: '0.6' },
  ];

  const channels = await getSitemapChannels();

  const urlEntries: string[] = [];

  // 1. Secciones principales
  for (const section of staticSections) {
    const loc = section.path === '/' ? `${cleanBase}/` : `${cleanBase}${section.path}`;
    urlEntries.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${nowIso}</lastmod>
    <changefreq>${section.changefreq}</changefreq>
    <priority>${section.priority}</priority>
  </url>`);
  }

  // 2. Páginas individuales de cada canal (/channel/@handle)
  for (const ch of channels) {
    const handle = ch.channel.startsWith('@') ? ch.channel : `@${ch.channel}`;
    const loc = `${cleanBase}/channel/${encodeURI(handle)}`;
    urlEntries.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${nowIso}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join('\n')}
</urlset>
`;
}

/**
 * Genera el contenido de robots.txt apuntando al sitemap del dominio actual.
 */
export function generateRobotsTxt(baseUrl: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${cleanBase}/sitemap.xml
`;
}
