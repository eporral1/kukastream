import type { VercelRequest, VercelResponse } from '@vercel/node';
import brandsHandler from '../src/api/brands.ts';
import channelHandler from '../src/api/channel.ts';
import channelsHandler from '../src/api/channels.ts';
import commentsQueryHandler from '../src/api/comments-query.ts';
import commentsHandler from '../src/api/comments.ts';
import contactHandler from '../src/api/contact.ts';
import detectAdsHandler from '../src/api/detect-ads.ts';
import generateCaptionsHandler from '../src/api/generate-captions.ts';
import liveHandler from '../src/api/live.ts';
import statusHandler from '../src/api/status.ts';
import streamsHandler from '../src/api/streams.ts';
import superchatsRankingHandler from '../src/api/superchats-ranking.ts';
import topCommentatorsHandler from '../src/api/top-commentators.ts';
import uniqueCommentatorsHandler from '../src/api/unique-commentators.ts';
import videoCaptionsHandler from '../src/api/video-captions.ts';

type ApiHandler = (req: VercelRequest, res: VercelResponse) => Promise<any> | any;

const HANDLERS: Record<string, ApiHandler> = {
  brands: brandsHandler,
  channel: channelHandler,
  channels: channelsHandler,
  'comments-query': commentsQueryHandler,
  comments: commentsHandler,
  contact: contactHandler,
  'detect-ads': detectAdsHandler,
  'generate-captions': generateCaptionsHandler,
  live: liveHandler,
  status: statusHandler,
  streams: streamsHandler,
  'superchats-ranking': superchatsRankingHandler,
  'top-commentators': topCommentatorsHandler,
  'unique-commentators': uniqueCommentatorsHandler,
  'video-captions': videoCaptionsHandler,
};

function resolveEndpoint(req: VercelRequest): string {
  const rawQueryEndpoint = req.query?.__endpoint;
  const fromQuery = Array.isArray(rawQueryEndpoint)
    ? rawQueryEndpoint[0]
    : typeof rawQueryEndpoint === 'string'
    ? rawQueryEndpoint
    : '';

  if (fromQuery) {
    return fromQuery.replace(/^\/+|\/+$/g, '').toLowerCase();
  }

  const pathname = String(req.url || '')
    .split('?')[0]
    .replace(/^\/api\/?/, '')
    .replace(/^\/+|\/+$/g, '');

  if (!pathname || pathname === 'index') {
    return 'status';
  }

  const segments = pathname.split('/').filter(Boolean);
  const first = (segments[0] || '').toLowerCase();

  if (first === 'channel' && segments[1] && !req.query.id) {
    req.query.id = decodeURIComponent(segments.slice(1).join('/'));
  } else if (first === 'brands' && segments[1] && !req.query.key) {
    req.query.key = decodeURIComponent(segments.slice(1).join('/'));
  }

  return first;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const endpoint = resolveEndpoint(req);

  if (req.query && '__endpoint' in req.query) {
    delete req.query.__endpoint;
  }

  const target = HANDLERS[endpoint];
  if (!target) {
    return res.status(404).json({
      success: false,
      error: `API endpoint '${endpoint}' not found`,
    });
  }

  return target(req, res);
}
