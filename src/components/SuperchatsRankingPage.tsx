import React, { useState, useEffect, useMemo } from 'react';
import { SuperchatChannelRanking, SuperchatVideoRanking } from '../types';
import { formatNumber } from '../data/mockData';
import { formatArgentinaDateTime } from '../utils/dateFilter';
import { SITE_NAME } from '../config/site';
import { trackEvent } from '../utils/analytics';
import {
  DollarSign,
  TrendingUp,
  Tv,
  Video,
  Search,
  ExternalLink,
  MessageSquare,
  Crown,
  RefreshCw,
  Sparkles,
  BarChart3,
  Calendar,
  Award,
} from 'lucide-react';

interface SuperchatsRankingPageProps {
  onNavigateChannel: (channelHandle: string) => void;
  onOpenStreamComments?: (streamStub: any) => void;
}

type RankingTab = 'channels' | 'videos';

export const SuperchatsRankingPage: React.FC<SuperchatsRankingPageProps> = ({
  onNavigateChannel,
  onOpenStreamComments,
}) => {
  const [activeTab, setActiveTab] = useState<RankingTab>('channels');
  const [channels, setChannels] = useState<SuperchatChannelRanking[]>([]);
  const [videos, setVideos] = useState<SuperchatVideoRanking[]>([]);
  const [totalArs, setTotalArs] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${SITE_NAME} - Superchats`;
  }, []);

  const fetchRanking = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/superchats-ranking');
      if (!res.ok) {
        throw new Error(`Error HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setChannels(data.top_channels || []);
        setVideos(data.top_videos || []);
        setTotalArs(Number(data.total_ars_all || 0));
        setTotalCount(Number(data.total_superchats_count || 0));
      } else {
        setError(data.message || 'No se pudo cargar el ranking de superchats.');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión al cargar ranking.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRanking();
  }, []);

  // Filtered lists
  const query = searchQuery.trim().toLowerCase();
  const filteredChannels = useMemo(() => {
    if (!query) return channels;
    return channels.filter(
      (c) =>
        c.channel_name.toLowerCase().includes(query) ||
        c.channel.toLowerCase().includes(query)
    );
  }, [channels, query]);

  const filteredVideos = useMemo(() => {
    if (!query) return videos;
    return videos.filter(
      (v) =>
        v.video_title.toLowerCase().includes(query) ||
        v.channel_name.toLowerCase().includes(query) ||
        v.channel.toLowerCase().includes(query) ||
        v.video_id.toLowerCase().includes(query)
    );
  }, [videos, query]);

  // Max totals for relative percentage bars
  const maxChannelArs = channels.length > 0 ? channels[0].total_ars : 1;
  const maxVideoArs = videos.length > 0 ? videos[0].total_ars : 1;

  // Podium helper styles
  const getRankBadgeClass = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-amber-200';
    if (rank === 2) return 'bg-gradient-to-r from-slate-300 to-slate-400 text-slate-800 shadow-slate-200';
    if (rank === 3) return 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-amber-200';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-16">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 rounded-3xl p-6 sm:p-10 text-white shadow-lg relative overflow-hidden">
        {/* Background Decorative Circles */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute right-40 -top-10 w-48 h-48 bg-yellow-300/20 rounded-full blur-xl pointer-events-none"></div>

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider mb-4 border border-white/25">
            <DollarSign className="w-4 h-4 text-yellow-200" />
            <span>Moneda: Pesos Argentinos (ARS)</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight mb-3">
            Top 20 Ganancias en Superchats
          </h1>
          <p className="text-amber-100 text-sm sm:text-base leading-relaxed max-w-2xl font-medium">
            Ranking oficial ordenado de mayor a menor según el dinero recaudado en donaciones de transmisiones en vivo. Filtrado exclusivamente en moneda local (ARS).
          </p>

          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <button
              onClick={fetchRanking}
              disabled={isLoading}
              className="inline-flex items-center gap-2 bg-white text-amber-900 hover:bg-amber-50 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 text-amber-700 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Actualizar Ranking</span>
            </button>
            <div className="text-xs text-amber-100/90 font-medium">
             
            </div>
          </div>
        </div>
      </div>

      {/* Overview Stat Cards (with Grey Placeholders while loading) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Recaudado ARS */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100 text-center hover:border-amber-300 transition-colors">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2.5">
            <DollarSign className="w-5 h-5" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-24 sm:w-28 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-amber-600 mb-1">
              ${formatNumber(totalArs)}
            </div>
          )}
          <div className="text-xs sm:text-sm text-gray-500 font-medium">Total Recaudado (ARS)</div>
        </div>

        {/* Card 2: Cantidad de Superchats */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100 text-center hover:border-blue-300 transition-colors">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2.5">
            <MessageSquare className="w-5 h-5" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-16 sm:w-20 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-blue-600 mb-1">
              {formatNumber(totalCount)}
            </div>
          )}
          <div className="text-xs sm:text-sm text-gray-500 font-medium">Mensajes Superchat</div>
        </div>

        {/* Card 3: Canal Líder */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100 text-center hover:border-emerald-300 transition-colors">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
            <Crown className="w-5 h-5" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-24 sm:w-28 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-lg sm:text-xl font-black text-gray-900 mb-1 truncate px-2" title={channels[0]?.channel_name || 'Carajo'}>
              {channels[0]?.channel_name || '-'}
            </div>
          )}
          <div className="text-xs sm:text-sm text-gray-500 font-medium">
            Canal #1 en Recaudación
          </div>
        </div>

        {/* Card 4: Video Más Donado */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100 text-center hover:border-purple-300 transition-colors">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-2.5">
            <Award className="w-5 h-5" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-24 sm:w-28 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-lg sm:text-xl font-black text-purple-600 mb-1 truncate px-2">
              {videos.length > 0 ? `$${formatNumber(videos[0].total_ars)}` : '-'}
            </div>
          )}
          <div className="text-xs sm:text-sm text-gray-500 font-medium">
            Pico en un solo Video
          </div>
        </div>
      </div>

      {/* Main Container with Tabs */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden">
        {/* Navigation Tabs Header */}
        <div className="border-b border-gray-200 bg-gray-50/70 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-gray-200/80 shadow-2xs self-start">
            <button
              onClick={() => setActiveTab('channels')}
              className={`px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'channels'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>Top 20 Canales</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                activeTab === 'channels' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {channels.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('videos')}
              className={`px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'videos'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Top 20 Streams</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                activeTab === 'videos' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {videos.length}
              </span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === 'channels' ? 'Buscar canal...' : 'Buscar video o canal...'}
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-gray-800 placeholder:text-gray-400 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Tab 1: Top 20 Canales */}
        {activeTab === 'channels' && (
          <div className="p-4 sm:p-6 space-y-6">
            {/* Top 3 Podium Cards when available and not searching */}
            {!searchQuery && channels.length >= 3 && !isLoading && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-2">
                {/* 2nd Place (Silver) */}
                {channels[1] && (
                  <div
                    onClick={() => onNavigateChannel(channels[1].channel)}
                    className="order-2 md:order-1 bg-gradient-to-b from-slate-50 to-white rounded-2xl p-5 border-2 border-slate-200 shadow-xs hover:shadow-md transition-all cursor-pointer text-center relative group"
                  >
                    <div className="absolute top-3 left-3 bg-slate-300 text-slate-800 font-black text-xs px-2.5 py-0.5 rounded-full">
                      #2 Plata
                    </div>
                    <img
                      src={channels[1].thumb || `https://i.ytimg.com/vi/sample/hqdefault.jpg`}
                      alt={channels[1].channel_name}
                      className="w-16 h-16 rounded-full object-cover mx-auto mt-2 border-2 border-slate-300 group-hover:scale-105 transition-transform shadow-xs"
                    />
                    <h3 className="font-bold text-gray-900 text-base mt-2 truncate">
                      {channels[1].channel_name}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono">{channels[1].channel}</p>
                    <div className="mt-3 bg-white border border-slate-200 rounded-xl py-2 px-3 inline-block">
                      <div className="text-xs text-gray-400 font-semibold">Total ARS</div>
                      <div className="text-xl font-black text-amber-600">
                        ${formatNumber(channels[1].total_ars)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {channels[1].superchats_count} superchats • {channels[1].streams_count} directos
                    </div>
                  </div>
                )}

                {/* 1st Place (Gold Leader) */}
                {channels[0] && (
                  <div
                    onClick={() => onNavigateChannel(channels[0].channel)}
                    className="order-1 md:order-2 bg-gradient-to-b from-amber-50/80 via-yellow-50/40 to-white rounded-2xl p-6 border-2 border-amber-400 shadow-md hover:shadow-lg transition-all cursor-pointer text-center relative group -translate-y-1"
                  >
                    <div className="absolute top-3 left-3 bg-gradient-to-r from-yellow-400 to-amber-500 text-white font-black text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                      <Crown className="w-3.5 h-3.5" />
                      <span>#1 Líder</span>
                    </div>
                    <img
                      src={channels[0].thumb || `https://i.ytimg.com/vi/sample/hqdefault.jpg`}
                      alt={channels[0].channel_name}
                      className="w-20 h-20 rounded-full object-cover mx-auto mt-2 border-4 border-amber-400 group-hover:scale-105 transition-transform shadow-sm"
                    />
                    <h3 className="font-extrabold text-gray-900 text-lg mt-2 truncate">
                      {channels[0].channel_name}
                    </h3>
                    <p className="text-xs text-amber-800 font-mono font-semibold">{channels[0].channel}</p>
                    <div className="mt-3 bg-white border-2 border-amber-200 rounded-xl py-2 px-4 inline-block shadow-xs">
                      <div className="text-xs text-amber-800 font-bold">Total Recaudado ARS</div>
                      <div className="text-2xl font-black text-amber-600">
                        ${formatNumber(channels[0].total_ars)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 font-semibold mt-2">
                      {channels[0].superchats_count} superchats • {channels[0].streams_count} directos
                    </div>
                  </div>
                )}

                {/* 3rd Place (Bronze) */}
                {channels[2] && (
                  <div
                    onClick={() => onNavigateChannel(channels[2].channel)}
                    className="order-3 bg-gradient-to-b from-amber-50/40 to-white rounded-2xl p-5 border-2 border-amber-200 shadow-xs hover:shadow-md transition-all cursor-pointer text-center relative group"
                  >
                    <div className="absolute top-3 left-3 bg-amber-700 text-white font-black text-xs px-2.5 py-0.5 rounded-full">
                      #3 Bronce
                    </div>
                    <img
                      src={channels[2].thumb || `https://i.ytimg.com/vi/sample/hqdefault.jpg`}
                      alt={channels[2].channel_name}
                      className="w-16 h-16 rounded-full object-cover mx-auto mt-2 border-2 border-amber-300 group-hover:scale-105 transition-transform shadow-xs"
                    />
                    <h3 className="font-bold text-gray-900 text-base mt-2 truncate">
                      {channels[2].channel_name}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono">{channels[2].channel}</p>
                    <div className="mt-3 bg-white border border-amber-200 rounded-xl py-2 px-3 inline-block">
                      <div className="text-xs text-gray-400 font-semibold">Total ARS</div>
                      <div className="text-xl font-black text-amber-600">
                        ${formatNumber(channels[2].total_ars)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {channels[2].superchats_count} superchats • {channels[2].streams_count} directos
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* List / Table of Channels */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="bg-gray-50 rounded-2xl p-4 border border-gray-100 animate-pulse flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center space-x-3.5 flex-1">
                      <div className="w-10 h-10 rounded-full bg-gray-200"></div>
                      <div className="w-12 h-12 rounded-full bg-gray-200"></div>
                      <div className="space-y-2 flex-1 max-w-xs">
                        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                      </div>
                    </div>
                    <div className="h-6 bg-gray-200 rounded w-28"></div>
                  </div>
                ))}
              </div>
            ) : filteredChannels.length === 0 ? (
              <div className="p-12 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-200">
                <p className="font-bold text-base text-gray-700">No se encontraron canales en el ranking</p>
                <p className="text-xs text-gray-500 mt-1">Probá con otro término de búsqueda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredChannels.map((channelItem) => {
                  const percentage = Math.round((channelItem.total_ars / maxChannelArs) * 100);

                  return (
                    <div
                      key={channelItem.channel_id}
                      className="bg-white hover:bg-amber-50/20 rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-2xs hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                    >
                      {/* Left: Rank, Avatar, Name */}
                      <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                        {/* Rank Badge */}
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 shadow-xs ${getRankBadgeClass(
                            channelItem.rank
                          )}`}
                        >
                          {channelItem.rank}
                        </div>

                        <button
                          onClick={() => onNavigateChannel(channelItem.channel)}
                          className="shrink-0 focus:outline-none cursor-pointer"
                        >
                          <img
                            src={channelItem.thumb || `https://i.ytimg.com/vi/sample/hqdefault.jpg`}
                            alt={channelItem.channel_name}
                            className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 group-hover:border-amber-400 transition-colors shadow-2xs"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/sample/hqdefault.jpg`;
                            }}
                          />
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => onNavigateChannel(channelItem.channel)}
                              className="font-extrabold text-gray-900 text-sm sm:text-base hover:text-amber-600 transition-colors text-left truncate cursor-pointer"
                            >
                              {channelItem.channel_name}
                            </button>
                            <span className="text-xs text-gray-400 font-mono">
                              {channelItem.channel}
                            </span>
                          </div>

                          {/* Relative Progress Bar */}
                          <div className="mt-2 max-w-md w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-amber-400 to-amber-600 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.max(percentage, 3)}%` }}
                            ></div>
                          </div>

                          <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500 flex-wrap">
                            <span>{channelItem.superchats_count} superchats</span>
                            <span>•</span>
                            <span>{channelItem.streams_count} transmisiones</span>
                            {channelItem.avg_per_superchat ? (
                              <>
                                <span>•</span>
                                <span>Promedio: ${formatNumber(channelItem.avg_per_superchat)} ARS</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Right: Money Total & Action */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                        <div className="text-left sm:text-right">
                          <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                            Total Ganado
                          </div>
                          <div className="text-xl sm:text-2xl font-black text-amber-600">
                            ${formatNumber(channelItem.total_ars)}{' '}
                            <span className="text-xs text-amber-800 font-bold">ARS</span>
                          </div>
                        </div>

                        <button
                          onClick={() => onNavigateChannel(channelItem.channel)}
                          className="inline-flex items-center gap-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border border-purple-200 shadow-2xs"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          <span>Ver Canal</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Top 20 Videos (video_id) */}
        {activeTab === 'videos' && (
          <div className="p-4 sm:p-6 space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="bg-gray-50 rounded-2xl p-4 border border-gray-100 animate-pulse flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center space-x-3.5 flex-1">
                      <div className="w-10 h-10 rounded-full bg-gray-200"></div>
                      <div className="w-20 h-12 rounded-lg bg-gray-200"></div>
                      <div className="space-y-2 flex-1 max-w-md">
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      </div>
                    </div>
                    <div className="h-6 bg-gray-200 rounded w-28"></div>
                  </div>
                ))}
              </div>
            ) : filteredVideos.length === 0 ? (
              <div className="p-12 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-200">
                <p className="font-bold text-base text-gray-700">No se encontraron videos en el ranking</p>
                <p className="text-xs text-gray-500 mt-1">Probá con otro término de búsqueda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredVideos.map((videoItem) => {
                  const percentage = Math.round((videoItem.total_ars / maxVideoArs) * 100);
                  const thumb = `https://i.ytimg.com/vi/${videoItem.video_id}/hqdefault.jpg`;

                  return (
                    <div
                      key={videoItem.video_id}
                      className="bg-white hover:bg-amber-50/20 rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-2xs hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                    >
                      {/* Left: Rank, Thumbnail, Title, Channel info */}
                      <div className="flex items-start sm:items-center space-x-3.5 min-w-0 flex-1">
                        {/* Rank Badge */}
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 shadow-xs self-start sm:self-center ${getRankBadgeClass(
                            videoItem.rank
                          )}`}
                        >
                          {videoItem.rank}
                        </div>

                        {/* Video Thumbnail */}
                        <div className="relative shrink-0 rounded-xl overflow-hidden shadow-xs border border-gray-200 w-24 h-16 sm:w-28 sm:h-18 bg-gray-100 group">
                          <img
                            src={thumb}
                            alt={videoItem.video_title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300';
                            }}
                          />
                          <a
                            href={`https://youtube.com/watch?v=${videoItem.video_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1"
                            title="Ver en YouTube"
                          >
                            <span>▶ YT</span>
                          </a>
                        </div>

                        {/* Title and Channel Metadata */}
                        <div className="min-w-0 flex-1">
                          <h4
                            className="font-bold text-gray-900 text-sm sm:text-base leading-snug line-clamp-2"
                            title={videoItem.video_title}
                          >
                            {videoItem.video_title}
                          </h4>

                          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-gray-500">
                            {videoItem.channel ? (
                              <button
                                onClick={() => onNavigateChannel(videoItem.channel)}
                                className="font-semibold text-gray-800 hover:text-amber-600 transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                {videoItem.channel_thumb && (
                                  <img
                                    src={videoItem.channel_thumb}
                                    alt={videoItem.channel_name}
                                    className="w-4 h-4 rounded-full object-cover"
                                  />
                                )}
                                <span>{videoItem.channel_name}</span>
                                <span className="text-gray-400 font-mono">({videoItem.channel})</span>
                              </button>
                            ) : null}

                            {videoItem.last_date && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-gray-400" />
                                  <span>{formatArgentinaDateTime(videoItem.last_date)}</span>
                                </span>
                              </>
                            )}

                            <span>•</span>
                            <span className="font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">
                              {videoItem.video_id}
                            </span>
                          </div>

                          {/* Relative Progress Bar */}
                          <div className="mt-2 max-w-md w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-amber-400 to-amber-600 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.max(percentage, 3)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Total Recaudado & Action Button */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                        <div className="text-left sm:text-right">
                          <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                            {videoItem.superchats_count} superchats
                          </div>
                          <div className="text-xl sm:text-2xl font-black text-amber-600">
                            ${formatNumber(videoItem.total_ars)}{' '}
                            <span className="text-xs text-amber-800 font-bold">ARS</span>
                          </div>
                          {videoItem.avg_per_superchat ? (
                            <div className="text-[10px] text-gray-400 font-medium">
                              Promedio: ${formatNumber(videoItem.avg_per_superchat)}
                            </div>
                          ) : null}
                        </div>

                        {onOpenStreamComments && (
                          <button
                            onClick={() =>
                              onOpenStreamComments({
                                video_id: videoItem.video_id,
                                video_title: videoItem.video_title,
                                channel: videoItem.channel,
                                channel_name: videoItem.channel_name,
                                thumb: thumb,
                              })
                            }
                            className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                            title="Ver los mensajes y superchats de este video"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden sm:inline">Ver Superchats</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
