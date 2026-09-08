/* ============================================================
   ATLAS IELTS Academy — module & programme metadata

   Single source for module labels, route paths, per-phase
   descriptors, day arithmetic (programme day, previous-day ref
   for §8.3 warm-ups) and status-aware TOC subtitles — including
   the §7.3 24-hour-window countdown text for Speaking.
   ============================================================ */

import { formatBand } from './utils.js';
import { hoursSince } from './timers.js';

export const MODULES = ['reading', 'listening', 'writing', 'speaking'];

export const MODULE_META = {
  reading: {
    label: 'Reading',
    path: '/reading',
    coach: 'Reading Coach',
    practiceDesc: '3 passages · 40 questions · 60 minutes',
    mockDesc: '3 passages · 40 questions · 60 minutes · strict conditions',
  },
  listening: {
    label: 'Listening',
    path: '/listening',
    coach: 'Listening Coach',
    practiceDesc: '4 parts · 40 questions · ~40 minutes · one replay allowed',
    mockDesc: '4 parts · 40 questions · one play only',
  },
  writing: {
    label: 'Writing',
    path: '/writing',
    coach: 'Writing Coach',
    practiceDesc: 'Task 1 + Task 2 · model answers on hand',
    mockDesc: 'Task 1 + Task 2 · no model answers',
  },
  speaking: {
    label: 'Speaking',
    path: '/speaking',
    coach: 'Speaking Coach',
    practiceDesc: 'Rolling interview rounds · 90 minutes logged',
    mockDesc: 'One interview · 11–14 minutes',
  },
};

export const PROGRAMME_LENGTH = 270;          // §1.2
export const PHASE_LENGTH = { practice: 150, mock: 120 };

export const phaseLabel = (phase) => (phase === 'mock' ? 'Mock Exam' : 'Training');

/** Programme day 1–270 (mock day 34 → 184). */
export function programmeDay(phase, day) {
  return phase === 'mock' ? PHASE_LENGTH.practice + Number(day || 0) : Number(day || 0);
}

/** The day before (phase, day), crossing the practice→mock boundary.
 *  Practice Day 1 has no previous day → null. */
export function previousDayRef(phase, day) {
  if (phase !== 'mock' && phase !== 'practice') return null;
  const d = Number(day);
  if (!Number.isFinite(d)) return null;
  if (phase === 'practice') return d > 1 ? { phase: 'practice', day: d - 1 } : null;
  return d > 1 ? { phase: 'mock', day: d - 1 } : { phase: 'practice', day: PHASE_LENGTH.practice };
}

/** ["Reading", "Listening"] → "Reading and Listening" (warm copy). */
export function joinList(items = []) {
  const list = items.filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** Labels of modules not yet done — powers the §2.3 gate hint. */
export function outstandingModules(record) {
  return MODULES
    .filter((k) => record?.[k]?.status !== 'done')
    .map((k) => MODULE_META[k].label);
}

/** Status-aware TOC subtitle, or undefined → caller falls back to
 *  the phase descriptor. Done rows lead with the real band —
 *  honesty first (§3.4). */
export function moduleSubtitle(record, key) {
  const m = record?.[key];
  if (!m) return undefined;

  if (m.status === 'done') {
    const s = m.score || {};
    if (key === 'reading' || key === 'listening') {
      return `Band ${formatBand(s.band)} · ${s.correct ?? '—'} of ${s.total ?? 40} correct`;
    }
    if (key === 'writing') {
      return `Band ${formatBand(s.band)} · Task 1 ${formatBand(s.task1Band)} · Task 2 ${formatBand(s.task2Band)}`;
    }
    const rounds = Array.isArray(m.rounds) ? m.rounds.length : 0;
    return `Band ${formatBand(s.band)} · ${rounds} ${rounds === 1 ? 'round' : 'rounds'} logged`;
  }

  if (m.status === 'progress') {
    if (key === 'speaking') {
      const mins = Math.floor((m.timeSpentSec || 0) / 60);
      const parts = [`${mins} of 90 minutes logged`];
      if (m.sessionStartedAt) {
        const left = 24 - hoursSince(m.sessionStartedAt);
        if (Number.isFinite(left) && left > 0) {
          const h = Math.floor(left);
          const mm = String(Math.round((left - h) * 60)).padStart(2, '0');
          parts.push(`${h}h ${mm}m left in today’s window`);
        }
      }
      return parts.join(' · ');
    }
    if (key === 'writing') return 'In progress — your drafts are saved';
    return 'In progress — your answers are saved';
  }

  return undefined;
}