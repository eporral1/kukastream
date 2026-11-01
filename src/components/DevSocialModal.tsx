import React, { useState } from 'react';
import { Stream } from '../types';
import { formatNumber } from '../data/mockData';
import { Copy, Check, X, Twitter } from 'lucide-react';

interface DevSocialModalProps {
  isOpen: boolean;
  onClose: () => void;
  streams: Stream[];
  lastUpdate: string;
}

export const DevSocialModal: React.FC<DevSocialModalProps> = ({
  isOpen,
  onClose,
  streams,
  lastUpdate,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const topStreams = streams.slice(0, 5);

  const tweetLines = [
    `📈 Usuarios conectados en vivo ${lastUpdate}`,
    '',
    ...topStreams.map((s, i) => `${medals[i]} ${s.channel} - ${formatNumber(s.concurrent_viewers)}`),
    '',
    'Ranking en vivo ➡️ https://.com',
    '',
    '#live #rating #tv #streaming #argentina #KukaStream',
  ];

  const tweetText = tweetLines.join('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(tweetText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center">
              <Twitter className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                Generador de Tweet / Ranking X
              </h3>
              <p className="text-xs text-gray-500">
                Formato automático extraído del módulo ?dev de Laravel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="bg-gray-50 rounded-xl p-4 font-mono text-xs sm:text-sm text-gray-800 border border-gray-200 whitespace-pre-line leading-relaxed shadow-inner">
            {tweetText}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400">
              {tweetText.length} caracteres
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={handleCopy}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-xs transition-all cursor-pointer ${
                  copied
                    ? 'bg-green-600'
                    : 'bg-black hover:bg-gray-800'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar al Portapapeles</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
