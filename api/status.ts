import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, executeQuery } from '../src/utils/serverDb.ts';
import { generateSitemapXml, generateRobotsTxt, resolveBaseUrl } from '../src/utils/sitemap.ts';

function getDiagnosticPool() {
  return getPool();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const reqType = String(req.query?.type || '').toLowerCase();
  if (reqType === 'sitemap') {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    try {
      const baseUrl = resolveBaseUrl(req.headers as Record<string, string | string[] | undefined>);
      const xml = await generateSitemapXml(baseUrl);
      return res.status(200).send(xml);
    } catch (err: any) {
      console.error('[api/status?type=sitemap] Error:', err);
      return res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
  }

  if (reqType === 'robots') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    const baseUrl = resolveBaseUrl(req.headers as Record<string, string | string[] | undefined>);
    return res.status(200).send(generateRobotsTxt(baseUrl));
  }

  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

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

  const port =
    process.env.DB_PORT ||
    process.env.POSTGRES_PORT ||
    process.env.PGPORT ||
    '5432';

  const hasValidConnectionString = Boolean(connectionString && !connectionString.includes('hjkhjk'));
  const hasValidDiscrete = Boolean(host && password && !host.includes('hjkhjk') && !password.includes('hjkhjk'));
  const isConfigured = hasValidConnectionString || hasValidDiscrete;

  const envCheck = {
    hasConnectionString: hasValidConnectionString,
    hasHost: Boolean(host && !host.includes('hjkhjk')),
    hasUser: Boolean(user),
    hasPassword: Boolean(password && !password.includes('hjkhjk')),
    hasDatabase: Boolean(database),
    port,
    hostPreview: host ? (host.length > 8 ? `${host.slice(0, 4)}...${host.slice(-4)}` : host) : null,
    databaseName: database || null,
  };

  if (!isConfigured) {
    return res.status(200).json({
      connected: false,
      configured: false,
      message: 'Base de datos no configurada en Vercel. Faltan variables de entorno en Vercel Dashboard.',
      environment: envCheck,
      help: 'En Vercel Dashboard: Ve a Project Settings -> Environment Variables, y añade DATABASE_URL o DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE, DB_PORT.',
    });
  }

  const p = getDiagnosticPool();
  if (!p) {
    return res.status(200).json({
      connected: false,
      configured: false,
      message: 'No se pudo crear el pool de PostgreSQL.',
      environment: envCheck,
    });
  }

  try {
    const start = Date.now();
    const dbRes: any = await executeQuery('SELECT NOW() as current_time, current_database() as db_name, version() as pg_version');
    const latencyMs = Date.now() - start;

    return res.status(200).json({
      connected: true,
      configured: true,
      latencyMs,
      currentTime: dbRes.rows[0]?.current_time,
      database: dbRes.rows[0]?.db_name,
      pgVersion: dbRes.rows[0]?.pg_version?.split(' ')?.[0] || 'PostgreSQL',
      environment: envCheck,
    });
  } catch (err: any) {
    return res.status(200).json({
      connected: false,
      configured: true,
      error: err.message,
      errorCode: err.code,
      environment: envCheck,
      help: err.message?.includes('timeout')
        ? 'El servidor de base de datos no respondió a tiempo. Si usas Supabase, asegúrate de usar el connection pooler (puerto 6543).'
        : err.code === '28P01'
        ? 'Contraseña o usuario incorrecto en las variables de entorno de Vercel.'
        : 'Verifica los datos de conexión en el dashboard de Vercel.',
    });
  }
}
