import React, { useEffect, useRef } from 'react';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// Register Chart.js modules
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface StreamLineChartProps {
  labels: string[];
  viewers: number[];
  likes: number[];
  comments?: number[];
  title?: string;
  height?: number;
}

export const StreamLineChart: React.FC<StreamLineChartProps> = ({
  labels,
  viewers,
  likes,
  comments,
  title,
  height = 340,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Destroy any existing instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const hasComments = comments && comments.length > 0;

    const datasets: any[] = [
      {
        label: 'Usuarios Conectados',
        data: viewers,
        borderColor: '#4582e6',
        backgroundColor: 'rgba(69, 130, 230, 0.1)',
        borderWidth: 2.5,
        pointRadius: 2,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.3,
        yAxisID: 'y',
      },
      {
        label: 'Likes',
        data: likes,
        borderColor: '#f15555',
        backgroundColor: 'rgba(241, 85, 85, 0.05)',
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
        fill: false,
        tension: 0.3,
        yAxisID: 'y1',
      },
    ];

    if (hasComments) {
      datasets.push({
        label: 'Comentarios',
        data: comments,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.05)',
        borderWidth: 2,
        pointRadius: 1.5,
        pointHoverRadius: 4,
        fill: false,
        tension: 0.3,
        yAxisID: 'y2',
      });
    }

    const scales: any = {
      x: {
        title: {
          display: true,
          text: 'Hora',
          font: { weight: '600', size: 11 },
          color: '#6b7280',
        },
        grid: {
          color: '#f3f4f6',
        },
        ticks: {
          color: '#6b7280',
          maxRotation: 45,
          font: { size: 10 },
        },
      },
      y: {
        position: 'left',
        title: {
          display: true,
          text: 'Usuarios Conectados',
          font: { weight: '600', size: 11 },
          color: '#4582e6',
        },
        beginAtZero: true,
        grid: {
          color: '#e5e7eb',
        },
        ticks: {
          color: '#4582e6',
          font: { size: 10 },
          callback: (value: any) =>
            typeof value === 'number'
              ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
              : value,
        },
      },
      y1: {
        position: 'right',
        title: {
          display: true,
          text: 'Likes',
          font: { weight: '600', size: 11 },
          color: '#f15555',
        },
        beginAtZero: true,
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: '#f15555',
          font: { size: 10 },
          callback: (value: any) =>
            typeof value === 'number'
              ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
              : value,
        },
      },
    };

    if (hasComments) {
      scales.y2 = {
        position: 'right',
        title: {
          display: false,
        },
        beginAtZero: true,
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: '#f59e0b',
          font: { size: 10 },
          callback: (value: any) =>
            typeof value === 'number'
              ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
              : value,
        },
      };
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          title: {
            display: !!title,
            text: title || '',
            font: { size: 14, weight: 'bold' },
            color: '#111827',
            padding: { bottom: 12 },
          },
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              usePointStyle: true,
              font: { size: 12 },
              color: '#374151',
            },
          },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.9)',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (context: any) => {
                const label = context.dataset.label || '';
                const val = context.parsed.y;
                const formatted = val !== null ? val.toLocaleString('es-AR') : '0';
                return ` ${label}: ${formatted}`;
              },
            },
          },
        },
        scales,
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [labels, viewers, likes, comments, title]);

  return (
    <div style={{ height: `${height}px` }} className="w-full relative">
      <canvas ref={canvasRef} />
    </div>
  );
};
