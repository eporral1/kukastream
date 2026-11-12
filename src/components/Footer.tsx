import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Heart, Mail } from 'lucide-react';
import { SITE_NAME } from '../config/site';

interface FooterProps {
  onNavigate?: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    {
      q: '¿Cada cuánto se actualiza el ranking?',
      a: `El ranking de ${SITE_NAME} se actualiza automáticamente en tiempo real, registrando la cantidad más reciente de espectadores conectados en cada transmisión en vivo de YouTube.`,
    },
    {
      q: '¿De dónde provienen los datos?',
      a: 'Todos los datos provienen de la API oficial de YouTube, garantizando precisión, actualización continua y total transparencia en las métricas exhibidas.',
    },
    {
      q: '¿Qué significan los "conectados"?',
      a: '“Conectados” representa el número de espectadores concurrentes que están mirando una transmisión en vivo en tiempo real (concurrent viewers). Es el indicador principal para ordenar el ranking.',
    },
    {
      q: `¿Qué canales se incluyen en el ranking de ${SITE_NAME}?`,
      a: 'Incluimos canales y transmisiones públicas de YouTube de streaming y actualidad.',
    },
  ];

  const handleContactClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('/contacto');
    }
  };

  return (
    <footer className="mt-16 pt-10 pb-0 border-t border-gray-200 text-center">
      {/* FAQ section */}
      {/*<div className="max-w-2xl mx-auto text-left mb-12 px-4">
        <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">
          Preguntas Frecuentes
        </h3>
        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div
                key={index}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                  className="w-full px-5 py-3.5 flex items-center justify-between text-left font-semibold text-gray-800 hover:text-blue-600 text-sm focus:outline-none"
                >
                  <span>{faq.q}</span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-xs sm:text-sm text-gray-600 leading-relaxed border-t border-gray-50 pt-2 bg-gray-50/50">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>*/}

      <div className="max-w-7xl mx-auto px-4 text-xs sm:text-sm text-gray-500 space-y-4">
        <div className="flex items-center justify-center">
          <a
            href="/contacto"
            onClick={handleContactClick}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-gray-50 text-gray-700 hover:text-blue-600 font-semibold border border-gray-200/90 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
          >
            <Mail className="w-4 h-4 text-blue-600" />
            <span>Contacto</span>
          </a>
        </div>

        {/*<p className="font-medium text-gray-600">
          {SITE_NAME} &bull; 
        </p>*/}
        <div className="flex items-center justify-center space-x-4">
          {/*<a
            href={`https://x.com/${SITE_NAME.toLowerCase().replace(/\s+/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 transition-colors"
          >
            <span>@{SITE_NAME.toLowerCase().replace(/\s+/g, '')}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            Hecho para la comunidad de streaming <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
          </span>*/}
        </div>
      </div>
    </footer>
  );
};
