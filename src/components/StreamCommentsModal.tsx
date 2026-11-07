import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Stream, DbComment, DbSuperchat } from '../types';
import { formatNumber } from '../data/mockData';
import { isOctober2026OrLater } from '../utils/dateFilter';
import { TopCommentatorsList } from './TopCommentatorsList';
import {
  MessageSquare,
  X,
  DollarSign,
  Youtube,
  RefreshCw,
  Clock,
  User,
  Search,
  Sparkles,
  Send,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Copy,
  Crown,
  Filter,
} from 'lucide-react';

// Variable booleana para ocultar/comentar temporalmente la consulta con IA
const SHOW_AI_COMMENTS_QUERY = false;

interface StreamCommentsModalProps {
  stream: Stream;
  isOpen: boolean;
  onClose: () => void;
}

type ModalNavTab = 'comments' | 'top_commentators' | 'ai' | 'captions';
type FilterTab = 'all' | 'superchats' | 'comments';

export const StreamCommentsModal: React.FC<StreamCommentsModalProps> = ({
  stream,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<ModalNavTab>('comments');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [comments, setComments] = useState<DbComment[]>([]);
  const [superchats, setSuperchats] = useState<DbSuperchat[]>([]);
  const [totalComments, setTotalComments] = useState<number>(0);
  const [totalSuperchats, setTotalSuperchats] = useState<number>(0);
  const [hasMoreComments, setHasMoreComments] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Captions state
  const [captions, setCaptions] = useState<string | null>(stream.captions || null);
  const [captionsLoading, setCaptionsLoading] = useState(false);
  const [captionsError, setCaptionsError] = useState<string | null>(null);

  const handleGenerateCaptions = async (force = false) => {
    if (!stream.video_id || captionsLoading) return;
    setCaptionsLoading(true);
    setCaptionsError(null);
    try {
      const res = await fetch('/api/generate-captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: stream.video_id, force }),
      });
      const data = await res.json();
      if (data.success) {
        setCaptions(data.captions);
      } else {
        setCaptionsError(data.error || 'Error al obtener la transcripción.');
      }
    } catch (err: any) {
      setCaptionsError(err.message || 'Error de conexión.');
    } finally {
      setCaptionsLoading(false);
    }
  };

  // AI Query state
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiStats, setAiStats] = useState<{ comments: number; superchats: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Initial fetch: first 20 comments + superchats + total counts
  const fetchInitialData = useCallback(async (isRefresh = false) => {
    if (!stream.video_id) return;
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetch(
        `/api/comments?video_id=${encodeURIComponent(stream.video_id)}&limit=20&offset=0`
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Respuesta inválida del servidor');
      }
      const data = await res.json();
      if (data.success) {
        const rawComments: DbComment[] = data.comments || [];
        const rawSuperchats: DbSuperchat[] = data.superchats || [];
        const filteredComments = rawComments.filter((c) => isOctober2026OrLater(c.created_at));
        const filteredSuperchats = rawSuperchats.filter((sc) => isOctober2026OrLater(sc.created_at));

        setComments(filteredComments);
        setSuperchats(filteredSuperchats);
        setTotalComments(data.total_comments ?? filteredComments.length);
        setTotalSuperchats(data.total_superchats ?? filteredSuperchats.length);
        setHasMoreComments(Boolean(data.has_more));
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

  // Load next batch of 20 comments (infinite scroll)
  const loadMoreComments = useCallback(async () => {
    if (isLoadingMore || !hasMoreComments || !stream.video_id) return;
    setIsLoadingMore(true);

    try {
      const nextOffset = comments.length;
      const res = await fetch(
        `/api/comments?video_id=${encodeURIComponent(stream.video_id)}&limit=20&offset=${nextOffset}&type=comments`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.comments)) {
          const newFiltered = data.comments.filter((c: DbComment) => isOctober2026OrLater(c.created_at));
          setComments((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            const fresh = newFiltered.filter((c: DbComment) => !existingIds.has(c.id));
            return [...prev, ...fresh];
          });
          setTotalComments(data.total_comments ?? (comments.length + newFiltered.length));
          setHasMoreComments(Boolean(data.has_more));
        } else {
          setHasMoreComments(false);
        }
      }
    } catch (err) {
      console.warn('Error loading more comments:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMoreComments, stream.video_id, comments.length]);

  // Scroll listener for infinite scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 120) {
      if (!loading && !isLoadingMore && hasMoreComments) {
        loadMoreComments();
      }
    }
  };

  useEffect(() => {
    if (!isOpen || !stream.video_id) return;
    fetchInitialData();
  }, [isOpen, stream.video_id, fetchInitialData]);

  // Select author from Top Commentators tab to filter in comments tab
  const handleSelectAuthor = (authorId: string) => {
    setActiveTab('comments');
    setSearchQuery(authorId);
    setFilter('all');
  };

  // AI Query Submission
  const handleAskAi = async (promptOverride?: string) => {
    const queryToAsk = (promptOverride || aiQuestion).trim();
    if (!queryToAsk || aiLoading || !stream.video_id) return;

    if (promptOverride) {
      setAiQuestion(promptOverride);
    }

    setAiLoading(true);
    setAiError(null);
    setAiAnswer(null);

    try {
      const res = await fetch('/api/comments-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: stream.video_id,
          question: queryToAsk,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setAiAnswer(data.answer);
        setAiStats({
          comments: data.comments_analyzed || 0,
          superchats: data.superchats_analyzed || 0,
        });
      } else {
        setAiError(data.error || 'No se pudo generar la respuesta.');
      }
    } catch (err: any) {
      setAiError(err.message || 'Error de conexión con el servicio de IA.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyAnswer = () => {
    if (!aiAnswer) return;
    navigator.clipboard.writeText(aiAnswer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  const quickPrompts = [
    'dame comments donde se expresen ideas políticas',
    'resumí qué opinan los chats',
    'chats más picantes o graciosos',
    'análisis de superchats y temas principales',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-start justify-between bg-gradient-to-r from-gray-50 via-white to-blue-50/40 shrink-0">
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
              onClick={() => fetchInitialData(true)}
              disabled={isRefreshing || loading}
              title="Actualizar chats"
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

        {/* Primary Navigation Solapas (Tabs) */}
        <div className="flex items-center border-b border-gray-200 bg-gray-50/80 px-4 sm:px-5 gap-2 shrink-0 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('comments')}
            className={`py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'comments'
                ? 'border-blue-600 text-blue-600 bg-white shadow-2xs rounded-t-lg -mb-px'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Mensajes & Superchats</span>
            {totalComments > 0 && (
              <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-bold ml-0.5">
                {formatNumber(totalComments + totalSuperchats)}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('top_commentators')}
            className={`py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'top_commentators'
                ? 'border-amber-500 text-amber-800 bg-white shadow-2xs rounded-t-lg -mb-px'
                : 'border-transparent text-gray-600 hover:text-amber-700 hover:bg-amber-50/50'
            }`}
          >
            <Crown className="w-4 h-4 text-amber-500" />
            <span>Top Comentaristas</span>
            <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded-full font-bold ml-0.5">
              Ranking
            </span>
          </button>

          <button
            onClick={() => setActiveTab('captions')}
            className={`py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'captions'
                ? 'border-purple-600 text-purple-700 bg-white shadow-2xs rounded-t-lg -mb-px'
                : 'border-transparent text-gray-600 hover:text-purple-700 hover:bg-purple-50/40'
            }`}
          >
            <Youtube className="w-4 h-4 text-purple-600" />
            <span>Transcripción & Anuncios</span>
          </button>

          {/* Consulta con IA comentada temporalmente por pedido del usuario */}
          {SHOW_AI_COMMENTS_QUERY && (
            <button
              onClick={() => setActiveTab('ai')}
              className={`py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'ai'
                  ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs rounded-t-lg -mb-px'
                  : 'border-transparent text-gray-600 hover:text-indigo-700 hover:bg-indigo-50/40'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Consultar con IA</span>
              <span className="text-[9px] uppercase tracking-wider bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-1.5 py-0.2 rounded font-extrabold ml-0.5">
                Gemini
              </span>
            </button>
          )}
        </div>

        {/* Tab 1: Chats & Superchats */}
        {activeTab === 'comments' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Database Totals & Filter Tabs Bar */}
            <div className="px-4 sm:px-5 py-2.5 bg-gradient-to-r from-amber-50/80 via-yellow-50/70 to-blue-50/50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
              <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-amber-600" />
                  <span className="font-bold text-gray-900">Superchats:</span>
                  <span className="font-semibold text-amber-700">
                    {totalSuperchats || superchats.length} reg.
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
                    {comments.length} cargados {totalComments > 0 ? `de ${totalComments}` : ''}
                  </span>
                </div>
              </div>

              {/* Sub-filter Tabs */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-gray-200 shadow-2xs">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    filter === 'all'
                      ? 'bg-gray-900 text-white shadow-xs'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Todos ({totalComments + totalSuperchats || comments.length + superchats.length})
                </button>
                <button
                  onClick={() => setFilter('superchats')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    filter === 'superchats'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-amber-800 hover:bg-amber-50'
                  }`}
                >
                  💰 Superchats ({totalSuperchats || superchats.length})
                </button>
                <button
                  onClick={() => setFilter('comments')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    filter === 'comments'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-blue-800 hover:bg-blue-50'
                  }`}
                >
                  💬 Comments ({totalComments || comments.length})
                </button>
              </div>
            </div>

            {/* Local Search Input Bar with Filter Notification */}
            <div className="px-4 sm:px-5 py-2 bg-gray-50/80 border-b border-gray-200/70 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar por texto de comentario cargado o autor (@handle)..."
                  className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-800 placeholder:text-gray-400 font-medium"
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

              {searchQuery && (
                <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-800 shrink-0">
                  <Filter className="w-3 h-3 text-blue-600" />
                  <span>Filtrando: <strong className="font-mono">{searchQuery}</strong></span>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="ml-1 text-blue-500 hover:text-blue-900 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Content list with Infinite Scroll */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 bg-gray-50/30"
            >
              {loading ? (
                <div className="py-20 text-center text-gray-500 flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                  <span className="text-xs font-medium">Cargando mensajes y superchats desde la base de datos...</span>
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

                        {sc.superchat_text ? (
                          <div className="mt-2 text-sm font-semibold text-amber-950 bg-white/90 p-3 rounded-lg border border-amber-200 shadow-2xs leading-relaxed break-words">
                            "{sc.superchat_text}"
                          </div>
                        ) : null}
                      </div>
                    ))}

                  {/* Comments list */}
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
                            <button
                              onClick={() => handleSelectAuthor(c.author_id)}
                              title="Filtrar por este autor"
                              className="font-bold text-xs text-gray-900 hover:text-blue-600 font-mono transition-colors cursor-pointer text-left"
                            >
                              {c.author_id}
                            </button>
                            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                              id: #{c.id}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span>{formatDate(c.created_at)}</span>
                          </div>
                        </div>

                        {/* comment_text Body */}
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
                      </div>
                    ))}

                  {/* Empty state */}
                  {((filter === 'superchats' && filteredSuperchats.length === 0) ||
                    (filter === 'comments' && filteredComments.length === 0) ||
                    (filter === 'all' && filteredComments.length === 0 && filteredSuperchats.length === 0)) && (
                    <div className="py-14 text-center text-gray-400 text-xs">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40 text-gray-400" />
                      {searchQuery ? (
                        <p>No se encontraron chats que coincidan con "{searchQuery}".</p>
                      ) : (
                        <p>No se encontraron registros en la tabla para este video_id.</p>
                      )}
                    </div>
                  )}

                  {/* Infinite Scroll Footer / Loader */}
                  {(filter === 'all' || filter === 'comments') && (
                    <div className="pt-2 pb-3 text-center">
                      {isLoadingMore ? (
                        <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 bg-blue-50 px-4 py-2 rounded-full border border-blue-100">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                          <span>Cargando más chats... (20 por lote)</span>
                        </div>
                      ) : hasMoreComments ? (
                        <button
                          onClick={loadMoreComments}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-full border border-blue-200 transition-colors cursor-pointer shadow-2xs hover:shadow-xs"
                        >
                          <ChevronDown className="w-4 h-4" />
                          <span>
                            Cargar más chats ({comments.length} de {totalComments})
                          </span>
                        </button>
                      ) : comments.length > 0 ? (
                        <span className="text-[11px] text-gray-400 font-medium">
                          ✓ Todos los {comments.length} chats han sido cargados.
                        </span>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Solapa de Top Commentators */}
        {activeTab === 'top_commentators' && (
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-gray-50/40">
            <TopCommentatorsList
              videoId={stream.video_id}
              scopeTitle={stream.video_title}
              onSelectAuthor={handleSelectAuthor}
            />
          </div>
        )}

        {/* Tab 3: Consultar con IA (comentada temporalmente por pedido del usuario) */}
        {SHOW_AI_COMMENTS_QUERY && activeTab === 'ai' && (
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 bg-gradient-to-br from-indigo-50/30 via-blue-50/20 to-white">
            <div className="bg-white rounded-2xl border border-blue-100 p-5 shadow-xs">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight">
                    Consulta inteligente con Gemini sobre los chats
                  </h3>
                  <p className="text-xs text-gray-500">
                    Preguntá cualquier cosa sobre la totalidad de mensajes y superchats registrados en la base de datos.
                  </p>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAskAi();
                }}
                className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    placeholder='Ej: "dame comment donde se expresen ideas politicas"'
                    disabled={aiLoading}
                    className="w-full pl-3.5 pr-8 py-2.5 text-xs sm:text-sm bg-white border border-blue-200 focus:border-blue-500 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-gray-900 placeholder:text-gray-400 font-medium shadow-2xs"
                  />
                  {aiQuestion && (
                    <button
                      type="button"
                      onClick={() => setAiQuestion('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={aiLoading || !aiQuestion.trim()}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  {aiLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Analizando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Consultar</span>
                    </>
                  )}
                </button>
              </form>

              {/* Suggestions */}
              <div className="mt-3.5">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Consultas sugeridas:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {quickPrompts.map((qp, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAskAi(qp)}
                      className="text-xs bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 border border-gray-200 hover:border-blue-200 px-3 py-1 rounded-full transition-all cursor-pointer font-medium shadow-3xs"
                    >
                      {qp}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Loading indicator */}
            {aiLoading && (
              <div className="p-5 bg-white rounded-2xl border border-blue-200/80 shadow-xs flex items-center space-x-3.5 animate-pulse">
                <RefreshCw className="w-6 h-6 text-blue-600 animate-spin shrink-0" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-gray-900 text-sm">Analizando chats con Gemini...</p>
                  <p className="text-gray-500">
                    Examinando miles de mensajes y superchats de la base de datos para sintetizar y responder tu consulta.
                  </p>
                </div>
              </div>
            )}

            {/* AI Error */}
            {aiError && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200">
                {aiError}
              </div>
            )}

            {/* AI Answer Card */}
            {aiAnswer && !aiLoading && (
              <div className="p-5 bg-white rounded-2xl border-2 border-blue-200 shadow-md space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-bold text-blue-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      Respuesta del Análisis
                    </span>
                    {aiStats && (
                      <span className="text-[11px] bg-blue-50 text-blue-700 font-semibold px-2.5 py-0.5 rounded-full border border-blue-100">
                        {aiStats.comments} comentarios • {aiStats.superchats} superchats analizados
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleCopyAnswer}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-blue-600 transition-colors cursor-pointer bg-gray-50 hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-gray-200"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copied ? '¡Copiado!' : 'Copiar texto'}</span>
                  </button>
                </div>
                <div className="text-xs sm:text-sm text-gray-800 leading-relaxed font-normal whitespace-pre-wrap select-text">
                  {aiAnswer}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Transcripción & Anuncios */}
        {activeTab === 'captions' && (
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-purple-50/70 p-4 rounded-xl border border-purple-200 shadow-2xs">
              <div className="space-y-1">
                <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Youtube className="w-4 h-4 text-purple-600" />
                  Transcripción y Detección Exhaustiva de Publicidad
                </h4>
                <p className="text-xs text-gray-600">
                  Detecta todos los PNTs hablados, banners, cupones, códigos de descuento y tandas comerciales de la transmisión, sincronizando el reloj en pantalla con las mediciones oficiales.
                </p>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100/80 text-purple-900 rounded-md text-[11px] font-semibold border border-purple-200 mt-1">
                  <Clock className="w-3.5 h-3.5 text-purple-700" />
                  <span>Sincronización dual: <strong>[HH:MM:SS de video | HH:MM hs en pantalla]</strong></span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleGenerateCaptions(Boolean(captions))}
                  disabled={captionsLoading}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {captionsLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sincronizando y procesando...</span>
                    </>
                  ) : captions ? (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Reanalizar y Sincronizar Reloj</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Obtener transcripción y analizar anuncios</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {captionsError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200">
                {captionsError}
              </div>
            )}

            {captionsLoading && (
              <div className="p-6 bg-white rounded-xl border border-purple-100 shadow-xs flex items-center space-x-3.5 animate-pulse">
                <RefreshCw className="w-6 h-6 text-purple-600 animate-spin shrink-0" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-gray-900 text-sm">Analizando transmisión y sincronizando hora en pantalla con Gemini...</p>
                  <p className="text-gray-500">
                    Procesando diálogo de los conductores, transiciones discursivas, PNTs, banners en pantalla, cupones de descuento y tandas comerciales.
                  </p>
                </div>
              </div>
            )}

            {captions && !captionsLoading ? (
              <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Transcripción y Anuncios (Guardado en Tabla Live)
                    </span>
                    <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                      Sincronizado con mediciones
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleGenerateCaptions(true)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-lg border border-purple-200 transition-colors cursor-pointer"
                      title="Volver a analizar y sobrescribir con reloj sincronizado"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reanalizar</span>
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(captions);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-purple-600 transition-colors cursor-pointer bg-gray-50 hover:bg-purple-50 px-2.5 py-1 rounded-lg border border-gray-200"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copied ? '¡Copiado!' : 'Copiar texto'}</span>
                    </button>
                  </div>
                </div>
                <div className="text-xs sm:text-sm text-gray-800 leading-relaxed font-normal whitespace-pre-wrap select-text bg-gray-50 p-4 rounded-xl border border-gray-100 max-h-[480px] overflow-y-auto font-sans">
                  {captions}
                </div>
              </div>
            ) : (
              !captionsLoading && (
                <div className="text-center py-12 text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                  <Youtube className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-xs font-medium">Aún no se ha generado la transcripción para este video.</p>
                  <p className="text-[11px] text-gray-400 mt-1">Haz clic en el botón superior para sincronizar las marcas de tiempo con el reloj en pantalla y detectar todos los anuncios.</p>
                </div>
              )
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500 shrink-0">
          <div className="flex items-center gap-2">
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
