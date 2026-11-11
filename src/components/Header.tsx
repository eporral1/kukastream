import React, { useState } from 'react';
import { RefreshCw, Radio, Menu, X, Share2, DollarSign, Swords } from 'lucide-react';
import { SITE_NAME } from '../config/site';

interface HeaderProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  lastUpdate: string;
  onRefresh: () => void;
  isSimulating: boolean;
  onToggleSimulate: () => void;
  onOpenSocialModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPath,
  onNavigate,
  lastUpdate,
  onRefresh,
  isSimulating,
  onToggleSimulate,
  onOpenSocialModal,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (path: string) => {
    onNavigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <header className="bg-white/95 backdrop-blur-md sticky top-0 z-50 shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo + Title */}
          <div className="flex items-center space-x-3">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                handleNav('/');
              }}
              className="flex items-center space-x-3 text-left focus:outline-none group"
            >
              <div>
                <h1 className="text-xl font-black tracking-tight text-gray-900 group-hover:text-blue-600 transition-colors">
                  {SITE_NAME}
                </h1>
              </div>
            </a>
          </div>

          {/* Right section: Navigation & Live indicator */}
          <div className="flex items-center space-x-4 md:space-x-6">
            {/* Nav Links */}
            <nav className="hidden md:flex items-center space-x-4 lg:space-x-6" aria-label="Navegación principal">
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  handleNav('/');
                }}
                className={`font-medium transition-colors px-3 py-1.5 rounded-lg text-sm ${
                  currentPath === '/'
                    ? 'text-blue-600 bg-blue-50 font-semibold'
                    : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
                }`}
              >
                Home
              </a>
            
              <a
                href="/channels"
                onClick={(e) => {
                  e.preventDefault();
                  handleNav('/channels');
                }}
                className={`font-medium transition-colors px-3 py-1.5 rounded-lg text-sm ${
                  currentPath === '/channels'
                    ? 'text-blue-600 bg-blue-50 font-semibold'
                    : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
                }`}
              >
                Canales
              </a>
              <a
                href="/streams"
                onClick={(e) => {
                  e.preventDefault();
                  handleNav('/streams');
                }}
                className={`font-medium transition-colors px-3 py-1.5 rounded-lg text-sm ${
                  currentPath === '/streams'
                    ? 'text-blue-600 bg-blue-50 font-semibold'
                    : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
                }`}
              >
                Streams
              </a>
              <a
                href="/superchats"
                onClick={(e) => {
                  e.preventDefault();
                  handleNav('/superchats');
                }}
                className={`font-medium transition-colors px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${
                  currentPath === '/superchats'
                    ? 'text-amber-800 bg-amber-50 font-bold border border-amber-200 shadow-2xs'
                    : 'text-gray-700 hover:text-amber-600 hover:bg-gray-50'
                }`}
              >
                <DollarSign className="w-4 h-4 text-amber-500" />
                <span>Superchats</span>
              </a>
              <a
                href="/face-off"
                onClick={(e) => {
                  e.preventDefault();
                  handleNav('/face-off');
                }}
                className={`font-medium transition-colors px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${
                  currentPath.startsWith('/face-off')
                    ? 'text-indigo-700 bg-indigo-50 font-bold border border-indigo-200 shadow-2xs'
                    : 'text-gray-700 hover:text-indigo-600 hover:bg-gray-50'
                }`}
              >
                <Swords className="w-4 h-4 text-indigo-500" />
                <span>Face-Off</span>
              </a>
            </nav>

            {/* Live Indicator */}
            <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-600 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
              <span className="font-medium text-xs">Actualizado en vivo</span>
              <span className="text-xs text-gray-400">({lastUpdate})</span>
            </div>

            {/* Quick Actions: Share Tweet text & Refresh */}
            {/*<button
              onClick={onOpenSocialModal}
              title="Generar ranking para X / Twitter"
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden lg:inline">Ranking X</span>
            </button>*/}

            <button
              onClick={onRefresh}
              title="Actualizar datos"
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={onToggleSimulate}
              title={isSimulating ? 'Auto-refresh cada 30s de la base de datos activo' : 'Pausar auto-refresh'}
              className={`hidden md:flex items-center space-x-1 px-2.5 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
                isSimulating
                  ? 'bg-green-50 border-green-300 text-green-700 font-semibold'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isSimulating ? 'animate-pulse text-green-600' : ''}`} />
              <span>{isSimulating ? 'Auto-refresh On' : 'Auto-refresh Off'}</span>
            </button>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-blue-600 hover:bg-gray-100 focus:outline-none transition-colors"
                aria-expanded={mobileMenuOpen}
              >
                <span className="sr-only">Open main menu</span>
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 py-3 space-y-1 bg-white">
            <button
              onClick={() => handleNav('/')}
              className={`w-full text-left block px-3 py-2 rounded-md font-medium text-sm ${
                currentPath === '/' ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              Home (Ranking En Vivo)
            </button>
            <button
              onClick={() => handleNav('/streams')}
              className={`w-full text-left block px-3 py-2 rounded-md font-medium text-sm ${
                currentPath === '/streams' ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              Streams (Top 10 por Transmisión)
            </button>
            <button
              onClick={() => handleNav('/channels')}
              className={`w-full text-left block px-3 py-2 rounded-md font-medium text-sm ${
                currentPath === '/channels' ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              Canales (Métricas y Directorio)
            </button>
            <button
              onClick={() => handleNav('/superchats')}
              className={`w-full text-left block px-3 py-2 rounded-md font-medium text-sm flex items-center gap-2 ${
                currentPath === '/superchats' ? 'text-amber-800 bg-amber-50 font-bold' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <DollarSign className="w-4 h-4 text-amber-500" />
              <span>Superchats (Ganancias ARS)</span>
            </button>
            <button
              onClick={() => handleNav('/face-off')}
              className={`w-full text-left block px-3 py-2 rounded-md font-medium text-sm flex items-center gap-2 ${
                currentPath.startsWith('/face-off') ? 'text-indigo-700 bg-indigo-50 font-bold' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Swords className="w-4 h-4 text-indigo-500" />
              <span>Face-Off (Duelo Cara a Cara)</span>
            </button>
            <button
              onClick={() => {
                onOpenSocialModal();
                setMobileMenuOpen(false);
              }}
              className="w-full text-left block px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm"
            >
              📋 Copiar Ranking para X / Twitter
            </button>
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between px-3 text-xs text-gray-600">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Actualizado: {lastUpdate}</span>
              </div>
              <button
                onClick={onToggleSimulate}
                className={`px-2 py-0.5 rounded text-xs ${
                  isSimulating ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {isSimulating ? 'Simulación ON' : 'Simulación OFF'}
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
