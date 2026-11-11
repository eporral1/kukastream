import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App, { InitialPrerenderData } from '../src/App.tsx';
import { CHANNELS } from '../src/data/mockData.ts';
import { SITE_NAME } from '../src/config/site.ts';
import { formatArgentinaTime, isOctober2026OrLater } from '../src/utils/dateFilter.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OCT_2026_CUTOFF = '2026-10-01 00:00:00';

function getBuildPool(): Pool | null {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DB_URL;

  if (connectionString && !connectionString.includes('hjkhjk')) {
    return new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 5000,
      max: 2,
    });
  }

  const host = process.env.DB_HOST || process.env.POSTGRES_HOST || process.env.PGHOST;
  const user = process.env.DB_USERNAME || process.env.DB_USER || process.env.POSTGRES_USER || process.env.PGUSER;
  const password = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD;
  const database = process.env.DB_DATABASE || process.env.DB_NAME || process.env.POSTGRES_DATABASE || process.env.PGDATABASE;
  const portNum = parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || process.env.PGPORT || '5432', 10);

  if (!host || host.includes('hjkhjk') || !password || password.includes('hjkhjk')) {
    return null;
  }

  return new Pool({
    host,
    user,
    password,
    database,
    port: portNum,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 4000,
    idleTimeoutMillis: 5000,
    max: 2,
  });
}

async function fetchPrerenderData(): Promise<InitialPrerenderData> {
  // 1. Try direct PostgreSQL connection during Vercel build if env vars are available
  const pool = getBuildPool();
  if (pool) {
    try {
      const liveQuery = `
        SELECT 
          l.video_id, l.channel_id, l.concurrent_viewers, l.old_viewers,
          l.current_likes, l.old_likes, l.scrape_date, l.start_date, l.live,
          COALESCE(NULLIF(l.video_title, ''), m_meta.video_title, 'Transmisión en vivo') AS video_title,
          c.channel, c.channel_name, c.description, c.subs, c.thumb, c.tags, c.twitter, c.type,
          COALESCE(m_meta.comments_count, 0)::int AS comments_count,
          COALESCE(v_max.max_viewers, l.concurrent_viewers, 0)::int AS max_viewers,
          COALESCE(sc.superchats_total, 0)::numeric AS superchats_total,
          COALESCE(sc.superchats_count, 0)::int AS superchats_count
        FROM public.live l
        JOIN public.channels c ON l.channel_id = c.channel_id
        LEFT JOIN LATERAL (
          SELECT m.video_title, COALESCE(m.comments_count, 0) AS comments_count
          FROM public.minute m
          WHERE m.video_id = l.video_id AND m.scrape_date >= '${OCT_2026_CUTOFF}'
          ORDER BY m.scrape_date DESC, m.id DESC
          LIMIT 1
        ) m_meta ON true
        LEFT JOIN LATERAL (
          SELECT MAX(m2.concurrent_viewers) AS max_viewers
          FROM public.minute m2
          WHERE m2.video_id = l.video_id AND m2.scrape_date >= '${OCT_2026_CUTOFF}'
        ) v_max ON true
        LEFT JOIN LATERAL (
          SELECT 
            SUM(CASE WHEN s.currency = 'ARS' OR UPPER(s.currency) LIKE '%ARS%' THEN s.amount ELSE 0 END) AS superchats_total,
            COUNT(s.id) AS superchats_count
          FROM public.superchats s
          WHERE s.video_id = l.video_id AND s.created_at >= '${OCT_2026_CUTOFF}'
        ) sc ON true
        WHERE l.live = 'live'
          AND l.concurrent_viewers > 0
          AND (l.scrape_date >= '${OCT_2026_CUTOFF}' OR l.start_date >= '${OCT_2026_CUTOFF}')
          AND c.active::text IN ('1', 'true')
          AND c.channel <> '@Radio10am'
        ORDER BY l.concurrent_viewers DESC
        LIMIT 30;
      `;

      const recentQuery = `
        SELECT 
          l.video_id, l.channel_id, l.concurrent_viewers, l.old_viewers,
          l.current_likes, l.old_likes, l.scrape_date, l.start_date, l.live,
          COALESCE(NULLIF(l.video_title, ''), 'Emisión finalizada') AS video_title,
          c.channel, c.channel_name, c.description, c.subs, c.thumb, c.tags, c.twitter, c.type,
          COALESCE(l.old_viewers, l.concurrent_viewers, 0)::int AS max_viewers,
          0::int AS comments_count,
          0::numeric AS superchats_total
        FROM public.live l
        JOIN public.channels c ON l.channel_id = c.channel_id
        WHERE l.live <> 'live'
          AND l.scrape_date >= NOW() - INTERVAL '24 hours'
          AND l.scrape_date >= '${OCT_2026_CUTOFF}'
          AND c.active::text IN ('1', 'true')
          AND c.channel <> '@Radio10am'
        ORDER BY l.scrape_date DESC
        LIMIT 12;
      `;

      const channelsQuery = `
        SELECT channel, channel_name, description, subs, channel_id, thumb, tags, twitter, active, type,
               0::int AS avg_viewers, 0::int AS avg_likes
        FROM public.channels
        WHERE active::text IN ('1', 'true') AND channel <> '@Radio10am'
        ORDER BY subs DESC NULLS LAST;
      `;

      const [liveRes, recentRes, chRes] = await Promise.all([
        pool.query(liveQuery).catch(() => ({ rows: [] })),
        pool.query(recentQuery).catch(() => ({ rows: [] })),
        pool.query(channelsQuery).catch(() => ({ rows: [] })),
      ]);

      await pool.end().catch(() => {});

      const streams = (liveRes.rows || []).filter(
        (s: any) => isOctober2026OrLater(s.scrape_date) || isOctober2026OrLater(s.start_date)
      );
      const recentStreams = (recentRes.rows || []).filter(
        (s: any) => isOctober2026OrLater(s.scrape_date) || isOctober2026OrLater(s.start_date)
      );
      const channelsList = chRes.rows && chRes.rows.length > 0 ? chRes.rows : CHANNELS;

      const allDates = [...streams, ...recentStreams].map((s: any) => s.scrape_date).filter(Boolean);
      const lastUpdate = allDates.length > 0 ? formatArgentinaTime(allDates.sort().reverse()[0]) : 'En vivo';

      if (streams.length > 0 || recentStreams.length > 0 || (chRes.rows && chRes.rows.length > 0)) {
        console.log(`[prerender] Loaded ${streams.length} live streams, ${recentStreams.length} recent streams, ${channelsList.length} channels from PostgreSQL.`);
        return {
          streams,
          recentStreams,
          channelsList,
          lastUpdate,
          isPrerendered: true,
        };
      }
    } catch (err: any) {
      console.warn('[prerender] Direct PostgreSQL query skipped:', err?.message);
      await pool.end().catch(() => {});
    }
  }

  // 2. Try local running server on port 3000 if available
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const [liveRes, chRes] = await Promise.all([
      fetch('http://localhost:3000/api/live?tag=all', {
        headers: { 'X-App-Client': 'kukastream-web' },
        signal: controller.signal,
      }),
      fetch('http://localhost:3000/api/channels', {
        headers: { 'X-App-Client': 'kukastream-web' },
        signal: controller.signal,
      }),
    ]);
    clearTimeout(timeout);

    if (liveRes.ok) {
      const liveData: any = await liveRes.json();
      const chData: any = chRes.ok ? await chRes.json() : null;
      const streams = Array.isArray(liveData?.streams) ? liveData.streams : [];
      const recentStreams = Array.isArray(liveData?.recent_streams) ? liveData.recent_streams : [];
      const channelsList = Array.isArray(chData?.channels) && chData.channels.length > 0 ? chData.channels : CHANNELS;
      const allDates = [...streams, ...recentStreams].map((s: any) => s.scrape_date).filter(Boolean);
      const lastUpdate = allDates.length > 0 ? formatArgentinaTime(allDates.sort().reverse()[0]) : 'En vivo';

      console.log(`[prerender] Loaded ${streams.length} live streams, ${recentStreams.length} recent streams, ${channelsList.length} channels from local API.`);
      return {
        streams,
        recentStreams,
        channelsList,
        lastUpdate,
        isPrerendered: true,
      };
    }
  } catch {
    // Local API not running during isolated build, fallback to static channels metadata
  }

  console.log('[prerender] Using static channel directory fallback for prerender.');
  return {
    streams: [],
    recentStreams: [],
    channelsList: CHANNELS,
    lastUpdate: 'En vivo',
    isPrerendered: true,
  };
}

function buildJsonLd(data: InitialPrerenderData): string {
  const channels = data.channelsList && data.channelsList.length > 0 ? data.channelsList : CHANNELS;
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: SITE_NAME,
        alternateName: 'StreamData Argentina',
        description:
          'Ranking en vivo, métricas de audiencia en tiempo real, superchats y estadísticas de canales de streaming en Argentina.',
        inLanguage: 'es-AR',
      },
      {
        '@type': 'WebApplication',
        name: `${SITE_NAME} - Ranking de Streaming en Vivo`,
        applicationCategory: 'EntertainmentApplication',
        operatingSystem: 'All',
        description:
          'Monitoreo continuo de espectadores concurrentes, likes, mensajes por emisión y recaudación en superchats (ARS) de los principales canales de streaming de Argentina.',
      },
      {
        '@type': 'ItemList',
        name: 'Canales de Streaming Monitoreados en Argentina',
        itemListElement: channels.slice(0, 20).map((ch, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: ch.channel_name,
          url: `/channel/${ch.channel}`,
        })),
      },
    ],
  };

  return `<script id="schema-jsonld" type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

function injectPrerenderIntoHtml(rawHtml: string, appHtml: string, jsonLdTag: string): string {
  let html = rawHtml;

  // 0. If GA_ID is provided in environment (e.g. Vercel GA_ID), replace G-XXXXXXXXXX placeholder in <head>
  const envGaId = process.env.GA_ID || process.env.VITE_GA_ID || process.env.GA_MEASUREMENT_ID;
  if (envGaId && envGaId !== 'G-XXXXXXXXXX') {
    html = html.replace(/G-XXXXXXXXXX/g, envGaId.trim());
  }

  // 1. Inject or update JSON-LD in <head>
  if (html.includes('id="schema-jsonld"')) {
    html = html.replace(/<script id="schema-jsonld" type="application\/ld\+json">[\s\S]*?<\/script>/, jsonLdTag);
  } else {
    html = html.replace('</head>', `    ${jsonLdTag}\n  </head>`);
  }

  // 2. Remove any exposed prerender-data script if present
  html = html.replace(/\s*<script id="prerender-data">[\s\S]*?<\/script>/g, '');

  // 3. Inject prerendered HTML into <div id="root">...</div>
  if (html.includes('<!--PRERENDER_START-->')) {
    html = html.replace(
      /<div id="root">[\s\S]*?<!--PRERENDER_END--><\/div>/,
      `<div id="root"><!--PRERENDER_START-->${appHtml}<!--PRERENDER_END--></div>`
    );
  } else {
    html = html.replace(
      /<div id="root"><\/div>/,
      `<div id="root"><!--PRERENDER_START-->${appHtml}<!--PRERENDER_END--></div>`
    );
  }

  return html;
}

async function runPrerender() {
  const initialData = await fetchPrerenderData();
  const appHtml = renderToString(<App initialData={initialData} />);
  const jsonLdTag = buildJsonLd(initialData);

  // Update dist/index.html if built (for Vercel deployment)
  const distIndexPath = path.join(ROOT_DIR, 'dist', 'index.html');
  if (fs.existsSync(distIndexPath)) {
    const distHtml = fs.readFileSync(distIndexPath, 'utf-8');
    const updatedDistHtml = injectPrerenderIntoHtml(distHtml, appHtml, jsonLdTag);
    fs.writeFileSync(distIndexPath, updatedDistHtml, 'utf-8');
    console.log(`[prerender] Successfully injected prerendered Home HTML (${appHtml.length} chars) into dist/index.html`);
  }

  // Also update root index.html so initial load in dev/source has prerendered HTML
  const rootIndexPath = path.join(ROOT_DIR, 'index.html');
  if (fs.existsSync(rootIndexPath)) {
    const rootHtml = fs.readFileSync(rootIndexPath, 'utf-8');
    const updatedRootHtml = injectPrerenderIntoHtml(rootHtml, appHtml, jsonLdTag);
    fs.writeFileSync(rootIndexPath, updatedRootHtml, 'utf-8');
    console.log(`[prerender] Successfully injected prerendered Home HTML (${appHtml.length} chars) into index.html`);
  }
}

runPrerender().catch((err) => {
  console.error('[prerender] Error during prerender:', err);
  process.exit(0); // Do not fail Vercel build if DB is unreachable
});
