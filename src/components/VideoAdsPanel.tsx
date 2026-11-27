import React, { useMemo, useState } from 'react';
import {
  Megaphone,
  RefreshCw,
  Play,
  ExternalLink,
  Clock,
  Users,
  Tag,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  Pencil,
  Check,
  X,
  Trash2,
} from 'lucide-react';
import { formatNumber } from '../data/mockData';

export interface DetectedAdItem {
  id: string;
  brand: string;
  category: string;
  ad_type: 'PNT' | 'Spot / Tanda' | 'Auspicio' | 'Mención / Chivo';
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  excerpt: string;
  confidence: 'alta' | 'media';
  clock_offset_sec?: number;
}

export interface VideoAdsAnalysis {
  video_id: string;
  total_ads: number;
  unique_brands: string[];
  total_ad_seconds: number;
  caption_cues_analyzed: number;
  ads: DetectedAdItem[];
  engine: 'gemini' | 'heuristic';
  model?: string;
  cached?: boolean;
  clock_offset_sec?: number;
  analyzed_at: string;
}

export interface AdAudienceSnapshot {
  clockTimeLabel: string | null;
  viewers: number | null;
  isInterpolated: boolean;
  clampedEdge?: 'before' | 'after' | null;
  clampedLabel?: string;
  rangeStartLabel?: string;
  rangeEndLabel?: string;
}

interface VideoAdsPanelProps {
  videoId: string;
  analysis: VideoAdsAnalysis | null;
  loading: boolean;
  error: string | null;
  activeTimeSec?: number;
  onAnalyze: (force?: boolean) => void;
  onSeekToSecond?: (sec: number) => void;
  getAudienceAtSecond?: (sec: number, extraClockOffsetSec?: number) => AdAudienceSnapshot | null;
  variant?: 'dark' | 'light';
  hideReanalyze?: boolean;
  standalone?: boolean;
  onAdjustAdTimestamp?: (adId: string, deltaSec: number) => void;
  onAdjustAdClockOffset?: (adId: string, deltaSec: number | null) => void;
  onRenameAdBrand?: (adId: string, newBrand: string) => void;
  onDeleteSingleAd?: (adId: string) => void;
  onDeleteAds?: () => void;
  deletingAds?: boolean;
}

function formatSignedOffset(offsetSec: number): string {
  if (!offsetSec) return '0s';
  const sign = offsetSec > 0 ? '+' : '-';
  const abs = Math.abs(Math.round(offsetSec));
  const hrs = Math.floor(abs / 3600);
  const mins = Math.floor((abs % 3600) / 60);
  const secs = abs % 60;
  if (hrs > 0) {
    if (mins > 0 && secs > 0) return `${sign}${hrs}h${mins}m${secs}s`;
    if (mins > 0) return `${sign}${hrs}h${mins}m`;
    if (secs > 0) return `${sign}${hrs}h${secs}s`;
    return `${sign}${hrs}h`;
  }
  if (mins > 0 && secs > 0) return `${sign}${mins}m${secs}s`;
  if (mins > 0) return `${sign}${mins}m`;
  return `${sign}${secs}s`;
}

function formatOffsetTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatTotalDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec || 0));
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

export const VideoAdsPanel: React.FC<VideoAdsPanelProps> = ({
  videoId,
  analysis,
  loading,
  error,
  activeTimeSec,
  onAnalyze,
  onSeekToSecond,
  getAudienceAtSecond,
  variant = 'light',
  hideReanalyze = false,
  standalone = false,
  onAdjustAdTimestamp,
  onAdjustAdClockOffset,
  onRenameAdBrand,
  onDeleteSingleAd,
  onDeleteAds,
  deletingAds = false,
}) => {
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [editingBrandAdId, setEditingBrandAdId] = useState<string | null>(null);
  const [editingBrandValue, setEditingBrandValue] = useState<string>('');
  const [confirmingDelete, setConfirmingDelete] = useState<boolean>(false);
  const [confirmDeleteAdId, setConfirmDeleteAdId] = useState<string | null>(null);
  const isDark = variant === 'dark';

  const brandCounts = useMemo(() => {
    if (!analysis?.ads) return [];
    const map = new Map<string, number>();
    for (const ad of analysis.ads) {
      map.set(ad.brand, (map.get(ad.brand) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [analysis]);

  const effectiveSelectedBrand = useMemo(() => {
    if (selectedBrand === 'ALL') return 'ALL';
    return brandCounts.some(([b]) => b === selectedBrand) ? selectedBrand : 'ALL';
  }, [selectedBrand, brandCounts]);

  const filteredAds = useMemo(() => {
    if (!analysis?.ads) return [];
    if (effectiveSelectedBrand === 'ALL') return analysis.ads;
    return analysis.ads.filter((a) => a.brand === effectiveSelectedBrand);
  }, [analysis, effectiveSelectedBrand]);

  const startEditingBrand = (ad: DetectedAdItem) => {
    setEditingBrandAdId(ad.id);
    setEditingBrandValue(ad.brand || '');
  };

  const commitEditingBrand = (ad: DetectedAdItem) => {
    const trimmed = editingBrandValue.trim();
    setEditingBrandAdId(null);
    if (trimmed && trimmed !== ad.brand && onRenameAdBrand) {
      if (selectedBrand === ad.brand) {
        setSelectedBrand(trimmed);
      }
      onRenameAdBrand(ad.id, trimmed);
    }
  };

  const cancelEditingBrand = () => {
    setEditingBrandAdId(null);
    setEditingBrandValue('');
  };

  const getAdTypeStyle = (adType: DetectedAdItem['ad_type']) => {
    if (isDark) {
      switch (adType) {
        case 'Spot / Tanda':
          return 'bg-purple-500/20 text-purple-200 border-purple-400/30';
        case 'Auspicio':
          return 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30';
        case 'Mención / Chivo':
          return 'bg-sky-500/20 text-sky-200 border-sky-400/30';
        default:
          return 'bg-amber-500/20 text-amber-200 border-amber-400/30';
      }
    }
    switch (adType) {
      case 'Spot / Tanda':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Auspicio':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Mención / Chivo':
        return 'bg-sky-100 text-sky-800 border-sky-200';
      default:
        return 'bg-amber-100 text-amber-800 border-amber-200';
    }
  };

  // Loading state
  if (loading) {
    return (
      <div
        className={`px-4 py-8 flex flex-col items-center justify-center text-center gap-3 ${
          isDark ? 'bg-gray-950 text-gray-300 border-t border-white/10' : 'bg-white text-gray-600'
        }`}
      >
        <RefreshCw className={`w-6 h-6 animate-spin ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
        <div className="space-y-1">
          <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Analizando subtítulos para detectar anuncios y PNTs...
          </p>
          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Escaneando menciones comerciales, auspicios, tandas y códigos promocionales en el transcript de YouTube.
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isDark
            ? 'bg-gray-950 border-t border-white/10 text-rose-200'
            : 'bg-rose-50/60 border border-rose-200 rounded-xl m-4 text-rose-800'
        }`}
      >
        <div className="flex items-start gap-2.5 text-xs sm:text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
          <span>{error}</span>
        </div>
        {!hideReanalyze && (
          <button
            type="button"
            onClick={() => onAnalyze(true)}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 cursor-pointer transition-colors ${
              isDark
                ? 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                : 'bg-white hover:bg-rose-100 text-rose-700 border border-rose-300'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reintentar</span>
          </button>
        )}
      </div>
    );
  }

  // Initial empty (not yet analyzed) state
  if (!analysis) {
    return (
      <div
        className={`px-4 py-8 flex flex-col items-center justify-center text-center gap-3 ${
          isDark ? 'bg-gray-950 text-gray-300 border-t border-white/10' : 'bg-white text-gray-600'
        }`}
      >
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700'
          }`}
        >
          <Megaphone className="w-5 h-5" />
        </div>
        <div className="space-y-1 max-w-md">
          <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Detector de Anuncios y PNTs
          </p>
          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {hideReanalyze
              ? 'Esta emisión todavía no cuenta con una medición de anuncios.'
              : 'Detecta automáticamente marcas, auspicios, PNTs y tandas comerciales a partir de los subtítulos sincronizados de YouTube.'}
          </p>
        </div>
        {!hideReanalyze && (
          <button
            type="button"
            onClick={() => onAnalyze(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-gray-950 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Analizar anuncios ahora</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={
        isDark
          ? 'bg-gray-950 border-t border-white/10 text-gray-200'
          : standalone
          ? 'bg-white text-black p-5 sm:p-6 space-y-4'
          : 'flex-1 overflow-y-auto bg-white text-black p-4 sm:p-5 space-y-4'
      }
    >
      {/* Header Summary Bar */}
      <div
        className={
          isDark
            ? 'px-3.5 py-2.5 bg-gray-900/70 border-b border-white/10 flex flex-wrap items-center justify-between gap-2'
            : 'pb-3.5 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 bg-white'
        }
      >
        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
          <span
            className={`inline-flex items-center gap-1.5 font-bold ${
              isDark ? 'text-amber-300' : 'text-black'
            }`}
          >
            <Megaphone className={`w-4 h-4 ${isDark ? '' : 'text-amber-600'}`} />
            <span>
              {analysis.total_ads}{' '}
              {analysis.total_ads === 1 ? 'anuncio detectado' : 'anuncios detectados'}
            </span>
          </span>

          <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>|</span>

          <span className={isDark ? 'text-gray-300' : 'text-black'}>
            <strong className={isDark ? 'text-white' : 'text-black font-bold'}>
              {analysis.unique_brands.length}
            </strong>{' '}
            {analysis.unique_brands.length === 1 ? 'marca' : 'marcas'}
          </span>

          {analysis.total_ad_seconds > 0 && (
            <>
              <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>|</span>
              <span className={isDark ? 'text-gray-300' : 'text-black'}>
                Pauta aprox:{' '}
                <strong className={isDark ? 'text-white' : 'text-black font-bold'}>
                  {formatTotalDuration(analysis.total_ad_seconds)}
                </strong>
              </span>
            </>
          )}

          {analysis.engine === 'heuristic' && !hideReanalyze && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                isDark
                  ? 'bg-gray-800 text-gray-400 border border-gray-700'
                  : 'bg-gray-100 text-black'
              }`}
              title="Análisis rápido por reglas sobre los subtítulos de YouTube"
            >
              Modo rápido
            </span>
          )}
        </div>

        {(!hideReanalyze || onDeleteAds) && (
          <div className="flex items-center gap-2 flex-wrap">
            {!hideReanalyze && (
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  onAnalyze(true);
                }}
                disabled={deletingAds}
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded border transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                  isDark
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700'
                    : 'bg-white hover:bg-gray-100 text-black border-gray-300'
                }`}
                title="Volver a analizar los subtítulos completos"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Re-analizar</span>
              </button>
            )}

            {onDeleteAds && (
              confirmingDelete ? (
                <div className="inline-flex items-center gap-1.5 text-[11px]">
                  <span className={isDark ? 'text-rose-300 font-semibold' : 'text-red-700 font-semibold'}>
                    ¿Borrar de /brands?
                  </span>
                  <button
                    type="button"
                    disabled={deletingAds}
                    onClick={() => {
                      setConfirmingDelete(false);
                      onDeleteAds();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded font-bold bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{deletingAds ? 'Borrando...' : 'Sí, borrar'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={deletingAds}
                    onClick={() => setConfirmingDelete(false)}
                    className={`px-2 py-1 rounded border font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      isDark
                        ? 'bg-gray-800 text-gray-300 border-gray-700 hover:text-white'
                        : 'bg-white text-black border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={deletingAds}
                  onClick={() => setConfirmingDelete(true)}
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded border transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                    isDark
                      ? 'bg-gray-900 hover:bg-rose-950/60 text-rose-300 border-rose-500/30'
                      : 'bg-white hover:bg-red-50 text-red-700 border-red-200 hover:border-red-300'
                  }`}
                  title="Borrar esta medición de anuncios para que deje de aparecer en /brands"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Borrar medición</span>
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Brand Filter Row */}
      {brandCounts.length > 1 && (
        <div
          className={
            isDark
              ? 'px-3.5 py-2 border-b border-white/10 flex items-center gap-1.5 flex-wrap bg-gray-950'
              : 'flex items-center gap-1.5 flex-wrap'
          }
        >
          <button
            type="button"
            onClick={() => setSelectedBrand('ALL')}
            className={`text-xs font-semibold px-2.5 py-1 rounded border transition-colors cursor-pointer ${
              effectiveSelectedBrand === 'ALL'
                ? isDark
                  ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                  : 'bg-black text-white border-black'
                : isDark
                ? 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white'
                : 'bg-white text-black border-gray-300 hover:bg-gray-100'
            }`}
          >
            Todas ({analysis.total_ads})
          </button>
          {brandCounts.map(([brand, count]) => (
            <button
              key={brand}
              type="button"
              onClick={() => setSelectedBrand(brand)}
              className={`text-xs font-medium px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                effectiveSelectedBrand === brand
                  ? isDark
                    ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                    : 'bg-black text-white border-black'
                  : isDark
                  ? 'bg-gray-900 text-gray-300 border-gray-800 hover:text-white'
                  : 'bg-white text-black border-gray-300 hover:bg-gray-100'
              }`}
            >
              {brand} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Empty Ads Result */}
      {filteredAds.length === 0 ? (
        <div
          className={`px-4 py-6 text-center text-xs flex flex-col items-center gap-2 ${
            isDark ? 'text-gray-400' : 'text-gray-500 bg-gray-50 rounded-xl border border-gray-200'
          }`}
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <p>
            No se detectaron anuncios comerciales ni PNTs en los subtítulos analizados (
            {formatNumber(analysis.caption_cues_analyzed)} bloques revisados).
          </p>
        </div>
      ) : (
        <div
          className={
            isDark
              ? 'max-h-72 overflow-y-auto divide-y divide-gray-800/80'
              : 'space-y-2.5'
          }
        >
          {filteredAds.map((ad) => {
            const isActive =
              typeof activeTimeSec === 'number' &&
              activeTimeSec >= ad.start_sec - 2 &&
              activeTimeSec <= ad.end_sec + 3;
            const adClockOffset = Number(ad.clock_offset_sec || 0);
            const audience = getAudienceAtSecond
              ? getAudienceAtSecond(ad.start_sec, adClockOffset)
              : null;
            const isEditingBrand = editingBrandAdId === ad.id;

            const hasAudienceViewers =
              audience?.viewers !== null && audience?.viewers !== undefined;

            return (
              <div
                key={ad.id}
                className={
                  isDark
                    ? `px-3.5 py-3 transition-colors ${
                        isActive
                          ? 'bg-amber-500/15 border-l-2 border-amber-400'
                          : 'hover:bg-gray-900/70'
                      }`
                    : `p-3.5 sm:px-4 sm:py-3.5 rounded-xl border transition-colors ${
                        isActive
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`
                }
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-5">
                  {/* Left column: metadata, controls & truncated caption excerpt */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      {/* Timestamp button (with optional per-row -10s / +10s adjustment) or YouTube link */}
                      {onSeekToSecond ? (
                        <div className="inline-flex items-center gap-1 shrink-0">
                          {onAdjustAdTimestamp && (
                            <button
                              type="button"
                              onClick={() => onAdjustAdTimestamp(ad.id, -10)}
                              className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors cursor-pointer whitespace-nowrap ${
                                isDark
                                  ? 'bg-gray-900 hover:bg-gray-800 text-gray-300 border-gray-700'
                                  : 'bg-white hover:bg-gray-100 text-black border-gray-300'
                              }`}
                              title="Atrasar este anuncio 10 segundos (solo este renglón)"
                            >
                              -10s
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onSeekToSecond(ad.start_sec)}
                            className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors tabular-nums whitespace-nowrap ${
                              isActive
                                ? 'bg-amber-500 text-gray-950'
                                : isDark
                                ? 'bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-400/30'
                                : 'bg-amber-100 hover:bg-amber-200 text-black border border-amber-300'
                            }`}
                            title={`Ir al segundo ${formatOffsetTime(ad.start_sec)} en el video`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>{formatOffsetTime(ad.start_sec)}</span>
                          </button>
                          {onAdjustAdTimestamp && (
                            <button
                              type="button"
                              onClick={() => onAdjustAdTimestamp(ad.id, 10)}
                              className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors cursor-pointer whitespace-nowrap ${
                                isDark
                                  ? 'bg-gray-900 hover:bg-gray-800 text-gray-300 border-gray-700'
                                  : 'bg-white hover:bg-gray-100 text-black border-gray-300'
                              }`}
                              title="Adelantar este anuncio 10 segundos (solo este renglón)"
                            >
                              +10s
                            </button>
                          )}
                        </div>
                      ) : (
                        <a
                          href={`https://youtube.com/watch?v=${videoId}&t=${Math.max(0, Math.floor(ad.start_sec))}s`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-colors"
                          title="Abrir este anuncio exacto en YouTube"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>{formatOffsetTime(ad.start_sec)}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                        </a>
                      )}

                      {/* Brand Name (inline editable when onRenameAdBrand is provided) */}
                      {isEditingBrand && onRenameAdBrand ? (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="text"
                            value={editingBrandValue}
                            onChange={(e) => setEditingBrandValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitEditingBrand(ad);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEditingBrand();
                              }
                            }}
                            autoFocus
                            maxLength={120}
                            aria-label="Editar nombre de marca"
                            className={`text-xs sm:text-sm font-bold px-2 py-0.5 rounded border outline-none w-40 sm:w-52 ${
                              isDark
                                ? 'bg-gray-900 text-white border-amber-400 focus:ring-1 focus:ring-amber-400'
                                : 'bg-white text-black border-blue-500 focus:ring-1 focus:ring-blue-500'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => commitEditingBrand(ad)}
                            className={`p-1 rounded border transition-colors cursor-pointer ${
                              isDark
                                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/30'
                                : 'bg-black text-white border-black hover:bg-neutral-800'
                            }`}
                            title="Guardar nombre de marca"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingBrand}
                            className={`p-1 rounded border transition-colors cursor-pointer ${
                              isDark
                                ? 'bg-gray-800 text-gray-300 border-gray-700 hover:text-white'
                                : 'bg-white text-black border-gray-300 hover:bg-gray-100'
                            }`}
                            title="Cancelar edición"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : onRenameAdBrand ? (
                        <button
                          type="button"
                          onClick={() => startEditingBrand(ad)}
                          className={`group/brand inline-flex items-center gap-1.5 text-sm font-bold text-left rounded px-1 -mx-1 transition-colors cursor-pointer ${
                            isDark
                              ? 'text-white hover:bg-white/10'
                              : 'text-black hover:bg-gray-100'
                          }`}
                          title="Clic para editar el nombre de la marca"
                        >
                          <span>{ad.brand}</span>
                          <Pencil
                            className={`w-3 h-3 shrink-0 transition-opacity ${
                              isDark
                                ? 'text-gray-400 opacity-60 group-hover/brand:opacity-100'
                                : 'text-neutral-500 opacity-60 group-hover/brand:opacity-100'
                            }`}
                          />
                        </button>
                      ) : (
                        <span
                          className={`text-sm font-bold ${
                            isDark ? 'text-white' : 'text-black'
                          }`}
                        >
                          {ad.brand}
                        </span>
                      )}

                      {/* Ad Type Badge */}
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getAdTypeStyle(
                          ad.ad_type
                        )}`}
                      >
                        {ad.ad_type}
                      </span>

                      {/* Category */}
                      <span
                        className={`inline-flex items-center gap-1 text-xs ${
                          isDark ? 'text-gray-400' : 'text-neutral-700'
                        }`}
                      >
                        <Tag className="w-3 h-3 opacity-70" />
                        <span>{ad.category}</span>
                      </span>

                      {/* Duration */}
                      <span
                        className={`font-mono text-xs ${isDark ? 'text-gray-400' : 'text-neutral-600'}`}
                        title="Duración estimada del bloque publicitario"
                      >
                        ~{ad.duration_sec}s
                      </span>

                      {/* Real clock + optional per-row clock offset controls */}
                      {audience?.clockTimeLabel && (
                        <div className="inline-flex items-center gap-1.5 flex-wrap text-xs">
                          <span
                            className={`inline-flex items-center gap-1 font-mono tabular-nums ${
                              isDark ? 'text-gray-300' : 'text-neutral-800'
                            }`}
                            title="Hora real en que salió este anuncio"
                          >
                            <Clock className="w-3 h-3 opacity-70" />
                            <span>{audience.clockTimeLabel}</span>
                          </span>

                          {onAdjustAdClockOffset && (
                            <div
                              className={`inline-flex items-center rounded border overflow-hidden font-mono text-[10px] ${
                                isDark
                                  ? 'bg-black/50 border-white/10'
                                  : 'bg-white border-gray-300'
                              }`}
                              title="Ajustar el horario real y la audiencia únicamente para este anuncio"
                            >
                              <button
                                type="button"
                                onClick={() => onAdjustAdClockOffset(ad.id, -3600)}
                                className={`px-1.5 py-0.5 transition-colors cursor-pointer whitespace-nowrap ${
                                  isDark
                                    ? 'text-gray-400 hover:text-white hover:bg-white/10'
                                    : 'text-black hover:bg-gray-100'
                                }`}
                                title="Restar 1 hora solo a este anuncio"
                              >
                                -1h
                              </button>
                              <button
                                type="button"
                                onClick={() => onAdjustAdClockOffset(ad.id, -60)}
                                className={`px-1.5 py-0.5 border-l transition-colors cursor-pointer whitespace-nowrap ${
                                  isDark
                                    ? 'border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                                    : 'border-gray-200 text-black hover:bg-gray-100'
                                }`}
                                title="Restar 1 minuto solo a este anuncio"
                              >
                                -1m
                              </button>
                              <button
                                type="button"
                                onClick={() => onAdjustAdClockOffset(ad.id, -10)}
                                className={`px-1.5 py-0.5 border-l transition-colors cursor-pointer whitespace-nowrap ${
                                  isDark
                                    ? 'border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                                    : 'border-gray-200 text-black hover:bg-gray-100'
                                }`}
                                title="Restar 10 segundos solo a este anuncio"
                              >
                                -10s
                              </button>
                              {adClockOffset !== 0 && (
                                <button
                                  type="button"
                                  onClick={() => onAdjustAdClockOffset(ad.id, null)}
                                  className={`px-1.5 py-0.5 border-l font-bold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                                    isDark
                                      ? 'border-white/10 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                                      : 'border-gray-200 bg-amber-100 text-black hover:bg-amber-200'
                                  }`}
                                  title="Clic para volver el ajuste horario de este anuncio a 0s"
                                >
                                  {formatSignedOffset(adClockOffset)}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onAdjustAdClockOffset(ad.id, 10)}
                                className={`px-1.5 py-0.5 border-l transition-colors cursor-pointer whitespace-nowrap ${
                                  isDark
                                    ? 'border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                                    : 'border-gray-200 text-black hover:bg-gray-100'
                                }`}
                                title="Sumar 10 segundos solo a este anuncio"
                              >
                                +10s
                              </button>
                              <button
                                type="button"
                                onClick={() => onAdjustAdClockOffset(ad.id, 60)}
                                className={`px-1.5 py-0.5 border-l transition-colors cursor-pointer whitespace-nowrap ${
                                  isDark
                                    ? 'border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                                    : 'border-gray-200 text-black hover:bg-gray-100'
                                }`}
                                title="Sumar 1 minuto solo a este anuncio"
                              >
                                +1m
                              </button>
                              <button
                                type="button"
                                onClick={() => onAdjustAdClockOffset(ad.id, 3600)}
                                className={`px-1.5 py-0.5 border-l transition-colors cursor-pointer whitespace-nowrap ${
                                  isDark
                                    ? 'border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                                    : 'border-gray-200 text-black hover:bg-gray-100'
                                }`}
                                title="Sumar 1 hora solo a este anuncio"
                              >
                                +1h
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Literal caption excerpt — truncated cleanly before the right edge */}
                    <p
                      title={ad.excerpt}
                      className={`text-xs sm:text-sm leading-snug italic truncate max-w-full sm:max-w-[92%] ${
                        isDark ? 'text-gray-300' : 'text-neutral-700'
                      }`}
                    >
                      “{ad.excerpt}”
                    </p>
                  </div>

                  {/* Right column: Hero Concurrent Viewers metric + optional delete button */}
                  {(hasAudienceViewers || onDeleteSingleAd) && (
                    <div
                      className={`shrink-0 flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 sm:border-l sm:pl-5 ${
                        isDark ? 'border-white/10' : 'border-gray-200'
                      }`}
                    >
                      {hasAudienceViewers && audience && (
                        <div
                          className={`flex flex-col items-start sm:items-end rounded-lg px-2.5 py-1.5 ${
                            isDark
                              ? 'bg-blue-500/15 border border-blue-400/30'
                              : 'bg-blue-50/70 border border-blue-200/80'
                          }`}
                          title={
                            audience.isInterpolated
                              ? 'Audiencia estimada por interpolación lineal en el horario indicado'
                              : 'Audiencia registrada en el horario indicado'
                          }
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <Users
                              className={`w-4 h-4 shrink-0 ${
                                isDark ? 'text-blue-300' : 'text-blue-600'
                              }`}
                            />
                            <span
                              className={`text-xl sm:text-2xl font-black tabular-nums leading-none tracking-tight ${
                                isDark ? 'text-blue-200' : 'text-blue-700'
                              }`}
                            >
                              {formatNumber(audience.viewers!)}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 leading-none ${
                              isDark ? 'text-blue-300/80' : 'text-slate-500'
                            }`}
                          >
                            espectadores
                          </span>
                        </div>
                      )}

                      {onDeleteSingleAd && (
                        confirmDeleteAdId === ad.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteAdId(null);
                                onDeleteSingleAd(ad.id);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white border border-rose-700 transition-colors cursor-pointer whitespace-nowrap"
                              title="Confirmar borrado de este PNT"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Borrar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAdId(null)}
                              className={`p-1 rounded border transition-colors cursor-pointer ${
                                isDark
                                  ? 'bg-gray-800 text-gray-300 border-gray-700 hover:text-white'
                                  : 'bg-white text-black border-gray-300 hover:bg-gray-100'
                              }`}
                              title="Cancelar"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAdId(ad.id)}
                            className={`inline-flex items-center justify-center p-1.5 rounded border transition-colors cursor-pointer ${
                              isDark
                                ? 'bg-gray-900 text-gray-400 border-gray-700 hover:bg-rose-500/20 hover:text-rose-200 hover:border-rose-400/40'
                                : 'bg-white text-gray-500 border-gray-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300'
                            }`}
                            title="Borrar este PNT"
                            aria-label={`Borrar PNT ${ad.brand}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
