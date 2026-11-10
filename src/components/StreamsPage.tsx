import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Stream } from '../types';
import { formatNumber, formatSubs } from '../data/mockData';
import { StreamCommentsModal } from './StreamCommentsModal';
import { formatArgentinaDateTime } from '../utils/dateFilter';
import { Search, Radio, Heart, MessageSquare, DollarSign, Sparkles, RefreshCw, BarChart2, ExternalLink } from 'lucide-react';
import { BLOCKED_STREAM_TITLE_KEYWORDS, isStreamTitleBlocked } from '../config/streamFilters';
export { BLOCKED_STREAM_TITLE_KEYWORDS };

export type StreamSortOption = 'viewers' | 'likes' | 'comments' | 'superchats';

interface StreamsPageProps {
  onNavigateChannel: (channelId: string) => void;
}

const cleanQueryString = (raw: string): string => {
  return (raw || '').replace(/^["'«»“”„]+|["'«»“”„]+$/g, '').trim();
};

const highlightMatch = (text: string, query: string): React.ReactNode => {
  if (!text) return '';
  const clean = cleanQueryString(query);
  if (!clean) return text;

  try {
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const words = clean
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 1)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    const pattern = words.length > 1 ? `(${escaped}|${words.join('|')})` : `(${escaped})`;
    const regex = new RegExp(pattern, 'gi');
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-amber-200 text-amber-950 font-bold px-1 rounded-sm">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  } catch {
    return text;
  }
};

export const StreamsPage: React.FC<StreamsPageProps> = ({
  onNavigateChannel,
}) => {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [sortBy, setSortBy] = useState<StreamSortOption>('viewers');
  const [selectedCommentsStream, setSelectedCommentsStream] = useState<Stream | null>(null);
  const [filterSuperchatsOnly, setFilterSuperchatsOnly] = useState<boolean>(false);

  const cleanSearchTerm = useMemo(() => cleanQueryString(searchQuery), [searchQuery]);

  const fetchStreams = useCallback(async (tag?: string, query?: string, sort?: StreamSortOption) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (tag && tag !== 'all') {
        params.append('tag', tag);
      }
      const cleanQ = cleanQueryString(query || '');
      if (cleanQ) {
        params.append('q', cleanQ);
      }
      if (sort) {
        params.append('sort', sort);
      }
      const qs = params.toString();
      const url = qs ? `/api/streams?${qs}` : '/api/streams';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.streams)) {
        setStreams(data.streams.filter((s: Stream) => !isStreamTitleBlocked(s.video_title)));
      }
    } catch (err) {
      console.error('Error fetching /api/streams:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchStreams(selectedTag, searchQuery, sortBy);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery, selectedTag, sortBy, fetchStreams]);

  const filteredStreams = useMemo(() => {
    if (!Array.isArray(streams)) return [];
    const q = cleanSearchTerm.toLowerCase();

    return streams.filter((s) => {
      if (!s) return false;
      if (s.channel === '@Radio10am') return false;
      if (isStreamTitleBlocked(s.video_title)) return false;
      const hasSuperchats = Number(s.superchats_total) > 0 || Number(s.superchats_count) > 0;
      const matchesSuperchat = !filterSuperchatsOnly || hasSuperchats;

      if (!q) return matchesSuperchat;

      const title = (s.video_title || '').toLowerCase();
      const channelName = (s.channel_name || '').toLowerCase();
      const channelHandle = (s.channel || '').toLowerCase();
      const videoId = (s.video_id || '').toLowerCase();

      // Check full phrase match
      const exactMatch =
        title.includes(q) || channelName.includes(q) || channelHandle.includes(q) || videoId.includes(q);

      if (exactMatch) return matchesSuperchat;

      // Check multi-word match (all words present in title or channel)
      const words = q.split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        const allWordsInTitle = words.every((w) => title.includes(w));
        const allWordsInChannel = words.every((w) => channelName.includes(w));
        if (allWordsInTitle || allWordsInChannel) {
          return matchesSuperchat;
        }
      }

      return false;
    })
    .sort((a, b) => {
      if (sortBy === 'likes') {
        const aLikes = Number(a.current_likes ?? a.max_likes ?? a.old_likes) || 0;
        const bLikes = Number(b.current_likes ?? b.max_likes ?? b.old_likes) || 0;
        return bLikes - aLikes;
      }
      if (sortBy === 'comments') {
        const aComments = Number(a.comments_count) || 0;
        const bComments = Number(b.comments_count) || 0;
        return bComments - aComments;
      }
      if (sortBy === 'superchats') {
        const aSuperchats = Number(a.superchats_total) || 0;
        const bSuperchats = Number(b.superchats_total) || 0;
        return bSuperchats - aSuperchats;
      }
      const aAvg = Number(a.avg_viewers ?? a.old_viewers ?? a.concurrent_viewers) || 0;
      const bAvg = Number(b.avg_viewers ?? b.old_viewers ?? b.concurrent_viewers) || 0;
      return bAvg - aAvg;
    });
  }, [streams, cleanSearchTerm, filterSuperchatsOnly, sortBy]);

  return (
    <div className="space-y-6">
      {/* Title & Search header */}
      <div className="text-center pt-2 pb-6">
        <div className="inline-flex items-center space-x-2 bg-red-600 text-white px-3.5 py-1 rounded-full text-xs font-semibold mb-3 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          <span className="uppercase tracking-wider">
            {cleanSearchTerm ? 'Buscador de streams' : 'Top streams'}
          </span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">
          Streams
        </h2>
        <p className="text-gray-500 max-w-xl mx-auto text-xs sm:text-sm">
          {cleanSearchTerm
            ? `Buscando "${cleanSearchTerm}" (${filteredStreams.length} encontrados)`
            : 'Explora y busca entre todas las emisiones y programas disponibles.'}
        </p>

        {/* Search bar */}
        <div className="mt-5 max-w-xl mx-auto relative">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por programa, título, canal, tema..."
            className="w-full pl-11 pr-10 py-3 rounded-xl border border-gray-200 bg-white shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-gray-900 transition-all placeholder:text-gray-400 font-medium"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer transition-colors"
              title="Borrar búsqueda"
            >
              ✕
            </button>
          ) : isLoading ? (
            <RefreshCw className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" />
          ) : null}
        </div>
      </div>

      {/* Streams Ranking List */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-gray-500 px-1">
          <div className="flex items-center gap-2">
            <span>
              {cleanSearchTerm
                ? `Resultados de búsqueda: ${filteredStreams.length} videos`
                : `Top ${filteredStreams.length} streams`}
            </span>
            {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="streams-sort-select" className="text-xs font-semibold text-gray-600 shrink-0">
              Ordenar por:
            </label>
            <select
              id="streams-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as StreamSortOption)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
            >
              <option value="viewers">Promedio de espectadores (mayor a menor)</option>
              <option value="likes">Likes (mayor a menor)</option>
              <option value="comments">Mensajes (mayor a menor)</option>
              <option value="superchats">Recaudación en superchats en ARS (mayor a menor)</option>
            </select>
          </div>
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
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200 text-gray-500 space-y-2">
            <Search className="w-8 h-8 mx-auto text-gray-300 mb-1" />
            <p className="font-semibold text-gray-800 text-sm">
              {searchQuery.trim()
                ? `No se encontraron videos disponibles para "${searchQuery}".`
                : 'No se encontraron streams para los filtros seleccionados.'}
            </p>
            {searchQuery.trim() && (
              <p className="text-xs text-gray-400">
                Prueba buscando por palabras clave del título, nombre del canal o ID de video de YouTube.
              </p>
            )}
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
                key={`${stream.video_id || stream.channel}-${stream.video_title || 'stream'}-${index}`}
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
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <button
                          onClick={() => onNavigateChannel(stream.channel)}
                          className="font-bold text-gray-900 text-base hover:text-blue-600 transition-colors text-left"
                        >
                          {highlightMatch(stream.channel_name, cleanSearchTerm)}
                        </button>
                        <span className="text-xs text-gray-400 font-mono">
                          {stream.channel}
                        </span>
                        {isLive && (
                          <span className="text-[11px] bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></span>
                            EN VIVO
                          </span>
                        )}
                        {(stream as any).subs !== undefined && (
                          <span className="text-xs text-gray-500 font-medium">
                            {formatArgentinaDateTime(stream.start_date)}
                          </span>
                        )}
                      </div>

                      {/* Video Title */}
                      <p
                        className={`text-sm text-gray-800 leading-snug mt-1 ${cleanSearchTerm ? 'line-clamp-3 font-medium bg-amber-50/60 p-2 rounded-lg border border-amber-200/70' : 'line-clamp-2 font-medium'}`}
                        title={stream.video_title}
                      >
                        {cleanSearchTerm && (
                          <span className="text-[10px] uppercase font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded mr-1.5 inline-block">
                            Video
                          </span>
                        )}
                        {highlightMatch(stream.video_title || 'Emisión', cleanSearchTerm)}
                      </p>

                      {/* Action buttons & date */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
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
                          <span>Mensajes</span>
                        </button>

                        {superchatsTotal > 0 && (
                          <button
                            onClick={() => setSelectedCommentsStream(stream)}
                            className="inline-flex items-center gap-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full font-bold transition-colors cursor-pointer"
                          >
                            <span>💰</span>
                            <span>${formatNumber(superchatsTotal)} ARS</span>
                          </button>
                        )}

                        {stream.video_id && (
                          <a
                            href={`https://youtube.com/watch?v=${stream.video_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-gray-500 hover:text-red-600 bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-200 px-2.5 py-0.5 rounded-full font-medium transition-colors"
                            title="Ver emisión original en YouTube"
                          >
                            <ExternalLink className="w-3 h-3 text-red-600" />
                            <span>YouTube</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Desktop Stats */}
                  <div className="flex items-center space-x-6 shrink-0 pl-2">
                    {/* Comentado temporalmente pico de espectadores:
                    <div className="text-center min-w-[90px]">
                      <div className="text-xs text-gray-400 font-semibold mb-0.5">ESPECTADORES</div>
                      <div className="font-extrabold text-2xl text-gray-900">
                        {formatNumber(stream.concurrent_viewers)}
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase">
                        {isLive ? 'ACTUALES' : 'PICO'}
                      </div>
                    </div>
                    */}

                    {/* PROMEDIO DE ESPECTADORES */}
                    <div className="text-center min-w-[95px]">
                      <div className="text-xs text-blue-600 font-bold mb-0.5">PROMEDIO</div>
                      <div className="font-extrabold text-2xl text-gray-900">
                        {formatNumber(stream.avg_viewers ?? stream.old_viewers ?? stream.concurrent_viewers)}
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase font-medium">
                        ESPECTADORES
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

                    {/*(superchatsTotal > 0 || sortBy === 'superchats') && (
                      <div className="text-center min-w-[90px]">
                        <div className="text-xs text-emerald-600 font-bold mb-0.5">SUPERCHATS</div>
                        <div className="font-extrabold text-2xl text-emerald-600">
                          ${formatNumber(superchatsTotal)}
                        </div>
                        <div className="text-[10px] text-gray-500 font-medium">ARS</div>
                      </div>
                    )*/}
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
                          {highlightMatch(stream.channel_name, cleanSearchTerm)}
                        </button>
                        {isLive && (
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0"></span>
                        )}
                      </div>

                      <p
                        className={`text-xs text-gray-800 mt-1 leading-snug ${cleanSearchTerm ? 'line-clamp-3 bg-amber-50/60 p-1.5 rounded border border-amber-200/70' : 'line-clamp-2 font-medium'}`}
                        title={stream.video_title}
                      >
                        {highlightMatch(stream.video_title || 'Emisión', cleanSearchTerm)}
                      </p>

                      <div className="flex items-center space-x-3 mt-2.5 flex-wrap gap-y-1">
                        {/* Comentado temporalmente pico de espectadores:
                        <div className="flex items-center space-x-1 bg-red-50 text-red-600 px-2 py-0.5 rounded-md text-xs font-bold">
                          <Radio className="w-3 h-3" />
                          <span>{formatNumber(stream.concurrent_viewers)}</span>
                        </div>
                        */}

                        {/* PROMEDIO DE ESPECTADORES */}
                        <div className="flex items-center space-x-1 bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-md text-xs font-bold" title="Promedio de espectadores">
                          <Radio className="w-3 h-3 text-blue-600" />
                          <span>Prom: {formatNumber(stream.avg_viewers ?? stream.old_viewers ?? stream.concurrent_viewers)}</span>
                        </div>

                        <div className="text-xs text-gray-500">
                          ❤️ {formatNumber(stream.current_likes || 0)}
                        </div>

                        <div className="text-xs text-gray-500">
                          💬 {formatNumber(stream.comments_count || 0)}
                        </div>

                        {(superchatsTotal > 0 || sortBy === 'superchats') && (
                          <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            💰 ${formatNumber(superchatsTotal)} ARS
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50 flex-wrap text-xs">
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
                        {stream.video_id && (
                          <a
                            href={`https://youtube.com/watch?v=${stream.video_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-gray-500 hover:text-red-600 bg-gray-50 px-2 py-0.5 rounded-full text-xs font-medium"
                          >
                            <ExternalLink className="w-3 h-3 text-red-600" />
                            <span>YT</span>
                          </a>
                        )}
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
