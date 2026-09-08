/* ============================================================
   ATLAS IELTS Academy — Listening flow (spec §5)

   §5.5 TWO SEQUENTIAL AI CALLS:
     1. POST /listening/generate  → theme + 4 multi-speaker
        transcripts (Part 2 may carry mapData)
     2. POST /listening/questions → 40 questions written against
        the FINISHED transcripts, answer keys drawn from the
        speakers' exact wording

   ⚠ CONTRACT for the backend prompt library (Batch 10):

   POST /listening/generate  payload:
     { phase, day, targetBand, difficulty,
       avoidTopics[≤20], weakAreas[{type,accuracy,attempts}],
       focusTypes[≤3] }
   response:
     { theme,
       parts: [ { part?: 1–4, title, scenario?,
                  speakers: [ { name, accent, voice? } ],
                  transcript: [ { speaker, text } ],
                  mapData?: { features: [ { label, x, y } ] } } × 4 ] }

   POST /listening/questions  payload:
     { phase, targetBand, difficulty,
       parts: [ { part, title, speakers[], lines: [{speaker,text}] } ],
       weakAreas, focusTypes }
   response:
     { questions: [ { part: 1–4 (0-based tolerated), type, prompt,
                      options?, wordLimit?, bank?, answer,
                      explanation } ] }

   Rules the prompt side owns (client is tolerant, not policing):
     · Part shapes/word-counts per §5.2 · answers = the speakers'
       exact words for completion types (slash alternatives OK)
     · ~10 questions per part, 40 total, numbered continuously
     · Server resolves a Kokoro voice per speaker per §13.3 —
       the client below falls back deterministically if absent.
   ============================================================ */

import { api } from './api.js';
import { listeningBand } from './scoring.js';
import { normalizeAnswer } from './utils.js';
import { gradeAnswer, scoreQuestions } from '../components/QuestionRenderer.jsx';
import { summarizeWeakAreas, focusTypesOf, avoidTopicsOf } from './genPayloads.js';

export const LISTENING_SECONDS = 2400;   // §5.1 — ~40 minutes, auto-submit at 0:00

const INCOMPLETE = "Today's audio didn't come back complete — one more try usually sorts it.";

/* IELTS Listening question types only — reading-specific types
   (TFNG, headings, etc.) are dropped, never rendered broken. */
const LISTENING_TYPES = new Set([
  'MULTIPLE_CHOICE', 'MATCHING', 'PLAN_MAP_LABELING',
  'SENTENCE_COMPLETION', 'TABLE_COMPLETION', 'FLOWCHART_COMPLETION',
  'FORM_COMPLETION', 'NOTE_COMPLETION',
]);

const normalizeType = (t) => String(t || '').trim().toUpperCase().replace(/[\s-]+/g, '_');

/* ── §13.2/§13.3 voice pools (client fallback resolution) ────
   British: 8 native voices · American: 20 native voices.
   Canadian → American (genuine phonetic fit, §13.3).
   Australian/NZ → British pool: nearest available approximation,
   never labelled as authentic to the student.                  */
const BRITISH_VOICES = [
  'bf_emma', 'bm_george', 'bf_isabella', 'bm_lewis',
  'bf_alice', 'bm_daniel', 'bf_lily',
];
const AMERICAN_VOICES = [
  'af_heart', 'am_michael', 'af_bella', 'am_adam', 'af_nicole', 'am_eric',
  'af_sky', 'am_liam', 'af_sarah', 'am_fenrir', 'af_jessica', 'am_echo',
  'af_kore', 'am_onyx', 'af_nova', 'am_puck',
];

function accentPool(accent) {
  const a = String(accent || '').toLowerCase();
  if (a.includes('brit') || a.includes('uk') || a.includes('en-gb')) return BRITISH_VOICES;
  // check AU/NZ BEFORE the generic default so 'australian' never falls through
  if (a.includes('austral') || a.includes('zealand') || a.trim() === 'nz') return BRITISH_VOICES;
  return AMERICAN_VOICES;                      // american + canadian + unknown
}

/** Deterministic unused-voice pick; server voice always wins. */
export function resolveVoice(accent, used = new Set()) {
  const pool = accentPool(accent);
  for (const v of pool) if (!used.has(v)) return v;
  return pool[0];
}

/* ── Payload builders ──────────────────────────────────────── */

export function buildListeningGenPayload({
  phase, day, targetBand, avoidTopics = [], weakAreas = [], difficulty = 'steady',
}) {
  return {
    phase, day, targetBand, difficulty,
    avoidTopics: avoidTopicsOf(avoidTopics),
    weakAreas: summarizeWeakAreas(weakAreas),
    focusTypes: focusTypesOf(weakAreas),
  };
}

export function buildListeningQuestionsPayload(genRes, {
  phase, targetBand, weakAreas = [], difficulty = 'steady',
}) {
  return {
    phase, targetBand, difficulty,
    parts: (genRes?.parts || []).map((p, i) => ({
      part: i + 1,
      title: p?.title,
      speakers: (p?.speakers || []).map((s) => s?.name).filter(Boolean),
      lines: (Array.isArray(p?.transcript) ? p.transcript : [])
        .map((l) => ({ speaker: l?.speaker, text: l?.text })),
    })),
    weakAreas: summarizeWeakAreas(weakAreas),
    focusTypes: focusTypesOf(weakAreas),
  };
}

/* ── Normalisation (the single gatekeeper before any UI) ───── */

const letterAt = (i) => String.fromCharCode(65 + i);

function clampPct(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(3, Math.min(97, n)) : fallback;
}

/** "Paragraph C"-style coercion → a letter actually in the bank. */
function coerceLetterAnswer(answer, letters) {
  const a = String(answer ?? '').trim();
  if (letters.includes(a)) return a;
  for (const w of a.split(/[^A-Za-z]+/).filter(Boolean)) {
    if (w.length === 1) {
      const up = w.toUpperCase();
      if (letters.includes(up)) return up;
    }
  }
  return a;
}

function normalizePart(raw, index) {
  const rawLines = Array.isArray(raw?.transcript) ? raw.transcript
    : Array.isArray(raw?.lines) ? raw.lines : [];
  const lines = rawLines
    .map((l) => ({
      speaker: String(l?.speaker ?? 'Speaker').trim() || 'Speaker',
      text: String(l?.text ?? '').trim(),
    }))
    .filter((l) => l.text);
  if (lines.length < 3) return null;           // an unusable part is dropped, not rendered

  /* Speaker roster: unique names in order of first appearance,
     matched (case-insensitively) to the server roster for
     accent/voice info. Server voice kept when present. */
  const seen = new Set();
  const orderedNames = [];
  for (const l of lines) {
    const key = l.speaker.toLowerCase();
    if (!seen.has(key)) { seen.add(key); orderedNames.push(l.speaker); }
  }
  const infoByName = new Map();
  for (const s of (Array.isArray(raw?.speakers) ? raw.speakers : [])) {
    const name = String(s?.name ?? '').trim();
    if (name) infoByName.set(name.toLowerCase(), { accent: s?.accent, voice: String(s?.voice ?? '').trim() });
  }
  const used = new Set();
  const speakers = orderedNames.map((name) => {
    const info = infoByName.get(name.toLowerCase()) || {};
    let voice = info.voice;
    if (!voice) voice = resolveVoice(info.accent, used);
    used.add(voice);
    return { name, accent: String(info.accent || '').trim(), voice };
  });
  const voiceByName = new Map(speakers.map((s) => [s.name, s.voice]));
  const playable = lines.map((l) => ({
    speaker: l.speaker,
    text: l.text,
    voice: voiceByName.get(l.speaker) || speakers[0].voice,
  }));

  /* mapData — features become lettered pins (§5.3 plan labelling).
     x/y are percentages, clamped; missing positions get a
     deterministic spread so pins never stack at the centre. */
  let mapData = null;
  const rawMap = raw?.mapData;
  if (rawMap && Array.isArray(rawMap.features) && rawMap.features.length >= 3) {
    const count = Math.min(rawMap.features.length, 12);
    const features = rawMap.features.slice(0, count).map((f, i) => ({
      label: String(f?.label ?? `Location ${i + 1}`).trim(),
      x: clampPct(f?.x, 10 + Math.round((i * 80) / Math.max(1, count - 1))),
      y: clampPct(f?.y, 22 + (i % 3) * 27),
    }));
    mapData = { features, letters: features.map((_, i) => letterAt(i)) };
  }

  return {
    part: index + 1,
    title: String(raw?.title || raw?.scenario || `Part ${index + 1}`).trim() || `Part ${index + 1}`,
    speakers,
    lines: playable,
    mapData,
  };
}

export function normalizeListeningContent(genRes, qaRes) {
  const rawParts = (Array.isArray(genRes?.parts) ? genRes.parts : [])
    .map((p, i) => normalizePart(p, i))
    .filter(Boolean);
  if (!rawParts.length) throw new Error(INCOMPLETE);
  const parts = rawParts.slice(0, 4);
  const partCount = parts.length;

  const rawQs = Array.isArray(qaRes?.questions) ? qaRes.questions : [];

  /* Pass 1 — validity + part resolution (plan-map questions for
     parts without mapData are dropped HERE, before numbering, so
     numbers never develop gaps). */
  const staged = [];
  rawQs.forEach((q, i) => {
    if (!q || !q.prompt || q.answer == null || String(q.answer).trim() === '') return;
    const type = normalizeType(q.type);
    if (!LISTENING_TYPES.has(type)) return;
    if (type === 'MULTIPLE_CHOICE') {
      const opts = (q.options || []).map((o) => String(o ?? '').trim()).filter(Boolean);
      if (opts.length < 2) return;              // unusable MC — drop before numbering
    }
    let idx = null;
    if (Number.isInteger(q.part)) idx = q.part === 0 ? 0 : q.part - 1;  // 1-based contract, 0 tolerated
    if (idx == null || idx < 0 || idx >= partCount) {
      idx = Math.floor((i * partCount) / Math.max(1, rawQs.length));    // even fallback spread
    }
    if (type === 'PLAN_MAP_LABELING' && !parts[idx]?.mapData) return;
    staged.push({ q, type, partIdx: idx });
  });
  if (staged.length < 20) throw new Error(INCOMPLETE);

  const sliced = staged.slice(0, 40);           // §5.1 — exactly 40 (tolerant if fewer)
  const total = sliced.length;

  /* Pass 2 — bank fallbacks: MATCHING answers of the same part
     form a last-resort bank (mirrors reading's heading fallback). */
  const matchingSets = new Map();
  for (const s of sliced) {
    if (s.type === 'MATCHING') {
      const set = matchingSets.get(s.partIdx) || new Set();
      set.add(String(s.q.answer).trim());
      matchingSets.set(s.partIdx, set);
    }
  }

  const questions = sliced.map((s, i) => {
    const number = i + 1;                       // continuous 1–40
    const { q, type, partIdx } = s;
    const answer = String(q.answer).trim();
    const out = {
      id: `q${number}`,
      number,
      part: partIdx,
      type,
      prompt: String(q.prompt).trim(),
      answer,
      explanation: q.explanation ? String(q.explanation).trim() : '',
    };
    if (q.wordLimit) out.wordLimit = String(q.wordLimit).trim();
    if (Array.isArray(q.options)) {
      const opts = q.options.map((o) => String(o ?? '').trim()).filter(Boolean);
      if (opts.length) out.options = opts;
    }

    if (type === 'PLAN_MAP_LABELING') {
      const map = parts[partIdx].mapData;
      out.bank = map.letters;
      out.answer = coerceLetterAnswer(answer, map.letters);
    } else if (type === 'MATCHING') {
      let bank = Array.isArray(q.bank) ? q.bank.map((b) => String(b ?? '').trim()).filter(Boolean) : [];
      if (!bank.length) bank = [...(matchingSets.get(partIdx) || [])];
      if (!bank.length) bank = [answer];
      if (!bank.some((b) => normalizeAnswer(b) === normalizeAnswer(out.answer))) {
        bank = [...bank, out.answer];
      }
      out.bank = bank;
    } else if (Array.isArray(q.bank) && q.bank.length) {
      out.bank = q.bank.map((b) => String(b ?? '').trim()).filter(Boolean);
    }
    return out;
  });

  const theme = String(genRes?.theme || parts[0]?.title || 'Today’s listening').trim();
  return { theme, parts, questions };
}

/* ── Two-call generation, in-flight memoised (StrictMode-proof) ── */

const inflight = new Map();

export async function generateListeningDay(opts) {
  const key = `${opts.phase}:${opts.day}`;
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    const genRes = await api.listening.generate(buildListeningGenPayload(opts));
    const qaRes = await api.listening.questions(buildListeningQuestionsPayload(genRes, opts));
    return normalizeListeningContent(genRes, qaRes);
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

/* ── Helpers ───────────────────────────────────────────────── */

/** "Q11–20" label for a part's contiguous question range. */
export function rangeForPart(content, partIndex) {
  const qs = (content?.questions || []).filter((q) => q.part === partIndex);
  if (!qs.length) return null;
  return `Q${Math.min(...qs.map((q) => q.number))}–${Math.max(...qs.map((q) => q.number))}`;
}

/* ── Scoring (§5.6 → §9.2) + §8.1 signals ──────────────────── */

export function finalizeListening(content, answers = {}) {
  const questions = content?.questions || [];
  const { correct, total } = scoreQuestions(questions, answers);
  const band = listeningBand(correct);          // §9.2 conversion table

  const perTypeMap = new Map();
  const missed = [];
  const signals = [];                           // §8.1 — one 1/0 per question

  for (const q of questions) {
    const ok = gradeAnswer(q, answers[q.id]);
    const t = perTypeMap.get(q.type) || { type: q.type, correct: 0, total: 0 };
    t.total += 1;
    if (ok) t.correct += 1;
    perTypeMap.set(q.type, t);
    signals.push({ key: q.type, value: ok ? 1 : 0 });
    if (!ok) missed.push({ q, yourAnswer: answers[q.id] ?? null });
  }

  return { correct, total, band, perType: [...perTypeMap.values()], missed, signals };
}