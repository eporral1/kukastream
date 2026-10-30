import React from 'react';
import { CategoryTag } from '../types';

interface CategoryFilterProps {
  activeCategory: CategoryTag;
  onSelectCategory: (category: CategoryTag) => void;
}

const CATEGORIES: { id: CategoryTag; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'stream', label: 'Streaming' },
  { id: 'tv', label: 'TV' },
  { id: 'entretenimiento', label: 'Entretenimiento' },
  { id: 'radio', label: 'Radio' },
  { id: 'política', label: 'Política' },
  { id: 'deportes', label: 'Deportes' },
];

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  activeCategory,
  onSelectCategory,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-0.5">
            Categorías
          </h3>
          <p className="text-xs sm:text-sm text-gray-500">
            Filtrá los canales en vivo según el tipo de contenido
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-lg font-medium text-xs sm:text-sm transition-all duration-200 border cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
