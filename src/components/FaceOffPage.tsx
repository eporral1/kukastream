import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Channel, Stream } from '../types';
import { formatNumber, formatSubs } from '../data/mockData';
import { isOctober2026OrLater } from '../utils/dateFilter';
import { SITE_NAME } from '../config/site';
import {
  Swords,
  Trophy,
  Users,
  Heart,
  MessageSquare,
  TrendingUp,
  Zap,
  Flame,
  ArrowLeftRight,
  Share2,
  Check,
  ExternalLink,
  Coins,
  Radio,
  Search,
  ChevronDown
} from 'lucide-react';

interface FaceOffPageProps {
  channelsList: Channel[];
  onNavigateChannel: (handle: string) => void;
}

interface ChannelDetailData {
  channel: Channel;
  live?: Stream;
  streams: Stream[];
}

export const FaceOffPage: React.FC<FaceOffPageProps> = ({
  channelsList,
  onNavigateChannel,
}) => {
  // Read initial query params ?ch1=...&ch2=...
  const urlParams = new URLSearchParams(window.location.search);
  const initialCh1 = urlParams.get('ch1') || (channelsList[0]?.channel || '@VorterixOficial');
  const initialCh2 = urlParams.get('ch2') || (channelsList[1]?.channel || '@SomosGelatina');

  const [selectedIdA, setSelectedIdA] = useState<string>(initialCh1);
  const [selectedIdB, setSelectedIdB] = useState<string>(initialCh2);

  const [dataA, setDataA] = useState<ChannelDetailData | null>(null);
  const [dataB, setDataB] = useState<ChannelDetailData | null>(null);

  const [loadingA, setLoadingA] = useState<boolean>(true);
  const [loadingB, setLoadingB] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Search dropdown states
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [openDropdownA, setOpenDropdownA] = useState(false);
  const [openDropdownB, setOpenDropdownB] = useState(false);

  // Sync with available channels list if initial was empty
  useEffect(() => {
    if (channelsList.length >= 2) {
      if (!selectedIdA && channelsList[0]?.channel) {
        setSelectedIdA(channelsList[0].channel);
      }
      if (!selectedIdB && channelsList[1]?.channel) {
        setSelectedIdB(channelsList[1].channel);
      }
    }
  }, [channelsList, selectedIdA, selectedIdB]);

  // Update URL search params when channels change
  useEffect(() => {
    if (selectedIdA && selectedIdB) {
      const url = new URL(window.location.href);
      url.searchParams.set('ch1', selectedIdA);
      url.searchParams.set('ch2', selectedIdB);
      window.history.replaceState({}, '', url.toString());
    }
  }, [selectedIdA, selectedIdB]);

  // Fetch full details for Channel A
  const fetchChannelData = useCallback(async (identifier: string, isA: boolean) => {
    if (!identifier) return;
    if (isA) setLoadingA(true);
    else setLoadingB(true);

    try {
      const res = await fetch(`/api/channel?id=${encodeURIComponent(identifier)}`, {
        headers: {
          'X-App-Client': 'kukastream-web',
        },
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.success && json.channel) {
        const liveData = json.live?.live === 'live' &&
          (isOctober2026OrLater(json.live.scrape_date) || isOctober2026OrLater(json.live.start_date))
            ? json.live
            : undefined;

        const rawStreams = json.streams || json.history || [];
        const filteredStreams = rawStreams.filter(
          (s: Stream) => isOctober2026OrLater(s.scrape_date) || isOctober2026OrLater(s.start_date)
        );

        const channelResult: ChannelDetailData = {
          channel: json.channel,
          live: liveData,
          streams: filteredStreams,
        };

        if (isA) setDataA(channelResult);
        else setDataB(channelResult);
      }
    } catch (err) {
      console.error(`Error loading face-off channel: ${identifier}`, err);
    } finally {
      if (isA) setLoadingA(false);
      else setLoadingB(false);
    }
  }, []);

  useEffect(() => {
    if (selectedIdA) fetchChannelData(selectedIdA, true);
  }, [selectedIdA, fetchChannelData]);

  useEffect(() => {
    if (selectedIdB) fetchChannelData(selectedIdB, false);
  }, [selectedIdB, fetchChannelData]);

  // Swap channels
  const handleSwap = () => {
    const tempId = selectedIdA;
    setSelectedIdA(selectedIdB);
    setSelectedIdB(tempId);
  };

  // Preset matchups
  const presets = [
    { label: 'Vorterix vs Gelatina', ch1: '@VorterixOficial', ch2: '@SomosGelatina' },
    { label: 'Futurock vs Carajo', ch1: '@futurock', ch2: '@carajostream' },
    { label: 'Urbana Play vs Radio Con Vos', ch1: '@UrbanaPlayFM', ch2: '@RadioConVos89.9' },
    { label: 'Infobae vs Longobardi', ch1: '@Infobae', ch2: '@LongobardiM' },
  ];

  const [superchatsMap, setSuperchatsMap] = useState<Record<string, { total_ars: number; count: number }>>({});

  // Pre-load official superchats ranking map to match /superchats exactly
  useEffect(() => {
    fetch('/api/superchats-ranking')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.top_channels)) {
          const map: Record<string, { total_ars: number; count: number }> = {};
          for (const ch of d.top_channels) {
            if (ch.channel) map[ch.channel.toLowerCase()] = { total_ars: Number(ch.total_ars || 0), count: Number(ch.superchats_count || 0) };
            if (ch.channel_id) map[ch.channel_id] = { total_ars: Number(ch.total_ars || 0), count: Number(ch.superchats_count || 0) };
          }
          setSuperchatsMap(map);
        }
      })
      .catch(() => {});
  }, []);

  // Helper to extract aggregated metrics from a channel detail object using the exact same formulas as the rest of the site
  const getMetrics = (data: ChannelDetailData | null, fallbackChannel?: Channel) => {
    const channel = data?.channel || fallbackChannel;
    const streams = data?.streams || [];
    const live = data?.live;

    // Subs, averages from official channel stats
    const subs = Number(channel?.subs || fallbackChannel?.subs || 0);
    const avgViewers = Number(channel?.avg_viewers || fallbackChannel?.avg_viewers || 0);
    const avgLikes = Number(channel?.avg_likes || fallbackChannel?.avg_likes || 0);
    const avgComments = Number(channel?.avg_comments || fallbackChannel?.avg_comments || 0);

    // Peak Viewers: database peak or highest across streams / current live
    const streamViewers = streams.map((s) => Number(s.concurrent_viewers || s.max_users || 0));
    const peakViewers = Math.max(
      Number(channel?.peak_viewers || 0),
      ...streamViewers,
      live ? Number(live.concurrent_viewers || 0) : 0
    );

    // Peak Likes: database peak or highest across streams / current live
    const streamLikes = streams.map((s) => Number(s.current_likes || s.max_likes || 0));
    const peakLikes = Math.max(
      Number(channel?.peak_likes || 0),
      ...streamLikes,
      live ? Number(live.current_likes || 0) : 0
    );

    // Peak Comments: database peak or highest across streams / current live
    const streamComments = streams.map((s) => Number(s.comments_count || 0));
    const peakComments = Math.max(
      Number(channel?.peak_comments || 0),
      ...streamComments,
      live ? Number(live.comments_count || 0) : 0
    );

    // Totals: from database or summed across all retrieved streams
    const totalLikes = Number(channel?.total_likes || 0) ||
      (streams.reduce((acc, s) => acc + (Number(s.current_likes) || 0), 0) + (live ? Number(live.current_likes || 0) : 0));

    const totalComments = Number(channel?.total_comments || 0) ||
      (streams.reduce((acc, s) => acc + (Number(s.comments_count) || 0), 0) + (live ? Number(live.comments_count || 0) : 0));

    // Superchats: match /superchats exactly via superchatsMap or channel.superchats_total_ars
    const scFromMap = superchatsMap[(channel?.channel || '').toLowerCase()] ||
      superchatsMap[channel?.channel_id || ''] ||
      superchatsMap[(fallbackChannel?.channel || '').toLowerCase()] ||
      superchatsMap[fallbackChannel?.channel_id || ''];

    let totalSuperchatsArs = scFromMap?.total_ars;
    if (totalSuperchatsArs === undefined || totalSuperchatsArs === null) {
      totalSuperchatsArs = Number(channel?.superchats_total_ars || fallbackChannel?.superchats_total_ars || 0);
    }
    if (!totalSuperchatsArs) {
      // Fallback: sum from stream objects if available
      const streamsScTotal = streams.reduce((acc, s) => {
        let streamSc = Number(s.superchats_total || 0);
        if (!streamSc && Array.isArray(s.superchats)) {
          const ars = s.superchats.find((item: any) => item.currency === 'ARS' || String(item.currency).toUpperCase().includes('ARS'));
          streamSc = Number(ars?.total_amount || 0);
        }
        return acc + streamSc;
      }, 0);
      const liveScTotal = Number(live?.superchats_total || 0);
      totalSuperchatsArs = streamsScTotal + liveScTotal;
    }

    let superchatsCount = scFromMap?.count;
    if (superchatsCount === undefined || superchatsCount === null) {
      superchatsCount = Number(channel?.superchats_count || fallbackChannel?.superchats_count || 0);
    }

    const totalStreams = Number(channel?.total_streams || 0) || (streams.length + (live ? 1 : 0));
    const isLive = live?.live === 'live';
    const liveViewers = isLive ? Number(live.concurrent_viewers || 0) : 0;

    return {
      channel,
      subs,
      avgViewers,
      avgLikes,
      avgComments,
      peakViewers,
      peakLikes,
      peakComments,
      totalLikes,
      totalComments,
      totalSuperchatsArs,
      superchatsCount,
      totalStreams,
      isLive,
      liveViewers,
    };
  };

  const channelAInfo = channelsList.find((c) => c.channel === selectedIdA || c.channel_id === selectedIdA);
  const channelBInfo = channelsList.find((c) => c.channel === selectedIdB || c.channel_id === selectedIdB);

  const metricsA = useMemo(() => getMetrics(dataA, channelAInfo), [dataA, channelAInfo, superchatsMap]);
  const metricsB = useMemo(() => getMetrics(dataB, channelBInfo), [dataB, channelBInfo, superchatsMap]);

  // Comparison definitions
  const comparisonList = useMemo(() => {
    return [
      {
        id: 'avg_viewers',
        title: 'Promedio de Espectadores',
        description: 'Audiencia concurrente media habitual por emisión',
        valA: metricsA.avgViewers,
        valB: metricsB.avgViewers,
        format: (v: number) => formatNumber(v),
        icon: Users,
      },
      {
        id: 'peak_viewers',
        title: 'Pico Máximo de Espectadores',
        description: 'Récord de concurrencia simultánea alcanzado',
        valA: metricsA.peakViewers,
        valB: metricsB.peakViewers,
        format: (v: number) => formatNumber(v),
        icon: Flame,
      },
      {
        id: 'subs',
        title: 'Suscriptores',
        description: 'Comunidad total registrada en YouTube',
        valA: metricsA.subs,
        valB: metricsB.subs,
        format: (v: number) => formatSubs(v),
        icon: Zap,
      },
      {
        id: 'avg_likes',
        title: 'Likes por Hora',
        description: 'Velocidad de Me Gusta recibidos en vivo',
        valA: metricsA.avgLikes,
        valB: metricsB.avgLikes,
        format: (v: number) => `${formatNumber(v)}/h`,
        icon: Heart,
      },
      {
        id: 'avg_comments',
        title: 'Mensajes por Hora',
        description: 'Ritmo de mensajes en el chat durante el directo',
        valA: metricsA.avgComments,
        valB: metricsB.avgComments,
        format: (v: number) => `${formatNumber(v)}/h`,
        icon: MessageSquare,
      },
      {
        id: 'total_likes',
        title: 'Total de Likes Acumulados',
        description: 'Suma de Me Gusta en todas las transmisiones',
        valA: metricsA.totalLikes,
        valB: metricsB.totalLikes,
        format: (v: number) => formatNumber(v),
        icon: Heart,
      },
      {
        id: 'total_comments',
        title: 'Total de Mensajes Acumulados',
        description: 'Interacciones totales registradas en el chat',
        valA: metricsA.totalComments,
        valB: metricsB.totalComments,
        format: (v: number) => formatNumber(v),
        icon: MessageSquare,
      },
      {
        id: 'peak_likes',
        title: 'Pico de Likes en un Stream',
        description: 'Máximo número de Me Gusta en una sola transmisión',
        valA: metricsA.peakLikes,
        valB: metricsB.peakLikes,
        format: (v: number) => formatNumber(v),
        icon: TrendingUp,
      },
      {
        id: 'superchats_total',
        title: 'Superchats Recaudados (ARS)',
        description: 'Monto total aportado por la audiencia en pesos',
        valA: metricsA.totalSuperchatsArs,
        valB: metricsB.totalSuperchatsArs,
        format: (v: number) => `$${formatNumber(v)}`,
        icon: Coins,
      },
    ];
  }, [metricsA, metricsB]);

  // Calculate score tally (how many categories each channel leads)
  const score = useMemo(() => {
    let scoreA = 0;
    let scoreB = 0;
    comparisonList.forEach((item) => {
      if (item.valA > item.valB) scoreA++;
      else if (item.valB > item.valA) scoreB++;
    });
    return { scoreA, scoreB };
  }, [comparisonList]);

  // Copy shareable link
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Share to X
  const handleShareX = () => {
    const nameA = metricsA.channel?.channel_name || 'Canal A';
    const nameB = metricsB.channel?.channel_name || 'Canal B';
    const text = encodeURIComponent(
      `🥊 FACE-OFF DE STREAMING: ${nameA} vs ${nameB} (${SITE_NAME})\n\n` +
      `📊 Marcador: ${score.scoreA} a ${score.scoreB}\n` +
      `👥 Audiencia Media: ${formatNumber(metricsA.avgViewers)} vs ${formatNumber(metricsB.avgViewers)}\n` +
      `🔥 Picos: ${formatNumber(metricsA.peakViewers)} vs ${formatNumber(metricsB.peakViewers)}\n\n` +
      `Mirá la comparativa completa acá:\n${window.location.href}`
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  const filteredChannelsA = channelsList.filter((c) =>
    c.channel !== '@Radio10am' && (
    (c.channel_name || '').toLowerCase().includes(searchA.toLowerCase()) ||
    (c.channel || '').toLowerCase().includes(searchA.toLowerCase()))
  );

  const filteredChannelsB = channelsList.filter((c) =>
    c.channel !== '@Radio10am' && (
    (c.channel_name || '').toLowerCase().includes(searchB.toLowerCase()) ||
    (c.channel || '').toLowerCase().includes(searchB.toLowerCase()))
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-16">
      {/* Top Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center space-x-2 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3.5 py-1.5 rounded-full text-xs font-semibold">
          <Swords className="w-3.5 h-3.5 text-indigo-600" />
          <span className="uppercase tracking-wider">Métricas Cara a Cara</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 tracking-tight">
          Face-Off de Canales
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Elegí dos canales para comparar sus estadísticas en vivo: audiencia, picos máximos, promedios, interacción y recaudación histórica.
        </p>

        {/* Preset quick buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <span className="text-xs text-gray-400 font-medium">Duelos sugeridos:</span>
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setSelectedIdA(p.ch1);
                setSelectedIdB(p.ch2);
              }}
              className="text-xs bg-white hover:bg-gray-50 text-gray-700 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selectors & Fighter Cards */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-stretch max-w-5xl mx-auto">
        {/* Corner Left: Channel A */}
        <div className="md:col-span-4 bg-white border-2 border-blue-200/80 rounded-2xl p-4 shadow-sm relative flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                Esquina Azul
              </span>
              {metricsA.isLive && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                  <Radio className="w-3 h-3" />
                  EN VIVO ({formatNumber(metricsA.liveViewers)})
                </span>
              )}
            </div>

            {/* Selector Dropdown A */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenDropdownA(!openDropdownA)}
                className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-2.5 py-2 text-left flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src={metricsA.channel?.thumb || 'https://yt3.ggpht.com/'}
                    alt={metricsA.channel?.channel_name || 'Canal'}
                    className="w-6 h-6 rounded-full object-cover shrink-0 border border-gray-200"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://yt3.ggpht.com/';
                    }}
                  />
                  <div className="truncate">
                    <div className="text-xs font-bold text-gray-900 truncate">
                      {metricsA.channel?.channel_name || 'Seleccionar canal'}
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      {metricsA.channel?.channel || ''}
                    </div>
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1.5" />
              </button>

              {openDropdownA && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-2 max-h-72 overflow-y-auto">
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Buscar canal..."
                      value={searchA}
                      onChange={(e) => setSearchA(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    {filteredChannelsA.map((ch) => (
                      <button
                        key={ch.channel_id || ch.channel}
                        onClick={() => {
                          setSelectedIdA(ch.channel || ch.channel_id);
                          setOpenDropdownA(false);
                          setSearchA('');
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                          selectedIdA === ch.channel || selectedIdA === ch.channel_id
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <img
                          src={ch.thumb}
                          alt={ch.channel_name}
                          className="w-5 h-5 rounded-full object-cover border border-gray-200"
                        />
                        <div className="truncate flex-1">
                          <span className="font-semibold block truncate">{ch.channel_name}</span>
                          <span className="text-[10px] text-gray-400 font-mono">{ch.channel}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 shrink-0">{formatSubs(ch.subs)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Channel A Profile summary (sin descripción) */}
            <div className="text-center pt-1 pb-1">
              <img
                src={metricsA.channel?.thumb || 'https://yt3.ggpht.com/'}
                alt={metricsA.channel?.channel_name || 'Canal'}
                className="w-16 h-16 rounded-full mx-auto object-cover border-3 border-blue-100 shadow-sm mb-2"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://yt3.ggpht.com/';
                }}
              />
              <h2 className="text-base font-black text-gray-900 truncate">
                {metricsA.channel?.channel_name || 'Cargando...'}
              </h2>
              <button
                onClick={() => onNavigateChannel(metricsA.channel?.channel || '')}
                className="text-xs text-blue-600 hover:underline font-mono inline-flex items-center gap-1 mt-0.5"
              >
                <span>{metricsA.channel?.channel}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>Subs: <strong className="text-gray-900">{formatSubs(metricsA.subs)}</strong></span>
            <span>Streams: <strong className="text-gray-900">{metricsA.totalStreams}</strong></span>
          </div>
        </div>

        {/* Middle: VS, Score & Badges of who wins each item */}
        <div className="md:col-span-4 bg-white border border-gray-200/90 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            {/* Top row: Scoreboard centered and bigger, Swap button on the right */}
            <div className="relative flex items-center justify-center pb-2.5 border-b border-gray-100">
              <div className="inline-flex items-center gap-3 px-4 py-1 rounded-xl bg-gray-100/90 text-gray-900 shadow-2xs">
                <span className="text-2xl sm:text-3xl font-black text-blue-600 tabular-nums">
                  {score.scoreA}
                </span>
                <span className="text-base font-extrabold text-gray-400">
                  -
                </span>
                <span className="text-2xl sm:text-3xl font-black text-rose-600 tabular-nums">
                  {score.scoreB}
                </span>
              </div>
              <button
                onClick={handleSwap}
                title="Invertir canales"
                className="absolute right-0 p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-indigo-600 transition-colors cursor-pointer border border-gray-200 shadow-2xs"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
            </div>

            {/* Badges: Who wins each item */}
            <div className="pt-2.5 space-y-1.5">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                Ganador por Métrica
              </div>
              <div className="space-y-1">
                {comparisonList.map((item) => {
                  const isWinnerA = item.valA > item.valB;
                  const isWinnerB = item.valB > item.valA;
                  const isTie = item.valA === item.valB;
                  const shortTitles: Record<string, string> = {
                    avg_viewers: 'Espectadores',
                    peak_viewers: 'Pico máx',
                    subs: 'Suscriptores',
                    avg_likes: 'Likes / hora',
                    avg_comments: 'Msgs / hora',
                    total_likes: 'Total likes',
                    total_comments: 'Total msgs',
                    peak_likes: 'Pico likes',
                    superchats_total: 'Superchats',
                  };
                  const label = shortTitles[item.id] || item.title;

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-[11px] py-1 px-2 rounded-lg bg-gray-50/80 hover:bg-gray-100/70 transition-colors border border-gray-100"
                    >
                      <span className="text-gray-600 font-medium truncate flex items-center gap-1.5 max-w-[110px]">
                        <item.icon className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="truncate">{label}</span>
                      </span>
                      {isWinnerA ? (
                        <span className="inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 shadow-2xs">
                          <span>👑</span>
                          <span className="truncate max-w-[95px]">{metricsA.channel?.channel_name || 'Azul'}</span>
                        </span>
                      ) : isWinnerB ? (
                        <span className="inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 shadow-2xs">
                          <span>👑</span>
                          <span className="truncate max-w-[95px]">{metricsB.channel?.channel_name || 'Rojo'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                          Empate
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-gray-100 text-center text-[11px] text-gray-500">
            {score.scoreA > score.scoreB ? (
              <span className="font-semibold text-blue-600">
                👑 Lidera {metricsA.channel?.channel_name || 'Esquina Azul'} ({score.scoreA} a {score.scoreB})
              </span>
            ) : score.scoreB > score.scoreA ? (
              <span className="font-semibold text-rose-600">
                👑 Lidera {metricsB.channel?.channel_name || 'Esquina Roja'} ({score.scoreB} a {score.scoreA})
              </span>
            ) : (
              <span className="font-medium text-gray-600">🤝 Empate general en métricas</span>
            )}
          </div>
        </div>

        {/* Corner Right: Channel B */}
        <div className="md:col-span-4 bg-white border-2 border-rose-200/80 rounded-2xl p-4 shadow-sm relative flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                Esquina Roja
              </span>
              {metricsB.isLive && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                  <Radio className="w-3 h-3" />
                  EN VIVO ({formatNumber(metricsB.liveViewers)})
                </span>
              )}
            </div>

            {/* Selector Dropdown B */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenDropdownB(!openDropdownB)}
                className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-2.5 py-2 text-left flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src={metricsB.channel?.thumb || 'https://yt3.ggpht.com/'}
                    alt={metricsB.channel?.channel_name || 'Canal'}
                    className="w-6 h-6 rounded-full object-cover shrink-0 border border-gray-200"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://yt3.ggpht.com/';
                    }}
                  />
                  <div className="truncate">
                    <div className="text-xs font-bold text-gray-900 truncate">
                      {metricsB.channel?.channel_name || 'Seleccionar canal'}
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      {metricsB.channel?.channel || ''}
                    </div>
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1.5" />
              </button>

              {openDropdownB && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-2 max-h-72 overflow-y-auto">
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Buscar canal..."
                      value={searchB}
                      onChange={(e) => setSearchB(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    {filteredChannelsB.map((ch) => (
                      <button
                        key={ch.channel_id || ch.channel}
                        onClick={() => {
                          setSelectedIdB(ch.channel || ch.channel_id);
                          setOpenDropdownB(false);
                          setSearchB('');
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                          selectedIdB === ch.channel || selectedIdB === ch.channel_id
                            ? 'bg-rose-50 text-rose-700 font-semibold'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <img
                          src={ch.thumb}
                          alt={ch.channel_name}
                          className="w-5 h-5 rounded-full object-cover border border-gray-200"
                        />
                        <div className="truncate flex-1">
                          <span className="font-semibold block truncate">{ch.channel_name}</span>
                          <span className="text-[10px] text-gray-400 font-mono">{ch.channel}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 shrink-0">{formatSubs(ch.subs)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Channel B Profile summary (sin descripción) */}
            <div className="text-center pt-1 pb-1">
              <img
                src={metricsB.channel?.thumb || 'https://yt3.ggpht.com/'}
                alt={metricsB.channel?.channel_name || 'Canal'}
                className="w-16 h-16 rounded-full mx-auto object-cover border-3 border-rose-100 shadow-sm mb-2"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://yt3.ggpht.com/';
                }}
              />
              <h2 className="text-base font-black text-gray-900 truncate">
                {metricsB.channel?.channel_name || 'Cargando...'}
              </h2>
              <button
                onClick={() => onNavigateChannel(metricsB.channel?.channel || '')}
                className="text-xs text-rose-600 hover:underline font-mono inline-flex items-center gap-1 mt-0.5"
              >
                <span>{metricsB.channel?.channel}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>Subs: <strong className="text-gray-900">{formatSubs(metricsB.subs)}</strong></span>
            <span>Streams: <strong className="text-gray-900">{metricsB.totalStreams}</strong></span>
          </div>
        </div>
      </div>

      {/* Share / Actions Bar */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={handleCopyLink}
          className="inline-flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-800 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-gray-200 shadow-2xs transition-colors cursor-pointer"
        >
          {copiedLink ? <Check className="w-4 h-4 text-green-600" /> : <Share2 className="w-4 h-4 text-gray-500" />}
          <span>{copiedLink ? '¡Enlace copiado!' : 'Copiar enlace del Duelo'}</span>
        </button>
        <button
          onClick={handleShareX}
          className="inline-flex items-center gap-2 bg-black hover:bg-gray-900 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span>Compartir en X</span>
        </button>
      </div>

      {/* Comparison Metrics Grid */}
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <span>Comparativa Métrica por Métrica</span>
          </h3>
          <span className="text-xs text-gray-500">
            {score.scoreA > score.scoreB
              ? `👑 Ventaja para ${metricsA.channel?.channel_name || 'Canal A'}`
              : score.scoreB > score.scoreA
              ? `👑 Ventaja para ${metricsB.channel?.channel_name || 'Canal B'}`
              : '🤝 Empate técnico en métricas'}
          </span>
        </div>

        <div className="space-y-3">
          {comparisonList.map((item) => {
            const total = item.valA + item.valB;
            const pctA = total > 0 ? Math.round((item.valA / total) * 100) : 50;
            const pctB = 100 - pctA;
            const isWinnerA = item.valA > item.valB;
            const isWinnerB = item.valB > item.valA;
            const isTie = item.valA === item.valB;
            const IconComponent = item.icon;

            return (
              <div
                key={item.id}
                className="bg-white border border-gray-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">{item.title}</h4>
                      <p className="text-[11px] text-gray-500 hidden sm:block">{item.description}</p>
                    </div>
                  </div>
                </div>

                {/* Values comparison row */}
                <div className="flex items-center justify-between py-1 gap-2">
                  <div className="text-left shrink-0">
                    <div className={`text-lg sm:text-2xl font-black ${isWinnerA ? 'text-blue-600' : 'text-gray-600'}`}>
                      {item.format(item.valA)}
                    </div>
                    <div className="text-[11px] text-gray-400 font-medium truncate max-w-[110px] sm:max-w-none">
                      {metricsA.channel?.channel_name || 'Canal A'}
                      {isWinnerA && <span className="ml-1 text-blue-600 font-bold">✓</span>}
                    </div>
                  </div>

                  {/* Middle Winner Badge */}
                  <div className="flex items-center justify-center text-center px-1 flex-1">
                    {isWinnerA ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                        <span>👑</span>
                        <span className="truncate max-w-[110px] sm:max-w-[170px]">{metricsA.channel?.channel_name || 'Canal A'}</span>
                        <span className="text-[10px] opacity-75 font-mono hidden sm:inline">+{pctA - pctB}%</span>
                      </span>
                    ) : isWinnerB ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                        <span>👑</span>
                        <span className="truncate max-w-[110px] sm:max-w-[170px]">{metricsB.channel?.channel_name || 'Canal B'}</span>
                        <span className="text-[10px] opacity-75 font-mono hidden sm:inline">+{pctB - pctA}%</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 shadow-2xs">
                        <span>🤝</span>
                        <span>Empate</span>
                      </span>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`text-lg sm:text-2xl font-black ${isWinnerB ? 'text-rose-600' : 'text-gray-600'}`}>
                      {item.format(item.valB)}
                    </div>
                    <div className="text-[11px] text-gray-400 font-medium truncate max-w-[110px] sm:max-w-none">
                      {isWinnerB && <span className="mr-1 text-rose-600 font-bold">✓</span>}
                      {metricsB.channel?.channel_name || 'Canal B'}
                    </div>
                  </div>
                </div>

                {/* Visual Comparative Split Bar */}
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden flex mt-2 shadow-inner">
                  <div
                    style={{ width: `${pctA}%` }}
                    className={`h-full transition-all duration-500 ${
                      isWinnerA ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-blue-300'
                    }`}
                  />
                  <div
                    style={{ width: `${pctB}%` }}
                    className={`h-full transition-all duration-500 ${
                      isWinnerB ? 'bg-gradient-to-r from-rose-500 to-rose-600' : 'bg-rose-300'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Streams Head-to-Head */}
      <div className="max-w-5xl mx-auto pt-6 border-t border-gray-200/80">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span>Últimas Emisiones Registradas</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Channel A Latest Streams */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>Directos de {metricsA.channel?.channel_name || 'Canal A'}</span>
            </h4>
            {loadingA ? (
              <div className="p-6 bg-white border border-gray-200 rounded-xl text-center text-xs text-gray-400 animate-pulse">
                Cargando emisiones...
              </div>
            ) : (dataA?.streams || []).length === 0 ? (
              <div className="p-6 bg-white border border-gray-200 rounded-xl text-center text-xs text-gray-400">
                No hay emisiones registradas en el período.
              </div>
            ) : (
              (dataA?.streams || []).slice(0, 3).map((s) => (
                <div
                  key={s.video_id}
                  className="bg-white border border-blue-100 rounded-xl p-3 shadow-2xs hover:border-blue-300 transition-colors"
                >
                  <p className="text-xs font-semibold text-gray-900 truncate" title={s.video_title}>
                    {s.video_title || 'Emisión en vivo'}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                    <span>👥 Pico: <strong className="text-gray-800">{formatNumber(s.concurrent_viewers || s.max_users || 0)}</strong></span>
                    <span>❤️ Likes: <strong className="text-gray-800">{formatNumber(s.current_likes || s.max_likes || 0)}</strong></span>
                    <span>💬 Chat: <strong className="text-gray-800">{formatNumber(s.comments_count || 0)}</strong></span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Channel B Latest Streams */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>Directos de {metricsB.channel?.channel_name || 'Canal B'}</span>
            </h4>
            {loadingB ? (
              <div className="p-6 bg-white border border-gray-200 rounded-xl text-center text-xs text-gray-400 animate-pulse">
                Cargando emisiones...
              </div>
            ) : (dataB?.streams || []).length === 0 ? (
              <div className="p-6 bg-white border border-gray-200 rounded-xl text-center text-xs text-gray-400">
                No hay emisiones registradas en el período.
              </div>
            ) : (
              (dataB?.streams || []).slice(0, 3).map((s) => (
                <div
                  key={s.video_id}
                  className="bg-white border border-rose-100 rounded-xl p-3 shadow-2xs hover:border-rose-300 transition-colors"
                >
                  <p className="text-xs font-semibold text-gray-900 truncate" title={s.video_title}>
                    {s.video_title || 'Emisión en vivo'}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                    <span>👥 Pico: <strong className="text-gray-800">{formatNumber(s.concurrent_viewers || s.max_users || 0)}</strong></span>
                    <span>❤️ Likes: <strong className="text-gray-800">{formatNumber(s.current_likes || s.max_likes || 0)}</strong></span>
                    <span>💬 Chat: <strong className="text-gray-800">{formatNumber(s.comments_count || 0)}</strong></span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
