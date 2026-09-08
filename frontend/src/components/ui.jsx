/* ============================================================
   ATLAS IELTS Academy — shared UI primitives

   Every primitive consumes File 10's classes only. LoadingHero
   carries the §15.4 warm voice — its copy pools are the single
   place loading messages live.
   ============================================================ */

import React, { useEffect, useMemo, useState } from 'react';
import { bandTone } from '../lib/scoring.js';
import { formatBand, cn } from '../lib/utils.js';

/* ── Tiny primitives ───────────────────────────────────────── */

export const Spinner = () => <div className="spinner" role="presentation" />;

export function Tag({ tone = '', children }) {
  return <span className={cn('tag', tone)}>{children}</span>;
}

export function StatusDot({ status = '' }) {
  return <span className={cn('status-dot', status)} aria-hidden="true" />;
}

export function BandPill({ band, target, tone, label }) {
  const t = tone ?? bandTone(band, target);
  const text = label ?? (Number.isFinite(band) ? formatBand(band) : '—');
  return <span className={cn('band-pill', t)}>{text}</span>;
}

export function StatBlock({ value, label }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export function ProgressBar({ value = 0, max = 1, ariaLabel }) {
  const p = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div className="progress-bar" style={{ width: `${p}%` }} />
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', children }) {
  return (
    <div className="panel center" style={{ padding: 'var(--sp-6)' }}>
      <h3 className="title-3" style={{ marginBottom: 8 }}>{title}</h3>
      <p className="muted">{children}</p>
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  children,
}) {
  return (
    <div className="panel" role="alert">
      <h3 className="title-3" style={{ marginBottom: 8 }}>{title}</h3>
      <p className="muted" style={{ marginBottom: 16 }}>
        {message || "That didn't work — give it another go in a moment."}
      </p>
      <div className="row">
        {onRetry && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
            {retryLabel}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/* ── LoadingHero — warm copy pools (§15.4) ───────────────────
   Usage: <LoadingHero kind="reading-gen" /> or custom
   <LoadingHero title="…" lines={[…]} hint="…" />.
   Rotates the subtitle every ~5s while the AI works.            */

const POOLS = {
  boot: {
    title: 'ATLAS IELTS Academy',
    lines: ['Waking up your coaches…', 'Loading your programme…'],
  },
  route: {
    title: 'Getting today ready…',
    lines: ['One moment…'],
  },
  'reading-gen': {
    title: 'Your Reading coach is writing today’s test',
    lines: [
      'Choosing a fresh theme you haven’t practised…',
      'Writing three brand-new passages…',
      'Picking vocabulary worth keeping…',
      'Building questions around what you find hardest…',
    ],
  },
  'listening-gen': {
    title: 'Your Listening coach is recording today’s audio',
    lines: [
      'Writing four new conversations and talks…',
      'Giving each speaker their own voice…',
      'Setting questions to the speakers’ exact words…',
    ],
  },
  'writing-gen': {
    title: 'Your Writing coach is drawing up today’s tasks',
    lines: [
      'Choosing today’s chart and essay question…',
      'Double-checking the numbers add up…',
    ],
  },
  'speaking-gen': {
    title: 'Your Speaking coach is preparing today’s interview',
    lines: [
      'Picking a topic worth talking about…',
      'Writing questions you won’t have heard before…',
    ],
  },
  grading: {
    title: 'Your coach is marking this carefully',
    lines: [
      'Reading every word…',
      'Scoring against the four official criteria…',
      'Noting what you did well, first…',
    ],
  },
  insight: {
    title: 'Your coach is looking for the pattern in today’s misses',
    lines: ['Reading across all forty questions…'],
  },
  model: {
    title: 'Writing a Band 9 model answer for comparison',
    lines: ['Choosing words you can actually steal…'],
  },
  image: {
    title: 'Sketching your diagram…', // §15.4's exact example
    lines: ['Adding the labels…'],
  },
  tts: {
    title: 'Warming up the coach’s voice…',
    lines: ['Almost there…'],
  },
};

export function LoadingHero({ kind = 'route', title, lines, hint }) {
  const pool = POOLS[kind] || POOLS.route;
  const finalTitle = title ?? pool.title;
  const finalLines = useMemo(() => lines ?? pool.lines, [lines, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const linesKey = finalLines.join('\u0001');
  const [i, setI] = useState(0);

  useEffect(() => {
    setI(0);
    if (finalLines.length <= 1) return undefined;
    const iv = setInterval(() => setI((v) => (v + 1) % finalLines.length), 5200);
    return () => clearInterval(iv);
  }, [linesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="loading-hero" role="status" aria-live="polite">
      <Spinner />
      <div className="loading-title">{finalTitle}</div>
      <div className="loading-sub">{finalLines[i % finalLines.length]}</div>
      {hint && <div className="small">{hint}</div>}
    </div>
  );
}