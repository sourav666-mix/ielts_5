/* ============================================================
   ATLAS IELTS Academy — batched §8.1 weak-area signals

   profileStore.recordAccuracy() records ONE signal per call;
   a 40-question Reading day would otherwise trigger 40 full
   profile clones + localStorage writes (the vocabDeck grows to
   thousands of words over 150 days — that's a real jank spike
   on mobile). This helper applies all signals in ONE pass and
   produces EXACTLY the shape profileStore's internal pushSignal
   writes ({ recent: [last ≤10 values] }), so weakAreaSummary()
   reads both paths identically.

   Shared by Reading (Batch 5) and Listening (Batch 6).
   ============================================================ */

export const RECENT_WINDOW = 10;   // §8.1 — last 10 occurrences

/**
 * @param {object} profile   current profile (read-only use)
 * @param {string} module    'reading' | 'listening'
 * @param {Array<{key:string, value:number}>} signals  e.g. {key:'TFNG', value:1}
 * @returns {object} a NEW weakAreaProfile — pass to profileStore.update()
 */
export function applyAccuracySignals(profile, module, signals = []) {
  const weak = { ...(profile?.weakAreaProfile || {}) };
  const bucket = { ...(weak[module] || {}) };

  for (const s of signals) {
    if (!s || s.key == null) continue;
    const value = Number(s.value);
    if (!Number.isFinite(value)) continue;
    const recent = [...(bucket[s.key]?.recent || []), value];
    if (recent.length > RECENT_WINDOW) recent.shift();
    bucket[s.key] = { recent };
  }

  weak[module] = bucket;
  return weak;
}