import React from 'react';
import { Stream } from '../types';
import { formatNumber } from '../data/mockData';

interface RankingStreamCardProps {
  stream: Stream;
  index: number;
  onNavigateChannel: (channelId: string) => void;
  onOpenComments?: (stream: Stream) => void;
}

export const RankingStreamCard: React.FC<RankingStreamCardProps> = ({
  stream,
  index,
  onNavigateChannel,
  onOpenComments,
}) => {
  const diffViewers = (stream.concurrent_viewers || 0) - (stream.old_viewers || 0);
  const diffLikes = (stream.current_likes || 0) - (stream.old_likes || 0);

  // Rank badge styling
  let badgeStyle = 'bg-gray-100 text-gray-700';
  if (index === 0) {
    badgeStyle = 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-white shadow-yellow-200';
  } else if (index === 1) {
    badgeStyle = 'bg-gradient-to-r from-slate-300 to-slate-400 text-slate-800 shadow-slate-200';
  } else if (index === 2) {
    badgeStyle = 'bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-amber-200';
  }

  const thumbUrl = stream.thumb || `https://i.ytimg.com/vi/${stream.video_id}/hqdefault.jpg`;
  const superchatsTotal = Number(stream.superchats_total || 0);
  const commentsCount = Number(stream.comments_count || 0);
  const currentLikes = Number(stream.current_likes || 0);
  const isLive = stream.live === 'live';
  const viewers = (isLive ? stream.concurrent_viewers : (stream.avg_viewers || stream.concurrent_viewers)) || 0;
  const peakViewers = (stream.max_viewers || stream.max_users || (isLive ? stream.concurrent_viewers : (stream.avg_viewers || stream.concurrent_viewers))) || 0;
  const likesRatio = peakViewers > 0 ? (currentLikes / peakViewers) : 0;
  const commentsRatio = peakViewers > 0 ? (commentsCount / peakViewers) : 0;

  return (
    <div
      id={stream.video_id}
      className="bg-white rounded-xl shadow-xs hover:shadow-lg transition-all duration-300 border border-gray-100 overflow-hidden group hover:-translate-y-0.5"
    >
      <div className="p-4 md:p-6">
        {/* Desktop Layout */}
        <div className="hidden sm:flex items-center space-x-4">
          {/* Rank Badge */}
          <div className="shrink-0">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shadow-md ${badgeStyle}`}
            >
              {index + 1}
            </div>
          </div>

          {/* Channel Info */}
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            <button
              onClick={() => onNavigateChannel(stream.channel)}
              className="shrink-0 focus:outline-none cursor-pointer"
            >
              <img
                src={thumbUrl}
                alt={stream.channel_name}
                className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 group-hover:border-blue-500 transition-colors shadow-xs"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${stream.video_id}/hqdefault.jpg`;
                }}
              />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigateChannel(stream.channel)}
                  className="text-left font-bold text-gray-900 hover:text-blue-600 transition-colors truncate block max-w-full text-base sm:text-lg focus:outline-none cursor-pointer"
                >
                  {stream.channel_name}
                </button>
                <span className="text-xs text-gray-400 font-mono">
                  {stream.channel} {/* stream.type */}
                </span>
              </div>
              <p className="text-sm text-gray-600 truncate mt-1" title={stream.video_title}>
                {stream.video_title || 'Transmisión en vivo'} 
              </p>
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => onNavigateChannel(stream.channel)}
                  className="bg-purple-100 hover:bg-purple-200 text-purple-800 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors cursor-pointer"
                >
                     <span>📊</span>
                            <span>Métricas</span>
                </button>

                {onOpenComments && (
                  <button
                    onClick={() => onOpenComments(stream)}
                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer border border-blue-200/60"
                  >
                    <span>💬</span>
                    <span>Mensajes{/*({commentsCount})*/}</span>
                  </button>
                )}

                {superchatsTotal > 0 && (
                  <button
                    onClick={() => onOpenComments && onOpenComments(stream)}
                    className="bg-amber-100 hover:bg-amber-200 text-amber-900 px-2.5 py-0.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer border border-amber-300"
                  >
                    <span>💰</span>
                    <span>${formatNumber(superchatsTotal)} ARS{/* ({stream.superchats_count})*/}</span>
                  </button>
                )}

                {stream.video_id && (
                  <a
                    href={`https://youtube.com/watch?v=${stream.video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-gray-400 hover:text-red-600 transition-colors flex items-center gap-0.5"
                  >
                
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Statistics */}
          <div className="flex items-center space-x-6 shrink-0 pl-2">
            {/* Live Viewers */}
            <div className="text-center min-w-[90px]">
              <div className="text-xs text-gray-400 font-semibold mb-0.5">ESPECTADORES</div>
              <div className="font-extrabold text-2xl text-gray-900">
                {formatNumber(viewers)}
              </div>
              <div className="text-[10px] text-gray-500 font-medium">
                {isLive ? 'ACTUALES' : 'PROMEDIO'}
              </div>
            </div>

            {/* Likes Count */}
            <div className="text-center min-w-[85px]">
              <div className="text-xs text-gray-400 font-semibold mb-0.5">LIKES</div>
              <div className="font-extrabold text-2xl text-rose-500">
                {formatNumber(currentLikes)}
              </div>
              <div className="text-[10px] text-gray-500 font-medium" title="Likes por espectador pico del episodio">
                {likesRatio > 0 ? likesRatio.toFixed(2) : '0.00'} / esp
              </div>
            </div>

            {/* Comments Count */}
            <div className="text-center min-w-[85px]">
              <div className="text-xs text-gray-400 font-semibold mb-0.5">MENSAJES</div>
              <div className="font-extrabold text-2xl text-amber-500">
                {formatNumber(commentsCount)}
              </div>
              <div className="text-[10px] text-gray-500 font-medium" title="Mensajes por espectador pico del episodio">
                {commentsRatio > 0 ? commentsRatio.toFixed(2) : '0.00'} / esp
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="sm:hidden">
          <div className="flex items-start space-x-3">
            {/* Rank badge small */}
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-xs ${badgeStyle}`}
            >
              {index + 1}
            </div>

            {/* Channel Thumbnail */}
            <button
              onClick={() => onNavigateChannel(stream.channel)}
              className="shrink-0 focus:outline-none"
            >
              <img
                src={thumbUrl}
                alt={stream.channel_name}
                className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${stream.video_id}/hqdefault.jpg`;
                }}
              />
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <button
                onClick={() => onNavigateChannel(stream.channel)}
                className="font-bold text-gray-900 text-sm leading-tight text-left truncate block w-full"
              >
                {stream.channel_name}
              </button>
              <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                {stream.video_title || 'Transmisión en vivo'}
              </p>

              {/* Mobile Stats */}
              <div className="flex items-center space-x-2 mt-3 flex-wrap gap-y-1.5">
                <div className="flex items-center space-x-1.5 bg-red-50 text-red-600 px-2 py-0.5 rounded-md">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-bold">
                    {formatNumber(viewers)}
                  </span>
                </div>

                <div
                  className={`text-xs font-semibold ${
                    diffViewers >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {diffViewers >= 0 ? '+' : ''}
                  {formatNumber(diffViewers)} (10m)
                </div>

                <div
                  className="flex items-center gap-1 bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md text-xs font-semibold border border-rose-200/60"
                  title="Likes totales y ratio sobre espectador pico del episodio"
                >
                  <span>❤️</span>
                  <span>{formatNumber(currentLikes)}</span>
                  <span className="text-[10px] text-gray-500 font-normal">({likesRatio > 0 ? likesRatio.toFixed(2) : '0.00'}/esp)</span>
                </div>

                <div
                  className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md text-xs font-semibold border border-amber-200/60"
                  title="Mensajes totales y ratio sobre espectador pico del episodio"
                >
                  <span>💬</span>
                  <span>{formatNumber(commentsCount)}</span>
                  <span className="text-[10px] text-gray-500 font-normal">({commentsRatio > 0 ? commentsRatio.toFixed(2) : '0.00'}/esp)</span>
                </div>

                {onOpenComments && (
                  <button
                    onClick={() => onOpenComments(stream)}
                    className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold border border-blue-200"
                  >
                    Chat
                  </button>
                )}

                <button
                  onClick={() => onNavigateChannel(stream.channel)}
                  className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-xs font-semibold ml-auto"
                >
                  Métricas
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
