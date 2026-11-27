import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../utils/serverDb.ts';
import {
  detectVideoAds,
  getCachedVideoAds,
  updateVideoAdsClockOffset,
  updateSingleAd,
  deleteSingleAd,
  deleteVideoAdsCache,
} from '../utils/serverAdDetector.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Client');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: false,
      error: 'DB not connected.',
    });
  }

  const sourceParams =
    req.method === 'POST' || req.method === 'PATCH'
      ? (req.body || {})
      : { ...(req.query || {}), ...(req.body && typeof req.body === 'object' ? req.body : {}) };
  const videoId = String(sourceParams.video_id || '').trim();
  if (!videoId) {
    return res.status(400).json({
      success: false,
      error: 'video_id is required.',
    });
  }

  // DELETE or action=delete: remove a single ad (if ad_id provided) or the whole measurement from public.video_ads_cache
  if (req.method === 'DELETE' || sourceParams.action === 'delete') {
    if (sourceParams.ad_id) {
      const adId = String(sourceParams.ad_id).trim();
      try {
        const deleted = await deleteSingleAd(videoId, adId);
        return res.status(200).json({
          success: true,
          video_id: videoId,
          ...deleted,
        });
      } catch (err: any) {
        return res.status(500).json({
          success: false,
          error: err.message || 'Error al borrar el anuncio.',
        });
      }
    }

    try {
      const deleted = await deleteVideoAdsCache(videoId);
      return res.status(200).json({
        success: true,
        ...deleted,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Error al borrar la medición de anuncios.',
      });
    }
  }

  // PATCH or update_offset_only: save per-ad timestamp OR manual global clock_offset_sec
  const updateOffsetOnly =
    req.method === 'PATCH' ||
    sourceParams.update_offset_only === '1' ||
    sourceParams.update_offset_only === 'true' ||
    sourceParams.update_offset_only === true;

  if (updateOffsetOnly) {
    if (sourceParams.ad_id) {
      const adId = String(sourceParams.ad_id).trim();
      const patch: {
        start_sec?: number;
        end_sec?: number;
        clock_offset_sec?: number;
        brand?: string;
      } = {};
      if (sourceParams.start_sec !== undefined && sourceParams.start_sec !== null) {
        patch.start_sec = Number(sourceParams.start_sec);
      }
      if (sourceParams.end_sec !== undefined && sourceParams.end_sec !== null) {
        patch.end_sec = Number(sourceParams.end_sec);
      }
      if (sourceParams.ad_clock_offset_sec !== undefined && sourceParams.ad_clock_offset_sec !== null) {
        patch.clock_offset_sec = Number(sourceParams.ad_clock_offset_sec);
      }
      if (sourceParams.brand !== undefined && sourceParams.brand !== null) {
        patch.brand = String(sourceParams.brand);
      }
      try {
        const updated = await updateSingleAd(videoId, adId, patch);
        return res.status(200).json({
          success: true,
          video_id: videoId,
          ...updated,
        });
      } catch (err: any) {
        return res.status(500).json({
          success: false,
          error: err.message || 'Error al actualizar el anuncio.',
        });
      }
    }

    const rawOffset = Number(sourceParams.clock_offset_sec ?? 0);
    const safeOffset = Number.isFinite(rawOffset) ? Math.round(rawOffset) : 0;
    try {
      const updated = await updateVideoAdsClockOffset(videoId, safeOffset);
      return res.status(200).json({
        success: true,
        video_id: videoId,
        ...updated,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Error al guardar el offset horario.',
      });
    }
  }

  // cache_only=1: fast read-only check on page load (never triggers Gemini/Supadata)
  const cacheOnly =
    sourceParams.cache_only === '1' ||
    sourceParams.cache_only === 'true' ||
    sourceParams.cache_only === true;

  if (cacheOnly) {
    try {
      const cached = await getCachedVideoAds(videoId);
      if (!cached) {
        return res.status(200).json({ success: true, found: false });
      }
      return res.status(200).json({ success: true, found: true, ...cached });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Error al consultar caché de anuncios.',
      });
    }
  }

  const force =
    sourceParams.force === '1' ||
    sourceParams.force === 'true' ||
    sourceParams.force === true;
  const startDate = sourceParams.start_date ? String(sourceParams.start_date) : null;
  const endDate = sourceParams.end_date ? String(sourceParams.end_date) : null;
  const videoTitle = sourceParams.video_title ? String(sourceParams.video_title) : undefined;
  const clockOffsetRaw = sourceParams.clock_offset_sec;
  const clockOffsetSec =
    clockOffsetRaw !== undefined && clockOffsetRaw !== null && clockOffsetRaw !== ''
      ? Number(clockOffsetRaw)
      : undefined;
  const saveOffset =
    sourceParams.save_offset === '1' ||
    sourceParams.save_offset === 'true' ||
    sourceParams.save_offset === true;

  try {
    const result = await detectVideoAds({
      video_id: videoId,
      force,
      start_date: startDate,
      end_date: endDate,
      video_title: videoTitle,
      clock_offset_sec: clockOffsetSec,
      save_offset: saveOffset,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[api/detect-ads] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Error al analizar anuncios en los subtítulos del video.',
    });
  }
}
