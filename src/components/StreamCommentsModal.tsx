import React, { useState, useEffect, useCallback } from 'react';
import { Stream, DbComment, DbSuperchat } from '../types';
import { formatNumber } from '../data/mockData';
import { isOctober2026OrLater } from '../utils/dateFilter';
import { MessageSquare, X, DollarSign, Youtube, RefreshCw, Clock, User, Search, MessageCircle } from 'lucide-react';

interface StreamCommentsModalProps {
  stream: Stream;
  isOpen: boolean;
  onClose: () => void;
}

type FilterTab = 'all' | 'superchats' | 'comments';

export const StreamCommentsModal: React.FC<StreamCommentsModalProps> = ({
  stream,
  isOpen,
  onClose,
}) => {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [comments, setComments] = useState<DbComment[]>([]);
  const [superchats, setSuperchats] = useState<DbSuperchat[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCommentsData = useCallback(async (isRefresh = false) => {
    if (!stream.video_id) return;
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetch(`/api/comments?video_id=${encodeURIComponent(stream.video_id)}`);
      const data = await res.json();
      if (data.success) {
        const rawComments: DbComment[] = data.comments || [];
        const rawSuperchats: DbSuperchat[] = data.superchats || [];
        setComments(rawComments.filter((c) => isOctober2026OrLater(c.created_at)));
        setSuperchats(rawSuperchats.filter((sc) => isOctober2026OrLater(sc.created_at)));
      } else {
        setError(data.message || 'Error al cargar registros');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [stream.video_id]);

  useEffect(() => {
    if (!isOpen || !stream.video_id) return;
    fetchCommentsData();
  }, [isOpen, stream.video_id, fetchCommentsData]);

  if (!isOpen) return null;

  // Format timestamp helper
  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return (
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
        ' • ' +
        d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })
      );
    } catch {
      return isoString;
    }
  };

  // Group superchats by currency for total sum
  const superchatTotalsByCurrency = superchats.reduce<Record<string, number>>((acc, sc) => {
    const cur = sc.currency || 'ARS';
    acc[cur] = (acc[cur] || 0) + Number(sc.amount || 0);
    return acc;
  }, {});

  // Search filter
  const query = searchQuery.trim().toLowerCase();
  const filteredComments = comments.filter((c) => {
    if (!query) return true;
    const author = (c.author_id || '').toLowerCase();
    const text = (c.comment_text || '').toLowerCase();
    return author.includes(query) || text.includes(query);
  });

  const filteredSuperchats = superchats.filter((sc) => {
    if (!query) return true;
    const text = (sc.superchat_text || '').toLowerCase();
    const cur = (sc.currency || '').toLowerCase();
    return text.includes(query) || cur.includes(query);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-start justify-between bg-gradient-to-r from-gray-50 via-white to-blue-50/40">
          <div className="flex items-start space-x-3.5 pr-2 min-w-0">
            <img
              src={stream.thumb || `https://i.ytimg.com/vi/${stream.video_id}/hqdefault.jpg`}
              alt={stream.channel_name}
              className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-xs shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${stream.video_id}/hqdefault.jpg`;
              }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bold text-gray-900 text-sm sm:text-base truncate">
                  {stream.channel_name}
                </span>
                <span className="text-[11px] font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-semibold">
                  video_id: {stream.video_id}
                </span>
                {stream.live === 'live' && (
                  <span className="text-[11px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                    En Vivo
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 line-clamp-1 font-medium">
                {stream.video_title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => fetchCommentsData(true)}
              disabled={isRefreshing || loading}
              title="Actualizar comentarios"
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Database Totals Bar */}
        <div className="px-4 sm:px-5 py-3 bg-gradient-to-r from-amber-50/80 via-yellow-50/70 to-blue-50/50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-amber-600" />
              <span className="font-bold text-gray-900">Superchats:</span>
              <span className="font-semibold text-amber-700">
                {superchats.length} reg.
              </span>
              {Object.entries(superchatTotalsByCurrency).map(([cur, tot]) => (
                <span
                  key={cur}
                  className="bg-amber-200/70 text-amber-900 font-bold px-2 py-0.5 rounded-md text-[11px]"
                >
                  ${formatNumber(tot)} {cur}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-gray-900">Comments:</span>
              <span className="font-semibold text-blue-700">
                {comments.length} reg.
              </span>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-gray-200 shadow-2xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-gray-900 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Todos ({comments.length + superchats.length})
            </button>
            <button
              onClick={() => setFilter('superchats')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                filter === 'superchats'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-amber-800 hover:bg-amber-50'
              }`}
            >
              💰 Superchats ({superchats.length})
            </button>
            <button
              onClick={() => setFilter('comments')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                filter === 'comments'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-blue-800 hover:bg-blue-50'
              }`}
            >
              💬 Comments ({comments.length})
            </button>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="px-4 sm:px-5 py-2.5 bg-gray-50/80 border-b border-gray-200/70 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en texto del comentario (comment_text) o autor..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-800 placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Content list */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 bg-gray-50/30">
          {loading ? (
            <div className="py-20 text-center text-gray-500 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-xs font-medium">Cargando comentarios y superchats desde la base de datos...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200">
              {error}
            </div>
          ) : (
            <>
              {/* Superchats list */}
              {(filter === 'all' || filter === 'superchats') &&
                filteredSuperchats.map((sc) => (
                  <div
                    key={`sc-${sc.id}`}
                    className="p-4 bg-gradient-to-r from-amber-50 via-yellow-50/70 to-amber-50/50 border-2 border-amber-300/80 rounded-xl shadow-xs transition-all hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-xs font-black px-3 py-1 rounded-full shadow-2xs">
                          <span>💰 SUPERCHAT</span>
                          <span>${formatNumber(sc.amount)} {sc.currency}</span>
                        </span>
                        <span className="text-[11px] font-mono text-gray-500">
                          id: #{sc.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span>{formatDate(sc.created_at)}</span>
                      </div>
                    </div>

                    {/* Superchat Message Text if present */}
                    {sc.superchat_text ? (
                      <div className="mt-2 text-sm font-semibold text-amber-950 bg-white/90 p-3 rounded-lg border border-amber-200 shadow-2xs leading-relaxed break-words">
                        "{sc.superchat_text}"
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2 text-[11px] text-gray-500 font-mono mt-2 pt-2 border-t border-amber-200/60">
                      <span className="font-semibold text-amber-900/70">superchat_id:</span>
                      <span className="truncate">{sc.superchat_id}</span>
                    </div>
                  </div>
                ))}

              {/* Comments list with comment_text prominently displayed */}
              {(filter === 'all' || filter === 'comments') &&
                filteredComments.map((c) => (
                  <div
                    key={`c-${c.id}`}
                    className="p-3.5 bg-white hover:bg-blue-50/20 border border-gray-200 rounded-xl transition-all shadow-2xs hover:shadow-xs"
                  >
                    {/* Header: Author & Date */}
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center space-x-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-xs text-gray-900 font-mono">
                          {c.author_id}
                        </span>
                        <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          id: #{c.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span>{formatDate(c.created_at)}</span>
                      </div>
                    </div>

                    {/* 💬 comment_text Body */}
                    <div className="mt-1 text-sm text-gray-800 leading-relaxed font-normal bg-gray-50/70 p-3 rounded-lg border border-gray-100 break-words">
                      {c.comment_text ? (
                        <p className="text-gray-900 font-medium whitespace-pre-wrap select-text">
                          {c.comment_text}
                        </p>
                      ) : (
                        <p className="italic text-gray-400 text-xs">
                          (Sin texto en el comentario)
                        </p>
                      )}
                    </div>

                    {/* Footer technical identifier */}
                    {/*<div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono mt-2 pt-1.5 border-t border-gray-100">
                      <MessageCircle className="w-3 h-3 text-gray-300 shrink-0" />
                      <span className="font-semibold text-gray-400">comment_id:</span>
                      <span className="truncate text-gray-500">{c.comment_id}</span>
                    </div>*/}
                  </div>
                ))}

              {/* Empty state */}
              {((filter === 'superchats' && filteredSuperchats.length === 0) ||
                (filter === 'comments' && filteredComments.length === 0) ||
                (filter === 'all' && filteredComments.length === 0 && filteredSuperchats.length === 0)) && (
                <div className="py-14 text-center text-gray-400 text-xs">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40 text-gray-400" />
                  {searchQuery ? (
                    <p>No se encontraron comentarios que coincidan con "{searchQuery}".</p>
                  ) : (
                    <p>No se encontraron registros en la tabla para este video_id.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px]">video_id: {stream.video_id}</span>
            <span>•</span>
            <a
              href={`https://youtube.com/watch?v=${stream.video_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium"
            >
              <Youtube className="w-3.5 h-3.5" />
              <span>Abrir en YouTube</span>
            </a>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors cursor-pointer text-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
