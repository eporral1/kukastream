import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TopCommentator } from '../types';
import { formatNumber } from '../data/mockData';
import {
  Crown,
  Trophy,
  Medal,
  Flame,
  Search,
  RefreshCw,
  MessageSquare,
  Clock,
  ArrowRight,
  User,
  Users,
  CheckCircle,
} from 'lucide-react';

interface TopCommentatorsListProps {
  videoId?: string;
  channelId?: string;
  channelHandle?: string;
  scopeTitle?: string;
  onSelectAuthor?: (authorId: string) => void;
}

export const TopCommentatorsList: React.FC<TopCommentatorsListProps> = ({
  videoId,
  channelId,
  channelHandle,
  scopeTitle,
  onSelectAuthor,
}) => {
  const [commentators, setCommentators] = useState<TopCommentator[]>([]);
  const [totalComments, setTotalComments] = useState<number>(0);
  const [uniqueCommentators, setUniqueCommentators] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');

  const fetchTopCommentators = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      if (videoId) params.append('video_id', videoId);
      if (channelId) params.append('channel_id', channelId);
      if (channelHandle) params.append('channel', channelHandle);
      params.append('limit', '50');

      const res = await fetch(`/api/top-commentators?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setCommentators(data.commentators || []);
        setTotalComments(data.total_comments || 0);
        setUniqueCommentators(data.unique_commentators || 0);
      } else {
        setError(data.error || 'Error al obtener top comentaristas');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [videoId, channelId, channelHandle]);

  useEffect(() => {
    fetchTopCommentators();
  }, [fetchTopCommentators]);

  const filteredCommentators = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return commentators;
    return commentators.filter((c) =>
      c.author_id.toLowerCase().includes(q) ||
      (c.latest_comment && c.latest_comment.toLowerCase().includes(q))
    );
  }, [commentators, searchFilter]);

  const top1 = filteredCommentators[0] || commentators[0];
  const top2 = filteredCommentators[1] || commentators[1];
  const top3 = filteredCommentators[2] || commentators[2];
  const restList = filteredCommentators.slice(3);

  const maxComments = commentators[0]?.comment_count || 1;

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return (
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
        ' • ' +
        d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
      );
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Stats Banner & Search */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-200/80 rounded-xl p-3.5 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-white flex items-center justify-center shadow-sm shrink-0">
              <Crown className="w-5 h-5 drop-shadow-xs" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight">
                  Ranking de Top Comentaristas
                </h3>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200">
                  Top 50
                </span>
              </div>
              <p className="text-xs text-gray-600">
                Los usuarios que más chats enviaron en la transmisión.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 shadow-2xs">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>{formatNumber(uniqueCommentators)} participantes</span>
            </div>
            <button
              onClick={() => fetchTopCommentators(true)}
              disabled={isRefreshing || loading}
              title="Actualizar ranking"
              className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter input */}
        <div className="mt-3 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Buscar comentarista por @usuario o texto..."
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-amber-200/90 rounded-lg outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-gray-800 placeholder:text-gray-400 font-medium"
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-500 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
          <span className="text-xs font-medium">Calculando el ranking de comentaristas...</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200">
          {error}
        </div>
      ) : filteredCommentators.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <p className="text-sm font-semibold">No se encontraron comentaristas para esta búsqueda</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Podium for Top 3 (if no search filter is applied or if top matches) */}
          {!searchFilter && commentators.length >= 3 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-2">
              {/* Rank 2 - Silver */}
              <div
                onClick={() => onSelectAuthor && onSelectAuthor(top2.author_id)}
                className="order-2 sm:order-1 bg-gradient-to-b from-slate-50 to-white border-2 border-slate-200 rounded-2xl p-3.5 shadow-xs relative flex flex-col justify-between hover:border-slate-400 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                    🥈 #2 Plata
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    {top2.percentage}% del chat
                  </span>
                </div>
                <div className="flex items-center space-x-2.5 my-1">
                  <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shadow-xs shrink-0 group-hover:bg-slate-300 transition-colors">
                    {top2.author_id.replace(/^@/, '').substring(0, 2).toUpperCase() || 'US'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                      {top2.author_id}
                    </p>
                    <p className="text-[11px] text-gray-500 font-medium">
                      <strong className="text-slate-900 font-extrabold">{formatNumber(top2.comment_count)}</strong> chats
                    </p>
                  </div>
                </div>
                {top2.latest_comment && (
                  <p className="text-[11px] text-gray-600 italic bg-slate-100/70 p-2 rounded-lg line-clamp-2 mt-2 border border-slate-200/60">
                    "{top2.latest_comment}"
                  </p>
                )}
                <div className="mt-2.5 flex items-center justify-end text-[11px] font-bold text-slate-700 group-hover:text-blue-600">
                  <span>Ver mensajes</span>
                  <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>

              {/* Rank 1 - Gold (Elevated) */}
              <div
                onClick={() => onSelectAuthor && onSelectAuthor(top1.author_id)}
                className="order-1 sm:order-2 bg-gradient-to-b from-amber-50/90 via-yellow-50/50 to-white border-2 border-amber-400 rounded-2xl p-4 shadow-md relative flex flex-col justify-between hover:border-amber-500 transition-all cursor-pointer group sm:-translate-y-1.5"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 bg-gradient-to-r from-amber-300 to-yellow-400 px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                    👑 #1 Campeón
                  </span>
                  <span className="text-xs font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full">
                    {top1.percentage}% del total
                  </span>
                </div>
                <div className="flex items-center space-x-3 my-1">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-300 text-amber-950 font-black text-sm flex items-center justify-center shadow-xs shrink-0 ring-2 ring-amber-300/60 group-hover:scale-105 transition-transform">
                    {top1.author_id.replace(/^@/, '').substring(0, 2).toUpperCase() || 'TOP'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-900 truncate group-hover:text-amber-700 transition-colors">
                      {top1.author_id}
                    </p>
                    <p className="text-xs text-amber-950 font-bold">
                      <strong className="text-amber-700 font-extrabold text-sm">{formatNumber(top1.comment_count)}</strong> chats
                    </p>
                  </div>
                </div>
                {top1.latest_comment && (
                  <p className="text-[11px] text-gray-700 italic bg-amber-100/60 p-2.5 rounded-lg line-clamp-2 mt-2 border border-amber-200">
                    "{top1.latest_comment}"
                  </p>
                )}
                <div className="mt-2.5 flex items-center justify-end text-[11px] font-black text-amber-800 group-hover:text-amber-900">
                  <span>Ver todos sus chats</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* Rank 3 - Bronze */}
              <div
                onClick={() => onSelectAuthor && onSelectAuthor(top3.author_id)}
                className="order-3 bg-gradient-to-b from-amber-900/5 to-white border-2 border-amber-700/30 rounded-2xl p-3.5 shadow-xs relative flex flex-col justify-between hover:border-amber-700/60 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                    🥉 #3 Bronce
                  </span>
                  <span className="text-xs font-bold text-amber-900">
                    {top3.percentage}% del chat
                  </span>
                </div>
                <div className="flex items-center space-x-2.5 my-1">
                  <div className="w-9 h-9 rounded-full bg-amber-800/15 text-amber-900 font-bold text-xs flex items-center justify-center shadow-xs shrink-0 group-hover:bg-amber-800/25 transition-colors">
                    {top3.author_id.replace(/^@/, '').substring(0, 2).toUpperCase() || 'US'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                      {top3.author_id}
                    </p>
                    <p className="text-[11px] text-gray-500 font-medium">
                      <strong className="text-amber-900 font-extrabold">{formatNumber(top3.comment_count)}</strong> chats
                    </p>
                  </div>
                </div>
                {top3.latest_comment && (
                  <p className="text-[11px] text-gray-600 italic bg-amber-50/60 p-2 rounded-lg line-clamp-2 mt-2 border border-amber-200/50">
                    "{top3.latest_comment}"
                  </p>
                )}
                <div className="mt-2.5 flex items-center justify-end text-[11px] font-bold text-amber-900 group-hover:text-blue-600">
                  <span>Ver mensajes</span>
                  <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          )}

          {/* List of remaining commentators (#4 to #50) or all when searching */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="px-4 py-3 bg-gray-50/70 border-b border-gray-200 flex items-center justify-between text-xs font-bold text-gray-600">
              <div className="flex items-center gap-2">
                <span>Ranking</span>
                <span>•</span>
                <span>Comentarista</span>
              </div>
              <div className="flex items-center gap-6">
                <span>Frecuencia</span>
                <span>Total Chats</span>
              </div>
            </div>

            <div className="divide-y divide-gray-100 max-h-[460px] overflow-y-auto">
              {(searchFilter ? filteredCommentators : restList).map((c) => {
                const widthPercent = Math.max(
                  Math.min(Math.round((c.comment_count / maxComments) * 100), 100),
                  4
                );

                return (
                  <div
                    key={c.author_id}
                    onClick={() => onSelectAuthor && onSelectAuthor(c.author_id)}
                    className="p-3 sm:px-4 sm:py-3 hover:bg-amber-50/40 transition-colors flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      {/* Rank badge */}
                      <span className="w-7 h-7 rounded-lg bg-gray-100 group-hover:bg-amber-100 text-gray-700 group-hover:text-amber-900 font-extrabold text-xs flex items-center justify-center shrink-0 transition-colors">
                        #{c.rank}
                      </span>

                      {/* Author Avatar & Handle */}
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 border border-gray-200">
                        {c.author_id.replace(/^@/, '').substring(0, 2).toUpperCase() || 'U'}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                            {c.author_id}
                          </p>
                          {c.rank <= 3 && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">
                              Top 3
                            </span>
                          )}
                        </div>

                        {c.latest_comment ? (
                          <p className="text-[11px] text-gray-500 truncate font-normal">
                            "{c.latest_comment}"
                          </p>
                        ) : c.last_comment_at ? (
                          <p className="text-[10px] text-gray-400">
                            Último: {formatDateTime(c.last_comment_at)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {/* Progress Bar & Comment Count */}
                    <div className="flex items-center space-x-4 shrink-0">
                      <div className="hidden sm:block w-24 sm:w-32">
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full"
                            style={{ width: `${widthPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {c.percentage}% del chat
                        </span>
                      </div>

                      <div className="text-right min-w-[70px]">
                        <p className="text-xs sm:text-sm font-black text-gray-900 group-hover:text-amber-700 transition-colors">
                          {formatNumber(c.comment_count)}
                        </p>
                        <p className="text-[10px] text-gray-400 uppercase font-semibold">
                          mensajes
                        </p>
                      </div>

                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-white border border-gray-200 text-blue-600 hover:bg-blue-50 transition-all text-xs font-bold flex items-center"
                        title="Ver chats de este autor"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
