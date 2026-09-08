/* ============================================================
   ATLAS IELTS Academy — Task 1 data visuals (§6.2)

   line_graph / mixed / pie_chart render through Chart.js;
   table renders as a real HTML table. All four live on the
   parchment .chart-frame (§15.1) with ink-text axis styling.

   ⚠ CROSS-BATCH REPAIR, stated plainly: Batch 3's TrendChart
   registered scales/elements but NOT the chart CONTROLLERS
   (LineController etc.), which Chart.js v4 requires when
   importing from 'chart.js' rather than 'chart.js/auto'. The
   registration below runs at module-evaluation time — before
   ANY component renders, because the whole bundle evaluates
   first — so it repairs the TrendChart's registry globally as
   a side effect. Registration is idempotent.

   Colours below are §15.1 palette values expressed as concrete
   hex/rgba (Chart.js options take concrete values, matching
   TrendChart's precedent): ink-600/ink-900/gold/green/red and
   ink-text tints for parchment surfaces.
   ============================================================ */

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  LineController,
  BarController,
  PieController,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Pie } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, ArcElement,
  LineController, BarController, PieController,
  Tooltip, Legend, Filler,
);

const INK_TEXT = '#26221A';                                   // --ink-text
const GRID = 'rgba(38, 34, 26, 0.18)';                        // ink-text tint
const SERIES_COLORS = ['#2A4266', '#C89B3C', '#4C8B68', '#B14848', '#10192A', '#6E6455'];

const paperTooltip = {
  backgroundColor: '#F6F3E9',                                 // --paper-raised
  titleColor: INK_TEXT,
  bodyColor: INK_TEXT,
  borderColor: 'rgba(38, 34, 26, 0.25)',
  borderWidth: 1,
  padding: 10,
  usePointStyle: true,
};

const paperLegend = {
  position: 'bottom',
  labels: {
    color: INK_TEXT,
    usePointStyle: true,
    pointStyle: 'circle',
    boxWidth: 8,
    boxHeight: 8,
    padding: 12,
    font: { size: 11 },
  },
};

const fmtTick = (v) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}k` : v);

const ariaFor = (cd) =>
  `${cd?.title || 'Chart'}: ${(cd?.series || []).map((s) => s.name).join(', ') || 'data'}`;

/* ── Line graph (read-a-value task — Chart.js, per §14.3) ──── */

export function LineGraphVisual({ chartData }) {
  if (!chartData) return null;
  const n = chartData.xLabels.length;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: {
        ticks: { color: INK_TEXT, font: { size: 11 }, callback: fmtTick, maxTicksLimit: 7 },
        grid: { color: GRID },
        title: {
          display: Boolean(chartData.yLabel),
          text: chartData.yLabel,
          color: INK_TEXT,
          font: { size: 11 },
        },
      },
      x: {
        ticks: { color: INK_TEXT, font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
        grid: { display: false },
      },
    },
    plugins: {
      legend: paperLegend,
      tooltip: { ...paperTooltip, callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y ?? '—'}` } },
    },
  };

  const data = {
    labels: chartData.xLabels,
    datasets: chartData.series.map((s, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length];
      return {
        label: s.name,
        data: s.data,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: n > 14 ? 0 : 2.5,
        pointHoverRadius: 5,
        tension: 0,            // data-reading tasks: exact points, no smoothing
        spanGaps: true,
      };
    }),
  };

  return (
    <div className="chart-holder">
      <Line data={data} options={options} role="img" aria-label={ariaFor(chartData)} />
    </div>
  );
}

/* ── Mixed bar + line (same shape as line_graph, §6.2) ─────── */

export function MixedChartVisual({ chartData }) {
  if (!chartData) return null;
  const n = chartData.xLabels.length;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: {
        ticks: { color: INK_TEXT, font: { size: 11 }, callback: fmtTick, maxTicksLimit: 7 },
        grid: { color: GRID },
        title: {
          display: Boolean(chartData.yLabel),
          text: chartData.yLabel,
          color: INK_TEXT,
          font: { size: 11 },
        },
      },
      x: {
        ticks: { color: INK_TEXT, font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
        grid: { display: false },
      },
    },
    plugins: {
      legend: paperLegend,
      tooltip: { ...paperTooltip, callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y ?? '—'}` } },
    },
  };

  const data = {
    labels: chartData.xLabels,
    datasets: chartData.series.map((s, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length];
      const asBar = i % 2 === 0;                        // alternating render type (§6.2)
      return {
        label: s.name,
        type: asBar ? 'bar' : 'line',
        data: s.data,
        backgroundColor: color,
        borderColor: color,
        borderWidth: 2,
        borderRadius: asBar ? 2 : 0,
        barPercentage: asBar ? 0.6 : undefined,
        categoryPercentage: asBar ? 0.7 : undefined,
        pointRadius: asBar || n > 14 ? 0 : 2.5,
        pointHoverRadius: 5,
        tension: 0,
        spanGaps: true,
      };
    }),
  };

  return (
    <div className="chart-holder">
      <Line data={data} options={options} role="img" aria-label={ariaFor(chartData)} />
    </div>
  );
}

/* ── Pie chart(s) — one or two side by side ────────────────── */

function SinglePie({ pie }) {
  const total = pie.segments.reduce((a, s) => a + s.value, 0);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: paperLegend,
      tooltip: {
        ...paperTooltip,
        callbacks: {
          label: (c) => {
            const value = c.parsed ?? 0;
            const share = total > 0 ? Math.round((value / total) * 100) : 0;
            return `${c.label}: ${value} (${share}%)`;
          },
        },
      },
    },
  };

  const data = {
    labels: pie.segments.map((s) => s.label),
    datasets: [{
      data: pie.segments.map((s) => s.value),
      backgroundColor: pie.segments.map((_, i) => SERIES_COLORS[i % SERIES_COLORS.length]),
      borderColor: '#EFEBE0',                            // --paper: segment separation
      borderWidth: 2,
    }],
  };

  return (
    <div className="stack-t" style={{ gap: 8 }}>
      {pie.title && <p className="chart-title" style={{ margin: 0 }}>{pie.title}</p>}
      <div className="pie-holder">
        <Pie data={data} options={options} role="img" aria-label={ariaFor({ title: pie.title, series: pie.segments.map((s) => ({ name: `${s.label} ${s.value}` })) })} />
      </div>
    </div>
  );
}

export function PieChartVisual({ chartData }) {
  const pies = chartData?.pies || [];
  if (!pies.length) return null;
  const two = pies.length > 1;
  return (
    <div className={`pie-grid${two ? ' pie-grid-2' : ''}`}>
      {pies.map((p, i) => <SinglePie key={i} pie={p} />)}
    </div>
  );
}

/* ── Table — real data, read off exact cells (§14.3) ───────── */

export function TableVisual({ chartData }) {
  if (!chartData) return null;
  return (
    <div className="t1-scroll">
      <table className="t1-table">
        <thead>
          <tr>
            {chartData.columns.map((c) => (
              <th key={c} scope="col">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chartData.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}