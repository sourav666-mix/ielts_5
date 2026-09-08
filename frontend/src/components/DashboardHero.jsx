/* ============================================================
   ATLAS IELTS Academy — dashboard hero (§9.5 + §2.4)

   The daily overall estimate (mean of whichever module bands
   exist so far, IELTS-rounded) appears the moment the first
   section completes — em-dash until then, never a fake number.
   Rolling stats and the 270-day programme bar sit alongside.
   Presentational: everything arrives as props.
   ============================================================ */

import React from 'react';
import { StatBlock, ProgressBar } from './ui.jsx';
import { formatBand } from '../lib/utils.js';
import { phaseLabel, PHASE_LENGTH, PROGRAMME_LENGTH } from '../lib/moduleMeta.js';
import '../styles/views.css';

export default function DashboardHero({
  overall,
  target,
  phase,
  day,
  streak,
  completedDays,
  avg7,
  dueToday,
  deckTotal,
}) {
  const note = overall == null
    ? 'Your estimate appears here after the first section today.'
    : overall >= target
      ? `At or above your ${formatBand(target)} target today — nice work.`
      : overall >= target - 0.5
        ? `Half a band from your ${formatBand(target)} target — very close.`
        : `${formatBand(target - overall)} below your ${formatBand(target)} target — today’s four sections are where that changes.`;

  return (
    <header className="hero">
      <div className="hero-grid">
        <div>
          <p className="kicker">
            {phaseLabel(phase)} · Day {day} of {PHASE_LENGTH[phase] ?? 150}
          </p>
          <div className="hero-band">{overall != null ? formatBand(overall) : '—'}</div>
          <p className="hero-note">{note}</p>
        </div>

        <div className="grid-auto">
          <StatBlock value={streak ?? 0} label="day streak" />
          <StatBlock value={completedDays} label="days completed" />
          <StatBlock value={avg7 != null ? formatBand(avg7) : '—'} label="7-day avg band" />
          <StatBlock value={dueToday} label="words due today" />
        </div>
      </div>

      <div>
        <ProgressBar value={completedDays} max={PROGRAMME_LENGTH} ariaLabel="Programme progress" />
        <p className="small" style={{ marginTop: 6 }}>
          {completedDays} of {PROGRAMME_LENGTH} days · {deckTotal} words collected so far
        </p>
      </div>
    </header>
  );
}