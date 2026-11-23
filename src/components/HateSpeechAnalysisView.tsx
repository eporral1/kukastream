import React, { useState, useMemo } from 'react';
import {
  HateSpeechAnalysisResult,
  HateSpeechCategoryId,
  HATE_SPEECH_CATEGORIES,
} from '../utils/hateSpeechAnalysis';
import { formatNumber } from '../data/mockData';
import {
  ShieldAlert,
  AlertTriangle,
  Flame,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  MessageSquare,
  Search,
  User,
  Clock,
  DollarSign,
  Filter,
  Crosshair,
} from 'lucide-react';

interface HateSpeechAnalysisViewProps {
  analysis: HateSpeechAnalysisResult | null;
  loading: boolean;
  error: string | null;
  onAnalyze: (force?: boolean) => void;
  onSelectAuthor?: (authorId: string) => void;
}

type MessageFilterMode = 'all' | 'hate' | 'clean' | 'alto' | 'medio' | 'bajo';

export const HateSpeechAnalysisView: React.FC<HateSpeechAnalysisViewProps> = ({
  analysis,
  loading,
  error,
  onAnalyze,
}) => {
  const [filterMode, setFilterMode] = useState<MessageFilterMode>('all');
  const [selectedCategory, setSelectedCategory] = useState<HateSpeechCategoryId | 'all'>('all');
  const [selectedTarget, setSelectedTarget] = useState<string | 'all'>('all');
  const [searchText, setSearchText] = useState('');

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

  const filteredMessages = useMemo(() => {
    if (!analysis || !Array.isArray(analysis.messages)) return [];
    const q = searchText.trim().toLowerCase();

    return analysis.messages.filter((m) => {
      if (filterMode === 'hate' && !m.is_hate_speech) return false;
      if (filterMode === 'clean' && m.is_hate_speech) return false;
      if (filterMode === 'alto' && m.severity !== 'alto') return false;
      if (filterMode === 'medio' && m.severity !== 'medio') return false;
      if (filterMode === 'bajo' && m.severity !== 'bajo') return false;

      if (selectedCategory !== 'all' && !m.categories.includes(selectedCategory)) {
        return false;
      }

      if (selectedTarget !== 'all' && !(m.hate_targets || []).includes(selectedTarget)) {
        return false;
      }

      if (q) {
        const authorMatch = (m.author_id || '').toLowerCase().includes(q);
        const textMatch = (m.comment_text || '').toLowerCase().includes(q);
        const termsMatch = m.matched_terms.some((t) => t.toLowerCase().includes(q));
        const targetMatch = (m.hate_targets || []).some((t) => t.toLowerCase().includes(q));
        if (!authorMatch && !textMatch && !termsMatch && !targetMatch) return false;
      }

      return true;
    });
  }, [analysis, filterMode, selectedCategory, selectedTarget, searchText]);

  const getToxicityBadgeColor = (level: string) => {
    if (level === 'Crítico') return 'bg-red-100 text-red-900 border-red-300';
    if (level === 'Alto') return 'bg-rose-100 text-rose-800 border-rose-300';
    if (level === 'Moderado') return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  };

  return (
    <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-gray-50/30">
      {/* Header Box */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-rose-50 via-red-50/70 to-amber-50 p-4 rounded-xl border border-rose-200 shadow-2xs">
        <div className="space-y-1">
          <h4 className="font-extrabold text-gray-900 text-sm sm:text-base flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            <span>Análisis de Mensajes de Odio (Dirigido a Personas o Grupos)</span>
          </h4>
          <p className="text-xs text-gray-600">
            Contabiliza únicamente mensajes donde <strong>se mencione explícitamente al grupo o persona a la que se está odiando</strong>, y retorna la lista completa de todos los mensajes del video (incluyendo canales 24/7 eternal).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onAnalyze(Boolean(analysis))}
            disabled={loading}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Analizando mensajes...</span>
              </>
            ) : analysis ? (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Recalcular Análisis</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Analizar Mensajes de Odio</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="p-6 bg-white rounded-xl border border-rose-100 shadow-xs flex items-center space-x-3.5 animate-pulse">
          <RefreshCw className="w-6 h-6 text-rose-600 animate-spin shrink-0" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-gray-900 text-sm">
              Analizando la totalidad de los mensajes y superchats del video...
            </p>
            <p className="text-gray-500">
              Identificando mensajes que mencionan explícitamente al grupo o persona atacada y compilando todos los mensajes de la emisión.
            </p>
          </div>
        </div>
      )}

      {!analysis && !loading && (
        <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-200 space-y-3">
          <ShieldAlert className="w-12 h-12 mx-auto text-rose-400" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-gray-800">
              Ejecutar Detección de Discurso de Odio Dirigido a Personas o Grupos
            </p>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Haz clic en el botón para analizar todos los mensajes de la emisión y detectar ataques que mencionen al grupo o persona destinataria.
            </p>
          </div>
          <button
            onClick={() => onAnalyze(false)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Analizar Mensajes Ahora</span>
          </button>
        </div>
      )}

      {analysis && !loading && (
        <div className="space-y-5">
          {/* Executive Summary & KPI Cards */}
          <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-md border ${getToxicityBadgeColor(
                    analysis.summary.toxicity_level
                  )}`}
                >
                  Nivel de Toxicidad: {analysis.summary.toxicity_level} ({analysis.summary.toxicity_index}/100)
                </span>
                {analysis.is_eternal && (
                  <span className="text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-md">
                    Canal 24/7 (Recorte exacto de emisión)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-semibold">
                <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                <span>
                  {formatNumber(analysis.summary.total_messages)} mensajes totales ({formatNumber(analysis.summary.total_comments)} comments • {formatNumber(analysis.summary.total_superchats)} superchats)
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
              {analysis.summary.executive_summary}
            </p>

            {/* 4 Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <span className="text-[11px] font-bold text-gray-500 uppercase block">
                  Total Mensajes Video
                </span>
                <span className="text-lg sm:text-xl font-black text-gray-900">
                  {formatNumber(analysis.summary.total_messages)}
                </span>
                <span className="text-[10px] text-gray-500 block mt-0.5">
                  100% de la emisión analizada
                </span>
              </div>

              <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3">
                <span className="text-[11px] font-bold text-rose-700 uppercase block">
                  Odio a Grupo/Persona
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg sm:text-xl font-black text-rose-800">
                    {formatNumber(analysis.summary.hate_messages_count)}
                  </span>
                  <span className="text-xs font-extrabold text-rose-600">
                    ({analysis.summary.hate_percentage}%)
                  </span>
                </div>
                <span className="text-[10px] text-rose-700/80 block mt-0.5">
                  Con mención explícita del blanco
                </span>
              </div>

              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3">
                <span className="text-[11px] font-bold text-amber-800 uppercase block">
                  Severidad (Alta / Media / Baja)
                </span>
                <div className="flex items-center gap-1.5 mt-1 text-xs font-extrabold">
                  <span className="px-2 py-0.5 rounded bg-red-600 text-white" title="Severidad Alta">
                    {analysis.summary.high_severity_count} A
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-500 text-white" title="Severidad Media">
                    {analysis.summary.medium_severity_count} M
                  </span>
                  <span className="px-2 py-0.5 rounded bg-yellow-200 text-yellow-900" title="Severidad Baja">
                    {analysis.summary.low_severity_count} B
                  </span>
                </div>
                <span className="text-[10px] text-amber-800/80 block mt-1">
                  Distribución por gravedad
                </span>
              </div>

              <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3">
                <span className="text-[11px] font-bold text-emerald-800 uppercase block">
                  Mensajes Sin Odio
                </span>
                <span className="text-lg sm:text-xl font-black text-emerald-800">
                  {formatNumber(analysis.summary.clean_messages_count)}
                </span>
                <span className="text-[10px] text-emerald-700/80 block mt-0.5">
                  {analysis.summary.total_messages > 0
                    ? `${(100 - analysis.summary.hate_percentage).toFixed(1)}% sin ataque dirigido`
                    : '0%'}
                </span>
              </div>
            </div>
          </div>

          {/* Target Groups / Persons Attacked + Categories + Top Hate Authors */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Grupos o Personas Odiadas (Blancos Mencionados) */}
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                <h5 className="text-xs font-extrabold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                  <Crosshair className="w-4 h-4 text-rose-600" />
                  <span>Grupos / Personas Atacadas</span>
                </h5>
                {selectedTarget !== 'all' && (
                  <button
                    onClick={() => setSelectedTarget('all')}
                    className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    Quitar filtro
                  </button>
                )}
              </div>

              {(!analysis.targets_breakdown || analysis.targets_breakdown.length === 0) ? (
                <div className="py-10 text-center text-xs text-gray-400">
                  No se detectaron grupos o personas atacadas en esta emisión.
                </div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {analysis.targets_breakdown.map((t) => {
                    const isSelected = selectedTarget === t.target;
                    return (
                      <button
                        key={t.target}
                        type="button"
                        onClick={() =>
                          setSelectedTarget((prev) => (prev === t.target ? 'all' : t.target))
                        }
                        className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20'
                            : 'bg-gray-50/70 hover:bg-gray-100/80 border-gray-200/80'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs font-bold text-gray-900 mb-1">
                          <span className="truncate">🎯 {t.target}</span>
                          <span className="text-rose-700 font-extrabold shrink-0">
                            {t.count} msg ({t.percentage_of_hate}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-rose-600 rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(t.count > 0 ? 5 : 0, t.percentage_of_hate))}%`,
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Categorías de Discurso de Odio */}
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                <h5 className="text-xs font-extrabold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-rose-600" />
                  <span>Tipo de Agresión</span>
                </h5>
                {selectedCategory !== 'all' && (
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    Quitar filtro
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {analysis.categories_breakdown.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() =>
                        setSelectedCategory((prev) => (prev === cat.id ? 'all' : cat.id))
                      }
                      className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20'
                          : 'bg-gray-50/70 hover:bg-gray-100/80 border-gray-200/80'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-gray-900 mb-1">
                        <span className="truncate">{cat.shortName}</span>
                        <span className="text-rose-700 font-extrabold shrink-0">
                          {cat.count} msg ({cat.percentage_of_total}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-rose-600 rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(cat.count > 0 ? 4 : 0, cat.percentage_of_hate))}%`,
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Usuarios con Más Mensajes de Odio */}
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                <h5 className="text-xs font-extrabold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Usuarios con Más Odio</span>
                </h5>
                <span className="text-[11px] text-gray-400 font-semibold">Top 10</span>
              </div>

              {analysis.top_hate_authors.length === 0 ? (
                <div className="py-10 text-center text-xs text-gray-400">
                  No se detectaron usuarios con mensajes de odio dirigido en esta emisión.
                </div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {analysis.top_hate_authors.map((au, idx) => (
                    <div
                      key={au.author_id}
                      className="p-2 rounded-lg bg-gray-50 border border-gray-200/80 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-800 font-black text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSearchText(au.author_id)}
                            className="font-mono font-bold text-gray-900 hover:text-rose-600 truncate cursor-pointer text-left"
                            title="Filtrar mensajes de este autor en la lista inferior"
                          >
                            {au.author_id}
                          </button>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-extrabold text-[11px] shrink-0">
                          {au.hate_messages} de {au.total_messages}
                        </span>
                      </div>
                      {au.targets && au.targets.length > 0 && (
                        <div className="flex flex-wrap gap-1 pl-7">
                          {au.targets.map((t) => (
                            <span
                              key={t}
                              className="text-[10px] bg-white border border-rose-200 text-rose-800 px-1.5 py-0.2 rounded font-semibold"
                            >
                              🎯 {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Complete List of All Messages of the Analyzed Video */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h5 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-rose-600" />
                    <span>
                      Lista Completa de Mensajes del Video Analizado ({formatNumber(filteredMessages.length)} de{' '}
                      {formatNumber(analysis.messages.length)})
                    </span>
                  </h5>
                  <p className="text-xs text-gray-500">
                    Todos los mensajes del video; los marcados con odio muestran el grupo o persona destinataria mencionada.
                  </p>
                </div>

                {/* Filter Buttons */}
                <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-lg border border-gray-200 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      filterMode === 'all'
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Todos ({analysis.messages.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('hate')}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      filterMode === 'hate'
                        ? 'bg-rose-600 text-white'
                        : 'text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    🔥 Con Odio ({analysis.summary.hate_messages_count})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('alto')}
                    className={`px-2 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      filterMode === 'alto'
                        ? 'bg-red-700 text-white'
                        : 'text-red-700 hover:bg-red-50'
                    }`}
                  >
                    Alta ({analysis.summary.high_severity_count})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('medio')}
                    className={`px-2 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      filterMode === 'medio'
                        ? 'bg-amber-500 text-white'
                        : 'text-amber-700 hover:bg-amber-50'
                    }`}
                  >
                    Media ({analysis.summary.medium_severity_count})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('clean')}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      filterMode === 'clean'
                        ? 'bg-emerald-600 text-white'
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    ✓ Sin Odio ({analysis.summary.clean_messages_count})
                  </button>
                </div>
              </div>

              {/* Search bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Buscar en todos los mensajes por texto, grupo/persona odiada o autor (@usuario)..."
                    className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-gray-800 placeholder:text-gray-400 font-medium"
                  />
                  {searchText && (
                    <button
                      type="button"
                      onClick={() => setSearchText('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {(searchText || selectedCategory !== 'all' || selectedTarget !== 'all' || filterMode !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchText('');
                      setSelectedCategory('all');
                      setSelectedTarget('all');
                      setFilterMode('all');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold hover:bg-rose-100 cursor-pointer shrink-0"
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>Limpiar filtros</span>
                  </button>
                )}
              </div>
            </div>

            {/* Messages Scrollable List */}
            <div className="divide-y divide-gray-100 max-h-[480px] overflow-y-auto p-3 sm:p-4 space-y-2.5">
              {filteredMessages.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-xs">
                  No se encontraron mensajes para los filtros seleccionados.
                </div>
              ) : (
                filteredMessages.map((msg) => {
                  const isHate = msg.is_hate_speech;
                  return (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-xl border transition-all ${
                        isHate
                          ? msg.severity === 'alto'
                            ? 'bg-red-50/70 border-red-300'
                            : msg.severity === 'medio'
                            ? 'bg-rose-50/50 border-rose-200'
                            : 'bg-amber-50/40 border-amber-200'
                          : 'bg-white border-gray-200/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {msg.source === 'superchat' ? (
                            <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full">
                              <DollarSign className="w-3 h-3" />
                              <span>
                                SUPERCHAT {msg.amount ? `$${formatNumber(msg.amount)} ${msg.currency || ''}` : ''}
                              </span>
                            </span>
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-bold text-xs shrink-0">
                              <User className="w-3.5 h-3.5" />
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setSearchText(msg.author_id)}
                            className="font-bold text-xs text-gray-900 hover:text-rose-600 font-mono cursor-pointer"
                          >
                            {msg.author_id}
                          </button>

                          {isHate ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                msg.severity === 'alto'
                                  ? 'bg-red-600 text-white'
                                  : msg.severity === 'medio'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : 'bg-amber-100 text-amber-800 border border-amber-300'
                              }`}
                            >
                              <ShieldAlert className="w-3 h-3" />
                              Odio: {msg.severity} ({msg.hate_score}/100)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Sin odio dirigido
                            </span>
                          )}

                          {/* Target Group / Person badges */}
                          {isHate &&
                            (msg.hate_targets || []).map((target) => (
                              <span
                                key={target}
                                className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-rose-900 text-white px-2 py-0.5 rounded-md shadow-2xs"
                              >
                                🎯 Contra: {target}
                              </span>
                            ))}

                          {msg.categories.map((cid) => {
                            const catDef = HATE_SPEECH_CATEGORIES.find((c) => c.id === cid);
                            return (
                              <span
                                key={cid}
                                className="text-[10px] font-bold bg-white/90 text-gray-700 border border-gray-300 px-2 py-0.5 rounded-md"
                              >
                                {catDef?.shortName || cid}
                              </span>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span>{formatDate(msg.created_at)}</span>
                        </div>
                      </div>

                      <p className="text-xs sm:text-sm text-gray-900 font-medium whitespace-pre-wrap break-words leading-relaxed">
                        {msg.comment_text || '(Sin texto)'}
                      </p>

                      {isHate && (msg.matched_terms.length > 0 || msg.reason) && (
                        <div className="mt-2 pt-1.5 border-t border-rose-200/60 flex flex-wrap items-center gap-1.5 text-[11px] text-rose-800">
                          <span className="font-bold">Blanco y términos detectados:</span>
                          {msg.reason && <span>{msg.reason}</span>}
                          {msg.matched_terms.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {msg.matched_terms.map((term) => (
                                <span
                                  key={term}
                                  className="px-1.5 py-0.2 bg-rose-100 text-rose-900 rounded font-mono text-[10px] font-bold"
                                >
                                  "{term}"
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
