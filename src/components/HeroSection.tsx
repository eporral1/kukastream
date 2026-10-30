import React from 'react';
import { ArrowRight, BarChart3, TrendingUp, Users, Heart, MessageSquare, Zap } from 'lucide-react';
import { formatNumber } from '../data/mockData';

interface HeroSectionProps {
  totalLiveViewers: number;
  activeStreamsCount: number;
  totalLikes: number;
  lastUpdate?: string;
  onExploreChannels: () => void;
  onScrollToLive: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  totalLiveViewers,
  activeStreamsCount,
  totalLikes,
  lastUpdate,
  onExploreChannels,
  onScrollToLive,
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
        En qué andan los {/*<br className="hidden sm:block" />*/}
        <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-teal-500 bg-clip-text text-transparent">
          kukitas ?
        </span>
      </h1>

      {/* Subtitle */}
      {/*<p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto mb-8 leading-relaxed">
        TODOS los kukitas
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
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl p-5 shadow-xs border border-gray-100 text-center hover:border-blue-200 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
            <Users className="w-4 h-4" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-blue-600 mb-1">
            {formatNumber(totalLiveViewers)}
          </div>
          <div className="text-xs sm:text-sm text-gray-500">Conectados En Vivo</div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-xs border border-gray-100 text-center hover:border-teal-200 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-2">
            <Zap className="w-4 h-4" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-teal-600 mb-1">
            {activeStreamsCount}
          </div>
          <div className="text-xs sm:text-sm text-gray-500">Canales Transmitiendo</div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-xs border border-gray-100 text-center hover:border-rose-200 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-2">
            <Heart className="w-4 h-4" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-rose-500 mb-1">
            {formatNumber(totalLikes)}
          </div>
          <div className="text-xs sm:text-sm text-gray-500">Total Likes Acumulados</div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-xs border border-gray-100 text-center hover:border-purple-200 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-purple-600 mb-1">
            {lastUpdate && lastUpdate !== '--:--' ? lastUpdate : 'En vivo'}
          </div>
          <div className="text-xs sm:text-sm text-gray-500">Última Actualización</div>
        </div>
      </div>
    </div>
  );
};
