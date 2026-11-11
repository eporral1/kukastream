import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, executeQuery } from '../src/utils/serverDb.ts';

const OCT_2026_CUTOFF = '2026-10-01 00:00:00';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawIds = (req.query.video_ids as string) || '';
  const videoIds = rawIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const p = getPool();
  if (!p || videoIds.length === 0) {
    return res.status(200).json({ success: true, counts: {} });
  }

  try {
    const result: any = await executeQuery(
      `SELECT video_id, COUNT(DISTINCT author_id)::int AS unique_count
       FROM public.comments
       WHERE video_id = ANY($1) AND created_at >= '${OCT_2026_CUTOFF}'
       GROUP BY video_id`,
      [videoIds]
    );

    const counts: Record<string, number> = {};
    for (const row of result.rows || []) {
      counts[row.video_id] = parseInt(row.unique_count || '0', 10);
    }

    return res.status(200).json({ success: true, counts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, counts: {} });
  }
}
