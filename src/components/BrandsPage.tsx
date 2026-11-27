import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  ArrowRight,
  ChevronRight,
  Megaphone,
  AlertCircle,
} from 'lucide-react';
import { formatNumber } from '../data/mockData';
import { formatArgentinaDateTime } from '../utils/dateFilter';
import { SITE_NAME } from '../config/site';
import { trackEvent, updateSeoMeta } from '../utils/analytics';

const HERO_AGENCY_IMG = '/assets/images/brands_agency_studio_hero.jpg';

export interface BrandMeasuredStream {
  stream_key: string;
  video_id: string;
  title_hash: string | null;
  channel_id: string;
  channel: string;
  channel_name: string;
  thumb: string;
  channel_type: string;
  video_title: string;
  start_date: string;
  video_start_date: string;
  scrape_date: string;
  avg_viewers: number;
  peak_viewers: number;
  ads_count: number;
  unique_brands: string[];
  total_ad_seconds: number;
  clock_offset_sec: number;
  analyzed_at: string;
}

export interface BrandsListSummary {
  total_streams: number;
  total_ads: number;
  unique_brands_count: number;
  total_ad_seconds: number;
  avg_viewers_across_streams: number;
  top_brands: string[];
}

type BrandsSortOption = 'recent' | 'viewers' | 'ads';

interface BrandsPageProps {
  onNavigateBrandStream: (streamKey: string) => void;
  onNavigateChannel: (channelHandle: string) => void;
  onNavigateContact: () => void;
}

export const BrandsPage: React.FC<BrandsPageProps> = ({
  onNavigateBrandStream,
  onNavigateChannel,
  onNavigateContact,
}) => {
  const [streams, setStreams] = useState<BrandMeasuredStream[]>([]);
  const [summary, setSummary] = useState<BrandsListSummary>({
    total_streams: 0,
    total_ads: 0,
    unique_brands_count: 0,
    total_ad_seconds: 0,
    avg_viewers_across_streams: 0,
    top_brands: [],
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [sortBy, setSortBy] = useState<BrandsSortOption>('ads');
  const [heroImgFailed, setHeroImgFailed] = useState<boolean>(false);

  const fetchMeasuredStreams = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/brands', {
        headers: { 'X-App-Client': 'kukastream-web' },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setStreams(Array.isArray(data.streams) ? data.streams : []);
        if (data.summary) {
          setSummary(data.summary);
        }
      } else {
        setError(data?.error || 'No se pudieron cargar las emisiones auditadas.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error de conexión al consultar emisiones medidas.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeasuredStreams();
  }, [fetchMeasuredStreams]);

  useEffect(() => {
    updateSeoMeta({
      title: `${SITE_NAME} - Brands & Auditoría de Pauta en Streaming`,
      description: `Auditoría de anuncios y PNT en canales de streaming de Argentina. Verificación en video al segundo exacto y audiencia concurrente real para agencias de medios y marcas.`,
    });
  }, []);

  const allBrands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of streams) {
      for (const b of s.unique_brands || []) {
        counts.set(b, (counts.get(b) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [streams]);

  const filteredStreams = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = streams.filter((s) => {
      if (selectedBrand !== 'all') {
        const hasBrand = (s.unique_brands || []).some(
          (b) => b.toLowerCase() === selectedBrand.toLowerCase()
        );
        if (!hasBrand) return false;
      }
      if (!q) return true;
      const inTitle = (s.video_title || '').toLowerCase().includes(q);
      const inChannel = (s.channel_name || '').toLowerCase().includes(q);
      const inHandle = (s.channel || '').toLowerCase().includes(q);
      const inBrands = (s.unique_brands || []).some((b) => b.toLowerCase().includes(q));
      return inTitle || inChannel || inHandle || inBrands;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'viewers') {
        return b.avg_viewers - a.avg_viewers || b.ads_count - a.ads_count;
      }
      if (sortBy === 'ads') {
        return b.ads_count - a.ads_count || b.avg_viewers - a.avg_viewers;
      }
      const aTime = new Date(a.start_date || a.analyzed_at).getTime() || 0;
      const bTime = new Date(b.start_date || b.analyzed_at).getTime() || 0;
      return bTime - aTime || b.avg_viewers - a.avg_viewers;
    });
  }, [streams, searchQuery, selectedBrand, sortBy]);

  const scrollToStreams = () => {
    const el = document.getElementById('emisiones-auditadas');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="space-y-14 pb-12">
      {/* 1. Editorial B2B Hero (2-column split + 4-column live KPI strip) */}
      <section className="space-y-6 pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          {/* Left Copy Column */}
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
                Auditoría de pauta para agencias y marcas
              </p>
              <h1 className="text-3xl sm:text-5xl font-black text-slate-950 tracking-tight leading-[1.06] text-balance">
                Cada PNT en streaming, verificado con su audiencia real.
              </h1>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                Detectamos menciones comerciales y PNT en las emisiones en vivo de YouTube,
                las indexamos sobre el video al segundo exacto y calculamos cuántos espectadores
                estaban conectados en ese preciso instante.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={() => {
                  trackEvent('brands_hero_cta_contact');
                  onNavigateContact();
                }}
                className="inline-flex items-center gap-2 px-5 py-3 bg-slate-950 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Solicitar demo para agencias</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={scrollToStreams}
                className="inline-flex items-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 text-sm font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Explorar emisiones auditadas</span>
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Datos de emisiones reales relevadas en {SITE_NAME} · Sin estimaciones opacas ni
              reportes manuales.
            </p>
          </div>

          {/* Right Editorial Photography Column */}
          <div className="lg:col-span-6">
            <div className="relative h-64 sm:h-80 lg:h-full min-h-[300px] w-full rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm bg-slate-900">
              {!heroImgFailed ? (
                <img
                  src={HERO_AGENCY_IMG}
                  alt="Sala de planificación de medios en Buenos Aires con seguimiento de emisiones en streaming"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover object-center"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent p-5 sm:p-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-300">
                  Verificación audiovisual continua
                </p>
                <p className="text-sm sm:text-base font-semibold text-white mt-1 leading-snug max-w-md">
                  Prueba en video, transcripción sincronizada y curva minuto a minuto en un solo
                  reporte por emisión.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Full-Width 4-Column Live KPI Strip */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-5 sm:p-6">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Emisiones auditadas
              </div>
              <div className="mt-1.5 text-2xl sm:text-3xl font-black text-slate-950 tabular-nums">
                {isLoading && summary.total_streams === 0 ? '—' : formatNumber(summary.total_streams)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Programas con pauta medida</div>
            </div>

            <div className="p-5 sm:p-6">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Anuncios detectados
              </div>
              <div className="mt-1.5 text-2xl sm:text-3xl font-black text-amber-600 tabular-nums">
                {isLoading && summary.total_ads === 0 ? '—' : formatNumber(summary.total_ads)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">PNT y menciones con timestamp</div>
            </div>

            <div className="p-5 sm:p-6">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Marcas identificadas
              </div>
              <div className="mt-1.5 text-2xl sm:text-3xl font-black text-slate-950 tabular-nums">
                {isLoading && summary.unique_brands_count === 0
                  ? '—'
                  : formatNumber(summary.unique_brands_count)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Anunciantes activos relevados</div>
            </div>

            <div className="p-5 sm:p-6">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Audiencia promedio
              </div>
              <div className="mt-1.5 text-2xl sm:text-3xl font-black text-blue-600 tabular-nums">
                {isLoading && summary.avg_viewers_across_streams === 0
                  ? '—'
                  : formatNumber(summary.avg_viewers_across_streams)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Espectadores por emisión medida</div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Agency Benefits (comentado temporalmente)
      <section className="space-y-6">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Qué resuelve para tu agencia
          </p>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight text-balance">
            Certificación de pauta y análisis competitivo en un solo lugar.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="text-xs font-mono font-bold text-blue-700">01.</div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-950 tracking-tight">
                Testigo en video al segundo exacto de cada mención
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                Cada anuncio queda vinculado a su fragmento textual y al minuto exacto dentro del
                reproductor. Tu equipo de cuentas o el cliente final hace clic en cualquier PNT y
                reproduce al instante el momento exacto en que se nombró la marca, sin revisar horas
                de transmisión a mano.
              </p>
            </div>
            <div className="text-xs font-medium text-slate-500 pt-2 border-t border-slate-100">
              Transcripción sincronizada · Salto directo en el reproductor · Extracto textual por marca
            </div>
          </div>

          <div className="md:col-span-1 bg-slate-950 text-white border border-slate-900 rounded-2xl p-6 sm:p-7 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="text-xs font-mono font-bold text-amber-400">02.</div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Audiencia exacta del instante del PNT
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Un promedio diario oculta picos y caídas. Interpolamos nuestra medición minuto a
                minuto para informar los espectadores concurrentes reales en el segundo exacto del
                anuncio.
              </p>
            </div>
            <div className="text-xs font-medium text-slate-400 pt-2 border-t border-slate-800">
              Cruce horario con curva real de YouTube
            </div>
          </div>

          <div className="md:col-span-1 bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="text-xs font-mono font-bold text-blue-700">03.</div>
              <h3 className="text-lg font-bold text-slate-950 tracking-tight">
                Share of voice y seguimiento de competencia
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Identificá qué marcas pautan en cada programa, cuántas menciones acumulan por
                emisión y en qué franjas horarias logran mayor alcance real.
              </p>
            </div>
            <div className="text-xs font-medium text-slate-500 pt-2 border-t border-slate-100">
              Filtro por anunciante · Duración estimada de pauta
            </div>
          </div>

          <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="text-xs font-mono font-bold text-blue-700">04.</div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-950 tracking-tight">
                Calibración horaria y soporte para señales continuas 24/7
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                Cuando el reloj de pantalla difiere del inicio técnico del stream, el ajuste de
                desfase se guarda por emisión para mantener la audiencia exacta. Además, en canales
                continuos que reutilizan un mismo video para toda la jornada, cada programa se
                separa y audita con su propia URL única.
              </p>
            </div>
            <div className="text-xs font-medium text-slate-500 pt-2 border-t border-slate-100">
              Offset guardado en base de datos · Separación automática por programa en canales continuos
            </div>
          </div>
        </div>
      </section>
      */}

      {/* 3. Measured Emissions List (Stream cards with ONLY Avg Viewers & Ads Count) */}
      <section id="emisiones-auditadas" className="space-y-5 scroll-mt-20">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
              Muestra en vivo de auditorías
            </p>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
              Emisiones con anuncios medidos
            </h2>
            <p className="text-sm text-slate-600">
              Hacé clic en cualquier emisión para abrir el reproductor con los anuncios detectados,
              subtítulos sincronizados y curva de audiencia.
            </p>
          </div>

          <div className="text-xs font-semibold text-slate-500 tabular-nums whitespace-nowrap shrink-0">
            {filteredStreams.length}{' '}
            {filteredStreams.length === 1 ? 'emisión auditada' : 'emisiones auditadas'}
          </div>
        </div>

        {/* Search, Brand Filter & Sort Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por canal, programa o marca anunciante..."
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 bg-white shadow-2xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                title="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>

          {allBrands.length > 0 && (
            <select
              aria-label="Filtrar por marca"
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer sm:max-w-[210px]"
            >
              <option value="all">Todas las marcas ({allBrands.length})</option>
              {allBrands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label="Ordenar emisiones"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as BrandsSortOption)}
            className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer shrink-0"
          >
            <option value="ads">Más anuncios medidos</option>
            <option value="recent">Más recientes</option>
            <option value="viewers">Mayor audiencia promedio</option>
          </select>
        </div>

        {/* Error state */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={fetchMeasuredStreams}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reintentar</span>
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && streams.length === 0 ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-5 border border-gray-100 shadow-xs animate-pulse flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-9 h-9 bg-gray-200 rounded-full shrink-0" />
                  <div className="w-14 h-14 bg-gray-200 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-8">
                  <div className="w-20 h-10 bg-gray-100 rounded" />
                  <div className="w-20 h-10 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredStreams.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-slate-200 text-slate-500 space-y-2">
            <Megaphone className="w-8 h-8 mx-auto text-slate-300 mb-1" />
            <p className="font-semibold text-slate-800 text-sm">
              {searchQuery.trim() || selectedBrand !== 'all'
                ? 'No se encontraron emisiones auditadas con ese filtro.'
                : 'Todavía no hay emisiones con anuncios medidos en la base de datos.'}
            </p>
            {(searchQuery.trim() || selectedBrand !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedBrand('all');
                }}
                className="mt-2 inline-flex items-center text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                Ver todas las emisiones auditadas
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredStreams.map((stream, index) => {
              let badgeStyle = 'bg-gray-100 text-gray-600';
              if (index === 0) badgeStyle = 'bg-amber-400 text-amber-950 ring-2 ring-amber-300 shadow-xs';
              else if (index === 1) badgeStyle = 'bg-slate-300 text-slate-800 ring-2 ring-slate-200 shadow-xs';
              else if (index === 2) badgeStyle = 'bg-amber-700 text-amber-100 ring-2 ring-amber-600 shadow-xs';

              const detailHref = `/brands/${encodeURIComponent(stream.stream_key)}`;
              const brandsPreview = (stream.unique_brands || []).slice(0, 5);
              const extraBrandsCount = Math.max(0, (stream.unique_brands || []).length - brandsPreview.length);

              return (
                <a
                  key={stream.stream_key}
                  href={detailHref}
                  onClick={(e) => {
                    e.preventDefault();
                    trackEvent('open_brand_stream_detail', {
                      stream_key: stream.stream_key,
                      channel: stream.channel,
                      ads_count: stream.ads_count,
                    });
                    onNavigateBrandStream(stream.stream_key);
                  }}
                  className="block group bg-white rounded-xl p-4 sm:p-5 border border-gray-200/80 shadow-xs hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                >
                  {/* Desktop Stream Card Layout (matches /streams, ONLY avg viewers + ads count) */}
                  <div className="hidden sm:flex items-center justify-between gap-4">
                    <div className="flex items-center space-x-4 flex-1 min-w-0">
                      {/* Rank Number */}
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 tabular-nums ${badgeStyle}`}
                      >
                        {index + 1}
                      </div>

                      {/* Channel Avatar */}
                      <div className="relative shrink-0">
                        <img
                          src={stream.thumb}
                          alt={stream.channel_name}
                          className="w-14 h-14 rounded-full object-cover border-2 border-gray-200 group-hover:border-blue-300 transition-colors"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${stream.video_id}/hqdefault.jpg`;
                          }}
                        />
                      </div>

                      {/* Stream & Channel Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-gray-900 text-base group-hover:text-blue-600 transition-colors">
                            {stream.channel_name}
                          </span>
                          <span className="text-xs text-gray-400 font-mono">
                            {stream.channel}
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className="text-xs text-gray-500 font-medium">
                            {formatArgentinaDateTime(stream.start_date)}
                          </span>
                        </div>

                        <p
                          className="text-sm text-gray-800 leading-snug line-clamp-2 font-medium"
                          title={stream.video_title}
                        >
                          {stream.video_title || 'Emisión'}
                        </p>

                        {brandsPreview.length > 0 && (
                          <p className="text-xs text-slate-500 mt-1.5 truncate">
                            <span className="font-semibold text-slate-700">Marcas:</span>{' '}
                            {brandsPreview.join(' · ')}
                            {extraBrandsCount > 0 ? ` · +${extraBrandsCount} más` : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Desktop Stats: ONLY Espectadores Promedio & Cantidad de Anuncios */}
                    <div className="flex items-center space-x-7 shrink-0 pl-2">
                      <div className="text-center min-w-[100px]">
                        <div className="text-[11px] text-gray-400 font-semibold mb-0.5 uppercase">
                          Espectadores
                        </div>
                        <div className="font-extrabold text-2xl text-blue-600 tabular-nums">
                          {formatNumber(stream.avg_viewers)}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase font-medium">
                          Promedio
                        </div>
                      </div>

                      <div className="text-center min-w-[90px]">
                        <div className="text-[11px] text-gray-400 font-semibold mb-0.5 uppercase">
                          Anuncios
                        </div>
                        <div className="font-extrabold text-2xl text-amber-600 tabular-nums">
                          {formatNumber(stream.ads_count)}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase font-medium">
                          {stream.ads_count === 1 ? 'Medido' : 'Medidos'}
                        </div>
                      </div>

                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  </div>

                  {/* Mobile Stream Card Layout (ONLY avg viewers + ads count) */}
                  <div className="sm:hidden space-y-3">
                    <div className="flex items-start space-x-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 tabular-nums ${badgeStyle}`}
                      >
                        {index + 1}
                      </div>

                      <img
                        src={stream.thumb}
                        alt={stream.channel_name}
                        className="w-11 h-11 rounded-full object-cover border-2 border-gray-200 shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${stream.video_id}/hqdefault.jpg`;
                        }}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-900 text-sm truncate">
                            {stream.channel_name}
                          </span>
                          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {formatArgentinaDateTime(stream.start_date)}
                        </div>
                        <p className="text-xs text-gray-800 mt-1 leading-snug line-clamp-2 font-medium">
                          {stream.video_title || 'Emisión'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-gray-100">
                      <div>
                        <div className="text-[10px] text-gray-400 font-semibold uppercase">
                          Espectadores promedio
                        </div>
                        <div className="text-lg font-extrabold text-blue-600 tabular-nums">
                          {formatNumber(stream.avg_viewers)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 font-semibold uppercase">
                          Anuncios medidos
                        </div>
                        <div className="text-lg font-extrabold text-amber-600 tabular-nums">
                          {formatNumber(stream.ads_count)}
                        </div>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Agency Bottom Conversion Band */}
      <section className="bg-slate-950 text-white rounded-2xl p-7 sm:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border border-slate-900">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">
            Planes para agencias de medios y marcas
          </p>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-balance">
            ¿Querés auditar toda la pauta de tus clientes en streaming?
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Configuramos monitoreo diario sobre los canales que pautan tus clientes, alertas por
            mención de marca o competencia y reportes listos para certificar campañas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={() => {
              trackEvent('brands_footer_cta_contact');
              onNavigateContact();
            }}
            className="inline-flex items-center gap-2 px-5 py-3 bg-white hover:bg-amber-300 text-slate-950 text-sm font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Hablar con ventas</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          {streams.length > 0 && (
            <button
              onClick={() => onNavigateChannel(streams[0].channel)}
              className="inline-flex items-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-sm font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Ver canales</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
