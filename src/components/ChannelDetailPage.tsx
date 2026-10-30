import React, { useMemo, useState, useEffect } from 'react';
import { Channel, Stream, HourDayData, AvgDataPoint } from '../types';
import { formatNumber, formatSubs, generateAvgData, generateHeatmapData, getPastStreamsForChannel } from '../data/mockData';
import { HeatmapTable } from './HeatmapTable';
import { StreamLineChart } from './StreamLineChart';
import { StreamCommentsModal } from './StreamCommentsModal';
import { isOctober2026OrLater } from '../utils/dateFilter';
import { ArrowLeft, ExternalLink, Calendar, Heart, Eye, MessageSquare, Radio, RefreshCw } from 'lucide-react';

interface ChannelDetailPageProps {
  channel: Channel;
  liveStream?: Stream;
  onBack: () => void;
}

export const ChannelDetailPage: React.FC<ChannelDetailPageProps> = ({
  channel: initialChannel,
  liveStream: initialLiveStream,
  onBack,
}) => {
  const [channel, setChannel] = useState<Channel>(initialChannel);
  const [liveStream, setLiveStream] = useState<Stream | undefined>(
    initialLiveStream?.live === 'live' ? initialLiveStream : undefined
  );
  const [pastStreams, setPastStreams] = useState<Stream[]>([]);
  const [heatmapData, setHeatmapData] = useState<HourDayData[]>([]);
  const [avgData, setAvgData] = useState<AvgDataPoint[]>([]);
  const [selectedStreamForComments, setSelectedStreamForComments] = useState<Stream | null>(null);
  const [isLoadingChannel, setIsLoadingChannel] = useState<boolean>(true);

  // Sync props if parent changes
  useEffect(() => {
    setChannel(initialChannel);
    if (initialLiveStream?.live === 'live') {
      setLiveStream(initialLiveStream);
    } else {
      setLiveStream(undefined);
    }
  }, [initialChannel, initialLiveStream]);

  // Fetch complete channel details from backend /api/channel/:id (reproducing Laravel route /channel/{channel})
  useEffect(() => {
    const channelIdentifier = channel.channel || channel.channel_id;
    if (!channelIdentifier) return;

    let isMounted = true;
    setIsLoadingChannel(true);

    const tryFetchChannel = async () => {
      try {
        // Try path format first: /api/channel/@handle
        let res = await fetch(`/api/channel/${encodeURIComponent(channelIdentifier)}`);
        // If 404 or not JSON, try query param format: /api/channel?id=@handle
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) {
          res = await fetch(`/api/channel?id=${encodeURIComponent(channelIdentifier)}`);
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error(`Expected JSON but received ${contentType || 'non-JSON'}`);
        }
        const data = await res.json();
        if (!isMounted) return;
        if (data.success) {
          if (data.channel) {
            setChannel(data.channel);
          }
          if (data.live && data.live.live === 'live' && (isOctober2026OrLater(data.live.scrape_date) || isOctober2026OrLater(data.live.start_date))) {
            setLiveStream(data.live);
          } else {
            // If live field is 'none', null, or older than Oct 2026, do not show as live
            setLiveStream(undefined);
          }
          if (data.streams && data.streams.length > 0) {
            const filteredStreams = data.streams.filter(
              (s: Stream) => isOctober2026OrLater(s.scrape_date) || isOctober2026OrLater(s.start_date)
            );
            setPastStreams(filteredStreams);
          }
          if (data.hour_day_data && data.hour_day_data.length > 0) {
            setHeatmapData(data.hour_day_data);
          }
          if (data.avg_data && data.avg_data.length > 0) {
            setAvgData(data.avg_data);
          }
        }
      } catch (err) {
        console.warn('Could not fetch channel details from API, using fallback data:', err);
      } finally {
        if (isMounted) setIsLoadingChannel(false);
      }
    };

    tryFetchChannel();

    return () => {
      isMounted = false;
    };
  }, [channel.channel, channel.channel_id, initialLiveStream]);

  const avgLabels = avgData.map((d) => d.scrape_date1);
  const avgViewers = avgData.map((d) => d.avg_viewers);
  const avgLikes = avgData.map((d) => d.avg_likes);

  return (
    <div className="space-y-8 pb-12">
      {/* Back button & status indicator */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 text-sm font-semibold text-gray-600 hover:text-blue-600 transition-colors bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-xs hover:border-gray-300 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Ranking</span>
        </button>

        {isLoadingChannel && (
          <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Consultando datos en vivo de {channel.channel}...</span>
          </div>
        )}
      </div>

      {/* Channel Header Card */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-100 overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-start md:items-center space-x-5">
              <img
                src={channel.thumb}
                alt={channel.channel_name}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-gray-100 shadow-sm shrink-0"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                    {channel.channel_name}
                  </h1>
                  <span className="bg-blue-100 text-blue-800 text-xs sm:text-sm font-semibold px-2.5 py-0.5 rounded-full">
                    {formatSubs(channel.subs)} suscriptores
                  </span>
                </div>
                <p className="text-sm text-gray-600 max-w-2xl leading-relaxed mb-3">
                  {channel.description}
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <a
                    href={`https://youtube.com/${channel.channel}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-full transition-colors"
                  >
                    <span>{channel.channel}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {channel.twitter && (
                    <a
                      href={`https://x.com/${channel.twitter.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-700"
                    >
                      <span>{channel.twitter}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Overall averages */}
            <div className="flex md:flex-col sm:flex-row gap-4 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-8 w-full md:w-auto">
              <div className="text-left md:text-right">
                <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                  Promedio Conectados
                </div>
                <div className="text-2xl font-black text-blue-600">
                  {formatNumber(channel.avg_viewers)}
                </div>
              </div>
              <div className="text-left md:text-right">
                <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                  Likes Promedio / Hora
                </div>
                <div className="text-2xl font-black text-rose-500">
                  {formatNumber(channel.avg_likes)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 🔴 Current Live Stream Card & Minute Chart (matching Laravel @if($live)) */}
      {liveStream ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse"></span>
              <span>🔴 Streams En Vivo</span>
            </h3>
            <span className="text-xs font-medium text-gray-500">
              video_id: <strong className="font-mono text-gray-700">{liveStream.video_id}</strong>
            </span>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 space-y-6">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-gray-100">
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-gray-900">
                  {liveStream.video_title || `${channel.channel_name} Transmitiendo En Vivo`}
                </h4>
                <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1.5 text-red-600 font-bold bg-red-50 px-2.5 py-0.5 rounded-md border border-red-100">
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
                    En Directo
                  </span>
                  <span>•</span>
                  <span>Iniciado: {liveStream.start_date || 'Hoy'}</span>
                  {liveStream.superchats && liveStream.superchats.length > 0 && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 bg-amber-500 text-white px-2.5 py-0.5 rounded-full text-xs font-extrabold shadow-xs">
                        <span>💰 Superchats:</span>
                        <span>
                          {liveStream.superchats
                            .map((sc) => `$${formatNumber(sc.total_amount || 0)} ${sc.currency}`)
                            .join(', ')}
                        </span>
                      </span>
                    </>
                  )}
                </div>

                {/* Button Ver Comments for live stream */}
                <div className="pt-2">
                  <button
                    onClick={() => setSelectedStreamForComments(liveStream)}
                    className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Ver Comentarios & Superchats</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-xs text-gray-400 font-semibold mb-0.5">EN VIVO</div>
                  <div className="text-3xl font-black text-gray-900">
                    {formatNumber(liveStream.concurrent_viewers)}
                  </div>
                  <div className="text-xs text-gray-500">espectadores</div>
                </div>

                <div className="text-center">
                  <div className="text-xs text-gray-400 font-semibold mb-0.5">LIKES</div>
                  <div className="text-3xl font-black text-rose-500">
                    {formatNumber(liveStream.current_likes)}
                  </div>
                  <div className="text-xs text-gray-500">acumulados</div>
                </div>
              </div>
            </div>

            {/* Live Minute-by-Minute Timeline Chart (id="chart-{{ $live->video_id }}") */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Línea de tiempo de la transmisión (minuto a minuto)
                </div>
                <div className="text-xs text-gray-400 font-mono">
                  canvas id: chart-{liveStream.video_id}
                </div>
              </div>

              {liveStream.data && liveStream.data.length > 0 ? (
                <StreamLineChart
                  labels={liveStream.data.map((d) => d.scrape_date)}
                  viewers={liveStream.data.map((d) => d.concurrent_viewers)}
                  likes={liveStream.data.map((d) => d.likes)}
                  comments={liveStream.data.map((d) => d.comments_count)}
                  height={320}
                />
              ) : (
                <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200 text-gray-500 text-xs">
                  Generando puntos de escaneo para esta transmisión en curso...
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
          <Radio className="w-4 h-4 text-gray-400" />
          <span>El canal no se encuentra transmitiendo en vivo en este momento. Consultando emisiones pasadas.</span>
        </div>
      )}

      {/* 🔥 Heatmap Section (matching Laravel) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
            🔥 Heatmap - Usuarios promedio conectados
          </h3>
        </div>
        <HeatmapTable data={heatmapData} />
      </div>

      {/* 📊 Métricas Promedio (24h curve) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
            📊 Métricas Promedio a lo largo del día
          </h3>
        </div>
        <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
          <div className="text-xs text-gray-500 mb-4">
            Curva promedio de audiencia y likes registrados cada 10-30 minutos (últimos 30 días)
          </div>
          <StreamLineChart
            labels={avgLabels}
            viewers={avgViewers}
            likes={avgLikes}
            height={320}
          />
        </div>
      </div>

      {/* 📈 Streams finalizados (Past Streams matching Laravel) */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
            📈 Streams finalizados recientemente
          </h3>
        </div>

        <div className="space-y-6">
          {pastStreams.map((pastStream) => {
            const chartLabels = pastStream.data ? pastStream.data.map((d) => d.scrape_date) : [];
            const chartViewers = pastStream.data ? pastStream.data.map((d) => d.concurrent_viewers) : [];
            const chartLikes = pastStream.data ? pastStream.data.map((d) => d.likes) : [];
            const chartComments = pastStream.data ? pastStream.data.map((d) => d.comments_count) : [];

            return (
              <div
                key={pastStream.video_id}
                className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 space-y-5"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                  <div>
                    <h4 className="text-base sm:text-lg font-bold text-gray-900">
                      {pastStream.video_title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 flex-wrap">
                      <span className="font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                        video_id: {pastStream.video_id}
                      </span>
                      <span>•</span>
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        Fecha de emisión:{' '}
                        {pastStream.start_date
                          ? pastStream.start_date.split(' ')[0]
                          : pastStream.scrape_date.split(' ')[0]}
                      </span>
                      {pastStream.superchats && pastStream.superchats.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 bg-amber-500 text-white px-2 py-0.5 rounded-full text-xs font-bold shadow-xs">
                            <span>💰 Superchats:</span>
                            <span>
                              {pastStream.superchats
                                .map((sc) => `$${formatNumber(sc.total_amount || 0)} ${sc.currency}`)
                                .join(', ')}
                            </span>
                          </span>
                        </>
                      )}
                    </div>

                    {/* Button Ver Comments for this past video_id item */}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => setSelectedStreamForComments(pastStream)}
                        className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Comentarios y Superchats ({pastStream.video_id})</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-center">
                      <div className="text-xs text-gray-400 font-medium mb-0.5 flex items-center gap-1 justify-center">
                        <Eye className="w-3 h-3 text-blue-500" />
                        <span>Pico Máximo</span>
                      </div>
                      <div className="text-xl font-black text-gray-900">
                        {formatNumber(pastStream.max_users || pastStream.concurrent_viewers)}
                      </div>
                      <div className="text-xs text-gray-500">max. conectados</div>
                    </div>

                    <div className="text-center">
                      <div className="text-xs text-gray-400 font-medium mb-0.5 flex items-center gap-1 justify-center">
                        <Heart className="w-3 h-3 text-rose-500" />
                        <span>Likes</span>
                      </div>
                      <div className="text-xl font-black text-gray-900">
                        {formatNumber(pastStream.max_likes || pastStream.current_likes)}
                      </div>
                      <div className="text-xs text-gray-500">total programa</div>
                    </div>
                  </div>
                </div>

                {/* Stream Chart */}
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
            );
          })}
        </div>
      </div>

      {/* Stream Comments & Superchats Modal for any selected video_id item */}
      {selectedStreamForComments && (
        <StreamCommentsModal
          stream={selectedStreamForComments}
          isOpen={!!selectedStreamForComments}
          onClose={() => setSelectedStreamForComments(null)}
        />
      )}
    </div>
  );
};
