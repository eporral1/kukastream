import React from 'react';
import {
  PoliticalAnalysisResult,
  PoliticalSectorAnalysis,
} from '../utils/politicalAnalysis';
import {
  Compass,
  ShieldCheck,
  Swords,
  Scale,
  MinusCircle,
  RefreshCw,
  Sparkles,
  MessageSquare,
} from 'lucide-react';

interface PoliticalCompassViewProps {
  analysis: PoliticalAnalysisResult | null;
  cached?: boolean;
  loading: boolean;
  error: string | null;
  onAnalyze: (force?: boolean) => void;
}

export const PoliticalCompassView: React.FC<PoliticalCompassViewProps> = ({
  analysis,
  cached,
  loading,
  error,
  onAnalyze,
}) => {
  // Convert (-100..100) coordinates to SVG (0..260)
  const toSvgX = (val: number) => 130 + (Math.max(-100, Math.min(100, val)) / 100) * 105;
  const toSvgY = (val: number) => 130 - (Math.max(-100, Math.min(100, val)) / 100) * 105;

  // Needle angle for semicircular dial (-90 deg = -100 Left/Opposition, 0 deg = Center, +90 deg = +100 Right/Libertarian)
  const needleValue = analysis
    ? Math.round(analysis.compass.x * 0.6 + analysis.compass.y * 0.4)
    : 0;
  const clampedNeedle = Math.max(-100, Math.min(100, needleValue));
  const needleAngleDeg = (clampedNeedle / 100) * 90;

  const getStanceBadge = (sector: PoliticalSectorAnalysis) => {
    if (sector.stance === 'defendido') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          DEFENDIDO ({sector.score > 0 ? `+${sector.score}` : sector.score})
        </span>
      );
    }
    if (sector.stance === 'atacado') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
          <Swords className="w-3.5 h-3.5 text-rose-600" />
          ATACADO ({sector.score})
        </span>
      );
    }
    if (sector.stance === 'neutral') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          <Scale className="w-3.5 h-3.5 text-amber-600" />
          NEUTRAL / DEBATIDO ({sector.score > 0 ? `+${sector.score}` : sector.score})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
        <MinusCircle className="w-3.5 h-3.5 text-gray-400" />
        SIN FOCO ({sector.score})
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
      {/* Header Box */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-indigo-50 via-blue-50/70 to-purple-50 p-4 rounded-xl border border-indigo-200 shadow-2xs">
        <div className="space-y-1">
          <h4 className="font-extrabold text-gray-900 text-sm sm:text-base flex items-center gap-2">
            <Compass className="w-5 h-5 text-indigo-600" />
            <span>Análisis de Tendencia Política y Compás de Opinión</span>
          </h4>
          <p className="text-xs text-gray-600">
            Identifica qué sectores políticos son <strong>defendidos</strong> o <strong>atacados</strong> (Milei, Kirchnerismo, Cristina Kirchner, PRO, Macri, Peronismo, UCR, Izquierda) y ubica la tendencia del video en el compás ideológico.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onAnalyze(Boolean(analysis))}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Analizando tendencia...</span>
              </>
            ) : analysis ? (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Actualizar Análisis Político</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Analizar Tendencia Política</span>
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
        <div className="p-6 bg-white rounded-xl border border-indigo-100 shadow-xs flex items-center space-x-3.5 animate-pulse">
          <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin shrink-0" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-gray-900 text-sm">
              Evaluando postura editorial, sectores políticos y generando compás de opinión...
            </p>
            <p className="text-gray-500">
              Analizando defensas y ataques hacia Milei, Kirchnerismo, Cristina Kirchner, PRO, Macri, Peronismo, UCR e Izquierda.
            </p>
          </div>
        </div>
      )}

      {!analysis && !loading && (
        <div className="text-center py-12 text-gray-500 bg-gray-50/60 rounded-xl border border-dashed border-gray-200 space-y-3">
          <Compass className="w-12 h-12 mx-auto text-indigo-400" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-gray-800">
              Generar Compás Político y Detección de Sectores Atacados / Defendidos
            </p>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Haz clic en el botón superior para analizar la tendencia de opinión del video y ver qué fuerzas políticas son respaldadas o cuestionadas.
            </p>
          </div>
          <button
            onClick={() => onAnalyze(false)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Ejecutar Análisis Político Ahora</span>
          </button>
        </div>
      )}

      {analysis && !loading && (
        <div className="space-y-5">
          {/* Executive Summary & Dominant Tendency Banner */}
          <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
                  Tendencia Detectada: {analysis.compass.tendency_label}
                </span>
                <span className="text-[11px] font-semibold bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md">
                  Polarización: <strong>{analysis.compass.polarization_score}%</strong>
                </span>
                <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                  {cached ? 'Cargado de DB (live.political_analysis)' : 'Guardado en DB (live.political_analysis)'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                <span>
                  {analysis.stats.comments_analyzed} comentarios • {analysis.stats.superchats_analyzed} superchats evaluados
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
              {analysis.executive_summary.replace(/\*\*/g, '')}
            </p>

            {/* Quick Defended vs Attacked Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900 mb-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Sectores Defendidos / A Favor</span>
                </div>
                {analysis.defended_sectors.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.defended_sectors.map((sec) => (
                      <span
                        key={sec}
                        className="px-2.5 py-1 bg-white text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold shadow-2xs"
                      >
                        🛡️ {sec}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-700/80 italic">
                    Ningún sector político con defensa partidaria dominante.
                  </p>
                )}
              </div>

              <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-rose-900 mb-2">
                  <Swords className="w-4 h-4 text-rose-600" />
                  <span>Sectores Atacados / Cuestionados</span>
                </div>
                {analysis.attacked_sectors.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.attacked_sectors.map((sec) => (
                      <span
                        key={sec}
                        className="px-2.5 py-1 bg-white text-rose-800 border border-rose-300 rounded-lg text-xs font-bold shadow-2xs"
                      >
                        ⚔️ {sec}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-rose-700/80 italic">
                    Sin ataques directos predominantes en este corte.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Visual Compass Section: Semicircular Needle Dial + 2D Political Compass */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Brújula / Aguja de Tendencia de Opinión */}
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs flex flex-col justify-between">
              <div>
                <h5 className="text-xs font-extrabold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-indigo-600" />
                  <span>Compás de Aguja (Tendencia del Video)</span>
                </h5>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Inclinación general entre Oposición / Izquierda-Kirchnerismo (-100) y Oficialismo / Derecha-Libertaria (+100)
                </p>
              </div>

              <div className="my-3 flex flex-col items-center">
                <svg viewBox="0 0 240 140" className="w-full max-w-[260px] overflow-visible">
                  <defs>
                    <linearGradient id="compassArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#ef4444" />
                      <stop offset="25%" stopColor="#3b82f6" />
                      <stop offset="50%" stopColor="#94a3b8" />
                      <stop offset="75%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                  </defs>

                  {/* Semicircle Track */}
                  <path
                    d="M 25 115 A 95 95 0 0 1 215 115"
                    fill="none"
                    stroke="url(#compassArcGrad)"
                    strokeWidth="18"
                    strokeLinecap="round"
                  />

                  {/* Tick Marks */}
                  <line x1="120" y1="12" x2="120" y2="26" stroke="#475569" strokeWidth="2" />
                  <text x="120" y="8" textAnchor="middle" className="text-[9px] fill-gray-500 font-bold">
                    CENTRO (0)
                  </text>
                  <text x="18" y="132" textAnchor="start" className="text-[9px] fill-blue-700 font-extrabold">
                    -100 NAC&POP / IZQ
                  </text>
                  <text x="222" y="132" textAnchor="end" className="text-[9px] fill-purple-800 font-extrabold">
                    +100 MILEI / DER
                  </text>

                  {/* Rotating Needle */}
                  <g transform={`translate(120, 115) rotate(${needleAngleDeg})`}>
                    <polygon points="-4,0 0,-82 4,0" fill="#1e1b4b" />
                    <circle cx="0" cy="-82" r="4" fill="#4f46e5" />
                  </g>

                  {/* Pivot Hub */}
                  <circle cx="120" cy="115" r="9" fill="#1e1b4b" />
                  <circle cx="120" cy="115" r="4" fill="#ffffff" />
                </svg>

                <div className="text-center -mt-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs font-black">
                    <span>Índice Compás: {clampedNeedle > 0 ? `+${clampedNeedle}` : clampedNeedle}</span>
                  </div>
                  <div className="text-[11px] font-bold text-gray-700 mt-1">
                    {analysis.compass.tendency_label}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-[11px]">
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <span className="text-gray-500 block">Eje Económico/Ideológico</span>
                  <strong className="text-gray-900 font-extrabold">
                    {analysis.compass.x > 0 ? `+${analysis.compass.x} (Derecha)` : analysis.compass.x < 0 ? `${analysis.compass.x} (Izquierda/Nac&Pop)` : '0 (Centro)'}
                  </strong>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <span className="text-gray-500 block">Eje Oficialismo/Oposición</span>
                  <strong className="text-gray-900 font-extrabold">
                    {analysis.compass.y > 0 ? `+${analysis.compass.y} (Oficialista)` : analysis.compass.y < 0 ? `${analysis.compass.y} (Opositor)` : '0 (Neutral)'}
                  </strong>
                </div>
              </div>
            </div>

            {/* 2. Matriz 2D del Compás Político */}
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs flex flex-col justify-between">
              <div>
                <h5 className="text-xs font-extrabold uppercase tracking-wider text-gray-800 flex items-center justify-between">
                  <span>Mapa de Posicionamiento Político 2D</span>
                  <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    Video & Chat
                  </span>
                </h5>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Ubicación de la tendencia del video analizado (punto violeta) y su chat en vivo (punto ámbar)
                </p>
              </div>

              <div className="flex justify-center my-2">
                <svg viewBox="0 0 260 260" className="w-full max-w-[250px] border border-gray-200 rounded-xl bg-slate-50">
                  {/* 4 Quadrant Backgrounds */}
                  <rect x="25" y="25" width="105" height="105" fill="#eff6ff" opacity="0.7" />
                  <rect x="130" y="25" width="105" height="105" fill="#f5f3ff" opacity="0.8" />
                  <rect x="25" y="130" width="105" height="105" fill="#fef2f2" opacity="0.7" />
                  <rect x="130" y="130" width="105" height="105" fill="#fffbeb" opacity="0.7" />

                  {/* Grid Lines */}
                  <line x1="25" y1="77.5" x2="235" y2="77.5" stroke="#e2e8f0" strokeDasharray="3,3" />
                  <line x1="25" y1="182.5" x2="235" y2="182.5" stroke="#e2e8f0" strokeDasharray="3,3" />
                  <line x1="77.5" y1="25" x2="77.5" y2="235" stroke="#e2e8f0" strokeDasharray="3,3" />
                  <line x1="182.5" y1="25" x2="182.5" y2="235" stroke="#e2e8f0" strokeDasharray="3,3" />

                  {/* Main Axes */}
                  <line x1="25" y1="130" x2="235" y2="130" stroke="#64748b" strokeWidth="1.5" />
                  <line x1="130" y1="25" x2="130" y2="235" stroke="#64748b" strokeWidth="1.5" />

                  {/* Axis Labels */}
                  <text x="130" y="16" textAnchor="middle" className="text-[8px] font-extrabold fill-purple-800">
                    ▲ OFICIALISTA / PRO-GOBIERNO (+100)
                  </text>
                  <text x="130" y="251" textAnchor="middle" className="text-[8px] font-extrabold fill-rose-800">
                    ▼ OPOSITOR DURO / CRÍTICO (-100)
                  </text>
                  <text x="20" y="126" textAnchor="start" className="text-[7.5px] font-bold fill-blue-800">
                    ◀ IZQ / NAC&POP
                  </text>
                  <text x="240" y="126" textAnchor="end" className="text-[7.5px] font-bold fill-indigo-900">
                    DER / LIBERTARIO ▶
                  </text>

                  {/* Chat Position Marker */}
                  <g>
                    <circle
                      cx={toSvgX(analysis.compass.chat_x)}
                      cy={toSvgY(analysis.compass.chat_y)}
                      r="9"
                      fill="#f59e0b"
                      opacity="0.18"
                    />
                    <circle
                      cx={toSvgX(analysis.compass.chat_x)}
                      cy={toSvgY(analysis.compass.chat_y)}
                      r="5.5"
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <text
                      x={toSvgX(analysis.compass.chat_x)}
                      y={toSvgY(analysis.compass.chat_y) + 13}
                      textAnchor="middle"
                      className="text-[7.5px] font-extrabold fill-amber-800"
                    >
                      CHAT
                    </text>
                  </g>

                  {/* Main Video Position Marker */}
                  <g>
                    <circle
                      cx={toSvgX(analysis.compass.x)}
                      cy={toSvgY(analysis.compass.y)}
                      r="11"
                      fill="#4f46e5"
                      opacity="0.22"
                    />
                    <circle
                      cx={toSvgX(analysis.compass.x)}
                      cy={toSvgY(analysis.compass.y)}
                      r="6.5"
                      fill="#4f46e5"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <text
                      x={toSvgX(analysis.compass.x)}
                      y={toSvgY(analysis.compass.y) - 9}
                      textAnchor="middle"
                      className="text-[8px] font-black fill-indigo-950"
                    >
                      ★ VIDEO
                    </text>
                  </g>
                </svg>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center justify-center gap-4 text-[10px] text-gray-600 pt-1 border-t border-gray-100">
                <span className="inline-flex items-center gap-1.5 font-bold text-indigo-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span>
                  Video Analizado ({analysis.compass.x > 0 ? `+${analysis.compass.x}` : analysis.compass.x}, {analysis.compass.y > 0 ? `+${analysis.compass.y}` : analysis.compass.y})
                </span>
                <span className="inline-flex items-center gap-1.5 font-bold text-amber-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                  Tendencia del Chat ({analysis.compass.chat_x > 0 ? `+${analysis.compass.chat_x}` : analysis.compass.chat_x}, {analysis.compass.chat_y > 0 ? `+${analysis.compass.chat_y}` : analysis.compass.chat_y})
                </span>
              </div>
            </div>
          </div>

          {/* Detailed Breakdown of the 8 Political Sectors */}
          <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-gray-100 pb-3">
              <div>
                <h5 className="text-sm font-extrabold text-gray-900">
                  Evaluación por Sector Político (Defendidos vs. Atacados)
                </h5>
                <p className="text-xs text-gray-500">
                  Escala de -100 (Fuertemente Atacado) a +100 (Fuertemente Defendido) en la transmisión
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {analysis.sectors.map((sector) => {
                const isDefended = sector.stance === 'defendido';
                const isAttacked = sector.stance === 'atacado';
                const absWidth = Math.min(50, Math.abs(sector.score) / 2);

                return (
                  <div
                    key={sector.id}
                    className={`rounded-xl p-3.5 border transition-all ${
                      isDefended
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : isAttacked
                        ? 'bg-rose-50/40 border-rose-200'
                        : 'bg-gray-50/60 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <span className="font-extrabold text-gray-900 text-xs sm:text-sm">
                        {sector.name}
                      </span>
                      {getStanceBadge(sector)}
                    </div>

                    {/* Bipolar Bar (-100 to +100) */}
                    <div className="space-y-1 my-2.5">
                      <div className="flex justify-between text-[10px] font-semibold text-gray-400">
                        <span className="text-rose-600">Atacado (-100)</span>
                        <span>Neutral (0)</span>
                        <span className="text-emerald-600">Defendido (+100)</span>
                      </div>
                      <div className="relative h-2.5 bg-gray-200 rounded-full overflow-hidden">
                        {/* Center line */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-400 z-10"></div>
                        {sector.score < 0 ? (
                          <div
                            className="absolute top-0 bottom-0 bg-gradient-to-l from-rose-500 to-red-600 rounded-l-full"
                            style={{
                              right: '50%',
                              width: `${absWidth}%`,
                            }}
                          />
                        ) : sector.score > 0 ? (
                          <div
                            className="absolute top-0 bottom-0 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-r-full"
                            style={{
                              left: '50%',
                              width: `${absWidth}%`,
                            }}
                          />
                        ) : null}
                      </div>
                    </div>

                    <p className="text-xs text-gray-700 leading-snug mt-2">
                      {sector.summary}
                    </p>
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
