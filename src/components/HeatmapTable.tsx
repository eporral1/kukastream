import React, { useMemo } from 'react';
import { HourDayData } from '../types';
import { formatNumber } from '../data/mockData';

interface HeatmapTableProps {
  data: HourDayData[];
}

const DAYS = [
  { key: 'mon_viewers', label: 'Lunes', short: 'L' },
  { key: 'tue_viewers', label: 'Martes', short: 'M' },
  { key: 'wed_viewers', label: 'Miércoles', short: 'X' },
  { key: 'thu_viewers', label: 'Jueves', short: 'J' },
  { key: 'fri_viewers', label: 'Viernes', short: 'V' },
  { key: 'sat_viewers', label: 'Sábado', short: 'S' },
  { key: 'sun_viewers', label: 'Domingo', short: 'D' },
] as const;

function interpolateColor(color1: string, color2: string, factor: number): string {
  const f = Math.max(0, Math.min(1, factor));
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;
  const r = Math.round(r1 + f * (r2 - r1));
  const g = Math.round(g1 + f * (g2 - g1));
  const b = Math.round(b1 + f * (b2 - b1));
  return `rgb(${r}, ${g}, ${b})`;
}

export const HeatmapTable: React.FC<HeatmapTableProps> = ({ data }) => {
  // Calculate minValue (> 0) and maxValue across all viewer values
  const { minVal, maxVal } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    data.forEach((row) => {
      DAYS.forEach((d) => {
        const val = row[d.key as keyof HourDayData] as number | undefined;
        if (typeof val === 'number') {
          if (val > 0 && val < min) min = val;
          if (val > max) max = val;
        }
      });
    });
    return {
      minVal: min === Infinity ? 0 : min,
      maxVal: max === -Infinity ? 1000 : max,
    };
  }, [data]);

  const getColor = (value: number) => {
    if (value <= 0) return { bg: '#f3f4f6', color: '#9ca3af' };
    const ratio = Math.max(0, Math.min(1, (value - minVal) / (maxVal - minVal || 1)));

    let bg: string;
    if (ratio < 0.1) {
      // 🔴 Red to 🟠 Orange
      bg = interpolateColor('#d63e36', '#f7932f', ratio * 2);
    } else {
      // 🟠 Orange to 🟢 Green
      bg = interpolateColor('#f7932f', '#1a9850', (ratio - 0.1) / 0.9);
    }
    return { bg, color: '#ffffff' };
  };

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-8 text-center text-gray-500 text-xs">
        No hay registros históricos en los últimos 30 días para generar el mapa de calor de este canal.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-100 overflow-hidden">
      {/* Legend */}
      <div className="px-6 pt-5 pb-3 flex flex-wrap items-center justify-between gap-4 border-b border-gray-100">
        <div className="text-sm text-gray-600">
          Audiencia promedio por hora del día en los últimos 30 días
        </div>
        <div className="flex items-center space-x-2 text-xs text-gray-500">
          <span>Menos audiencia</span>
          <div className="flex items-center space-x-1">
            <span className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: '#d63e36' }}></span>
            <span className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: '#f7932f' }}></span>
            <span className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: '#1a9850' }}></span>
          </div>
          <span>Más audiencia</span>
        </div>
      </div>

      <div className="p-4 sm:p-6 overflow-x-auto">
        <table className="min-w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-3 sm:px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider rounded-tl-lg">
                Hora
              </th>
              {DAYS.map((d, i) => (
                <th
                  key={d.key}
                  className={`px-2 sm:px-4 py-3 text-center text-xs font-semibold ${
                    i === DAYS.length - 1 ? 'rounded-tr-lg' : ''
                  }`}
                >
                  <span className="hidden md:inline">{d.label}</span>
                  <span className="md:hidden">{d.short}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((row) => {
              const formattedHour = `${row.hour.toString().padStart(2, '0')}:00`;
              return (
                <tr key={row.hour} className="hover:opacity-95 transition-opacity">
                  <td className="px-3 sm:px-4 py-2 font-bold text-center bg-gray-50 text-gray-700 border-r border-gray-200">
                    {formattedHour}
                  </td>
                  {DAYS.map((d) => {
                    const val = (row[d.key as keyof HourDayData] as number) || 0;
                    const { bg, color } = getColor(val);
                    return (
                      <td
                        key={d.key}
                        style={{ backgroundColor: bg, color }}
                        title={`${d.label} ${formattedHour}: ${val > 0 ? formatNumber(val) : 'Sin datos'} espectadores promedio`}
                        className="px-2 sm:px-4 py-2 text-center font-medium transition-transform hover:scale-105 select-none"
                      >
                        {val > 0 ? formatNumber(val) : '-'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
