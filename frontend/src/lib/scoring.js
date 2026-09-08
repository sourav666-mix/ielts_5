/* ============================================================
   ATLAS IELTS Academy — universal scoring (spec §9)

   Reading/Listening: published raw-score → band tables (§9.1/§9.2).
   Writing/Speaking:  four-criteria means rounded by the real
   IELTS rounding rule (§9.4) — averages ending in exactly .25 or
   .75 are forced UP to the next half/whole band.
   ============================================================ */

import { mean, clamp } from './utils.js';

/* §9.1 — Academic Reading (practice reference table). Each row is
   [minCorrect, band]; the max bound is implied by the next row. */
const READING_TABLE = [
  [39, 9.0], [37, 8.5], [35, 8.0], [33, 7.5], [30, 7.0], [27, 6.5],
  [23, 6.0], [19, 5.5], [15, 5.0], [13, 4.5], [10, 4.0], [8, 3.5],
  [6, 3.0], [4, 2.5], [0, 2.0],
];

/* §9.2 — Listening. Note the rows that differ from Reading:
   7.5 starts at 32 (not 33), 6.5 at 26 (not 27), 6.0 at 23 with an
   implied max of 25, 5.5 at 18, 5.0 at 16. */
const LISTENING_TABLE = [
  [39, 9.0], [37, 8.5], [35, 8.0], [32, 7.5], [30, 7.0], [26, 6.5],
  [23, 6.0], [18, 5.5], [16, 5.0], [13, 4.5], [10, 4.0], [8, 3.5],
  [6, 3.0], [4, 2.5], [0, 2.0],
];

function fromTable(table, correct) {
  const c = clamp(Math.round(Number(correct) || 0), 0, 40);
  for (const [min, band] of table) if (c >= min) return band;
  return 2.0;
}

export const readingBand = (correct) => fromTable(READING_TABLE, correct);
export const listeningBand = (correct) => fromTable(LISTENING_TABLE, correct);

/* §9.4 — the IELTS rounding rule.

   remainder in eighths →  0   1   2   3   4   5   6   7
   band adjustment      → +0  +0  +.5 +.5 +.5 +.5  +1  +1
                               ↑                  ↑
                          exact .25 tie       exact .75 tie
                          → forced UP         → forced UP

   Verified: 6.125→6.0 · 6.25→6.5 · 6.375→6.5 · 6.5→6.5
             6.625→6.5 · 6.75→7.0 · 6.875→7.0                      */
export function roundBand(avg) {
  if (!Number.isFinite(avg)) return 0;
  const floor = Math.floor(avg);
  const eighths = Math.round((avg - floor) * 8);
  if (eighths >= 8) return clamp(floor + 1, 0, 9);        // float-noise guard (6.9999…)
  const adjust = eighths <= 1 ? 0 : eighths <= 5 ? 0.5 : 1;
  return clamp(floor + adjust, 0, 9);
}

/* §9.3 — four official criteria, averaged and IELTS-rounded.
   Writing criteria: Task Achievement, Coherence & Cohesion,
   Lexical Resource, Grammatical Range & Accuracy.
   Speaking criteria: Fluency, Lexical Resource, Grammar,
   Pronunciation (estimated — see §7.7 honesty note). */
export const criteriaBand = (scores = []) =>
  roundBand(mean((scores || []).filter(Number.isFinite)));

/* §6.7 — Task 1 counts one-third, Task 2 two-thirds. */
export const writingDayBand = (task1Band, task2Band) =>
  roundBand((task1Band + 2 * task2Band) / 3);

/* §7.7 — round average = mean of answer-level estimates;
   day band = mean of round averages, rounded per §9.4. */
export const speakingRoundBand = (answerBands = []) =>
  roundBand(mean((answerBands || []).filter(Number.isFinite)));

export const speakingDayBand = (roundBands = []) =>
  roundBand(mean((roundBands || []).filter(Number.isFinite)));

/* §9.5 — daily overall estimate: the mean of whichever of the four
   module bands exist so far, rounded per §9.4. null until at least
   one module reports a score. */
export function estimateOverall(record) {
  if (!record) return null;
  const bands = ['reading', 'listening', 'writing', 'speaking']
    .map((m) => record[m]?.score?.band)
    .filter((b) => Number.isFinite(b));
  if (!bands.length) return null;
  return roundBand(mean(bands));
}

export const isBand = (b) =>
  Number.isFinite(b) && b >= 0 && b <= 9 && (b * 2) % 1 === 0;

/* UI helper for band pills: at/above target → green, within 0.5
   (the §8.4 "hold steady" band) → gold, further below → red. */
export function bandTone(band, target = 6.5) {
  if (!Number.isFinite(band)) return '';
  if (band >= target) return 'green';
  if (band >= target - 0.5) return 'gold';
  return 'red';
}

/** Y-axis ticks for the dashboard trend chart (§2.4). */
export const bandAxisTicks = () => {
  const ticks = [];
  for (let b = 2; b <= 9; b += 0.5) ticks.push(b);
  return ticks;
};