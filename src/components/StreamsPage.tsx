import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Stream } from '../types';
import { formatNumber, formatSubs } from '../data/mockData';
import { StreamCommentsModal } from './StreamCommentsModal';
import { formatArgentinaDateTime } from '../utils/dateFilter';
import { Search, Radio, Heart, MessageSquare, DollarSign, Sparkles, RefreshCw, BarChart2 } from 'lucide-react';

interface StreamsPageProps {
  onNavigateChannel: (channelId: string) => void;
}

export const StreamsPage: React.FC<StreamsPageProps> = ({
  onNavigateChannel,
}) => {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedCommentsStream, setSelectedCommentsStream] = useState<Stream | null>(null);
  const [filterSuperchatsOnly, setFilterSuperchatsOnly] = useState<boolean>(false);

  const fetchStreams = useCallback(async (tag?: string) => {
    setIsLoading(true);
    try {
      const url = tag && tag !== 'all'
        ? `/api/streams?tag=${encodeURIComponent(tag)}`
        : '/api/streams';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.streams)) {
        setStreams(data.streams);
      }
    } catch (err) {
      console.error('Error fetching /api/streams:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStreams(selectedTag);
  }, [selectedTag, fetchStreams]);

  const filteredStreams = useMemo(() => {
    if (!Array.isArray(streams)) return [];
    return streams.filter((s) => {
      if (!s) return false;
      if (s.channel === '@Radio10am') return false;
      const title = (s.video_title || '').toLowerCase();
      const channelName = (s.channel_name || '').toLowerCase();
      const channelHandle = (s.channel || '').toLowerCase();
      const q = (searchQuery || '').toLowerCase();

      const matchesSearch = title.includes(q) || channelName.includes(q) || channelHandle.includes(q);
      const hasSuperchats = Number(s.superchats_total) > 0 || Number(s.superchats_count) > 0;
      const matchesSuperchat = !filterSuperchatsOnly || hasSuperchats;

      return matchesSearch && matchesSuperchat;
    });
  }, [streams, searchQuery, filterSuperchatsOnly]);

  return (
    <div className="space-y-6">
      {/* Title & Search header */}
      <div className="text-center pt-2 pb-6">
        <div className="inline-flex items-center space-x-2 bg-red-600 text-white px-3.5 py-1 rounded-full text-xs font-semibold mb-3 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          <span className="uppercase tracking-wider">Top 10 streams</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
          Streams
        </h2>
        <p className="text-gray-600 max-w-xl mx-auto text-sm sm:text-base">
        </p>

        {/* Search bar */}
        <div className="mt-6 max-w-md mx-auto relative">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por programa o canal..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-gray-900 transition-all placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Filter Tabs & Superchat Filter Toggle */}
      {/*<div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-2">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 sm:gap-2">
          {['all', 'stream', 'entretenimiento', 'política', 'radio', 'tv', 'deportes'].map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all border cursor-pointer ${
                selectedTag === tag
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tag === 'all' ? 'Todos los Streams' : tag}
            </button>
          ))}
        </div>

        {/* Superchat filter switch * / }
        <button
          onClick={() => setFilterSuperchatsOnly(!filterSuperchatsOnly)}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer shrink-0 ${
            filterSuperchatsOnly
              ? 'bg-amber-500 text-white border-amber-600 shadow-sm ring-2 ring-amber-300'
              : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-50 shadow-2xs'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          <span>{filterSuperchatsOnly ? 'Filtrando: Con Superchats' : 'Filtrar por Superchats'}</span>
        </button>
      </div>*/}

      {/* Streams Ranking List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm text-gray-500 px-1">
          <span>Top {filteredStreams.length} streams</span>
          <span className="flex items-center gap-1.5">
            {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />}
            <span>Ordenado por pico de espectadores</span>
          </span>
        </div>

        {isLoading && streams.length === 0 ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 shadow-xs animate-pulse flex items-center space-x-4">
                <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded-md w-1/3"></div>
                  <div className="h-3 bg-gray-100 rounded-md w-2/3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredStreams.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200 text-gray-500">
            No se encontraron streams para los filtros seleccionados.
          </div>
        ) : (
          filteredStreams.map((stream, index) => {
            let badgeStyle = 'bg-gray-100 text-gray-600';
            if (index === 0) badgeStyle = 'bg-amber-400 text-amber-950 ring-2 ring-amber-300 shadow-xs';
            else if (index === 1) badgeStyle = 'bg-slate-300 text-slate-800 ring-2 ring-slate-200 shadow-xs';
            else if (index === 2) badgeStyle = 'bg-amber-700 text-amber-100 ring-2 ring-amber-600 shadow-xs';

            const isLive = stream.live === 'live';
            const superchatsTotal = Number(stream.superchats_total) || 0;

            return (
              <div
                key={stream.video_id || `${stream.channel}-${index}`}
                className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100 shadow-xs hover:border-gray-200 hover:shadow-md transition-all"
              >
                {/* Desktop Layout */}
                <div className="hidden sm:flex items-center justify-between gap-4">
                  <div className="flex items-center space-x-4 flex-1 min-w-0">
                    {/* Rank Badge */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${badgeStyle}`}>
                      {index + 1}
                    </div>

                    {/* Channel Thumbnail */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => onNavigateChannel(stream.channel)}
                        className="focus:outline-none"
                      >
                        <img
                          src={stream.thumb}
                          alt={stream.channel_name}
                          className="w-14 h-14 rounded-full object-cover border-2 border-gray-200"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${stream.video_id}/hqdefault.jpg`;
                          }}
                        />
                      </button>
                      {isLive && (
                        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full animate-pulse" title="En Vivo"></span>
                      )}
                    </div>

                    {/* Stream & Channel Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => onNavigateChannel(stream.channel)}
                          className="font-bold text-gray-900 text-base hover:text-blue-600 transition-colors text-left"
                        >
                          {stream.channel_name}
                        </button>
                        <span className="text-xs text-gray-400 font-mono">
                          {stream.channel}
                        </span>
                        {isLive ? (
                          <span className="text-[11px] bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></span>
                            EN VIVO
                          </span>
                        ) : "" /*: /*(
                          <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">
                            Finalizado
                          </span>
                        )*/}
                        {(stream as any).subs !== undefined && (
                          <span className="text-xs text-gray-500 font-medium">
                            {formatArgentinaDateTime(stream.start_date)}
                          </span>
                        )}
                      </div>

                      {/* Video Title */}
                      <p className="text-sm font-semibold text-gray-800 mt-1 line-clamp-1" title={stream.video_title}>
                        {stream.video_title || 'Emisión'}
                      </p>

                      {/* Action buttons & date */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                        {/*stream.start_date && (
                          <span className="text-gray-400 text-[11px]">
                            {formatArgentinaDateTime(stream.start_date)}
                          </span>
                        )*/}

                        <button
                          onClick={() => onNavigateChannel(stream.channel)}
                          className="inline-flex items-center gap-1 bg-purple-100 hover:bg-purple-200 text-purple-800 px-2.5 py-0.5 rounded-full font-semibold transition-colors cursor-pointer"
                        >
                          <span>📊</span>
                          <span>Métricas</span>
                        </button>

                        <button
                          onClick={() => setSelectedCommentsStream(stream)}
                          className="inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-semibold transition-colors cursor-pointer"
                        >
                          <span>💬</span>
                          <span>Mensajes{/*({(stream.comments_count || 0).toLocaleString('es-AR')})*/}</span>
                        </button>

                        {superchatsTotal > 0 && (
                          <button
                            onClick={() => setSelectedCommentsStream(stream)}
                            className="inline-flex items-center gap-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full font-bold transition-colors cursor-pointer"
                          >
                            <span>💰</span>
                            <span>${formatNumber(superchatsTotal)} ARS{/*({stream.superchats_count})*/}</span>
                          </button>
                        )}

                        {/*stream.video_id && (
                          <a
                            href={`https://youtube.com/watch?v=${stream.video_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-red-600 transition-colors flex items-center gap-0.5 text-[11px]"
                          >
                            ▶ Ver en YT
                          </a>
                        )*/}
                      </div>
                    </div>
                  </div>

                  {/* Desktop Stats */}
                  <div className="flex items-center space-x-6 shrink-0 pl-2">
                    <div className="text-center min-w-[90px]">
                      <div className="text-xs text-gray-400 font-semibold mb-0.5">ESPECTADORES</div>
                      <div className="font-extrabold text-2xl text-gray-900">
                        {formatNumber(stream.concurrent_viewers)}
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase">
                        {isLive ? 'ACTUALES' : 'PICO'}
                      </div>
                    </div>

                    <div className="text-center min-w-[75px]">
                      <div className="text-xs text-gray-400 font-semibold mb-0.5">LIKES</div>
                      <div className="font-extrabold text-2xl text-rose-500">
                        {formatNumber(stream.current_likes || 0)}
                      </div>
                      <div className="text-[10px] text-gray-500">TOTALES</div>
                    </div>

                    <div className="text-center min-w-[80px]">
                      <div className="text-xs text-gray-400 font-semibold mb-0.5">MENSAJES</div>
                      <div className="font-extrabold text-2xl text-amber-500">
                        {formatNumber(stream.comments_count || 0)}
                      </div>
                      <div className="text-[10px] text-gray-500">TOTALES</div>
                    </div>
                  </div>
                </div>

                {/* Mobile Layout */}
                <div className="sm:hidden space-y-2.5">
                  <div className="flex items-start space-x-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${badgeStyle}`}>
                      {index + 1}
                    </div>

                    <button
                      onClick={() => onNavigateChannel(stream.channel)}
                      className="shrink-0"
                    >
                      <img
                        src={stream.thumb}
                        alt={stream.channel_name}
                        className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
                      />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <button
                          onClick={() => onNavigateChannel(stream.channel)}
                          className="font-bold text-gray-900 text-sm leading-tight text-left truncate"
                        >
                          {stream.channel_name}
                        </button>
                        {isLive && (
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0"></span>
                        )}
                      </div>

                      <p className="text-xs text-gray-700 font-medium mt-0.5 line-clamp-2">
                        {stream.video_title || 'Emisión'}
                      </p>

                      <div className="flex items-center space-x-3 mt-2.5 flex-wrap gap-y-1">
                        <div className="flex items-center space-x-1 bg-red-50 text-red-600 px-2 py-0.5 rounded-md text-xs font-bold">
                          <Radio className="w-3 h-3" />
                          <span>{formatNumber(stream.concurrent_viewers)}</span>
                        </div>

                        <div className="text-xs text-gray-500">
                          ❤️ {formatNumber(stream.current_likes || 0)}
                        </div>

                        <div className="text-xs text-gray-500">
                          💬 {formatNumber(stream.comments_count || 0)}
                        </div>

                        {superchatsTotal > 0 && (
                          <div className="text-xs font-bold text-amber-600">
                            💰 ${formatNumber(superchatsTotal)}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50 flex-wrap">
                        <button
                          onClick={() => onNavigateChannel(stream.channel)}
                          className="bg-purple-100 hover:bg-purple-200 text-purple-800 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                        >
                          Métricas
                        </button>
                        <button
                          onClick={() => setSelectedCommentsStream(stream)}
                          className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold border border-blue-200"
                        >
                          💬 Mensajes
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Stream Comments Modal */}
      {selectedCommentsStream && (
        <StreamCommentsModal
          isOpen={Boolean(selectedCommentsStream)}
          stream={selectedCommentsStream}
          onClose={() => setSelectedCommentsStream(null)}
        />
      )}
    </div>
  );
};
