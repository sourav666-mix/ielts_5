/* ============================================================
   ATLAS IELTS Academy — Writing flow (spec §6, §14)

   ⚠ CONTRACT for the backend prompt library (Batch 10):

   POST /writing/generate  payload:
     { phase, day, targetBand, difficulty,
       avoidTopics[≤20],
       weakCriteria: [{ criterion, averageBand, attempts }] }   // §8.1
   response:
     { theme?,
       task1: { prompt, visualType: 'line_graph'|'pie_chart'|
                'table'|'process_diagram'|'map'|'mixed',
                chartData: <per §6.2 shapes>, image? },
       task2: { prompt, essayType: 'opinion'|'discussion'|
                'adv_disadv'|'problem_solution'|'two_part' } }

   POST /writing/grade  (multipart FormData):
     task1, task2        — JSON strings of the generated tasks
     task1Text, task2Text— typed answers ('' when a file is used)
     task1File/task2File — optional image/PDF File (§6.4)
   response:
     { task1: { criteria: { taskAchievement, coherenceCohesion,
                 lexicalResource, grammaticalRangeAccuracy },
                errors: [{original, corrected, why}],
                strengths: [..], improvedVersion, nextSteps: [..],
                wordCount?, extractedText? },
       task2: { criteria: { taskResponse, ...same three },
                ...same } }
     Criteria may arrive as {score, feedback} objects, bare
     numbers, or a [{name, score, feedback}] array — all are
     normalised here. The task bands are ALWAYS recomputed
     client-side via criteriaBand() so §9.4 rounding has a single
     source of truth; any server-side `band` is ignored.

   POST /writing/model-answer  payload: { task: 'task1'|'task2',
     taskData, targetBand } → { modelAnswer }   (Training only —
     the server enforces §6.6; the UI hides it in Mock too)

   POST /writing/image  payload: { chartData }  → { url }
     Only process_diagram / map (§14.3); schematic fallback
     renders first, the image never blocks the task (§14.4).

   TIMER NOTE (documented spec reading): the spec mandates strict
   auto-submitting clocks only for Reading (§4.1) and Listening
   (§5.1); §2.2's only Writing-specific Mock change is removing
   model answers. So Writing keeps an advisory clock + active-
   time accounting (Stopwatch, pauses on tab-hide) — never a
   forced submit. Stated in the session UI, not hidden.
   ============================================================ */

import { api } from './api.js';
import { criteriaBand, writingDayBand } from './scoring.js';
import { avoidTopicsOf } from './genPayloads.js';
import { clamp, mean } from './utils.js';

export const TASK1_MIN = 150;      // §6.1
export const TASK1_TARGET = 170;
export const TASK2_MIN = 250;
export const TASK2_TARGET = 270;

export const VISUAL_LABELS = {
  line_graph: 'Line graph',
  pie_chart: 'Pie chart',
  table: 'Table',
  process_diagram: 'Process diagram',
  map: 'Map',
  mixed: 'Bar & line chart',
};

export const ESSAY_LABELS = {
  opinion: 'Opinion essay',
  discussion: 'Discussion essay',
  adv_disadv: 'Advantages & disadvantages',
  problem_solution: 'Problem & solution',
  two_part: 'Two-part question',
};

export const TASK1_CRITERIA = [
  'taskAchievement', 'coherenceCohesion', 'lexicalResource', 'grammaticalRangeAccuracy',
];
export const TASK2_CRITERIA = [
  'taskResponse', 'coherenceCohesion', 'lexicalResource', 'grammaticalRangeAccuracy',
];

const INCOMPLETE = "Today's tasks didn't come back complete — one more try usually sorts it.";
const GRADE_INCOMPLETE = "The coach's marking came back unclear — trying again usually sorts it.";

/* ── small coercion helpers ─────────────────────────────────── */

const str = (v) => String(v ?? '').trim();
const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const toNonNeg = (v) => { const n = toNum(v); return n != null && n >= 0 ? n : 0; };
const roundToHalf = (v) => Math.round(v * 2) / 2;
const toBand = (v) => {
  const n = toNum(v);
  return n == null ? NaN : clamp(roundToHalf(n), 2, 9);
};
const clampPct = (v, fallback) => {
  const n = toNum(v);
  return n == null ? fallback : Math.max(4, Math.min(96, n));
};
const normKey = (s) =>
  String(s ?? '').replace(/([a-z\d])([A-Z])/g, '$1_$2').toLowerCase().replace(/[\s-]+/g, '_');

const VISUAL_TYPES = new Set(['line_graph', 'pie_chart', 'table', 'process_diagram', 'map', 'mixed']);

const ESSAY_ALIASES = {
  opinion: 'opinion', agree_or_disagree: 'opinion', agree_disagree: 'opinion',
  discussion: 'discussion', discuss_both_views: 'discussion', both_views: 'discussion',
  adv_disadv: 'adv_disadv', advantages_disadvantages: 'adv_disadv',
  advantages_and_disadvantages: 'adv_disadv', positive_negative: 'adv_disadv',
  problem_solution: 'problem_solution', problems_solutions: 'problem_solution',
  cause_solution: 'problem_solution',
  two_part: 'two_part', two_part_question: 'two_part', double_question: 'two_part',
};

const normalizeVisualType = (t) => {
  const k = normKey(t);
  return VISUAL_TYPES.has(k) ? k : 'table';       // unreadable type → table is always renderable
};

const normalizeEssayType = (t) => {
  const k = normKey(t);
  return ESSAY_ALIASES[k] || (k ? k : 'two_part');
};

/* ── chartData normalisers (§6.2 shapes, defensively clamped) ── */

function normalizeLineData(cd) {
  if (!Array.isArray(cd?.xLabels) || cd.xLabels.length < 2) return null;
  const xLabels = cd.xLabels.map((x) => String(x ?? '').trim());
  const series = (Array.isArray(cd?.series) ? cd.series : [])
    .slice(0, 6)
    .map((s) => ({
      name: str(s?.name) || 'Series',
      data: xLabels.map((_, i) => toNum(s?.data?.[i])),   // length-forced; nulls span
    }))
    .filter((s) => s.data.some((v) => v != null));
  if (!series.length) return null;
  return { title: str(cd?.title), xLabels, series, yLabel: str(cd?.yLabel) };
}

function normalizePieData(cd) {
  const rawPies = Array.isArray(cd?.pies) && cd.pies.length ? cd.pies : [cd];
  const pies = rawPies
    .slice(0, 2)
    .map((p) => ({
      title: str(p?.title),
      segments: (Array.isArray(p?.segments) ? p.segments : [])
        .map((s) => ({ label: str(s?.label) || '—', value: toNonNeg(s?.value) }))
        .filter((s) => s.value > 0)
        .slice(0, 8),
    }))
    .filter((p) => p.segments.length >= 2);
  if (!pies.length) return null;
  return { title: str(cd?.title), pies };
}

function normalizeTableData(cd) {
  const columns = (Array.isArray(cd?.columns) ? cd.columns : [])
    .map((c) => str(c)).filter(Boolean).slice(0, 8);
  if (columns.length < 2) return null;
  const rows = (Array.isArray(cd?.rows) ? cd.rows : [])
    .filter((r) => Array.isArray(r) && r.length > 0)
    .slice(0, 12)
    .map((r) => columns.map((_, i) => (r[i] == null ? '' : String(r[i]))));
  if (!rows.length) return null;
  return { title: str(cd?.title), columns, rows };
}

function normalizeProcessData(cd) {
  const steps = (Array.isArray(cd?.steps) ? cd.steps : [])
    .slice(0, 8)
    .map((s) => ({ label: str(s?.label) || 'Step', description: str(s?.description) }))
    .filter((s) => s.label);
  if (steps.length < 2) return null;
  return { title: str(cd?.title), steps };
}

function normalizePane(pane, offset) {
  if (!pane) return null;
  const features = (Array.isArray(pane?.features) ? pane.features : [])
    .slice(0, 10)
    .map((f, i) => ({
      label: str(f?.label) || `Location ${i + 1}`,
      x: clampPct(f?.x, 10 + Math.round((i * 80) / 9)),
      y: clampPct(f?.y, 22 + (i % 3) * 27 + offset),
    }));
  if (features.length < 2) return null;
  return { caption: str(pane?.caption), features };
}

function normalizeMapData(cd) {
  const before = normalizePane(cd?.before, 0);
  const after = normalizePane(cd?.after, 10);   // slight offset so pins never mirror-stack
  if (!before || !after) return null;
  return { title: str(cd?.title), before, after };
}

/* ── content normalisation (single gatekeeper) ─────────────── */

function deriveTheme(task2Prompt) {
  const words = String(task2Prompt || '').split(/\s+/).filter(Boolean).slice(0, 8).join(' ');
  return words || 'Today’s writing';
}

export function normalizeWritingContent(genRes) {
  const rawT1 = genRes?.task1;
  const rawT2 = genRes?.task2;
  if (!rawT1?.prompt || !rawT2?.prompt) throw new Error(INCOMPLETE);

  const task2 = {
    prompt: String(rawT2.prompt).trim(),
    essayType: normalizeEssayType(rawT2.essayType),
  };

  let visualType = normalizeVisualType(rawT1.visualType);
  const cd = rawT1.chartData || {};
  let chartData = null;

  if (visualType === 'line_graph' || visualType === 'mixed') chartData = normalizeLineData(cd);
  else if (visualType === 'pie_chart') chartData = normalizePieData(cd);
  else if (visualType === 'table') chartData = normalizeTableData(cd);
  else if (visualType === 'process_diagram') chartData = normalizeProcessData(cd);
  else if (visualType === 'map') chartData = normalizeMapData(cd);

  if (!chartData) {
    const asTable = normalizeTableData(cd);            // generic last resort
    if (asTable) { chartData = asTable; visualType = 'table'; }
  }
  if (!chartData) throw new Error(INCOMPLETE);

  const task1 = { prompt: String(rawT1.prompt).trim(), visualType, chartData };
  if (rawT1.image) task1.image = String(rawT1.image);

  return { theme: str(genRes?.theme) || deriveTheme(task2.prompt), task1, task2 };
}

/* ── payload builders (§8.1 quiet criteria weighting) ──────── */

export function buildWritingGenPayload({
  phase, day, targetBand, avoidTopics = [], weakAreas = [], difficulty = 'steady',
}) {
  return {
    phase, day, targetBand, difficulty,
    avoidTopics: avoidTopicsOf(avoidTopics),
    weakCriteria: (weakAreas || []).map((w) => ({
      criterion: w.key,
      averageBand: +Number(w.rate).toFixed(2),
      attempts: w.n,
    })),
  };
}

/* ── generation (in-flight memoised, StrictMode-proof) ─────── */

const inflight = new Map();

export async function generateWritingDay(opts) {
  const key = `${opts.phase}:${opts.day}`;
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => normalizeWritingContent(await api.writing.generate(
    buildWritingGenPayload(opts)
  )))();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

/* ── grading (§6.5) ─────────────────────────────────────────── */

export function buildGradeFormData({
  task1, task2, task1Text, task2Text, task1File, task2File,
}) {
  const fd = new FormData();
  fd.append('task1', JSON.stringify(task1));
  fd.append('task2', JSON.stringify(task2));
  fd.append('task1Text', String(task1Text || ''));
  fd.append('task2Text', String(task2Text || ''));
  if (task1File) fd.append('task1File', task1File, task1File.name);
  if (task2File) fd.append('task2File', task2File, task2File.name);
  return fd;
}

/** Map a free-form criterion name onto an expected slot key. */
function slotFromName(name, expected) {
  const n = String(name || '').toLowerCase();
  const first = expected[0];
  const firstMatch = expected === TASK2_CRITERIA
    ? (n.includes('response') || n.includes('task'))
    : (n.includes('achievement') || n.includes('task'));
  if (firstMatch) return first;
  if (n.includes('coherence') || n.includes('cohesion')) return 'coherenceCohesion';
  if (n.includes('lexical') || n.includes('vocab')) return 'lexicalResource';
  if (n.includes('grammar')) return 'grammaticalRangeAccuracy';
  return null;
}

export function normalizeFeedback(raw, taskKey) {
  const expected = taskKey === 'task1' ? TASK1_CRITERIA : TASK2_CRITERIA;
  const rawCriteria = raw?.criteria;

  let byKey = {};
  if (Array.isArray(rawCriteria)) {
    for (const c of rawCriteria) {
      const slot = slotFromName(c?.name, expected);
      if (slot) byKey[slot] = c;
    }
  } else if (rawCriteria && typeof rawCriteria === 'object') {
    byKey = rawCriteria;
  }

  const criteria = {};
  const present = [];
  for (const key of expected) {
    const entry = byKey[key];
    const score = toBand(typeof entry === 'number' ? entry : entry?.score);
    const note = typeof entry === 'object' && entry ? str(entry?.feedback) : '';
    criteria[key] = { score: Number.isFinite(score) ? score : null, feedback: note };
    if (Number.isFinite(score)) present.push(score);
  }
  if (present.length < 3) throw new Error(GRADE_INCOMPLETE);

  /* A single missing criterion is filled with the rounded mean of
   * the others — a retry (a full re-grade) costs too much to
   * demand over one absent slot. Documented tolerance. */
  if (present.length < expected.length) {
    const fill = roundToHalf(mean(present));
    for (const key of expected) if (criteria[key].score == null) criteria[key].score = fill;
  }

  const errors = (Array.isArray(raw?.errors) ? raw.errors : [])
    .map((e) => ({
      original: str(e?.original ?? e?.before),
      corrected: str(e?.corrected ?? e?.after),
      why: str(e?.why ?? e?.reason ?? e?.explanation),
    }))
    .filter((e) => e.original && e.corrected);

  const strings = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

  return {
    band: criteriaBand(expected.map((k) => criteria[k].score)),   // §9.3 + §9.4
    criteria,
    errors,
    strengths: strings(raw?.strengths),
    improvedVersion: str(raw?.improvedVersion),
    nextSteps: strings(raw?.nextSteps),
    wordCount: toNum(raw?.wordCount) ?? undefined,
    extractedText: str(raw?.extractedText) || undefined,
  };
}

/** Full grading call — returns both tasks' feedback + §6.7 day band. */
export async function gradeWriting(args) {
  const fd = buildGradeFormData(args);
  const res = await api.writing.grade(fd);
  const t1 = normalizeFeedback(res?.task1 ?? res?.feedback?.task1, 'task1');
  const t2 = normalizeFeedback(res?.task2 ?? res?.feedback?.task2, 'task2');
  return { task1: t1, task2: t2, band: writingDayBand(t1.band, t2.band) };
}

/* ── §8.1 signals (criteria scores → weak-area profile) ──────
   applyAccuracySignals (Batch 5) pushes numeric values into the
   same {recent:[≤10]} shape the profile store writes — its name
   says "accuracy", its contract is "rolling numbers", which is
   exactly what writing criteria averages are.                */

export function writingSignals(task1Feedback, task2Feedback) {
  const out = [];
  for (const [fb, keys] of [[task1Feedback, TASK1_CRITERIA], [task2Feedback, TASK2_CRITERIA]]) {
    for (const k of keys) out.push({ key: k, value: fb.criteria[k].score });
  }
  return out;
}

/* ── §6.6 model answer ─────────────────────────────────────── */

export async function requestModelAnswer(taskKey, taskData, targetBand) {
  const res = await api.writing.modelAnswer({ task: taskKey, taskData, targetBand });
  const text = str(res?.modelAnswer);
  if (!text) throw new Error("The model answer didn't come back — one more try usually sorts it.");
  return text;
}

/* ── §14.4 AI image for process/map ──────────────────────────
   Results are memoised by visual identity (type + title). A
   failure caches as '' — the schematic is the steady state and
   the image is strictly an enhancement, never a dependency. */

const imageCache = new Map();

const imageKeyOf = (task1) => `${task1?.visualType}|${task1?.chartData?.title || ''}`;

export function fetchTaskImage(task1) {
  const key = imageKeyOf(task1);
  if (imageCache.has(key)) return imageCache.get(key);
  const p = api.writing.image(task1.chartData)
    .then((r) => {
      if (r && typeof r === 'object') return str(r.url || r.imageUrl || r.image);
      return str(r);
    })
    .catch(() => '');
  imageCache.set(key, p);
  return p;
}