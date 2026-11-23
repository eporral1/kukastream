import React from 'react';
import { ArrowRight, BarChart3, TrendingUp, Users, Heart, Coins, Zap, Activity } from 'lucide-react';
import { formatNumber } from '../data/mockData';
import { SITE_NAME } from '../config/site';

interface HeroSectionProps {
  totalLiveViewers: number;
  activeStreamsCount: number;
  totalLikes: number;
  totalSuperchatsArs?: number;
  lastUpdate?: string;
  isLoading?: boolean;
  onExploreChannels: () => void;
  onScrollToLive: () => void;
  onShareTwitter?: () => void;
  isCapturing?: boolean;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  totalLiveViewers,
  activeStreamsCount,
  totalLikes,
  totalSuperchatsArs = 0,
  lastUpdate,
  isLoading = false,
  onExploreChannels,
  onScrollToLive,
}) => {
  return (
    <div className="relative pt-6 pb-12 sm:pt-10 sm:pb-16 text-center">
      {/* Background Decorative Glow */}
      <div className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none opacity-40">
        <div className="w-[500px] h-[250px] bg-gradient-to-tr from-blue-400/20 via-sky-400/25 to-blue-600/20 blur-3xl rounded-full"></div>
      </div>

      {/* Top Badges */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
        <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-red-600 to-rose-600 text-white px-3.5 py-1.5 rounded-full text-xs font-bold shadow-sm">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          <span className="uppercase tracking-wider">Monitoreo En Vivo</span>
        </div>
        {/*<div className="inline-flex items-center space-x-1.5 bg-blue-50 text-blue-900 border border-blue-200 px-3 py-1.5 rounded-full text-xs font-extrabold shadow-3xs">
          <Activity className="w-3.5 h-3.5 text-blue-600" />
          <span>Índice de Engagement (0-100 pts)</span>
        </div>*/}
      </div>

      {/* Main Title with Blue -> Sky Blue -> Blue Gradient */}
      <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4 leading-tight tracking-tight">
        <span className="bg-gradient-to-r from-blue-700 via-sky-400 to-blue-700 bg-clip-text text-transparent drop-shadow-xs">
          {SITE_NAME}
        </span>
      </h1>

      {/* Tagline */}
      <p className="text-sm sm:text-base text-gray-700 max-w-3xl mx-auto mb-8 leading-relaxed font-medium">
        Análisis de de engagement de streamings políticos de Argentina.
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center mb-10">
        <a
          href="#live"
          onClick={(e) => {
            e.preventDefault();
            onScrollToLive();
          }}
          className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 via-sky-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-7 py-3.5 rounded-xl font-bold text-sm sm:text-base shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
        >
          <span>🚀</span>
          <span>Ver Streams En Vivo</span>
          <ArrowRight className="w-4 h-4 ml-1" />
        </a>
        <a
          href="/channels"
          onClick={(e) => {
            e.preventDefault();
            onExploreChannels();
          }}
          className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-white text-gray-800 px-7 py-3.5 rounded-xl font-bold text-sm sm:text-base border border-gray-200 shadow-xs hover:shadow-md hover:bg-gray-50 transition-all duration-200 cursor-pointer"
        >
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <span>Métricas de Canales</span>
        </a>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 max-w-5xl mx-auto">
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-gray-200/80 text-center hover:border-blue-300 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2.5 shadow-3xs">
            <Users className="w-4.5 h-4.5" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-20 sm:w-24 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-xl sm:text-2xl lg:text-3xl font-black text-blue-600 mb-1">
              {formatNumber(totalLiveViewers)}
            </div>
          )}
          <div className="text-xs font-bold text-gray-600">Conectados En Vivo</div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-gray-200/80 text-center hover:border-sky-300 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto mb-2.5 shadow-3xs">
            <Zap className="w-4.5 h-4.5" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-14 sm:w-16 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-xl sm:text-2xl lg:text-3xl font-black text-sky-600 mb-1">
              {activeStreamsCount}
            </div>
          )}
          <div className="text-xs font-bold text-gray-600">Canales En Vivo</div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-gray-200/80 text-center hover:border-rose-300 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-2.5 shadow-3xs">
            <Heart className="w-4.5 h-4.5" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-20 sm:w-24 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-xl sm:text-2xl lg:text-3xl font-black text-rose-500 mb-1">
              {formatNumber(totalLikes)}
            </div>
          )}
          <div className="text-xs font-bold text-gray-600">Likes Acumulados</div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-gray-200/80 text-center hover:border-amber-300 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2.5 shadow-3xs">
            <Coins className="w-4.5 h-4.5" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-20 sm:w-24 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-xl sm:text-2xl lg:text-3xl font-black text-amber-600 mb-1">
              ${formatNumber(totalSuperchatsArs)}
            </div>
          )}
          <div className="text-xs font-bold text-gray-600">Superchats (ARS)</div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-gray-200/80 text-center hover:border-purple-300 hover:shadow-sm transition-all col-span-2 sm:col-span-1">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-2.5 shadow-3xs">
            <TrendingUp className="w-4.5 h-4.5" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-20 sm:w-24 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-xl sm:text-2xl lg:text-3xl font-black text-purple-600 mb-1">
              {lastUpdate && lastUpdate !== '--:--' ? lastUpdate : 'En vivo'}
            </div>
          )}
          <div className="text-xs font-bold text-gray-600">Última Actualización</div>
        </div>
      </div>
    </div>
  );
};
