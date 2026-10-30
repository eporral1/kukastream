import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    {
      q: '¿Cada cuánto se actualiza el ranking?',
      a: 'El ranking de KukaStream se actualiza automáticamente en tiempo real, registrando la cantidad más reciente de espectadores conectados en cada transmisión en vivo de YouTube.',
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
      q: '¿Qué canales se incluyen en el ranking?',
      a: 'Incluimos canales y transmisiones públicas de YouTube de kukitas radioactivos.',
    },
    {
      q: 'Cuánto nos importa la opinión de los kukas',
      a: 'Nos chupa la pija.',
    },
    {
      q: 'Si no les importa la opinión de los kukas, porque existe esta página',
      a: 'Eso es exactamente lo que preguntaría un kuka.',
    },
   /* {
      q: '¿Cómo se calculan los likes y el heatmap?',
      a: 'El heatmap refleja la audiencia promedio registrada por hora y día de la semana durante los últimos 30 días, permitiendo a marcas y creadores identificar las franjas horarias con mayor tracción.',
    },*/
  ];

  return (
    <footer className="mt-16 pt-12 pb-16 border-t border-gray-200 text-center">
      {/* FAQ section */}
      <div className="max-w-2xl mx-auto text-left mb-12 px-4">
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
      </div>

      <div className="max-w-7xl mx-auto px-4 text-xs sm:text-sm text-gray-500 space-y-3">
        {/*<p className="font-medium text-gray-600">
          KukaStream &bull; 
        </p>*/}
        <div className="flex items-center justify-center space-x-4">
          {/*<a
            href="https://x.com/kukastream"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 transition-colors"
          >
            <span>@kukastream</span>
            <ExternalLink className="w-3 h-3" />
          </a>*/}
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            Hecho para la comunidad de streaming <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
          </span>
        </div>
      </div>
    </footer>
  );
};
