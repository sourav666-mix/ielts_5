/* ============================================================
   ATLAS IELTS Academy — day-record store (spec §10.2)

   One record per phase+day, cached locally under
   'atlas_day_<phase>_<day>' (§10.4) and saved to the server with
   a 1.5s debounce. File uploads (Writing photos/PDFs) keep the
   actual File object OUT of the persisted record — only metadata
   is stored, so a reload asks for a re-upload instead of blowing
   the localStorage quota.
   ============================================================ */

import { create } from 'zustand';
import { api } from '../lib/api.js';
import { debounce, storage, uid } from '../lib/utils.js';
import { within24hWindow } from '../lib/timers.js';
import { useToastStore } from './useToastStore.js';

const dayKey = (phase, day) => `atlas_day_${phase}_${day}`;   // §10.4

const makeModule = () => ({
  status: 'todo',        // 'todo' | 'progress' | 'done' (§10.2)
  content: null,
  answers: {},
  score: null,
  timeSpentSec: 0,
});

export function makeDayRecord(phase, day) {
  return {
    phase,
    day,
    reading: makeModule(),
    listening: makeModule(),
    writing: {
      status: 'todo',
      content: null,                    // { task1, task2 } generated tasks
      task1: { text: '', file: null, feedback: null, modelAnswer: null },
      task2: { text: '', file: null, feedback: null },
      score: null,                      // { band, task1Band, task2Band } §6.7
      timeSpentSec: 0,                  // additive to §10.2 for stat parity
    },
    speaking: {
      status: 'todo',
      content: null,
      sessionStartedAt: null,           // §7.3 24-hour window anchor
      timeSpentSec: 0,
      rounds: [],                       // see newRound() — superset of §10.2
      score: null,                      // { band } §7.7
    },
  };
}

/** A Speaking round keeps its question set for resume/coarse
 *  restart, plus per-answer bands & feedback (§7.6).
 *
 *  The question set is spread AT THE TOP LEVEL (part1 / cueCard /
 *  part3) — that is the shape every consumer reads
 *  (SpeakingSession renders round.part1, round.cueCard,
 *  round.part3; RoundSummary/SpeakingResults/finalizeSpeaking
 *  read answers, topic, avgBand, completedAt). Nothing ever reads
 *  a nested `questions` key. */
export function newRound(topic, questions) {
  const q = questions || {};
  return {
    id: uid(),
    topic,
    part1: Array.isArray(q.part1) ? q.part1 : [],
    cueCard: q.cueCard || null,
    part3: Array.isArray(q.part3) ? q.part3 : [],
    answers: [],                        // { part, question, answer, band, feedback }
    avgBand: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

/** File objects live here — outside the serialised record. */
const writingFiles = new Map();

/* Debounced persistence: local cache always, server best-effort. */
const persist = debounce(() => {
  const { phase, day, record } = useDayStore.getState();
  if (!record) return;
  storage.set(dayKey(phase, day), record);
  api.days.put(phase, day, record).catch(() => { /* offline: cache holds */ });
}, 1500);

/** Keep only the current day's local cache — 270 days of generated
 *  content would otherwise blow the ~5MB localStorage budget. */
function pruneDayCache(phase, day) {
  try {
    const keep = dayKey(phase, day);
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('atlas_day_') && k !== keep) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

export const useDayStore = create((set, get) => ({
  phase: 'practice',
  day: 1,
  record: null,
  loading: false,

  load: async (phase, day) => {
    set({ loading: true });
    try {
      const record = await api.days.get(phase, day);
      set({ phase, day, record, loading: false });
      pruneDayCache(phase, day);
      storage.set(dayKey(phase, day), record);
      return record;
    } catch {
      const record = storage.get(dayKey(phase, day), null) || makeDayRecord(phase, day);
      set({ phase, day, record, loading: false });
      return record;
    }
  },

  /** After §2.3 advance: swap in the brand-new day. */
  adoptDay: (record) => {
    writingFiles.clear();
    set({ phase: record.phase, day: record.day, record });
    pruneDayCache(record.phase, record.day);
    storage.set(dayKey(record.phase, record.day), record);
  },

  save: () => persist(),
  saveNow: () => {
    persist.cancel();
    const { phase, day, record } = get();
    if (!record) return;
    storage.set(dayKey(phase, day), record);
    api.days.put(phase, day, record).catch(() => {});
  },

  /* ── generic module helpers ─────────────────────────────── */

  patchModule: (name, partial) => {
    set((state) => ({
      record: { ...state.record, [name]: { ...state.record[name], ...partial } },
    }));
    get().save();
  },

  /** Generation finished → content lands, status moves to 'progress'. */
  setContent: (name, content) => {
    const current = get().record[name];
    get().patchModule(name, {
      content,
      status: current.status === 'todo' ? 'progress' : current.status,
    });
  },

  /** A score always implies 'done' — the §2.3 gate reads status. */
  setScore: (name, score) => get().patchModule(name, { score, status: 'done' }),

  setModuleStatus: (name, status) => get().patchModule(name, { status }),

  /**
   * Practice-again support — wipe a module back to a clean slate so
   * the student can run it as many times as they like.
   *
   *   keepContent: true   → the same generated paper reopens with
   *                         answers, score, clock and play-counts
   *                         reset (a retake never re-runs warm-ups).
   *   keepContent: false  → everything goes; the module view fires
   *                         a fresh generation for a brand-new paper.
   *
   * Writing's staged uploads live outside the serialised record
   * (writingFiles map), so they're dropped here too. Persisted
   * immediately — a reset is a deliberate, destructive action.
   */
  resetModule: (name, { keepContent = false } = {}) => {
    set((state) => {
      if (!state.record?.[name]) return state;
      const fresh = makeDayRecord(state.record.phase, state.record.day)[name];
      if (name === 'writing') {
        writingFiles.delete('task1');
        writingFiles.delete('task2');
      }
      if (keepContent && state.record[name].content) {
        fresh.content = state.record[name].content;
        fresh.status = 'progress';
        if (name === 'reading' || name === 'listening') {
          fresh.warmupsDone = true;        // a retake doesn't re-run warm-ups
        }
      }
      return { record: { ...state.record, [name]: fresh } };
    });
    get().saveNow();
  },

  patchAnswer: (name, qId, value) => {
    set((state) => ({
      record: {
        ...state.record,
        [name]: { ...state.record[name], answers: { ...state.record[name].answers, [qId]: value } },
      },
    }));
    get().save();
  },

  setAnswers: (name, answers) => get().patchModule(name, { answers }),

  addTimeSpent: (name, sec) => {
    if (!Number.isFinite(sec) || sec <= 0) return;
    set((state) => ({
      record: {
        ...state.record,
        [name]: { ...state.record[name], timeSpentSec: (state.record[name].timeSpentSec || 0) + sec },
      },
    }));
    get().save();
  },

  /* ── writing-specific (§6) ───────────────────────────────── */

  patchWritingTask: (task, partial) => {
    set((state) => ({
      record: {
        ...state.record,
        writing: {
          ...state.record.writing,
          status: state.record.writing.status === 'todo' ? 'progress' : state.record.writing.status,
          [task]: { ...state.record.writing[task], ...partial },
        },
      },
    }));
    get().save();
  },

  setWritingFile: (task, file) => {
    if (file) writingFiles.set(task, file);
    else writingFiles.delete(task);
    get().patchWritingTask(task, {
      file: file ? { name: file.name, type: file.type, size: file.size } : null,
      text: '', // an upload replaces typed text (§6.4 one input per task)
    });
  },

  getWritingFile: (task) => writingFiles.get(task) || null,

  /* ── speaking-specific (§7) ──────────────────────────────── */

  /** §7.3 — anchors the 24-hour window on the first attempt. */
  startSpeakingSession: () => {
    const s = get().record?.speaking;
    if (!s?.sessionStartedAt) {
      get().patchModule('speaking', {
        sessionStartedAt: new Date().toISOString(),
        status: 'progress',
      });
    }
  },

  upsertSpeakingRound: (round) => {
    set((state) => {
      const rounds = [...state.record.speaking.rounds];
      const i = rounds.findIndex((r) => r.id === round.id);
      if (i >= 0) rounds[i] = round;
      else rounds.push(round);
      return {
        record: {
          ...state.record,
          speaking: { ...state.record.speaking, rounds, status: 'progress' },
        },
      };
    });
    get().save();
  },

  /**
   * §7.3 — the window lapsed: wipe today's Speaking to zero, keep
   * nothing. Callers surface this honestly, never punitively.
   */
  resetSpeaking: () => {
    set((state) => ({
      record: {
        ...state.record,
        speaking: makeDayRecord(state.record.phase, state.record.day).speaking,
      },
    }));
    get().saveNow();
  },

  /** Returns true (and resets) if the 24h window has lapsed. */
  checkSpeakingWindow: () => {
    const s = get().record?.speaking;
    if (!s || s.status === 'done' || !s.sessionStartedAt) return false;
    if (within24hWindow(s.sessionStartedAt)) return false;
    get().resetSpeaking();
    useToastStore.getState().push(
      "Your 24-hour speaking window closed, so today's speaking practice starts fresh — no partial credit carries over, but every lesson you logged still counts.",
      'error',
      7000,
    );
    return true;
  },

  /** §2.3 — a day is complete only when ALL FOUR report 'done'. */
  allModulesDone: () => {
    const r = get().record;
    if (!r) return false;
    return ['reading', 'listening', 'writing', 'speaking'].every((m) => r[m]?.status === 'done');
  },
}));