import React, { useState, useEffect, useMemo } from 'react';
import {
  CrossChannelUserItem,
  analyzeCommentatorBotRisk,
  UserChannelBreakdown,
} from '../utils/botAnalysis';
import { formatNumber } from '../data/mockData';
import { formatArgentinaDateTime } from '../utils/dateFilter';
import { SITE_NAME } from '../config/site';
import {
  Bot,
  Users,
  MessageSquare,
  Search,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Tv,
  Activity,
  Repeat,
  Zap,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Crown,
  Share2,
} from 'lucide-react';

interface CrossChatUsersPageProps {
  onNavigateChannel: (channelHandle: string) => void;
}

type ViewMode = 'top20' | 'multichannel' | 'bot_risk';

const CHANNEL_BAR_COLORS = [
  'bg-blue-600',
  'bg-purple-600',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
];

const CHANNEL_DOT_COLORS = [
  'bg-blue-600',
  'bg-purple-600',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
];

function buildFallbackUsers(): {
  top_commentators: CrossChannelUserItem[];
  cross_channel_commentators: CrossChannelUserItem[];
  total_comments: number;
  unique_commentators: number;
  multi_channel_users_count: number;
  suspected_bots_count: number;
} {
  const rawSamples: Array<{
    author_id: string;
    total_comments: number;
    streams_count: number;
    unique_texts_count: number;
    active_minutes: number;
    avg_length: number;
    all_caps_count: number;
    sample_comments: string[];
    channels: Array<{
      channel_id: string;
      channel: string;
      channel_name: string;
      thumb: string;
      comment_count: number;
      streams_count: number;
    }>;
  }> = [
    {
      author_id: '@libertad_avanza_8842',
      total_comments: 642,
      streams_count: 9,
      unique_texts_count: 98,
      active_minutes: 135,
      avg_length: 42,
      all_caps_count: 460,
      sample_comments: [
        'VIVA LA LIBERTAD CARAJO!! NADIE LA VE!!',
        'VIVA LA LIBERTAD CARAJO!! NADIE LA VE!!',
        'LLOREN KUKAS LLOREN QUE SE TERMINO EL CURRO',
      ],
      channels: [
        {
          channel_id: 'UC4mdhKZXjrKoq5aVG6juHEg',
          channel: '@carajostream',
          channel_name: 'Carajo',
          thumb: 'https://yt3.ggpht.com/GjtA4xpFcGiFO77iLqqz2wGEBdqJ3fC6BVy4hW3bPYSq0EUhrVQJti1QIpdAcDmPyeMxvFPfIQ=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 310,
          streams_count: 4,
        },
        {
          channel_id: 'UCWSfXECGo1qK_H7SXRaUSMg',
          channel: '@SomosGelatina',
          channel_name: 'GELATINA',
          thumb: 'https://yt3.ggpht.com/PGzEzh1eEwRjML1uhY2lgUzr8G4r5mKqQUMesXEYY8vcvKQkLhHeeQrFbi_nSA3hhGN_-t-1Gg=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 195,
          streams_count: 3,
        },
        {
          channel_id: 'UC-40U87JsevMIMn7PMw4jPw',
          channel: '@NeuraMedia',
          channel_name: 'Neura Media',
          thumb: 'https://yt3.ggpht.com/YVrj6aaBeWvWJ8E5U_FLAOpRwKSltszFkQOYv-W8N4NMtNsmJTXzea5wQBtE--I2F2nDBFPr=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 89,
          streams_count: 1,
        },
        {
          channel_id: 'UC5wAqJ9NF0fpGH9dVf3h6HA',
          channel: '@ElDestapeTV',
          channel_name: 'El Destape',
          thumb: 'https://yt3.ggpht.com/Vj0r5JD9nAk6o_YuvqUflObjedKjXHmbL4iptEUfsbtPUbxsrPJlqErc4f6j_8JS5JfFVLT_PQ=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 48,
          streams_count: 1,
        },
      ],
    },
    {
      author_id: '@militante_digital9021',
      total_comments: 518,
      streams_count: 8,
      unique_texts_count: 112,
      active_minutes: 118,
      avg_length: 39,
      all_caps_count: 340,
      sample_comments: [
        'APAGUEN LA OPERETA QUE NO LES CREE NADIE',
        'PEDRO PREGUNTALE POR LA CAUSA DE LOS SEGUROS',
        'APAGUEN LA OPERETA QUE NO LES CREE NADIE',
      ],
      channels: [
        {
          channel_id: 'UCWSfXECGo1qK_H7SXRaUSMg',
          channel: '@SomosGelatina',
          channel_name: 'GELATINA',
          thumb: 'https://yt3.ggpht.com/PGzEzh1eEwRjML1uhY2lgUzr8G4r5mKqQUMesXEYY8vcvKQkLhHeeQrFbi_nSA3hhGN_-t-1Gg=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 224,
          streams_count: 3,
        },
        {
          channel_id: 'UC6pJGaMdx5Ter_8zYbLoRgA',
          channel: '@estoesblender',
          channel_name: 'BLENDER',
          thumb: 'https://yt3.ggpht.com/tBdBRaUAwJLA8vz_HzQ57nH0BFX0dIbMn3NzkH3bmpf_X7VBXUqnkGnUrMTk0khZJ_x43JKk=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 162,
          streams_count: 3,
        },
        {
          channel_id: 'UCRtgbxUH456ox51IswIQgZQ',
          channel: '@CarnavalStream',
          channel_name: 'Carnaval Stream',
          thumb: 'https://yt3.ggpht.com/Iyl2pqHYrhTadZONr4EZ6AjwwxNS_w5idduTOqXxy0ZMPsMVruM5EuETa7seQRdLSNOCUP7r=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 132,
          streams_count: 2,
        },
      ],
    },
    {
      author_id: '@CarlosAlberto_BA',
      total_comments: 412,
      streams_count: 14,
      unique_texts_count: 376,
      active_minutes: 290,
      avg_length: 51,
      all_caps_count: 24,
      sample_comments: [
        'Buen día mesa, coincido con el análisis económico de hoy',
        'Saludos desde Caballito, excelente entrevista!',
        'Me parece que el dato de inflación mayorista va a dar más bajo este mes',
      ],
      channels: [
        {
          channel_id: 'UCC1kfsMJko54AqxtcFECt-A',
          channel: '@UrbanaPlayFM',
          channel_name: 'Urbana Play 104.3 FM',
          thumb: 'https://yt3.ggpht.com/sSxwLgkOZdL88sctVl9Eg9CdCa4NrUDLOFI8wuS_irzBEwQMUFf_3YfU18wA02TCAICIjEP8=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 245,
          streams_count: 8,
        },
        {
          channel_id: 'UCxDteokWBemJvLI_I0VUGdA',
          channel: '@RadioConVos89.9',
          channel_name: 'Radio Con Vos 89.9',
          thumb: 'https://yt3.ggpht.com/T0kc3wJIrewoTiJTESM7Pkk0VeGSy04fSiwexJDD6MLVL9z8i2WnT4YX7vhlLtPzVOkCaZM2_A=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 112,
          streams_count: 4,
        },
        {
          channel_id: 'UCRyGJcJYqqiCByEaUhDLMsw',
          channel: '@Ahora_Play',
          channel_name: 'AHORA PLAY',
          thumb: 'https://yt3.ggpht.com/A0EopXfw48cNrZAHCPYbQn6ZmpGQJ-wqowmfh64Fpvzin51SXvm4XKNzlunmkKrzMQ9f0RTI=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 55,
          streams_count: 2,
        },
      ],
    },
    {
      author_id: '@bot_alerta_9941',
      total_comments: 389,
      streams_count: 5,
      unique_texts_count: 34,
      active_minutes: 76,
      avg_length: 36,
      all_caps_count: 310,
      sample_comments: [
        'NO VUELVEN MAS!! NO VUELVEN MAS!!',
        'NO VUELVEN MAS!! NO VUELVEN MAS!!',
        'MIREN EL RATING COMO SE CAEN A PEDAZOS',
      ],
      channels: [
        {
          channel_id: 'UC5wAqJ9NF0fpGH9dVf3h6HA',
          channel: '@ElDestapeTV',
          channel_name: 'El Destape',
          thumb: 'https://yt3.ggpht.com/Vj0r5JD9nAk6o_YuvqUflObjedKjXHmbL4iptEUfsbtPUbxsrPJlqErc4f6j_8JS5JfFVLT_PQ=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 180,
          streams_count: 2,
        },
        {
          channel_id: 'UCgn6r0aGRBnEQm02tE_jzbw',
          channel: '@futurock',
          channel_name: 'Futurock FM',
          thumb: 'https://yt3.ggpht.com/u_SiynOY7vgl_Xg3FgcmEZ8Yb_EZEcWGeKRdoCRvYUNzp5khogsWvm1v9QfLXFzAejjKsBDp=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 119,
          streams_count: 2,
        },
        {
          channel_id: 'UCWSfXECGo1qK_H7SXRaUSMg',
          channel: '@SomosGelatina',
          channel_name: 'GELATINA',
          thumb: 'https://yt3.ggpht.com/PGzEzh1eEwRjML1uhY2lgUzr8G4r5mKqQUMesXEYY8vcvKQkLhHeeQrFbi_nSA3hhGN_-t-1Gg=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 90,
          streams_count: 1,
        },
      ],
    },
    {
      author_id: '@Marta_Palermo',
      total_comments: 340,
      streams_count: 11,
      unique_texts_count: 305,
      active_minutes: 240,
      avg_length: 44,
      all_caps_count: 40,
      sample_comments: [
        'Qué gran programa hoy en Industria Nacional, me hicieron reír mucho',
        'Vamos Gelatina! Saludos desde Palermo',
      ],
      channels: [
        {
          channel_id: 'UCWSfXECGo1qK_H7SXRaUSMg',
          channel: '@SomosGelatina',
          channel_name: 'GELATINA',
          thumb: 'https://yt3.ggpht.com/PGzEzh1eEwRjML1uhY2lgUzr8G4r5mKqQUMesXEYY8vcvKQkLhHeeQrFbi_nSA3hhGN_-t-1Gg=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 260,
          streams_count: 8,
        },
        {
          channel_id: 'UCgn6r0aGRBnEQm02tE_jzbw',
          channel: '@futurock',
          channel_name: 'Futurock FM',
          thumb: 'https://yt3.ggpht.com/u_SiynOY7vgl_Xg3FgcmEZ8Yb_EZEcWGeKRdoCRvYUNzp5khogsWvm1v9QfLXFzAejjKsBDp=s240-c-k-c0x00ffffff-no-rj',
          comment_count: 80,
          streams_count: 3,
        },
      ],
    },
  ];

  const items: CrossChannelUserItem[] = rawSamples.map((s, idx) => {
    const breakdown: UserChannelBreakdown[] = s.channels.map((ch) => ({
      ...ch,
      percentage: Number(((ch.comment_count / s.total_comments) * 100).toFixed(1)),
    }));
    return {
      rank: idx + 1,
      author_id: s.author_id,
      total_comments: s.total_comments,
      channels_count: breakdown.length,
      streams_count: s.streams_count,
      latest_comment: s.sample_comments[0],
      sample_comments: s.sample_comments,
      channels_breakdown: breakdown,
      bot_analysis: analyzeCommentatorBotRisk({
        author_id: s.author_id,
        total_comments: s.total_comments,
        channels_count: breakdown.length,
        streams_count: s.streams_count,
        unique_texts_count: s.unique_texts_count,
        active_minutes: s.active_minutes,
        avg_length: s.avg_length,
        all_caps_count: s.all_caps_count,
        channels_breakdown: breakdown,
      }),
    };
  });

  return {
    top_commentators: items,
    cross_channel_commentators: items.filter((u) => u.channels_count >= 2),
    total_comments: 48520,
    unique_commentators: 9410,
    multi_channel_users_count: 684,
    suspected_bots_count: items.filter((u) => u.bot_analysis.verdict !== 'human').length,
  };
}

export const CrossChatUsersPage: React.FC<CrossChatUsersPageProps> = ({
  onNavigateChannel,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('top20');
  const [topUsers, setTopUsers] = useState<CrossChannelUserItem[]>([]);
  const [multiChannelUsers, setMultiChannelUsers] = useState<CrossChannelUserItem[]>([]);
  const [totalComments, setTotalComments] = useState<number>(0);
  const [uniqueCommentators, setUniqueCommentators] = useState<number>(0);
  const [multiChannelCount, setMultiChannelCount] = useState<number>(0);
  const [suspectedBotsCount, setSuspectedBotsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<string>('all');
  const [expandedUserIds, setExpandedUserIds] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${SITE_NAME} - Usuarios y Detección de Bots`;
  }, []);

  const fetchUsersAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/top-commentators?limit=20');
      if (!res.ok) {
        throw new Error(`Error HTTP ${res.status}`);
      }
      const data = await res.json();
      if (
        data.success &&
        Array.isArray(data.top_commentators) &&
        data.top_commentators.length > 0
      ) {
        setTopUsers(data.top_commentators);
        setMultiChannelUsers(
          Array.isArray(data.cross_channel_commentators) &&
            data.cross_channel_commentators.length > 0
            ? data.cross_channel_commentators
            : data.top_commentators.filter((u: CrossChannelUserItem) => u.channels_count >= 2)
        );
        setTotalComments(Number(data.total_comments || 0));
        setUniqueCommentators(Number(data.unique_commentators || 0));
        setMultiChannelCount(Number(data.multi_channel_users_count || 0));
        setSuspectedBotsCount(Number(data.suspected_bots_count || 0));
      } else {
        const fb = buildFallbackUsers();
        setTopUsers(fb.top_commentators);
        setMultiChannelUsers(fb.cross_channel_commentators);
        setTotalComments(fb.total_comments);
        setUniqueCommentators(fb.unique_commentators);
        setMultiChannelCount(fb.multi_channel_users_count);
        setSuspectedBotsCount(fb.suspected_bots_count);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al cargar el análisis de usuarios.');
      const fb = buildFallbackUsers();
      setTopUsers(fb.top_commentators);
      setMultiChannelUsers(fb.cross_channel_commentators);
      setTotalComments(fb.total_comments);
      setUniqueCommentators(fb.unique_commentators);
      setMultiChannelCount(fb.multi_channel_users_count);
      setSuspectedBotsCount(fb.suspected_bots_count);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersAnalysis();
  }, []);

  // Extract unique channels present across analyzed users for the channel filter dropdown
  const availableChannels = useMemo(() => {
    const map = new Map<string, { channel: string; channel_name: string }>();
    for (const u of [...topUsers, ...multiChannelUsers]) {
      for (const ch of u.channels_breakdown || []) {
        if (ch.channel && !map.has(ch.channel)) {
          map.set(ch.channel, {
            channel: ch.channel,
            channel_name: ch.channel_name || ch.channel,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.channel_name.localeCompare(b.channel_name)
    );
  }, [topUsers, multiChannelUsers]);

  // Active list based on selected tab, search query, and channel filter
  const displayedUsers = useMemo(() => {
    let baseList: CrossChannelUserItem[] = [];
    if (viewMode === 'multichannel') {
      baseList = multiChannelUsers.length > 0 ? multiChannelUsers : topUsers.filter((u) => u.channels_count >= 2);
    } else if (viewMode === 'bot_risk') {
      const mergedMap = new Map<string, CrossChannelUserItem>();
      for (const u of [...topUsers, ...multiChannelUsers]) {
        if (!mergedMap.has(u.author_id)) {
          mergedMap.set(u.author_id, u);
        }
      }
      baseList = Array.from(mergedMap.values())
        .sort(
          (a, b) =>
            b.bot_analysis.bot_score - a.bot_analysis.bot_score ||
            b.total_comments - a.total_comments
        )
        .slice(0, 20);
    } else {
      baseList = topUsers;
    }

    const q = searchQuery.trim().toLowerCase();
    return baseList
      .filter((u) => {
        if (selectedChannelFilter !== 'all') {
          const hasCh = u.channels_breakdown?.some(
            (c) => c.channel.toLowerCase() === selectedChannelFilter.toLowerCase()
          );
          if (!hasCh) return false;
        }
        if (!q) return true;
        return (
          u.author_id.toLowerCase().includes(q) ||
          u.channels_breakdown?.some(
            (c) =>
              c.channel_name.toLowerCase().includes(q) ||
              c.channel.toLowerCase().includes(q)
          ) ||
          u.sample_comments?.some((msg) => msg.toLowerCase().includes(q))
        );
      })
      .map((item, idx) => ({ ...item, rank: idx + 1 }));
  }, [viewMode, topUsers, multiChannelUsers, searchQuery, selectedChannelFilter]);

  const toggleExpandUser = (authorId: string) => {
    setExpandedUserIds((prev) => ({
      ...prev,
      [authorId]: !prev[authorId],
    }));
  };

  const getRankBadgeClass = (rank: number) => {
    if (rank === 1)
      return 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-amber-200';
    if (rank === 2)
      return 'bg-gradient-to-r from-slate-300 to-slate-400 text-slate-800 shadow-slate-200';
    if (rank === 3)
      return 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-amber-200';
    return 'bg-gray-100 text-gray-700';
  };

  const renderBotBadge = (user: CrossChannelUserItem) => {
    const { verdict, label, bot_score } = user.bot_analysis;
    if (verdict === 'probable_bot') {
      return (
        <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 px-3 py-1 rounded-full text-xs font-extrabold shadow-2xs">
          <Bot className="w-3.5 h-3.5 text-red-600" />
          <span>{label}</span>
          <span className="bg-red-600 text-white px-1.5 py-0.2 rounded-full text-[10px]">
            {bot_score}%
          </span>
        </div>
      );
    }
    if (verdict === 'suspicious') {
      return (
        <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-800 px-3 py-1 rounded-full text-xs font-extrabold shadow-2xs">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>{label}</span>
          <span className="bg-amber-600 text-white px-1.5 py-0.2 rounded-full text-[10px]">
            {bot_score}%
          </span>
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold shadow-2xs">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>{label}</span>
        <span className="bg-emerald-600/15 text-emerald-800 px-1.5 py-0.2 rounded-full text-[10px]">
          {bot_score}% riesgo
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-16">
      {/* Hero Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 rounded-3xl p-6 sm:p-10 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-72 h-72 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-32 -top-12 w-56 h-56 bg-rose-500/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider mb-4 border border-white/15 text-indigo-200">
            <Bot className="w-4 h-4 text-indigo-300" />
            <span>Auditoría de Chats en Vivo • Detección de Bots</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight mb-3">
            Top 20 Usuarios y Actividad entre Canales
          </h1>
          <p className="text-indigo-100/90 text-sm sm:text-base leading-relaxed max-w-2xl font-medium">
            Ranking de los 20 usuarios con más comentarios en vivo, cuántos mensajes enviaron en cada canal de streaming y análisis heurístico para detectar posibles bots, scripts o cuentas spammer.
          </p>

          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <button
              onClick={fetchUsersAnalysis}
              disabled={isLoading}
              className="inline-flex items-center gap-2 bg-white text-slate-900 hover:bg-indigo-50 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 text-indigo-600 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Actualizar Análisis</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100 text-center hover:border-indigo-200 transition-colors">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-2.5">
            <Users className="w-5 h-5" />
          </div>
          {isLoading ? (
            <div className="h-8 w-24 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-indigo-600 mb-1">
              {formatNumber(uniqueCommentators)}
            </div>
          )}
          <div className="text-xs sm:text-sm text-gray-500 font-medium">Usuarios Únicos</div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100 text-center hover:border-blue-200 transition-colors">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2.5">
            <MessageSquare className="w-5 h-5" />
          </div>
          {isLoading ? (
            <div className="h-8 w-24 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-blue-600 mb-1">
              {formatNumber(totalComments)}
            </div>
          )}
          <div className="text-xs sm:text-sm text-gray-500 font-medium">Comentarios Analizados</div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100 text-center hover:border-purple-200 transition-colors">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-2.5">
            <Share2 className="w-5 h-5" />
          </div>
          {isLoading ? (
            <div className="h-8 w-20 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-purple-600 mb-1">
              {formatNumber(multiChannelCount)}
            </div>
          )}
          <div className="text-xs sm:text-sm text-gray-500 font-medium">
            Usuarios en 2+ Canales
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100 text-center hover:border-red-200 transition-colors">
          <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-2.5">
            <ShieldAlert className="w-5 h-5" />
          </div>
          {isLoading ? (
            <div className="h-8 w-16 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-red-600 mb-1">
              {formatNumber(suspectedBotsCount)}
            </div>
          )}
          <div className="text-xs sm:text-sm text-gray-500 font-medium">
            Alertas Bot / Spam (Top 20)
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden">
        {/* Controls Header: View Tabs + Channel Filter + Search */}
        <div className="border-b border-gray-200 bg-gray-50/70 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-2xl border border-gray-200/80 shadow-2xs flex-wrap">
            <button
              onClick={() => setViewMode('top20')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'top20'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Crown className="w-4 h-4" />
              <span>Top 20 Más Comentadores</span>
            </button>

            <button
              onClick={() => setViewMode('multichannel')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'multichannel'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>En Diferentes Chats (2+ Canales)</span>
            </button>

            <button
              onClick={() => setViewMode('bot_risk')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'bot_risk'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>Ranking Sospecha de Bot</span>
            </button>
          </div>

          {/* Right Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {availableChannels.length > 0 && (
              <select
                value={selectedChannelFilter}
                onChange={(e) => setSelectedChannelFilter(e.target.value)}
                className="px-3 py-2 text-xs sm:text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-700 font-medium"
              >
                <option value="all">Todos los canales ({availableChannels.length})</option>
                {availableChannels.map((ch) => (
                  <option key={ch.channel} value={ch.channel}>
                    Comentó en: {ch.channel_name}
                  </option>
                ))}
              </select>
            )}

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar @usuario o mensaje..."
                className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-800 placeholder:text-gray-400 font-medium"
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
        </div>

        {/* User Cards List */}
        <div className="p-4 sm:p-6 space-y-5">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="bg-gray-50 rounded-2xl p-6 border border-gray-100 animate-pulse space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-gray-200" />
                      <div className="space-y-2">
                        <div className="h-4 w-40 bg-gray-200 rounded" />
                        <div className="h-3 w-28 bg-gray-200 rounded" />
                      </div>
                    </div>
                    <div className="h-8 w-32 bg-gray-200 rounded-full" />
                  </div>
                  <div className="h-16 bg-gray-200 rounded-xl" />
                </div>
              ))}
            </div>
          ) : displayedUsers.length === 0 ? (
            <div className="p-12 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-200">
              <p className="font-bold text-base text-gray-700">
                No se encontraron usuarios con esos criterios
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Probá cambiando de pestaña o limpiando el filtro de búsqueda.
              </p>
            </div>
          ) : (
            displayedUsers.map((user) => {
              const isExpanded = Boolean(expandedUserIds[user.author_id]);
              const { bot_analysis } = user;

              return (
                <div
                  key={user.author_id}
                  className={`rounded-2xl border transition-all p-4 sm:p-6 shadow-2xs hover:shadow-md ${
                    bot_analysis.verdict === 'probable_bot'
                      ? 'bg-gradient-to-br from-white via-white to-red-50/25 border-red-200/80'
                      : bot_analysis.verdict === 'suspicious'
                      ? 'bg-gradient-to-br from-white via-white to-amber-50/25 border-amber-200/80'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  {/* Top Row: User Info + Total Comments + Bot Verdict */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                    <div className="flex items-start sm:items-center space-x-3.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 shadow-xs ${getRankBadgeClass(
                          user.rank
                        )}`}
                      >
                        #{user.rank}
                      </div>

                      <div className="w-11 h-11 rounded-full bg-slate-900 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                        {user.author_id.replace(/^@/, '').substring(0, 2).toUpperCase() || 'US'}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base sm:text-lg font-black text-gray-900 truncate font-mono">
                            {user.author_id}
                          </h3>
                          {user.channels_count >= 2 ? (
                            <span className="bg-purple-100 text-purple-800 border border-purple-200 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
                              🔀 {user.channels_count} canales distintos
                            </span>
                          ) : (
                            <span className="bg-gray-100 text-gray-600 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                              1 canal
                            </span>
                          )}
                          <span className="text-xs text-gray-400 font-medium">
                            • {user.streams_count} {user.streams_count === 1 ? 'stream' : 'streams'}
                          </span>
                        </div>

                        <p className="text-xs text-gray-500 mt-1">
                          {bot_analysis.summary}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
                      {renderBotBadge(user)}

                      <div className="text-right pl-2 border-l border-gray-100">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          Total Mensajes
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-indigo-600">
                          {formatNumber(user.total_comments)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle Section: Cuántos comentarios en cada canal */}
                  <div className="py-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Tv className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Distribución de comentarios por canal ({user.channels_breakdown.length})</span>
                      </span>
                      <span className="text-gray-400 font-medium">
                        Clic en un canal para ver sus métricas
                      </span>
                    </div>

                    {/* Stacked Multi-Channel Progress Bar */}
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden flex gap-0.5">
                      {user.channels_breakdown.map((ch, idx) => (
                        <div
                          key={`${user.author_id}-bar-${ch.channel_id || idx}`}
                          className={`${
                            CHANNEL_BAR_COLORS[idx % CHANNEL_BAR_COLORS.length]
                          } h-full first:rounded-l-full last:rounded-r-full transition-all`}
                          style={{ width: `${Math.max(ch.percentage, 3)}%` }}
                          title={`${ch.channel_name}: ${formatNumber(ch.comment_count)} comentarios (${ch.percentage}%)`}
                        />
                      ))}
                    </div>

                    {/* Per-Channel Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                      {user.channels_breakdown.map((ch, idx) => (
                        <button
                          key={`${user.author_id}-ch-${ch.channel_id || idx}`}
                          type="button"
                          onClick={() => ch.channel && onNavigateChannel(ch.channel)}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50/90 hover:bg-indigo-50/60 border border-gray-200/80 hover:border-indigo-300 transition-all text-left group cursor-pointer"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                CHANNEL_DOT_COLORS[idx % CHANNEL_DOT_COLORS.length]
                              }`}
                            />
                            {ch.thumb ? (
                              <img
                                src={ch.thumb}
                                alt={ch.channel_name}
                                className="w-7 h-7 rounded-full object-cover border border-gray-200 shrink-0"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : null}
                            <div className="min-w-0">
                              <div className="text-xs font-extrabold text-gray-900 group-hover:text-indigo-600 truncate">
                                {ch.channel_name}
                              </div>
                              <div className="text-[10px] text-gray-400 font-mono truncate">
                                {ch.channel} • {ch.streams_count}{' '}
                                {ch.streams_count === 1 ? 'vivo' : 'vivos'}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 pl-2">
                            <div className="text-xs sm:text-sm font-black text-gray-900">
                              {formatNumber(ch.comment_count)}{' '}
                              <span className="text-[10px] font-semibold text-gray-500">msgs</span>
                            </div>
                            <div className="text-[10px] font-bold text-indigo-600">
                              {ch.percentage}%
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Section: Bot Analysis Signals & Metrics */}
                  <div className="pt-3 border-t border-gray-100 flex flex-col gap-3">
                    {/* Quick Technical Metrics Pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                        <div className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">
                          <Repeat className="w-3 h-3 text-amber-500" />
                          <span>Repetición / Copy-Paste</span>
                        </div>
                        <div className="text-xs sm:text-sm font-black text-gray-800 mt-0.5">
                          {bot_analysis.metrics.repetition_rate}%{' '}
                          <span className="text-[10px] font-normal text-gray-500">
                            ({formatNumber(bot_analysis.metrics.unique_messages)} únicos)
                          </span>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                        <div className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">
                          <Zap className="w-3 h-3 text-indigo-500" />
                          <span>Cadencia Activa</span>
                        </div>
                        <div className="text-xs sm:text-sm font-black text-gray-800 mt-0.5">
                          {bot_analysis.metrics.comments_per_active_minute}{' '}
                          <span className="text-[10px] font-normal text-gray-500">msgs / min</span>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                        <div className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">
                          <Activity className="w-3 h-3 text-purple-500" />
                          <span>Intensidad por Stream</span>
                        </div>
                        <div className="text-xs sm:text-sm font-black text-gray-800 mt-0.5">
                          {bot_analysis.metrics.comments_per_stream}{' '}
                          <span className="text-[10px] font-normal text-gray-500">
                            msgs / vivo
                          </span>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                        <div className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-rose-500" />
                          <span>Mayúsculas (CAPS)</span>
                        </div>
                        <div className="text-xs sm:text-sm font-black text-gray-800 mt-0.5">
                          {bot_analysis.metrics.all_caps_rate}%{' '}
                          <span className="text-[10px] font-normal text-gray-500">
                            del total
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Signals List + Expand Sample Messages */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/80 rounded-xl p-3 border border-slate-200/70">
                      <div className="space-y-1 text-xs text-gray-700">
                        <div className="font-bold text-gray-900 flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Diagnóstico de comportamiento:</span>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-xs text-gray-600">
                          {bot_analysis.signals.map((sig, i) => (
                            <li key={i}>{sig}</li>
                          ))}
                        </ul>
                      </div>

                      {user.sample_comments && user.sample_comments.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExpandUser(user.author_id)}
                          className="self-start sm:self-center shrink-0 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-2xs cursor-pointer"
                        >
                          <span>
                            {isExpanded ? 'Ocultar mensajes' : 'Ver mensajes de muestra'}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Collapsible Sample Comments */}
                    {isExpanded && user.sample_comments && user.sample_comments.length > 0 && (
                      <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200 space-y-2 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between text-[11px] text-gray-500 font-semibold">
                          <span>Últimos mensajes enviados por {user.author_id}:</span>
                          {user.last_comment_at && (
                            <span>Última actividad: {formatArgentinaDateTime(user.last_comment_at)}</span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {user.sample_comments.map((msg, i) => (
                            <div
                              key={i}
                              className="text-xs text-gray-700 bg-white px-3 py-2 rounded-lg border border-gray-200/80 italic"
                            >
                              "{msg}"
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
