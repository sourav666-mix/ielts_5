/* ============================================================
   ATLAS IELTS Academy — shared generation-payload builders

   Introduced in Batch 6 as the CANONICAL shared module for the
   Listening / Writing / Speaking flows (Batches 6–8). Reading
   (Batch 5) keeps its own private, byte-identical copies inside
   readingFlow.js — module self-containment by design; swapping
   them to this module later is a one-line change per import.

   weakAreaSummary() (Batch 2 store) returns [{key, rate, n}];
   these helpers turn that into the wire shape every generation
   prompt consumes (§8.1 quiet targeting, §8.4 difficulty).
   ============================================================ */

/** §10.4/§8.1 → wire shape: [{type, accuracy, attempts}]. */
export function summarizeWeakAreas(weakAreas = []) {
  return (weakAreas || [])
    .map((w) => ({ type: w.key, accuracy: +Number(w.rate).toFixed(2), attempts: w.n }))
    .filter((w) => w.type);
}

/** §8.1 — today's set quietly weights toward types under 60%
 *  accuracy (top 3). Never surfaced to the student. */
export function focusTypesOf(weakAreas = []) {
  return (weakAreas || [])
    .filter((w) => Number.isFinite(w.rate) && w.rate < 0.6)
    .slice(0, 3)
    .map((w) => w.key);
}

/** §4.1 — the last 20 themes are tracked and explicitly avoided. */
export const avoidTopicsOf = (topics = []) => (topics || []).slice(-20);