import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { CategoryFilter } from './components/CategoryFilter';
import { RankingStreamCard } from './components/RankingStreamCard';
import { ChannelsPage } from './components/ChannelsPage';
import { ChannelDetailPage } from './components/ChannelDetailPage';
import { SuperchatsRankingPage } from './components/SuperchatsRankingPage';
import { DevSocialModal } from './components/DevSocialModal';
import { StreamCommentsModal } from './components/StreamCommentsModal';
import { Footer } from './components/Footer';
import { CategoryTag, Stream, Channel } from './types';
import { isOctober2026OrLater, formatArgentinaTime } from './utils/dateFilter';
import { RefreshCw, Radio, Sparkles, Clock, AlertCircle, X } from 'lucide-react';
import { SITE_NAME } from './config/site';

export default function App() {
  // Navigation state: path e.g. '/', '/channels', '/channel/@futurock'
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname || '/';
  });

  const [activeCategory, setActiveCategory] = useState<CategoryTag>('all');
  const [streams, setStreams] = useState<Stream[]>([]);
  const [recentStreams, setRecentStreams] = useState<Stream[]>([]);
  const [channelsList, setChannelsList] = useState<Channel[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string>('--:--');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [isSocialModalOpen, setIsSocialModalOpen] = useState<boolean>(false);
  const [selectedCommentsStream, setSelectedCommentsStream] = useState<Stream | null>(null);
  const [isLoadingStreams, setIsLoadingStreams] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isDbErrorDismissed, setIsDbErrorDismissed] = useState<boolean>(false);

  // Fetch live streams and recent 24h streams from real DB
  const fetchLiveData = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setIsLoadingStreams(true);
    }
    setDbError(null);

    try {
      const res = await fetch(`/api/live?tag=${encodeURIComponent(activeCategory)}`);
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // Response was not JSON
      }

      if (res.ok && data?.success) {
        const liveList = (Array.isArray(data.streams) ? data.streams : []).filter(
          (s: Stream) => isOctober2026OrLater(s.scrape_date) || isOctober2026OrLater(s.start_date)
        );
        const recentList = (Array.isArray(data.recent_streams) ? data.recent_streams : []).filter(
          (s: Stream) => isOctober2026OrLater(s.scrape_date) || isOctober2026OrLater(s.start_date)
        );
        setStreams(liveList);
        setRecentStreams(recentList);

        // Find the most recent scrape_date among all retrieved streams
        const allDates = [...liveList, ...recentList]
          .map((s: any) => s.scrape_date)
          .filter(Boolean);

        if (allDates.length > 0) {
          const maxDateStr = allDates.sort().reverse()[0];
          setLastUpdate(formatArgentinaTime(maxDateStr));
        }
      } else {
        const errorMessage =
          data?.error ||
          data?.message ||
          (res.ok
            ? 'Error al obtener streams de la base de datos'
            : `Error del servidor (HTTP ${res.status}: ${res.statusText || 'Error de conexión'})`);
        setDbError(errorMessage);
        setStreams([]);
        setRecentStreams([]);
      }
    } catch (err: any) {
      setDbError(err.message || 'Error de conexión de red');
      setStreams([]);
      setRecentStreams([]);
    } finally {
      setIsLoadingStreams(false);
      setIsRefreshing(false);
    }
  }, [activeCategory]);

  // Fetch channels list from real DB
  const fetchChannelsData = useCallback(async () => {
    try {
      const res = await fetch('/api/channels');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.channels)) {
          setChannelsList(data.channels);
        } else {
          setChannelsList([]);
        }
      } else {
        setChannelsList([]);
      }
    } catch (err) {
      console.error('Error fetching channels:', err);
      setChannelsList([]);
    }
  }, []);

  // Set document title dynamically with SITE_NAME
  useEffect(() => {
    document.title = `${SITE_NAME} - Ranking de Streaming en Vivo`;
  }, []);

  // Initial fetch on mount & category change
  useEffect(() => {
    fetchLiveData();
  }, [fetchLiveData]);

  useEffect(() => {
    fetchChannelsData();
  }, [fetchChannelsData]);

  // Real Database Polling every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchLiveData(true); // background silent update
    }, 300000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchLiveData]);

  // Manual refresh button
  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setIsDbErrorDismissed(false);
    fetchLiveData(false);
    fetchChannelsData();
  };

  // Sync URL history state
  const navigate = useCallback((path: string) => {
    setCurrentPath(path);
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Listen for browser back / forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Check URL query parameters on load (e.g., ?dev=true or ?tag=stream)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('dev')) {
      setIsSocialModalOpen(true);
    }
    const tag = params.get('tag');
    if (tag && ['stream', 'tv', 'entretenimiento', 'radio', 'política', 'deportes', 'all'].includes(tag)) {
      setActiveCategory(tag as CategoryTag);
    }
  }, []);

  // Aggregated live stats from real streams
  const totalLiveViewers = useMemo(() => {
    return streams.reduce((acc, curr) => acc + (Number(curr?.concurrent_viewers) || 0), 0);
  }, [streams]);

  const totalLikes = useMemo(() => {
    return streams.reduce((acc, curr) => acc + (Number(curr?.current_likes) || 0), 0);
  }, [streams]);

  // Handle Channel Route parsing: `/channel/:id` or `/channel/@handle`
  const isChannelDetail = currentPath.startsWith('/channel/');
  const currentChannelIdentifier = isChannelDetail
    ? decodeURIComponent(currentPath.replace('/channel/', '')).toLowerCase()
    : null;

  const currentChannel = useMemo(() => {
    if (!currentChannelIdentifier) return null;
    const withAt = currentChannelIdentifier.startsWith('@') ? currentChannelIdentifier : `@${currentChannelIdentifier}`;
    const withoutAt = currentChannelIdentifier.startsWith('@') ? currentChannelIdentifier.substring(1) : currentChannelIdentifier;

    const found = channelsList.find(
      (c) =>
        c &&
        ((c.channel || '').toLowerCase() === withAt ||
          (c.channel || '').toLowerCase() === withoutAt ||
          (c.channel_id || '').toLowerCase() === currentChannelIdentifier ||
          (c.channel_name || '').toLowerCase() === currentChannelIdentifier)
    );

    if (found) return found;

    // Default object so ChannelDetailPage can request /api/channel/:id and populate
    return {
      channel_id: currentChannelIdentifier,
      channel: withAt,
      channel_name: withoutAt,
      description: 'Canal de streaming',
      subs: 0,
      thumb: `https://yt3.ggpht.com/`,
      tags: 'stream',
      avg_viewers: 0,
      avg_likes: 0,
    };
  }, [currentChannelIdentifier, channelsList]);

  const currentChannelLiveStream = useMemo(() => {
    if (!currentChannel) return undefined;
    return streams.find(
      (s) =>
        s &&
        s.live === 'live' &&
        (s.channel_id === currentChannel.channel_id ||
          (s.channel || '').toLowerCase() === (currentChannel.channel || '').toLowerCase())
    );
  }, [currentChannel, streams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-gray-100 text-gray-900 relative selection:bg-blue-100 selection:text-blue-900">
      {/* Decorative ambient gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-blue-400/10 to-purple-600/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] h-[32rem] bg-gradient-to-br from-teal-400/10 to-indigo-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-rose-400/10 to-orange-400/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Navigation Bar */}
        <Header
          currentPath={currentPath}
          onNavigate={navigate}
          lastUpdate={lastUpdate}
          onRefresh={handleManualRefresh}
          isSimulating={autoRefresh}
          onToggleSimulate={() => setAutoRefresh(!autoRefresh)}
          onOpenSocialModal={() => setIsSocialModalOpen(true)}
        />

        {/* Main Content Area */}
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
          {/* DB error banner if any */}
          {dbError && !isDbErrorDismissed && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col gap-2.5 text-amber-900 text-sm shadow-sm relative animate-in fade-in duration-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <span className="font-semibold text-amber-950">{dbError}</span>
                </div>
                <button
                  onClick={() => setIsDbErrorDismissed(true)}
                  className="text-amber-500 hover:text-amber-800 hover:bg-amber-100 p-1 rounded-md transition-colors shrink-0"
                  title="Cerrar aviso"
                  aria-label="Cerrar aviso"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pl-7 text-xs text-amber-800">
                <span>
                  Para conectar con PostgreSQL en Vercel, agrega las variables en{' '}
                  <strong className="font-semibold">Vercel Dashboard → Project Settings → Environment Variables</strong>.
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1.5 font-medium bg-amber-200 hover:bg-amber-300 text-amber-900 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Reintentar
                  </button>
                  <a
                    href="/api/status"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded transition-colors"
                  >
                    Diagnóstico /api/status ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Route: Canales Directory */}
          {currentPath === '/channels' ? (
            <ChannelsPage
              channels={channelsList}
              onNavigateChannel={(handle) => navigate(`/channel/${handle}`)}
            />
          ) : currentPath === '/superchats' ? (
            /* Route: Superchats Ranking */
            <SuperchatsRankingPage
              onNavigateChannel={(handle) => navigate(`/channel/${handle}`)}
              onOpenStreamComments={(streamStub) => setSelectedCommentsStream(streamStub as any)}
            />
          ) : isChannelDetail && currentChannel ? (
            /* Route: Channel Detail */
            <ChannelDetailPage
              channel={currentChannel}
              liveStream={currentChannelLiveStream}
              onBack={() => navigate('/')}
            />
          ) : (
            /* Route: Home / Ranking */
            <div>
              <HeroSection
                totalLiveViewers={totalLiveViewers}
                activeStreamsCount={streams.length}
                totalLikes={totalLikes}
                lastUpdate={lastUpdate}
                isLoading={isLoadingStreams && streams.length === 0}
                onExploreChannels={() => navigate('/channels')}
                onScrollToLive={() => {
                  const el = document.getElementById('live');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              />

              {/* Category Filter */}
              <div id="categorias">
                <CategoryFilter
                  activeCategory={activeCategory}
                  onSelectCategory={setActiveCategory}
                />
              </div>

              {/* Ranking Live Streams */}
              <div id="live" className="space-y-4 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                        Ranking En Vivo
                      </h2>
                      {streams.length > 0 && (
                        <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                          {streams.length} transmitiendo
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                      Canales ordenados por audiencia concurrente real extraída de la base de datos
                    </p>
                  </div>
                  {/*<div className="flex items-center gap-2 self-start sm:self-auto">
                    <div className="text-xs sm:text-sm text-gray-500 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-2xs flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      <span>Último scrapeo:</span>
                      <strong className="text-gray-900">{lastUpdate}</strong>
                    </div>
                    {isRefreshing && (
                      <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg animate-spin">
                        <RefreshCw className="w-4 h-4" />
                      </div>
                    )}
                  </div>*/}
                </div>

                {isLoadingStreams && streams.length === 0 ? (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <div
                        key={i}
                        className="bg-white rounded-xl p-6 border border-gray-100 animate-pulse flex items-center space-x-4"
                      >
                        <div className="w-12 h-12 rounded-full bg-gray-200"></div>
                        <div className="w-16 h-16 rounded-full bg-gray-200"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                          <div className="h-3 bg-gray-100 rounded w-2/3"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : streams.length === 0 ? (
                  <div className="bg-white rounded-xl p-10 text-center border border-gray-200 text-gray-500 space-y-2">
                    <p className="text-base font-semibold text-gray-700">
                      No hay canales transmitiendo en vivo en este momento
                    </p>
                    <p className="text-xs text-gray-500">
                      Revisá más abajo las transmisiones destacadas finalizadas en las últimas 24 horas.
                    </p>
                  </div>
                ) : (
                  streams.map((stream, idx) => (
                    <RankingStreamCard
                      key={stream.video_id}
                      stream={stream}
                      index={idx}
                      onNavigateChannel={(channel) => navigate(`/channel/${channel}`)}
                      onOpenComments={(s) => setSelectedCommentsStream(s)}
                    />
                  ))
                )}
              </div>

              {/* Transmisiones Recientes (Últimas 24 hs de la DB) */}
              {recentStreams.length > 0 && (
                <div className="mt-12 pt-6 border-t border-gray-200/80 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                        <span>Transmisiones Recientes</span>
                        <span className="text-xs bg-gray-100 text-gray-700 font-semibold px-2.5 py-0.5 rounded-full">
                          Últimas 24 hs
                        </span>
                      </h3>
                      <p className="text-xs text-gray-500">
                        Historial de directos finalizados registrados en la base de datos
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {recentStreams.map((stream, idx) => (
                      <div
                        key={stream.video_id}
                        className="bg-white/90 rounded-xl p-4 sm:p-5 border border-gray-200/80 shadow-2xs hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-start sm:items-center space-x-3.5 min-w-0 flex-1">
                          <button
                            onClick={() => navigate(`/channel/${stream.channel}`)}
                            className="shrink-0 focus:outline-none cursor-pointer"
                          >
                            <img
                              src={stream.thumb || `https://i.ytimg.com/vi/${stream.video_id}/hqdefault.jpg`}
                              alt={stream.channel_name}
                              className="w-12 h-12 rounded-full object-cover border-2 border-gray-100"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${stream.video_id}/hqdefault.jpg`;
                              }}
                            />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => navigate(`/channel/${stream.channel}`)}
                                className="font-bold text-gray-900 text-sm sm:text-base hover:text-blue-600 transition-colors text-left"
                              >
                                {stream.channel_name}
                              </button>
                              <span className="text-xs text-gray-400 font-mono">
                                {stream.channel}
                              </span>
                              <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">
                                Finalizado
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 truncate mt-0.5" title={stream.video_title}>
                              {stream.video_title || 'Emisión finalizada'}
                            </p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <button
                                onClick={() => navigate(`/channel/${stream.channel}`)}
                                className="bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors cursor-pointer"
                              >
                                Ver Stats
                              </button>
                              <button
                                onClick={() => setSelectedCommentsStream(stream)}
                                className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 cursor-pointer border border-blue-200/50"
                              >
                                💬 Comments ({typeof stream.unique_commentators === 'number' ? stream.unique_commentators : (stream.comments_count || 0)})
                              </button>
                              {Number(stream.superchats_total) > 0 && (
                                <button
                                  onClick={() => setSelectedCommentsStream(stream)}
                                  className="bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 cursor-pointer border border-amber-300"
                                >
                                  💰 ${stream.superchats_total} ARS
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                          <div className="text-right">
                            <div className="text-xs text-gray-400">Espectadores pico</div>
                            <div className="text-base sm:text-lg font-extrabold text-gray-900">
                              {new Intl.NumberFormat('es-AR').format(stream.concurrent_viewers)}
                            </div>
                          </div>
                          {stream.video_id && (
                            <a
                              href={`https://youtube.com/watch?v=${stream.video_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                            >
                              ▶ YouTube
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer Component */}
          <Footer />
        </main>
      </div>

      {/* Dev / Twitter Status Modal */}
      <DevSocialModal
        isOpen={isSocialModalOpen}
        onClose={() => setIsSocialModalOpen(false)}
        streams={streams}
        lastUpdate={lastUpdate}
      />

      {/* Stream Comments & Superchats Modal */}
      {selectedCommentsStream && (
        <StreamCommentsModal
          stream={selectedCommentsStream}
          isOpen={Boolean(selectedCommentsStream)}
          onClose={() => setSelectedCommentsStream(null)}
        />
      )}
    </div>
  );
}
