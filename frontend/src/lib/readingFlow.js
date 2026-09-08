/* ============================================================
   ATLAS IELTS Academy — Reading flow (spec §4)

   §4.4 TWO SEQUENTIAL AI CALLS:
     1. POST /reading/generate  → theme + 3 passages + 30 vocab
     2. POST /reading/questions → 40 questions written against
        the EXACT passage text from call 1 (that's the whole
        point of splitting — answerable questions).

   ⚠ CONTRACT for the backend prompt library (Batch 10):

   POST /reading/generate  payload:
     { phase, day, targetBand, difficulty,
       avoidTopics[≤20], weakAreas[{type,accuracy,attempts}],
       focusTypes[≤3] }
   response: { theme, passages: [{ title, text,
       vocab: [{ word, definition, example, related } × 10 ] } × 3 ] }

   POST /reading/questions  payload:
     { phase, targetBand, difficulty, passages: [{title,text}×3],
       weakAreas, focusTypes }
   response: { questions: [{ id?, number?, passage: 0|1|2, type,
       prompt, options?, wordLimit?, bank?, answer, explanation } ],
       headingBanks?: [[string] × 3] }

   Everything is normalised here into the Batch-3 question
   contract before any UI sees it — the AI's drift never leaks
   into a view. Paragraphs are separated by blank lines (\n\n);
   the UI letters them A, B, C… for MATCHING_INFORMATION.
   ============================================================ */

import { api } from './api.js';
import { readingBand } from './scoring.js';
import { normalizeAnswer } from './utils.js';
import { gradeAnswer, scoreQuestions } from '../components/QuestionRenderer.jsx';

export const READING_SECONDS = 3600;   // §4.1 — strict 60 minutes

const INCOMPLETE = "Today's draft came back incomplete — one more try usually sorts it.";

/* ── Text helpers ───────────────────────────────────────────── */

export function paragraphsOf(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/** Paragraph letters for MATCHING_INFORMATION banks: ["A","B",…]. */
export function passageLetters(text) {
  return paragraphsOf(text).map((_, i) => String.fromCharCode(65 + i));
}

/** Lowercase roman numerals for heading banks: i, ii, iii… */
export function toRoman(n) {
  const map = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '';
  let v = Math.max(1, Math.floor(n));
  for (const [val, sym] of map) while (v >= val) { out += sym; v -= val; }
  return out || 'i';
}

/** "Q1–13" label for a passage's contiguous question range. */
export function rangeForPassage(content, passageIndex) {
  const qs = (content?.questions || []).filter((q) => q.passage === passageIndex);
  if (!qs.length) return null;
  const min = Math.min(...qs.map((q) => q.number));
  const max = Math.max(...qs.map((q) => q.number));
  return `Q${min}–${max}`;
}

/* ── Generation payloads (§8.1 quiet targeting, §8.4 difficulty) ── */

const summarizeWeakAreas = (weakAreas = []) =>
  weakAreas.map((w) => ({ type: w.key, accuracy: +Number(w.rate).toFixed(2), attempts: w.n }));

/* §8.1: quietly weight today's set toward the weakest types —
   never surfaced to the student as "targeting". */
const focusTypesOf = (weakAreas = []) =>
  weakAreas.filter((w) => w.rate < 0.6).slice(0, 3).map((w) => w.key);

export function buildReadingGenPayload({
  phase, day, targetBand, avoidTopics = [], weakAreas = [], difficulty = 'steady',
}) {
  return {
    phase,
    day,
    targetBand,
    difficulty,
    avoidTopics: avoidTopics.slice(-20),          // §4.1 — last 20 themes avoided
    weakAreas: summarizeWeakAreas(weakAreas),
    focusTypes: focusTypesOf(weakAreas),
  };
}

export function buildReadingQuestionsPayload(passagesRes, {
  phase, targetBand, weakAreas = [], difficulty = 'steady',
}) {
  return {
    phase,
    targetBand,
    difficulty,
    passages: (passagesRes?.passages || []).map((p) => ({ title: p?.title, text: p?.text })),
    weakAreas: summarizeWeakAreas(weakAreas),
    focusTypes: focusTypesOf(weakAreas),
  };
}

/* ── Normalisation (defensive, single gatekeeper) ───────────── */

const normalizeType = (t) =>
  String(t || '').trim().toUpperCase().replace(/[\s-]+/g, '_');

/** MATCHING_INFORMATION answers may come back as "Paragraph C" —
 *  coerce to the letter the bank actually holds. */
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

export function normalizeReadingContent(passagesRes, questionsRes) {
  const rawPassages = (passagesRes?.passages || []).filter((p) => p && p.title && p.text);
  if (!rawPassages.length) throw new Error(INCOMPLETE);

  const passages = rawPassages.slice(0, 3).map((p) => ({
    title: String(p.title).trim(),
    text: String(p.text).trim(),
    vocab: (Array.isArray(p.vocab) ? p.vocab : [])
      .filter((v) => v && v.word)
      .slice(0, 10)                              // §4.2 — exactly 10 per passage
      .map((v) => ({
        word: String(v.word).trim(),
        definition: String(v.definition || '').trim(),
        example: String(v.example || '').trim(),
        related: String(v.related || '').trim(),
      })),
  }));
  const passageCount = passages.length;

  const rawBanks = (Array.isArray(questionsRes?.headingBanks) ? questionsRes.headingBanks : [])
    .map((b) => (Array.isArray(b) ? b.map((x) => String(x).trim()).filter(Boolean) : []));

  const validQuestions = (questionsRes?.questions || []).filter((q) => {
    if (!q || !q.prompt || q.answer == null || String(q.answer).trim() === '') return false;
    const type = normalizeType(q.type);
    if (!type) return false;
    if (type === 'MULTIPLE_CHOICE') {            // unusable without real options
      const opts = (q.options || []).filter((o) => o != null && String(o).trim() !== '');
      return opts.length >= 2;
    }
    return true;
  });
  if (validQuestions.length < 20) throw new Error(INCOMPLETE);

  /* Pre-pass: heading answers per passage, as a last-resort bank. */
  const headingAnswers = new Map();
  for (const q of validQuestions) {
    if (normalizeType(q.type) === 'MATCHING_HEADINGS') {
      const p = Number.isInteger(q.passage)
        ? Math.max(0, Math.min(passageCount - 1, q.passage)) : 0;
      const set = headingAnswers.get(p) || new Set();
      set.add(String(q.answer).trim());
      headingAnswers.set(p, set);
    }
  }

  const sliced = validQuestions.slice(0, 40);    // §4.1 — exactly 40 (tolerant if fewer)
  const total = sliced.length;

  const questions = sliced.map((q, i) => {
    const type = normalizeType(q.type);
    const number = i + 1;                        // continuous 1–40 (§4.1)
    let passage = Number.isInteger(q.passage)
      ? q.passage
      : Math.floor((i * passageCount) / Math.max(1, total)); // even fallback spread
    passage = Math.max(0, Math.min(passageCount - 1, passage));
    const answer = String(q.answer).trim();

    const out = {
      id: `q${number}`,                          // stable key — answers map onto it
      number,
      passage,
      type,
      prompt: String(q.prompt).trim(),
      answer,
      explanation: q.explanation ? String(q.explanation).trim() : '',
    };
    if (q.wordLimit) out.wordLimit = String(q.wordLimit).trim();
    if (Array.isArray(q.options)) {
      const opts = q.options.map((o) => String(o).trim()).filter(Boolean);
      if (opts.length) out.options = opts;
    }
    if (Array.isArray(q.optionLabels)) out.optionLabels = q.optionLabels.map(String);

    if (type === 'MATCHING_HEADINGS') {
      let bank = Array.isArray(q.bank) ? q.bank.map((b) => String(b).trim()).filter(Boolean) : [];
      if (!bank.length) bank = (rawBanks[passage] || []).slice();
      if (!bank.length) bank = [...(headingAnswers.get(passage) || [])];
      if (!bank.length) bank = [answer];         // degenerate but answerable
      if (!bank.some((b) => normalizeAnswer(b) === normalizeAnswer(answer))) bank = [...bank, answer];
      out.bank = bank;
    } else if (type === 'MATCHING_INFORMATION') {
      let bank = Array.isArray(q.bank) ? q.bank.map((b) => String(b).trim()).filter(Boolean) : [];
      if (!bank.length) bank = passageLetters(passages[passage]?.text || '');
      out.answer = coerceLetterAnswer(answer, bank);
      out.bank = bank;
    } else if (Array.isArray(q.bank) && q.bank.length) {
      out.bank = q.bank.map((b) => String(b).trim()).filter(Boolean);
    }
    return out;
  });

  /* Rebuild heading banks from the NORMALISED questions so the
     view's propBank fallback and the question-level banks can
     never disagree. */
  const headingBanks = passages.map((_, p) => {
    const q = questions.find((x) => x.type === 'MATCHING_HEADINGS' && x.passage === p);
    return q ? q.bank : (rawBanks[p] || []);
  });

  const theme = String(passagesRes?.theme || passages[0]?.title || '').trim() || 'Today’s reading';
  return { theme, passages, headingBanks, questions };
}

/* ── Two-call generation, with in-flight memoisation ──────────
   The memo makes generation StrictMode-proof and remount-proof:
   one network spend per (phase, day) no matter how many times
   the effect fires; failures clear it so Retry genuinely
   retries.                                               */

const inflight = new Map();

export async function generateReadingDay(opts) {
  const key = `${opts.phase}:${opts.day}`;
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    const passagesRes = await api.reading.generate(buildReadingGenPayload(opts));
    const questionsRes = await api.reading.questions(
      buildReadingQuestionsPayload(passagesRes, opts)
    );
    return normalizeReadingContent(passagesRes, questionsRes);
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

/* ── Scoring (§4.5) + §8.1 signals ─────────────────────────── */

export function finalizeReading(content, answers = {}) {
  const questions = content?.questions || [];
  const { correct, total } = scoreQuestions(questions, answers);
  const band = readingBand(correct);             // §9.1 conversion table

  const perTypeMap = new Map();
  const missed = [];
  const signals = [];                            // §8.1 — one 1/0 per question

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