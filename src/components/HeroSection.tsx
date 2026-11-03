import React from 'react';
import { ArrowRight, BarChart3, TrendingUp, Users, Heart, Coins, Zap } from 'lucide-react';
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
  onShareTwitter,
  isCapturing = false,
}) => {
  return (
    <div className="relative pt-6 pb-12 sm:pt-10 sm:pb-16 text-center">
      {/* Live Indicator */}
      <div className="inline-flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-full text-xs sm:text-sm font-semibold mb-6 shadow-md hover:shadow-lg transition-shadow">
        <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse"></div>
        <span className="uppercase tracking-wider">En Vivo</span>
      </div>

      {/* Main Title */}
      <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6 leading-tight tracking-tight">
        <span className="bg-gradient-to-r font-black bg-clip-text">
          {SITE_NAME}
        </span>
      </h1>

      {/* Subtitle */}
      {/*<p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto mb-8 leading-relaxed">
        {SITE_NAME}
      </p>*/}

      {/* Feature Pills */}
      {/*<div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-8">
        <div className="inline-flex items-center space-x-2 bg-white/90 backdrop-blur-sm border border-gray-200 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium text-gray-700 shadow-xs">
          <span>📊</span>
          <span>Decisiones más precisas</span>
        </div>
        <div className="inline-flex items-center space-x-2 bg-white/90 backdrop-blur-sm border border-gray-200 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium text-gray-700 shadow-xs">
          <span>🎯</span>
          <span>Nuevas Oportunidades</span>
        </div>
        <div className="inline-flex items-center space-x-2 bg-white/90 backdrop-blur-sm border border-gray-200 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium text-gray-700 shadow-xs">
          <span>⚡</span>
          <span>Monitoreo continuo</span>
        </div>
      </div>*/}

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center mb-10">
        <button
          onClick={onScrollToLive}
          className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white px-7 py-3.5 rounded-xl font-semibold text-base shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
        >
          <span>🚀</span>
          <span>Top Streamings</span>
          <ArrowRight className="w-4 h-4 ml-1" />
        </button>
        <button
          onClick={onExploreChannels}
          className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-white text-gray-800 px-7 py-3.5 rounded-xl font-semibold text-base border border-gray-200 shadow-xs hover:shadow-md hover:bg-gray-50 transition-all duration-200 cursor-pointer"
        >
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <span>Métricas por canal</span>
        </button>
        {/*<button
          onClick={onShareTwitter}
          disabled={isCapturing}
          className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-black hover:bg-gray-900 text-white px-6 py-3.5 rounded-xl font-semibold text-base shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-50"
          title="Capturar Top 3 y publicar en X"
        >
          {isCapturing ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          )}
          <span>{isCapturing ? 'Capturando...' : 'Publicar Top 3 en X'}</span>
        </button>*/}
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 max-w-5xl mx-auto">
        <div className="bg-white rounded-xl p-4 sm:p-5 shadow-xs border border-gray-100 text-center hover:border-blue-200 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
            <Users className="w-4 h-4" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-20 sm:w-24 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-600 mb-1">
              {formatNumber(totalLiveViewers)}
            </div>
          )}
          <div className="text-xs text-gray-500">Conectados En Vivo</div>
        </div>

        <div className="bg-white rounded-xl p-4 sm:p-5 shadow-xs border border-gray-100 text-center hover:border-teal-200 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-2">
            <Zap className="w-4 h-4" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-14 sm:w-16 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-teal-600 mb-1">
              {activeStreamsCount}
            </div>
          )}
          <div className="text-xs text-gray-500">Canales En Vivo</div>
        </div>

        <div className="bg-white rounded-xl p-4 sm:p-5 shadow-xs border border-gray-100 text-center hover:border-rose-200 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-2">
            <Heart className="w-4 h-4" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-20 sm:w-24 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-rose-500 mb-1">
              {formatNumber(totalLikes)}
            </div>
          )}
          <div className="text-xs text-gray-500">Likes Acumulados</div>
        </div>

        <div className="bg-white rounded-xl p-4 sm:p-5 shadow-xs border border-gray-100 text-center hover:border-amber-200 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2">
            <Coins className="w-4 h-4" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-20 sm:w-24 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-amber-600 mb-1">
              ${formatNumber(totalSuperchatsArs)}
            </div>
          )}
          <div className="text-xs text-gray-500">Superchats (ARS)</div>
        </div>

        <div className="bg-white rounded-xl p-4 sm:p-5 shadow-xs border border-gray-100 text-center hover:border-purple-200 transition-colors col-span-2 sm:col-span-1">
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="w-4 h-4" />
          </div>
          {isLoading ? (
            <div className="h-8 sm:h-9 w-20 sm:w-24 bg-gray-200 rounded-lg animate-pulse mx-auto mb-1"></div>
          ) : (
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-purple-600 mb-1">
              {lastUpdate && lastUpdate !== '--:--' ? lastUpdate : 'En vivo'}
            </div>
          )}
          <div className="text-xs text-gray-500">Última Actualización</div>
        </div>
      </div>
    </div>
  );
};
