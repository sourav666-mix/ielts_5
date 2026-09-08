/* ============================================================
   ATLAS IELTS Academy — shared utilities
   Pure functions only: no React, no stores, no network.
   Everything here is consumed by scoring, srs, api, speech,
   timers and all four module views.
   ============================================================ */

/* ── Dates (LOCAL calendar days — streak logic §2.3 must
      compare the student's own calendar, never UTC) ────────── */

export function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const todayISO = () => isoDate();

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** Whole calendar days from a → b (b - a). Local-date safe. */
export function daysBetween(isoA, isoB) {
  const a = new Date(`${isoA}T00:00:00`).getTime();
  const b = new Date(`${isoB}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export function formatDateLong(iso) {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/* ── Formatting ────────────────────────────────────────────── */

/**
 * Exam clock. Below 100 minutes renders as MM:SS so the Reading
 * test conventionally shows "60:00" and a Speaking session "90:00";
 * at 100+ minutes it switches to H:MM:SS.
 */
export function formatClock(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const pad = (n) => String(n).padStart(2, '0');
  if (sec < 6000) return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
  const h = Math.floor(sec / 3600);
  return `${h}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
}

/** Compact duration for stats rows: "45m", "1h 30m". */
export function formatDuration(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

export const formatBand = (b) => (Number.isFinite(b) ? b.toFixed(1) : '—');

export const pct = (x) => `${Math.round(x * 100)}%`;

export function pluralize(n, word, plural = `${word}s`) {
  return `${n} ${n === 1 ? word : plural}`;
}

/* ── Writing word counter (§6.4 live counter) ──────────────── */

export function countWords(text) {
  const t = String(text || '').trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/* ── Free-text answer matching (§4.3) ────────────────────────
   Case-insensitive, whitespace-normalised, slash-separated
   acceptable alternatives ("aquifer/underground water source").
   Trailing punctuation is also forgiven — a full stop should
   never cost a student a mark. */

export function normalizeAnswer(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!;:,]+$/, '')
    .trim();
}

export function isAnswerCorrect(given, accepted) {
  if (given == null || accepted == null) return false;
  const g = normalizeAnswer(given);
  if (!g) return false;
  return String(accepted)
    .split('/')
    .map(normalizeAnswer)
    .includes(g);
}

/* ── Generic helpers ───────────────────────────────────────── */

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const mean = (nums) => {
  const valid = (nums || []).filter(Number.isFinite);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : NaN;
};

export const range = (n) => Array.from({ length: n }, (_, i) => i);

export function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const pickRandom = (arr) => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined);

export function groupBy(arr, keyFn) {
  return (arr || []).reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {});
}

export const cn = (...classes) => classes.filter(Boolean).join(' ');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function uid() {
  try { return crypto.randomUUID(); } catch { /* older browsers */ }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** SNAKE_CASE → "Matching Headings" (for weak-area narratives §8.5). */
export function humanType(type) {
  return String(type || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Debounce with .cancel (used by store autosave) ────────── */

export function debounce(fn, ms = 1000) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  wrapped.cancel = () => { clearTimeout(t); t = null; };
  return wrapped;
}

/* ── Files (Writing photo / PDF uploads §6.4) ──────────────── */

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

/* ── Safe localStorage (§10.4 keys + graceful quota failure) ─ */

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false; // quota / private mode — never crash a lesson over a cache
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};