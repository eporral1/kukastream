import React, { useState, useMemo } from 'react';
import { Channel } from '../types';
import { formatNumber, formatSubs } from '../data/mockData';
import { ChannelCommentsModal } from './ChannelCommentsModal';
import { Search, ExternalLink, BarChart2, Radio, Heart, MessageSquare, DollarSign, Sparkles } from 'lucide-react';

interface ChannelsPageProps {
  channels: Channel[];
  onNavigateChannel: (channelId: string) => void;
}

export const ChannelsPage: React.FC<ChannelsPageProps> = ({
  channels,
  onNavigateChannel,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedCommentsChannel, setSelectedCommentsChannel] = useState<Channel | null>(null);
  const [filterSuperchatsOnly, setFilterSuperchatsOnly] = useState<boolean>(false);

  const filteredChannels = useMemo(() => {
    if (!Array.isArray(channels)) return [];
    return channels.filter((ch) => {
      if (!ch) return false;

      // Solo mostrar los canales activos (active = 1)
      if (ch.active !== undefined && ch.active !== null) {
        const isActive = ch.active === 1 || ch.active === '1' || ch.active === true;
        if (!isActive) return false;
      }

      const channelName = (ch.channel_name || '').toLowerCase();
      const channelHandle = (ch.channel || '').toLowerCase();
      const description = (ch.description || '').toLowerCase();
      const tags = (ch.tags || '').toLowerCase();
      const query = (searchQuery || '').toLowerCase();
      const selected = (selectedTag || 'all').toLowerCase();

      const matchesSearch =
        channelName.includes(query) ||
        channelHandle.includes(query) ||
        description.includes(query);
      const matchesTag =
        selected === 'all' || tags.includes(selected);

      const hasSuperchats = (ch.superchats_count && ch.superchats_count > 0) ||
        (ch.comments_sample && ch.comments_sample.some(c => c.is_superchat));

      const matchesSuperchatFilter = !filterSuperchatsOnly || hasSuperchats;

      return matchesSearch && matchesTag && matchesSuperchatFilter;
    });
  }, [channels, searchQuery, selectedTag, filterSuperchatsOnly]);

  return (
    <div className="space-y-6">
      {/* Title & Search header */}
      <div className="text-center pt-2 pb-6">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
        Canales
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
            placeholder="Buscar..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-gray-900 transition-all placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Filter Tabs & Superchat Filter Toggle */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-2">
        {/*<div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
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
              {tag === 'all' ? 'Todos los Canales' : tag}
            </button>
          ))}
        </div>*/}

        {/* Superchat filter switch */}
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
      </div>

      {/* Channels List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm text-gray-500 px-1">
          <span>Mostrando {filteredChannels.length} canales</span>
          <span>Ordenado por promedio de conectados</span>
        </div>

        {filteredChannels.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200 text-gray-500">
            No se encontraron canales para los filtros seleccionados.
          </div>
        ) : (
          filteredChannels.map((channel, index) => {
            const hasSuperchats = (channel.superchats_count && channel.superchats_count > 0) ||
              (channel.comments_sample && channel.comments_sample.some(c => c.is_superchat));

            return (
              <div
                key={channel.channel_id}
                className={`bg-white rounded-xl shadow-xs hover:shadow-lg transition-all duration-300 border overflow-hidden group hover:-translate-y-0.5 ${
                  hasSuperchats ? 'border-amber-200/70 bg-gradient-to-r from-white via-white to-amber-50/20' : 'border-gray-100'
                }`}
              >
                <div className="p-4 md:p-6">
                  {/* Desktop Layout */}
                  <div className="hidden sm:flex items-center space-x-4">
                    {/* Rank */}
                    <div className="shrink-0 w-8 text-center font-bold text-gray-400 text-sm">
                      #{index + 1}
                    </div>

                    {/* Channel Info */}
                    <div className="flex items-center space-x-4 flex-1 min-w-0">
                      <button
                        onClick={() => onNavigateChannel(channel.channel)}
                        className="shrink-0 focus:outline-none cursor-pointer"
                      >
                        <img
                          src={channel.thumb}
                          alt={channel.channel_name}
                          className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 group-hover:border-blue-500 transition-colors shadow-xs"
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => onNavigateChannel(channel.channel)}
                            className="font-bold text-gray-900 hover:text-blue-600 transition-colors truncate text-base sm:text-lg focus:outline-none cursor-pointer"
                          >
                            {channel.channel_name}
                          </button>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {formatSubs(channel.subs)} subs
                          </span>

                          {/* Superchat Highlight Tag if present */}
                          {hasSuperchats && (
                            <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-xs">
                              <span>💰</span>
                              <span>
                                {channel.superchats_count} Superchats
                                {channel.superchats_total_ars ? ` (~$${formatNumber(channel.superchats_total_ars)})` : ''}
                              </span>
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-gray-600 truncate mt-1">
                          {channel.description}
                        </p>

                        <div className="mt-2.5 flex items-center space-x-2 flex-wrap gap-y-1">
                          <a
                            href={`https://youtube.com/${channel.channel}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                          >
                            <span>{channel.channel}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>

                          <button
                            onClick={() => onNavigateChannel(channel.channel)}
                            className="inline-flex items-center gap-1 bg-purple-100 hover:bg-purple-200 text-purple-800 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <BarChart2 className="w-3 h-3" />
                            <span>Ver Métricas & Heatmap</span>
                          </button>

                          {/* 💬 Button to View Comments & Superchats */}
                          <button
                            onClick={() => setSelectedCommentsChannel(channel)}
                            className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Ver Comments</span>
                            {channel.comments_sample && channel.comments_sample.length > 0 && (
                              <span className="bg-emerald-600 text-white px-1.5 py-0.2 rounded-full text-[10px]">
                                {channel.comments_sample.length}
                              </span>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Statistics */}
                    <div className="flex items-center space-x-8 shrink-0 pl-4 border-l border-gray-100">
                      {/* Avg Viewers */}
                      <div className="text-center min-w-[100px]">
                        <div className="flex items-center justify-center space-x-1 text-red-500 mb-1">
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                          <span className="text-xs font-semibold uppercase tracking-wider">
                            Live Avg
                          </span>
                        </div>
                        <div className="font-extrabold text-xl text-gray-900">
                          {formatNumber(channel.avg_viewers)}
                        </div>
                        <div className="text-xs text-gray-500">promedio</div>
                      </div>

                      {/* Avg Likes */}
                      <div className="text-center min-w-[90px]">
                        <div className="flex items-center justify-center gap-1 text-xs text-gray-500 mb-1">
                          <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
                          <span>Likes/h</span>
                        </div>
                        <div className="font-bold text-lg text-gray-900">
                          {formatNumber(channel.avg_likes)}
                        </div>
                        <div className="text-xs text-gray-500">por hora</div>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Layout */}
                  <div className="sm:hidden">
                    <div className="flex items-start space-x-3">
                      <button
                        onClick={() => onNavigateChannel(channel.channel)}
                        className="shrink-0"
                      >
                        <img
                          src={channel.thumb}
                          alt={channel.channel_name}
                          className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <button
                            onClick={() => onNavigateChannel(channel.channel)}
                            className="font-bold text-gray-900 text-sm leading-tight text-left"
                          >
                            {channel.channel_name}
                          </button>
                          <span className="text-xs text-gray-500 font-medium">
                            {formatSubs(channel.subs)}
                          </span>
                        </div>

                        {/* Superchat badge on mobile */}
                        {hasSuperchats && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                              <span>💰</span>
                              <span>{channel.superchats_count} Superchats</span>
                            </span>
                          </div>
                        )}

                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {channel.description}
                        </p>

                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50 flex-wrap gap-2">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-1 text-red-600">
                              <Radio className="w-3 h-3" />
                              <span className="text-xs font-bold">
                                {formatNumber(channel.avg_viewers)}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              👍 {formatNumber(channel.avg_likes)}/h
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {/* Button Ver Comments on Mobile */}
                            <button
                              onClick={() => setSelectedCommentsChannel(channel)}
                              className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>Comments</span>
                            </button>

                            <button
                              onClick={() => onNavigateChannel(channel.channel)}
                              className="bg-purple-100 text-purple-800 px-2.5 py-1 rounded-full text-xs font-semibold"
                            >
                              Métricas
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal for Comments and Superchats */}
      {selectedCommentsChannel && (
        <ChannelCommentsModal
          channel={selectedCommentsChannel}
          isOpen={!!selectedCommentsChannel}
          onClose={() => setSelectedCommentsChannel(null)}
        />
      )}
    </div>
  );
};
