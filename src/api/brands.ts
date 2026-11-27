import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../utils/serverDb.ts';
import { listMeasuredBrandStreams, getBrandStreamDetail } from '../utils/serverBrands.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Client');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const p = getPool();
  if (!p) {
    return res.status(200).json({
      success: false,
      error: 'DB not connected.',
      streams: [],
    });
  }

  const key = req.query?.key ? String(req.query.key).trim() : '';

  try {
    if (key) {
      const detail = await getBrandStreamDetail(key);
      if (!detail) {
        return res.status(404).json({
          success: false,
          error: 'Emisión auditada no encontrada.',
        });
      }
      return res.status(200).json({
        success: true,
        ...detail,
      });
    }

    const list = await listMeasuredBrandStreams();
    return res.status(200).json({
      success: true,
      ...list,
    });
  } catch (err: any) {
    console.error('[api/brands] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Error al obtener emisiones medidas para Brands.',
    });
  }
}
