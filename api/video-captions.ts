import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../src/utils/serverDb.ts';
import { getVideoCaptions } from '../src/utils/serverVideoCaptions.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Client');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: false,
      error: 'DB not connected.',
      cues: [],
      status: 'idle',
      progress: 0,
    });
  }

  const sourceParams = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const videoId = String(sourceParams.video_id || '').trim();
  if (!videoId) {
    return res.status(400).json({
      success: false,
      error: 'video_id is required.',
      cues: [],
      status: 'idle',
      progress: 0,
    });
  }

  const startDate = sourceParams.start_date ? String(sourceParams.start_date) : null;
  const endDate = sourceParams.end_date ? String(sourceParams.end_date) : null;
  const durationRaw = sourceParams.duration;
  const duration =
    durationRaw !== undefined && durationRaw !== null && durationRaw !== ''
      ? Number(durationRaw)
      : null;
  const priorityTimeRaw = sourceParams.priority_time;
  const priorityTime =
    priorityTimeRaw !== undefined && priorityTimeRaw !== null && priorityTimeRaw !== ''
      ? Number(priorityTimeRaw)
      : null;
  const isLive =
    sourceParams.is_live === '1' ||
    sourceParams.is_live === 'true' ||
    sourceParams.is_live === true;
  const downloadAll =
    req.method === 'POST' ||
    sourceParams.download_all === '1' ||
    sourceParams.download_all === 'true' ||
    sourceParams.download_all === true;

  try {
    const result = await getVideoCaptions({
      video_id: videoId,
      start_date: startDate,
      end_date: endDate,
      duration,
      priority_time: priorityTime,
      is_live: isLive,
      download_all: downloadAll,
    });

    return res.status(200).json({
      success: true,
      video_id: videoId,
      ...result,
    });
  } catch (err: any) {
    console.error('[api/video-captions] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Error fetching video captions.',
      cues: [],
      status: 'idle',
      progress: 0,
    });
  }
}
