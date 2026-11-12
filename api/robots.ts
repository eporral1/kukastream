import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateRobotsTxt, resolveBaseUrl } from '../src/utils/sitemap.ts';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');

  const baseUrl = resolveBaseUrl(req.headers as Record<string, string | string[] | undefined>);
  const robotsTxt = generateRobotsTxt(baseUrl);
  return res.status(200).send(robotsTxt);
}
