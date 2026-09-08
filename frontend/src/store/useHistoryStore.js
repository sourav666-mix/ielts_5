/* ============================================================
   ATLAS IELTS Academy — history store (spec §10.3 + §2.4)

   One entry per COMPLETED day: per-module bands + overall.
   Additive field `weakAreas` (a snapshot of the profile's
   weak-area profile at advance time) powers the §8.5 progress
   narratives — e.g. "your Matching Headings accuracy has gone
   from 40% to 75%" — from real movement, never invention.
   ============================================================ */

import { create } from 'zustand';
import { api } from '../lib/api.js';
import { roundBand } from '../lib/scoring.js';
import { mean, pct, humanType, storage } from '../lib/utils.js';
import { deckStats } from '../lib/srs.js';

const HISTORY_KEY = 'atlas_history';   // §10.4

const MODULE_LABELS = { reading: 'Reading', listening: 'Listening', writing: 'Writing', speaking: 'Speaking' };

export const useHistoryStore = create((set, get) => ({
  entries: [],
  loaded: false,

  load: async () => {
    try {
      const entries = await api.history.list();
      set({ entries: entries || [], loaded: true });
      storage.set(HISTORY_KEY, entries || []);
    } catch {
      set({ entries: storage.get(HISTORY_KEY, []), loaded: true });
    }
  },

  setEntries: (entries) => {
    const list = entries || [];
    set({ entries: list, loaded: true });
    storage.set(HISTORY_KEY, list);
  },

  /* ── §2.4 selectors ──────────────────────────────────────── */

  totalDays: () => get().entries.length,

  /** Last n completed days for the trend chart (default 30). */
  trend: (n = 30) => get().entries.slice(-n),

  /** Average overall band over the last 7 completed days. */
  avgOverallLast7: () => {
    const last = get().entries.slice(-7);
    if (!last.length) return null;
    return roundBand(mean(last.map((e) => e.overall)));
  },

  /**
   * §8.4 adaptive difficulty per module, from the rolling 7-day
   * average vs the target band. NOTE for module views: when this
   * returns 'easier', generation is slightly simplified AND the
   * gap must be flagged to the student plainly — never quietly
   * made easier forever.
   */
  moduleDifficulty: (module, targetBand = 6.5) => {
    const last = get().entries.slice(-7).map((e) => e[module]).filter(Number.isFinite);
    if (last.length < 3) return 'steady';      // not enough signal yet
    const avg = mean(last);
    if (avg - targetBand >= 1.0) return 'harder';
    if (targetBand - avg >= 1.0) return 'easier';
    return 'steady';
  },

  /* ── §8.5 progress narratives ─────────────────────────────── */

  /**
   * Plain-language milestone callouts for the dashboard — tied to
   * real, specific movement in the numbers (§3.4: no empty
   * praise, no claims without data). Returns [] until ≥6 completed
   * days exist. Max 3 callouts: encouragement, never a wall.
   * @param {object} [profile] current profile (for vocabulary stats)
   */
  milestones: (profile) => {
    const entries = get().entries;
    const out = [];

    if (entries.length >= 6) {
      const firstAvg = mean(entries.slice(0, 3).map((e) => e.overall));
      const lastAvg = mean(entries.slice(-3).map((e) => e.overall));
      if (Number.isFinite(firstAvg) && Number.isFinite(lastAvg) && lastAvg - firstAvg >= 0.5) {
        out.push(`Your overall band has climbed from ${firstAvg.toFixed(1)} to ${lastAvg.toFixed(1)} — steady, real progress.`);
      }

      // biggest module mover
      let best = null;
      for (const m of ['reading', 'listening', 'writing', 'speaking']) {
        const a = mean(entries.slice(0, 3).map((e) => e[m]).filter(Number.isFinite));
        const b = mean(entries.slice(-3).map((e) => e[m]).filter(Number.isFinite));
        if (Number.isFinite(a) && Number.isFinite(b) && b - a >= 0.5) {
          if (!best || b - a > best.delta) best = { m, a, b, delta: b - a };
        }
      }
      if (best) {
        out.push(`Biggest mover: ${MODULE_LABELS[best.m]}, up from ${best.a.toFixed(1)} to ${best.b.toFixed(1)}. Keep doing exactly that.`);
      }

      // question-type accuracy movement from weakAreas snapshots
      const moves = typeAccuracyMovement(entries);
      if (moves.length) out.push(moves[0].text);
    }

    // vocabulary retention (works from day one — real data, no claim inflation)
    const stats = deckStats(profile?.vocabDeck || []);
    if (stats.mastered > 0) {
      out.push(`${stats.mastered} ${stats.mastered === 1 ? 'word has' : 'words have'} reached long-term retention in your deck, out of ${stats.total} collected so far.`);
    }

    return out.slice(0, 3);
  },
}));

/* Compare the earliest vs latest weakAreas snapshots in history:
   a ≥25-point accuracy gain on any question type becomes a
   milestone — the spec's own example shape. */
function typeAccuracyMovement(entries) {
  const withSnap = entries.filter((e) => e.weakAreas);
  if (withSnap.length < 4) return [];
  const first = withSnap[0].weakAreas;
  const last = withSnap[withSnap.length - 1].weakAreas;
  const moves = [];
  for (const mod of ['reading', 'listening']) {
    for (const [type, entry] of Object.entries(last[mod] || {})) {
      const prev = first[mod]?.[type];
      if (!entry?.recent?.length || !prev?.recent?.length) continue;
      const nowRate = mean(entry.recent);
      const thenRate = mean(prev.recent);
      if (nowRate - thenRate >= 0.25) {
        moves.push({
          delta: nowRate - thenRate,
          text: `Your ${humanType(type)} accuracy has gone from ${pct(thenRate)} to ${pct(nowRate)}.`,
        });
      }
    }
  }
  return moves.sort((a, b) => b.delta - a.delta);
}