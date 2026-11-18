import { executeQuery, getPool, getCachedResponse, setCachedResponse } from './serverDb.ts';
import { SITE_NAME } from '../config/site.ts';

export interface SitemapChannelEntry {
  channel: string;
  channel_name?: string;
  description?: string;
  subs?: number;
  thumb?: string;
  tags?: string;
}

export interface RouteSeoData {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogImage?: string;
  jsonLd?: string;
  prerenderBody?: string;
  channelData?: Record<string, any>;
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
    { path: '/usuarios', changefreq: 'hourly', priority: '0.8' },
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
 * Importante: NO bloquear /api/ con Disallow, ya que Googlebot (Web Rendering Service)
 * necesita consultar /api/channel, /api/channels y /api/live al renderizar el SPA.
 */
export function generateRobotsTxt(baseUrl: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `User-agent: *
Allow: /

Sitemap: ${cleanBase}/sitemap.xml
`;
}

export function escapeHtmlAttrServer(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Resuelve título, meta description, canonical URL, JSON-LD y HTML prerenderizado
 * para cualquier ruta (/channels, /channel/:id, etc.) tanto en Express como en Vercel.
 */
export async function resolveRouteSeoMeta(
  pathname: string,
  baseUrl?: string
): Promise<RouteSeoData> {
  const cleanPath = (pathname || '/').split('?')[0];
  const cleanBase = (baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const canonicalUrl = `${cleanBase}${cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`}`;
  const p = getPool();

  if (cleanPath === '/channels') {
    const title = `${SITE_NAME} - Canales`;
    let rows: any[] = [];
    const cached = getCachedResponse<{ channels?: any[] }>('channels:viewers');
    if (cached?.channels && cached.channels.length > 0) {
      rows = cached.channels;
    } else if (p) {
      try {
        const res = await p.query(
          `SELECT channel_name, channel, description, subs, thumb, tags
           FROM public.channels
           WHERE active::text IN ('1', 'true') AND channel <> '@Radio10am'
           ORDER BY subs DESC NULLS LAST`
        );
        rows = res.rows || [];
      } catch {
        // Fallback to static channels list below
      }
    }
    if (!rows || rows.length === 0) {
      rows = PRODUCTION_CHANNELS_FALLBACK;
    }

    const names = Array.from(
      new Set(
        rows
          .map((c: any) => String(c.channel_name || c.channel || '').trim())
          .filter(Boolean)
      )
    );
    const description =
      names.length > 0
        ? names.join(', ')
        : `Directorio completo de canales de streaming monitoreados en ${SITE_NAME}.`;

    const channelLinksHtml = rows
      .map((c: any) => {
        const handle = String(c.channel || '').startsWith('@')
          ? String(c.channel)
          : `@${c.channel}`;
        const label = escapeHtmlAttrServer(c.channel_name || handle);
        const desc = escapeHtmlAttrServer(
          String(c.description || '').replace(/\s+/g, ' ').trim()
        );
        return `<article class="bg-white rounded-xl p-5 border border-gray-100 shadow-xs">
          <h2 class="text-lg font-bold text-gray-900"><a href="/channel/${encodeURI(handle)}">${label}</a></h2>
          <p class="text-xs text-gray-500">${escapeHtmlAttrServer(handle)}</p>
          ${desc ? `<p class="text-sm text-gray-600 mt-2">${desc}</p>` : ''}
        </article>`;
      })
      .join('');

    const prerenderBody = `<div class="min-h-screen bg-gray-50 text-gray-900">
      <header class="bg-white border-b border-gray-200 px-6 py-4">
        <nav class="max-w-6xl mx-auto flex items-center justify-between">
          <a href="/" class="text-xl font-black text-gray-900">${escapeHtmlAttrServer(SITE_NAME)}</a>
          <div class="flex gap-4 text-sm font-medium text-gray-700">
            <a href="/">Home</a>
            <a href="/channels">Canales</a>
            <a href="/streams">Streams</a>
            <a href="/superchats">Superchats</a>
            <a href="/face-off">Face-Off</a>
          </div>
        </nav>
      </header>
      <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <h1 class="text-3xl font-extrabold text-gray-900">Canales de Streaming Monitoreados</h1>
        <p class="text-sm text-gray-600">${escapeHtmlAttrServer(description)}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">${channelLinksHtml}</div>
      </main>
    </div>`;

    return {
      title,
      description,
      canonicalUrl,
      prerenderBody,
    };
  }

  if (cleanPath.startsWith('/channel/')) {
    let rawId = cleanPath.replace('/channel/', '');
    try {
      rawId = decodeURIComponent(rawId);
    } catch {
      // Keep as is
    }
    rawId = rawId.trim();

    if (!rawId) {
      return {
        title: `${SITE_NAME} - Canal`,
        canonicalUrl,
      };
    }

    const withAt = rawId.startsWith('@') ? rawId : `@${rawId}`;
    const withoutAt = rawId.startsWith('@') ? rawId.substring(1) : rawId;

    let ch: any = null;
    if (p) {
      try {
        const res = await p.query(
          `SELECT channel, channel_name, description, subs, channel_id, thumb, tags, twitter, type
           FROM public.channels
           WHERE LOWER(channel) = LOWER($1)
              OR LOWER(channel) = LOWER($2)
              OR LOWER(channel_id) = LOWER($3)
              OR LOWER(channel_name) = LOWER($3)
           LIMIT 1`,
          [withAt, withoutAt, rawId]
        );
        ch = res.rows?.[0] || null;
      } catch {
        // Fallback below
      }
    }

    if (!ch) {
      const fb = PRODUCTION_CHANNELS_FALLBACK.find(
        (item) =>
          item.channel.toLowerCase() === withAt.toLowerCase() ||
          item.channel.toLowerCase() === withoutAt.toLowerCase() ||
          (item.channel_name || '').toLowerCase() === rawId.toLowerCase()
      );
      if (fb) {
        ch = {
          channel: fb.channel,
          channel_name: fb.channel_name || withoutAt,
          description: fb.description || '',
          subs: fb.subs || 0,
          channel_id: fb.channel,
          thumb: fb.thumb || '',
          tags: fb.tags || 'stream',
        };
      }
    }

    const label = String(ch?.channel_name || ch?.channel || withoutAt).trim();
    const handle = String(ch?.channel || withAt).trim();
    const rawDesc = String(ch?.description || '').replace(/\s+/g, ' ').trim();
    const description =
      rawDesc ||
      `Métricas en vivo, audiencia en tiempo real, emisiones recientes, superchats y estadísticas de ${label} (${handle}) en ${SITE_NAME}.`;
    const title = `${SITE_NAME} - ${label}`;
    const ogImage = ch?.thumb && String(ch.thumb).startsWith('http') ? String(ch.thumb) : undefined;

    const schema = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          '@id': canonicalUrl,
          url: canonicalUrl,
          name: title,
          description,
          inLanguage: 'es-AR',
          isPartOf: {
            '@type': 'WebSite',
            name: SITE_NAME,
            url: `${cleanBase}/`,
          },
        },
        {
          '@type': 'BroadcastChannel',
          name: label,
          alternateName: handle,
          description,
          url: canonicalUrl,
          ...(ogImage ? { image: ogImage } : {}),
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: SITE_NAME,
              item: `${cleanBase}/`,
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'Canales',
              item: `${cleanBase}/channels`,
            },
            {
              '@type': 'ListItem',
              position: 3,
              name: label,
              item: canonicalUrl,
            },
          ],
        },
      ],
    };

    const jsonLd = `<script id="schema-jsonld" type="application/ld+json">${JSON.stringify(schema)}</script>`;

    const channelData = {
      channel_id: ch?.channel_id || handle,
      channel: handle.startsWith('@') ? handle : `@${handle}`,
      channel_name: label,
      description: rawDesc,
      subs: Number(ch?.subs || 0),
      thumb: ch?.thumb || 'https://yt3.ggpht.com/',
      tags: ch?.tags || 'stream',
      twitter: ch?.twitter || '',
      type: ch?.type || 'normal',
      avg_viewers: 0,
      avg_likes: 0,
    };

    const prerenderBody = `<div class="min-h-screen bg-gray-50 text-gray-900">
      <header class="bg-white border-b border-gray-200 px-6 py-4">
        <nav class="max-w-6xl mx-auto flex items-center justify-between">
          <a href="/" class="text-xl font-black text-gray-900">${escapeHtmlAttrServer(SITE_NAME)}</a>
          <div class="flex gap-4 text-sm font-medium text-gray-700">
            <a href="/">Home</a>
            <a href="/channels">Canales</a>
            <a href="/streams">Streams</a>
            <a href="/superchats">Superchats</a>
            <a href="/face-off">Face-Off</a>
          </div>
        </nav>
      </header>
      <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <a href="/" class="inline-flex items-center text-sm font-semibold text-gray-600 hover:text-blue-600">← Volver al Ranking</a>
        <article class="bg-white rounded-xl shadow-xs border border-gray-100 p-6 md:p-8 space-y-4">
          <div class="flex items-center gap-4">
            ${ogImage ? `<img src="${escapeHtmlAttrServer(ogImage)}" alt="${escapeHtmlAttrServer(label)}" class="w-20 h-20 rounded-full object-cover" />` : ''}
            <div>
              <h1 class="text-2xl sm:text-3xl font-extrabold text-gray-900">${escapeHtmlAttrServer(label)}</h1>
              <p class="text-sm text-gray-500">${escapeHtmlAttrServer(handle)}</p>
            </div>
          </div>
          <p class="text-sm text-gray-700 leading-relaxed">${escapeHtmlAttrServer(description)}</p>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div class="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div class="text-xs text-gray-500">Suscriptores</div>
              <div class="text-lg font-extrabold text-gray-900">${Number(ch?.subs || 0).toLocaleString('es-AR')}</div>
            </div>
            <div class="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div class="text-xs text-gray-500">Categoría</div>
              <div class="text-lg font-extrabold text-gray-900">${escapeHtmlAttrServer(ch?.tags || 'Streaming')}</div>
            </div>
          </div>
        </article>
        <section class="space-y-3">
          <h2 class="text-xl font-bold text-gray-900">Emisiones y estadísticas en tiempo real de ${escapeHtmlAttrServer(label)}</h2>
          <p class="text-sm text-gray-600">Monitoreo minuto a minuto de espectadores concurrentes, picos de audiencia, likes, superchats y comentaristas únicos en el chat en vivo de ${escapeHtmlAttrServer(label)}.</p>
        </section>
      </main>
    </div>`;

    return {
      title,
      description,
      canonicalUrl,
      ogImage,
      jsonLd,
      prerenderBody,
      channelData,
    };
  }

  return {
    canonicalUrl,
  };
}

export function applySeoToHtml(html: string, seo: RouteSeoData): string {
  let out = html;

  if (seo.title) {
    const escapedTitle = escapeHtmlAttrServer(seo.title);
    out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapedTitle}</title>`);
    out = out.replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${escapedTitle}" />`
    );
    out = out.replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:title" content="${escapedTitle}" />`
    );
  }

  if (seo.description) {
    const escapedDesc = escapeHtmlAttrServer(seo.description);
    out = out.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${escapedDesc}" />`
    );
    out = out.replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${escapedDesc}" />`
    );
    out = out.replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:description" content="${escapedDesc}" />`
    );
  }

  if (seo.ogImage) {
    const escapedImg = escapeHtmlAttrServer(seo.ogImage);
    out = out.replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:image" content="${escapedImg}" />`
    );
    out = out.replace(
      /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:image" content="${escapedImg}" />`
    );
  }

  if (seo.canonicalUrl) {
    const escapedCanonical = escapeHtmlAttrServer(seo.canonicalUrl);
    const canonicalTag = `<link rel="canonical" href="${escapedCanonical}" />`;
    const ogUrlTag = `<meta property="og:url" content="${escapedCanonical}" />`;

    if (/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i.test(out)) {
      out = out.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, canonicalTag);
    } else {
      out = out.replace('</head>', `    ${canonicalTag}\n  </head>`);
    }

    if (/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i.test(out)) {
      out = out.replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i, ogUrlTag);
    } else {
      out = out.replace('</head>', `    ${ogUrlTag}\n  </head>`);
    }
  }

  // Ensure explicit index, follow robots tag is present
  const robotsTag = `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />`;
  if (!/<meta\s+name="robots"/i.test(out)) {
    out = out.replace('</head>', `    ${robotsTag}\n  </head>`);
  }

  if (seo.jsonLd) {
    if (out.includes('id="schema-jsonld"')) {
      out = out.replace(
        /<script id="schema-jsonld" type="application\/ld\+json">[\s\S]*?<\/script>/i,
        seo.jsonLd
      );
    } else {
      out = out.replace('</head>', `    ${seo.jsonLd}\n  </head>`);
    }
  }

  if (seo.channelData) {
    const safeJson = JSON.stringify(seo.channelData).replace(/</g, '\\u003c');
    const channelScript = `<script id="prerender-channel" type="application/json">${safeJson}</script>`;
    if (out.includes('id="prerender-channel"')) {
      out = out.replace(
        /<script id="prerender-channel" type="application\/json">[\s\S]*?<\/script>/i,
        channelScript
      );
    } else {
      out = out.replace('</head>', `    ${channelScript}\n  </head>`);
    }
  }

  if (seo.prerenderBody) {
    if (out.includes('<!--PRERENDER_START-->')) {
      out = out.replace(
        /<div id="root">[\s\S]*?<!--PRERENDER_END--><\/div>/,
        `<div id="root"><!--PRERENDER_START-->${seo.prerenderBody}<!--PRERENDER_END--></div>`
      );
    } else {
      out = out.replace(
        /<div id="root"><\/div>/,
        `<div id="root"><!--PRERENDER_START-->${seo.prerenderBody}<!--PRERENDER_END--></div>`
      );
    }
  }

  return out;
}

