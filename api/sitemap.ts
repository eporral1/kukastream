import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateSitemapXml, resolveBaseUrl } from '../src/utils/sitemap.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const baseUrl = resolveBaseUrl(req.headers as Record<string, string | string[] | undefined>);
    const xml = await generateSitemapXml(baseUrl);
    return res.status(200).send(xml);
  } catch (err: any) {
    console.error('[api/sitemap] Error generating sitemap:', err);
    return res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
}
