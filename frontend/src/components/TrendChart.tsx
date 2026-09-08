/* ============================================================
   ATLAS IELTS Academy — band trend chart (§2.4)

   Overall / Reading / Listening / Writing / Speaking per
   completed day, last 30 days, on the ink-navy panel. All
   series colors come from the §15.1 palette. Y-axis adapts to
   the student's actual range, clamped to the legal 2–9 band
   space, with the 0.5 grid the scale demands.
   ============================================================ */

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { bandAxisTicks } from '../lib/scoring.js';
import { EmptyState } from './ui.jsx';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Filler);
ChartJS.defaults.font.family = "'IBM Plex Sans', sans-serif";
ChartJS.defaults.color = '#96A2B3';

const SERIES = [
  { key: 'overall',   label: 'Overall',   color: '#E3BC63', width: 3 },   // gold-bright — the hero line
  { key: 'reading',   label: 'Reading',   color: '#96A2B3', width: 1.5 }, // text-dim
  { key: 'listening', label: 'Listening', color: '#6BAE87', width: 1.5 }, // green-bright
  { key: 'writing',   label: 'Writing',   color: '#D46A6A', width: 1.5 }, // red-bright
  { key: 'speaking',  label: 'Speaking',  color: '#EFEBE0', width: 1.5 }, // paper
];

export default function TrendChart({ entries = [], height }) {
  if (!entries.length) {
    return (
      <EmptyState title="Your trend line starts after your first full day">
        Once all four sections of a day are done, your bands get plotted here — one point per
        completed day, across the last thirty.
      </EmptyState>
    );
  }

  const values = entries.flatMap((e) => SERIES.map((s) => e[s.key])).filter(Number.isFinite);
  const yMin = values.length
    ? Math.max(2, Math.floor(Math.min(...values) * 2) / 2 - 0.5)
    : 4;
  const yMax = values.length
    ? Math.min(9, Math.ceil(Math.max(...values) * 2) / 2 + 0.5)
    : 8;

  const data = {
    labels: entries.map((e) => (e.phase === 'mock' ? `M${e.day}` : `D${e.day}`)),
    datasets: SERIES.map((s) => ({
      label: s.label,
      data: entries.map((e) => e[s.key]),
      borderColor: s.color,
      backgroundColor: s.color,
      borderWidth: s.width,
      pointRadius: entries.length > 20 ? 0 : 2.5,
      pointHoverRadius: 5,
      pointBackgroundColor: s.color,
      tension: 0.25,
      spanGaps: true,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: {
        min: yMin,
        max: yMax,
        ticks: {
          stepSize: 0.5,
          color: '#96A2B3',
          font: { size: 11 },
          callback: (v) => v.toFixed(1),
        },
        grid: { color: 'rgba(30, 51, 80, 0.6)' }, // ink-700 @ 60%
      },
      x: {
        ticks: { color: '#96A2B3', font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
        grid: { display: false },
      },
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 14 },
      },
      tooltip: {
        backgroundColor: '#131F33',     // ink-850
        borderColor: '#1E3350',         // ink-700
        borderWidth: 1,
        titleColor: '#E8E6DD',
        bodyColor: '#E8E6DD',
        padding: 12,
        usePointStyle: true,
        callbacks: {
          title: (items) => {
            const e = entries[items[0]?.dataIndex];
            if (!e) return '';
            return `${e.phase === 'mock' ? 'Mock Exam' : 'Training'} · Day ${e.day}`;
          },
          label: (item) =>
            `${item.dataset.label}: ${item.parsed.y != null ? item.parsed.y.toFixed(1) : '—'}`,
        },
      },
    },
  };

  return (
    <div className={height ? undefined : 'chart-holder'} style={height ? { height } : undefined}>
      <Line data={data} options={options} aria-label="Band score trend by day" role="img" />
    </div>
  );
}