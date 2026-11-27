import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  Calendar,
  Eye,
  Heart,
  MessageSquare,
  Users,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Megaphone,
} from 'lucide-react';
import { Stream, MinuteDataPoint } from '../types';
import { formatNumber } from '../data/mockData';
import { formatArgentinaDateTime } from '../utils/dateFilter';
import { StreamVideoWithCaptions } from './StreamVideoWithCaptions';
import { StreamLineChart } from './StreamLineChart';
import { StreamCommentsModal } from './StreamCommentsModal';
import { VideoAdsAnalysis } from './VideoAdsPanel';
import { SITE_NAME } from '../config/site';
import { trackEvent, updateSeoMeta } from '../utils/analytics';

interface BrandStreamDetailResponse {
  stream_key: string;
  stream: Stream & {
    video_start_date?: string;
    superchats_total?: number;
    superchats_count?: number;
    data?: MinuteDataPoint[];
  };
  channel: {
    channel_id: string;
    channel: string;
    channel_name: string;
    thumb: string;
    tags: string;
    subs: number;
    type: string;
  };
  ads_analysis: VideoAdsAnalysis;
  audience_timeline_points: MinuteDataPoint[];
}

interface BrandStreamDetailPageProps {
  streamKey: string;
  onBack: () => void;
  onNavigateChannel: (channelHandle: string) => void;
}

function sortTimelineChronologically<T extends { scrape_date: string; raw_date?: string }>(
  data: T[]
): T[] {
  if (!data || data.length <= 1) return data;

  const hasRawDates = data.some((d) => d.raw_date);
  if (hasRawDates) {
    return [...data].sort((a, b) => {
      const timeA = a.raw_date ? new Date(a.raw_date).getTime() : 0;
      const timeB = b.raw_date ? new Date(b.raw_date).getTime() : 0;
      return timeA - timeB;
    });
  }

  let splitIndex = -1;
  for (let i = 0; i < data.length - 1; i++) {
    const parseHour = (str: string) => parseInt(str.split(':')[0], 10);
    const hCurrent = parseHour(data[i].scrape_date);
    const hNext = parseHour(data[i + 1].scrape_date);
    if (hCurrent < 12 && hNext >= 18) {
      splitIndex = i + 1;
      break;
    }
  }

  if (splitIndex > 0) {
    return [...data.slice(splitIndex), ...data.slice(0, splitIndex)];
  }
  return data;
}

export const BrandStreamDetailPage: React.FC<BrandStreamDetailPageProps> = ({
  streamKey,
  onBack,
  onNavigateChannel,
}) => {
  const [detail, setDetail] = useState<BrandStreamDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCommentsOpen, setIsCommentsOpen] = useState<boolean>(false);

  const fetchDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands?key=${encodeURIComponent(streamKey)}`, {
        headers: { 'X-App-Client': 'kukastream-web' },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.stream) {
        setDetail(data as BrandStreamDetailResponse);
        trackEvent('view_brand_stream_detail', {
          stream_key: data.stream_key,
          channel: data.channel?.channel,
          ads_count: data.ads_analysis?.total_ads || 0,
        });
      } else {
        setError(data?.error || 'No se encontró la emisión auditada solicitada.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error de conexión al cargar el detalle de la emisión.');
    } finally {
      setIsLoading(false);
    }
  }, [streamKey]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (!detail?.stream) return;
    const chLabel = detail.channel?.channel_name || detail.stream.channel_name || 'Canal';
    const title = detail.stream.video_title || 'Emisión auditada';
    updateSeoMeta({
      title: `${SITE_NAME} - Brands · ${chLabel}: ${title}`,
      description: `Auditoría de ${detail.ads_analysis?.total_ads || 0} anuncios en "${title}" (${chLabel}) con promedio de ${formatNumber(detail.stream.avg_viewers || 0)} espectadores.`,
      ...(detail.channel?.thumb ? { faviconUrl: detail.channel.thumb } : {}),
    });
  }, [detail]);

  const chartData = useMemo(() => {
    if (!detail?.stream?.data?.length) return [];
    return sortTimelineChronologically(detail.stream.data);
  }, [detail]);

  const audienceTimeline = useMemo(() => {
    if (detail?.audience_timeline_points?.length) {
      return sortTimelineChronologically(detail.audience_timeline_points);
    }
    return chartData;
  }, [detail, chartData]);

  const chartLabels = useMemo(() => chartData.map((d) => d.scrape_date), [chartData]);
  const chartViewers = useMemo(() => chartData.map((d) => d.concurrent_viewers), [chartData]);
  const chartLikes = useMemo(() => chartData.map((d) => d.likes), [chartData]);
  const chartComments = useMemo(() => chartData.map((d) => d.comments_count), [chartData]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 text-sm font-semibold text-gray-600 hover:text-blue-600 transition-colors bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-xs hover:border-gray-300 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a Brands</span>
        </button>

        {detail?.channel && (
          <a
            href={`/channel/${detail.channel.channel}`}
            onClick={(e) => {
              e.preventDefault();
              onNavigateChannel(detail.channel.channel);
            }}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 hover:text-blue-600 bg-white px-3.5 py-2 rounded-lg border border-gray-200 shadow-xs hover:border-blue-300 transition-colors"
          >
            <img
              src={detail.channel.thumb}
              alt={detail.channel.channel_name}
              className="w-5 h-5 rounded-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${detail.stream.video_id}/hqdefault.jpg`;
              }}
            />
            <span>Ver canal {detail.channel.channel_name}</span>
          </a>
        )}
      </div>

      {/* Loading state */}
      {isLoading && !detail && (
        <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 space-y-5 animate-pulse">
          <div className="space-y-3 pb-4 border-b border-gray-100">
            <div className="h-6 bg-gray-200 rounded w-2/3" />
            <div className="h-4 bg-gray-100 rounded w-1/3" />
          </div>
          <div className="aspect-video w-full bg-gray-200 rounded-xl" />
          <div className="h-48 w-full bg-gray-100 rounded-xl" />
        </div>
      )}

      {/* Error state */}
      {error && !detail && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchDetail}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white hover:bg-red-100 text-red-800 border border-red-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reintentar</span>
            </button>
            <button
              onClick={onBack}
              className="text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-900 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Volver a Brands
            </button>
          </div>
        </div>
      )}

      {/* Individual Emission Card (mirrors /channel/:canal individual emission layout) */}
      {detail && (
        <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5 sm:p-6 space-y-5">
          {/* Header & Emission Stats */}
          <div className="space-y-4 pb-5 border-b border-gray-100">
            <div className="flex items-start gap-3.5">
              <a
                href={`/channel/${detail.channel.channel}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigateChannel(detail.channel.channel);
                }}
                className="shrink-0"
              >
                <img
                  src={detail.channel.thumb}
                  alt={detail.channel.channel_name}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-gray-100 shadow-2xs"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${detail.stream.video_id}/hqdefault.jpg`;
                  }}
                />
              </a>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 mb-1">
                  <a
                    href={`/channel/${detail.channel.channel}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateChannel(detail.channel.channel);
                    }}
                    className="font-bold text-gray-900 hover:text-blue-600 text-sm transition-colors"
                  >
                    {detail.channel.channel_name}
                  </a>
                  <span className="font-mono text-gray-400">{detail.channel.channel}</span>
                </div>
                <h1 className="text-lg sm:text-2xl font-extrabold text-gray-900 tracking-tight leading-snug">
                  {detail.stream.video_title}
                </h1>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span>
                    Fecha de emisión:{' '}
                    <strong className="font-semibold text-gray-700">
                      {formatArgentinaDateTime(detail.stream.start_date || detail.stream.scrape_date)}
                    </strong>
                  </span>
                  {Number(detail.stream.superchats_total) > 0 && (
                    <>
                      <span>·</span>
                      <span className="font-bold text-amber-700">
                        Superchats: ${formatNumber(Number(detail.stream.superchats_total))} ARS
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setIsCommentsOpen(true)}
                    className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Mensajes & Superchats</span>
                  </button>

                  {detail.stream.video_id && (
                    <a
                      href={`https://youtube.com/watch?v=${detail.stream.video_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-gray-50 hover:bg-red-50 text-gray-700 hover:text-red-700 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-red-600" />
                      <span>Abrir en YouTube</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Metrics Strip matching /channel/:canal */}
              <div className="flex items-center gap-5 sm:gap-6 flex-wrap shrink-0">
                <div className="text-center">
                  <div className="text-xs text-gray-400 font-medium mb-0.5 flex items-center gap-1 justify-center whitespace-nowrap">
                    <Megaphone className="w-3 h-3 text-amber-500" />
                    <span>Anuncios</span>
                  </div>
                  <div className="text-xl font-black text-amber-600 tabular-nums">
                    {formatNumber(detail.ads_analysis?.total_ads || 0)}
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">medidos</div>
                </div>

                <div className="text-center">
                  <div className="text-xs text-gray-400 font-medium mb-0.5 flex items-center gap-1 justify-center whitespace-nowrap">
                    <Eye className="w-3 h-3 text-blue-500" />
                    <span>Espectadores</span>
                  </div>
                  <div className="text-xl font-black text-blue-600 tabular-nums">
                    {formatNumber(detail.stream.avg_viewers || detail.stream.concurrent_viewers)}
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">
                    Prom. · Pico {formatNumber(detail.stream.max_users || detail.stream.avg_viewers || 0)}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-xs text-gray-400 font-medium mb-0.5 flex items-center gap-1 justify-center whitespace-nowrap">
                    <Heart className="w-3 h-3 text-rose-500" />
                    <span>Likes</span>
                  </div>
                  <div className="text-xl font-black text-rose-500 tabular-nums">
                    {formatNumber(detail.stream.max_likes || detail.stream.current_likes || 0)}
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">total emisión</div>
                </div>

                <div className="text-center">
                  <div className="text-xs text-gray-400 font-medium mb-0.5 flex items-center gap-1 justify-center whitespace-nowrap">
                    <MessageSquare className="w-3 h-3 text-amber-500" />
                    <span>Mensajes</span>
                  </div>
                  <div className="text-xl font-black text-amber-500 tabular-nums">
                    {formatNumber(detail.stream.comments_count || 0)}
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">total emisión</div>
                </div>

                <div className="text-center">
                  <div className="text-xs text-gray-400 font-medium mb-0.5 flex items-center gap-1 justify-center whitespace-nowrap">
                    <Users className="w-3 h-3 text-emerald-500" />
                    <span>Usuarios Chat</span>
                  </div>
                  <div className="text-xl font-black text-emerald-600 tabular-nums">
                    {formatNumber(detail.stream.unique_commentators || 0)}
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">únicos en chat</div>
                </div>
              </div>
            </div>
          </div>

          {/* Video Embed & Separated White/Black Ads List (subtitles hidden on /brands) */}
          {detail.stream.video_id && (
            <StreamVideoWithCaptions
              videoId={detail.stream.video_id}
              videoTitle={detail.stream.video_title}
              startDate={detail.stream.start_date}
              videoStartDate={detail.stream.video_start_date}
              endDate={detail.stream.scrape_date}
              isLive={false}
              timelinePoints={audienceTimeline}
              defaultShowAdsPanel={true}
              initialAdsAnalysis={detail.ads_analysis}
              hideClockAdjustment={true}
              separateLightAdsPanel={true}
              alwaysShowAdsPanel={true}
              hideReanalyze={true}
              hideSubtitles={true}
              hideTranscriptButton={true}
            />
          )}

          {/* Minute-by-Minute Stream Chart */}
          {chartLabels.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-2">
                Línea de tiempo de la transmisión
              </div>
              <StreamLineChart
                labels={chartLabels}
                viewers={chartViewers}
                likes={chartLikes}
                comments={chartComments}
                height={240}
              />
            </div>
          )}
        </div>
      )}

      {/* Stream Comments & Superchats Modal */}
      {detail?.stream && isCommentsOpen && (
        <StreamCommentsModal
          stream={detail.stream}
          isOpen={isCommentsOpen}
          onClose={() => setIsCommentsOpen(false)}
        />
      )}
    </div>
  );
};
