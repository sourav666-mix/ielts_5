/* ============================================================
   ATLAS IELTS Academy — Speaking flow (spec §7)

   ⚠ CONTRACT for the backend prompt library (Batch 10):

   POST /speaking/generate  payload:
     { phase, day, roundIndex, targetBand, difficulty,
       avoidTopics[≤20],
       weakMetrics: [{ metric, average, attempts }] }   // §8.1
   response:
     { topic,
       part1: [ 5 question strings ],
       cueCard: { prompt, bullets: [ 4 "you should say" items ] },
       part3: [ 6 question strings ] }
   One coherent topic per round; phrasing VARIES across rounds
   (§3.5) — avoidTopics carries every topic used, including
   earlier rounds today.

   POST /speaking/feedback  payload:
     { phase, part: 1|2|3, question, answer, targetBand, topic }
   response:
     { reaction?, band, grammarFaults?, sentenceFaults?,
       meaningFaults?, correctedVersion?, vocabularyTip?,
       fluencyNote? }
   · band is REQUIRED (single-answer estimate, half-band)
   · faults: [{ original, corrected, why }]
   · The answer transcript is RAW spoken English — the prompt
     side (§12.4) must never flag fillers as errors.

   Client rules: per-answer bands are coerced to half-bands;
   round/day aggregation is recomputed client-side via
   speakingRoundBand / speakingDayBand (§9.4) so rounding has a
   single source of truth; any server-side averages are ignored.
   ============================================================ */

import { api } from './api.js';
import { speakingRoundBand, speakingDayBand } from './scoring.js';
import { avoidTopicsOf } from './genPayloads.js';

export const TRAINING_TARGET_SEC = 5400;   // §7.1 — 90 minutes of active practice
export const PART2_PREP_SEC = 60;          // §7.2 — 1 minute silent prep
export const LONG_TURN_SEC = 120;          // §7.2 — 2 minutes continuous speech

const ROUND_INCOMPLETE = "This round's questions didn't come back complete — one more try usually sorts it.";
const FEEDBACK_INCOMPLETE = "The feedback didn't come back clear — trying again usually sorts it.";

const str = (v) => String(v ?? '').trim();
const arr = (v) => (Array.isArray(v) ? v : []);
const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const roundToHalf = (v) => Math.round(v * 2) / 2;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const toBand = (v) => {
  const n = toNum(v);
  return n == null ? NaN : clamp(roundToHalf(n), 2, 9);
};

/* ── §7.5 round generation ─────────────────────────────────── */

export function buildRoundGenPayload({
  phase, day, roundIndex, targetBand, avoidTopics = [], weakAreas = [], difficulty = 'steady',
}) {
  return {
    phase,
    day,
    roundIndex,
    targetBand,
    difficulty,
    avoidTopics: avoidTopicsOf(avoidTopics),
    weakMetrics: (weakAreas || []).map((w) => ({
      metric: w.key,
      average: +Number(w.rate).toFixed(2),   // rolling faults-per-answer, last 10
      attempts: w.n,
    })),
  };
}

export function buildFeedbackPayload({ phase, part, question, answer, targetBand, topic }) {
  return { phase, part, question, answer, targetBand, topic };
}

export function normalizeRound(res) {
  const topic = str(res?.topic);
  const part1 = arr(res?.part1).map(str).filter(Boolean);
  const part3 = arr(res?.part3).map(str).filter(Boolean);
  const cc = res?.cueCard || {};
  const prompt = str(cc.prompt || cc.question || cc.title);
  const bullets = arr(cc.bullets || cc.points || cc.prompts).map(str).filter(Boolean);

  if (!topic || part1.length < 3 || !prompt || bullets.length < 2 || part3.length < 4) {
    throw new Error(ROUND_INCOMPLETE);
  }

  return {
    topic,
    part1: part1.slice(0, 5),                       // §7.2 — 5 personal questions
    cueCard: { prompt, bullets: bullets.slice(0, 4) },  // 4 "you should say" bullets
    part3: part3.slice(0, 6),                       // 6 abstract questions
  };
}

/* In-flight memoisation keyed by phase:day:roundIndex —
   StrictMode double-mounts spend ONE network call, and each
   genuine "next round" (roundIndex grows) generates fresh. */
const inflight = new Map();

export async function generateRound(opts) {
  const key = `${opts.phase}:${opts.day}:${opts.roundIndex}`;
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => normalizeRound(await api.speaking.generate(
    buildRoundGenPayload(opts)
  )))();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

/* ── §7.6 per-answer feedback normalisation ────────────────── */

const normalizeFaults = (list) => arr(list)
  .map((f) => ({
    original: str(f?.original ?? f?.before),
    corrected: str(f?.corrected ?? f?.after),
    why: str(f?.why ?? f?.reason ?? f?.explanation),
  }))
  .filter((f) => f.original && f.corrected);

export function normalizeSpeakingFeedback(res) {
  const band = toBand(res?.band);
  if (!Number.isFinite(band)) throw new Error(FEEDBACK_INCOMPLETE);

  return {
    reaction: str(res?.reaction ?? res?.contentReaction),
    band,
    grammarFaults: normalizeFaults(res?.grammarFaults),
    sentenceFaults: normalizeFaults(res?.sentenceFaults),
    meaningFaults: normalizeFaults(res?.meaningFaults),
    correctedVersion: str(res?.correctedVersion ?? res?.corrected),
    bestAnswer: str(res?.bestAnswer ?? res?.modelAnswer),
    vocabularyTip: str(res?.vocabularyTip),
    fluencyNote: str(res?.fluencyNote),
  };
}

/* ── §7.7 aggregation ──────────────────────────────────────── */

/** Round average = mean of answer-level estimates, §9.4-rounded. */
export const roundAverage = (answers = []) =>
  speakingRoundBand((answers || []).map((a) => a.band).filter(Number.isFinite));

/** Day band = mean of round averages, §9.4-rounded — completed rounds only. */
export function finalizeSpeaking(rounds = []) {
  const completed = (rounds || []).filter((r) => r.completedAt && r.avgBand != null);
  return {
    band: completed.length ? speakingDayBand(completed.map((r) => r.avgBand)) : NaN,
    roundsCompleted: completed.length,
    totalAnswers: completed.reduce((n, r) => n + (arr(r.answers).length), 0),
  };
}

/* ── §8.1 signals — fault counts per answer; the rolling mean
   of these IS the spec's "grammarFaults_perAnswer: 1.8" profile
   shape. One batched profile update per day via
   applyAccuracySignals (shared with Reading/Listening/Writing).
   Not recorded for warm-up or abandoned rounds — only scored
   answers count.                                         */

export function speakingSignals(rounds = []) {
  const out = [];
  for (const r of rounds || []) {
    for (const a of arr(r.answers)) {
      const fb = a.feedback || {};
      out.push({ key: 'grammarFaults_perAnswer', value: arr(fb.grammarFaults).length });
      out.push({ key: 'sentenceFaults_perAnswer', value: arr(fb.sentenceFaults).length });
      out.push({ key: 'meaningFaults_perAnswer', value: arr(fb.meaningFaults).length });
    }
  }
  return out;
}