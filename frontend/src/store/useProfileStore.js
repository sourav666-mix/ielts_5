/* ============================================================
   ATLAS IELTS Academy — profile store (spec §10.1)

   The profile persists for the whole 270-day programme. The
   server is authoritative; localStorage mirrors it under
   'atlas_profile' (§10.4) so the dashboard still renders if the
   network drops. Mutations apply locally first, then sync to the
   server (debounced for high-frequency weak-area signals).
   ============================================================ */

import { create } from 'zustand';
import { api, getToken, setToken, clearToken } from '../lib/api.js';
import { addWords, reviewCard, deckStats } from '../lib/srs.js';
import { mean, storage, todayISO } from '../lib/utils.js';
import { useDayStore } from './useDayStore.js';
import { useHistoryStore } from './useHistoryStore.js';

const PROFILE_KEY = 'atlas_profile';   // §10.4
const RECENT_WINDOW = 10;              // §8.1 — last 10 occurrences
const TOPIC_MEMORY = 20;               // §4.1 — last 20 themes avoided

export const emptyProfile = () => ({
  onboarded: false,
  targetBand: 6.5,
  phase: 'practice',
  day: 1,
  status: 'active',                    // 'active' | 'complete' (Day 270)
  streak: 0,
  lastCompletedDate: null,
  topicsUsed: { reading: [], listening: [], writing: [], speaking: [] },
  weakAreaProfile: { reading: {}, listening: {}, writing: {}, speaking: {} },
  vocabDeck: [],
  createdAt: new Date().toISOString(),
});

const mirror = (profile) => { if (profile) storage.set(PROFILE_KEY, profile); };

/* Debounced full-profile sync — bursty calls (10 missed questions
   in a row) collapse into one PUT. */
let syncTimer = null;
function syncSoon() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const { profile } = useProfileStore.getState();
    if (profile) api.profile.update(profile).catch(() => { /* offline: mirror holds */ });
  }, 1200);
}

function pushSignal(bucket, key, value) {
  const entry = { recent: [...(bucket[key]?.recent || []), value] };
  if (entry.recent.length > RECENT_WINDOW) entry.recent.shift();
  return { ...bucket, [key]: entry };
}

/**
 * §8.1 weak-area summary for generation prompts: sorted weakest-
 * first, only types with ≥3 observations (never target a student
 * on noise). Views pass the top entries into generate calls.
 */
export function weakAreaSummary(profile, module) {
  const bucket = profile?.weakAreaProfile?.[module] || {};
  return Object.entries(bucket)
    .map(([key, entry]) => ({
      key,
      rate: entry?.recent?.length ? mean(entry.recent) : null,
      n: entry?.recent?.length || 0,
    }))
    .filter((s) => s.rate != null && s.n >= 3)
    .sort((a, b) => a.rate - b.rate);
}

export const useProfileStore = create((set, get) => ({
  profile: null,
  loading: false,
  offline: false,
  error: null,

  /** App boot: ensure a session token, then load the profile.
   *
   *  Self-healing: a token can become invalid server-side (the
   *  backend's JWT secret changed or its database was reset —
   *  both normal in development). A 401 here means the stored
   *  token is dead, NOT that the network is down, so we discard
   *  it, mint a fresh guest, and retry ONCE before falling back
   *  to the offline mirror. */
  bootstrap: async () => {
    set({ loading: true, error: null });
    const loadProfile = () => api.profile.get();

    try {
      if (!getToken()) {
        const { access_token } = await api.auth.guest();
        setToken(access_token);
      }

      let profile;
      try {
        profile = await loadProfile();
      } catch (err) {
        if (err?.status !== 401) throw err;
        // Stored token is dead — start a fresh guest session.
        clearToken();
        const { access_token } = await api.auth.guest();
        setToken(access_token);
        profile = await loadProfile();
      }

      set({ profile, loading: false, offline: false });
      mirror(profile);
      return profile;
    } catch (err) {
      // Offline: render from the local mirror so the dashboard,
      // history and streaks still work. Content generation will
      // surface its own error until the server returns.
      const local = storage.get(PROFILE_KEY, null) || emptyProfile();
      set({
        profile: local,
        loading: false,
        offline: true,
        error: err?.message || 'Could not reach the server.',
      });
      mirror(local);
      return local;
    }
  },

  /** Onboarding — sets the target band and starts the programme. */
  onboard: async ({ targetBand }) => {
    const profile = await api.profile.update({
      ...emptyProfile(),
      onboarded: true,
      targetBand,
      createdAt: new Date().toISOString(),
    });
    set({ profile, error: null });
    mirror(profile);
    return profile;
  },

  /** Local-first update + debounced server sync. */
  update(patch) {
    const profile = { ...get().profile, ...patch };
    set({ profile });
    mirror(profile);
    syncSoon();
  },

  /** §4.1 — remember recently used themes so tomorrow avoids them. */
  addTopics(module, topics = []) {
    const p = get().profile;
    if (!p || !topics.length) return;
    const used = [...(p.topicsUsed?.[module] || [])];
    for (const t of topics) if (t && !used.includes(t)) used.push(t);
    while (used.length > TOPIC_MEMORY) used.shift();
    get().update({ topicsUsed: { ...p.topicsUsed, [module]: used } });
  },

  /** §8.1 — Reading/Listening question-type accuracy (1/0 per question). */
  recordAccuracy(module, type, isCorrect) {
    const p = get().profile;
    if (!p) return;
    const weak = { ...p.weakAreaProfile };
    weak[module] = pushSignal({ ...(weak[module] || {}) }, type, isCorrect ? 1 : 0);
    get().update({ weakAreaProfile: weak });
  },

  /** §8.1 — Writing criteria bands / Speaking fault counts (numeric). */
  recordMetric(module, key, value) {
    const p = get().profile;
    if (!p || !Number.isFinite(value)) return;
    const weak = { ...p.weakAreaProfile };
    weak[module] = pushSignal({ ...(weak[module] || {}) }, key, value);
    get().update({ weakAreaProfile: weak });
  },

  /** §4.2/§8.2 — today's 30 vocabulary items enter the SRS deck. */
  addVocabulary(items) {
    const p = get().profile;
    if (!p || !items?.length) return 0;
    const deck = addWords(p.vocabDeck || [], items, p.day);
    get().update({ vocabDeck: deck });
    return deck.length;
  },

  /** Apply SRS outcomes from the warm-up: [{ word, remembered }]. */
  reviewVocabulary(results = []) {
    const p = get().profile;
    if (!p || !results.length) return;
    const norm = (w) => String(w || '').toLowerCase().trim();
    const outcomes = new Map(results.map((r) => [norm(r.word), Boolean(r.remembered)]));
    const deck = p.vocabDeck.map((c) =>
      outcomes.has(norm(c.word)) ? reviewCard(c, outcomes.get(norm(c.word))) : c);
    get().update({ vocabDeck: deck });
  },

  deckStats: () => deckStats(get().profile?.vocabDeck || []),

  /**
   * §2.3 — advance to the next day. SERVER-AUTHORITATIVE: the
   * backend verifies all four modules are done, writes the history
   * entry, updates the streak, rolls Day 150 → Mock Day 1, and
   * marks the programme complete at Day 270. We just adopt the
   * results — one source of truth for the tricky rules.
   */
  advanceDay: async () => {
    const res = await api.days.advance();
    set({ profile: res.profile, error: null });
    mirror(res.profile);
    useDayStore.getState().adoptDay(res.day);
    useHistoryStore.getState().setEntries(res.history);
    return res.profile;
  },

  /** Sign out / start over — clears local mirrors only. */
  resetAll() {
    clearToken();
    storage.remove(PROFILE_KEY);
    set({ profile: null, offline: false, error: null });
  },

  /** Exposed for onboarding-screen defaults. */
  getToday: () => todayISO(),
}));