/* ============================================================
   ATLAS IELTS Academy — Speaking duplex config (v2 §6/§7/§16)

   ONE place to tune every timing and threshold in the
   conversational voice loop. Nothing here is per-student data —
   it's runtime config (§16: "barge-in behaviour is a
   client/runtime concern, not something that needs persisting").
   ============================================================ */

/* ── §6 Barge-in gate ────────────────────────────────────────
   Don't trigger on ANY sound (a cough, a chair creak): trigger
   only once speech-like confidence stays above the threshold
   for a minimum window. Production bar for 2026 voice agents:
   false-barge-in rate under 2%. */
export const BARGE_IN_CONFIDENCE = 0.6;   // VAD confidence score, 0–1
export const BARGE_IN_MIN_MS = 180;       // must stay confident this long before it counts
export const BARGE_IN_ARM_MS = 600;       // ignore the first moments after arming (playback settle)

/* ── §7 Per-part duplex modes ─────────────────────────────────
   Parts 1 & 3 are conversational → barge-in ON.
   Part 2 is a protected 2-minute monologue → barge-in OFF,
   matching the real IELTS format. The VAD keeps running for the
   silence-timeout logic during Part 2; it just never triggers a
   barge-in stop. */
export const PART_DUPLEX_CONFIG = {
  1: { bargeInEnabled: true },
  2: { bargeInEnabled: false },
  3: { bargeInEnabled: true },
};

/* ── §9 Thinking acknowledgments ──────────────────────────────
   Played the INSTANT the student's turn ends — no AI call, no
   network wait — masking the real grading latency. A UX trick,
   not a scoring shortcut: it changes what the wait feels like,
   not what gets graded. Varied on purpose; a parroted line
   breaks the illusion. */
export const THINKING_ACKS = [
  'Nice — let me think about that for a second.',
  'Okay, got it. One moment.',
  'Mm, interesting way to put it — hang on.',
  'Good — give me a second with that.',
  'Alright, I hear you. One moment.',
  'Right, let me look at that properly.',
];

/* ── §10 Ending a turn — the silence-timeout ──────────────────
   Long enough to tolerate a genuine thinking pause, short
   enough not to leave the student wondering if they're still
   being heard. Tunable, not a fixed rule. */
export const START_DELAY_MS = 600;        // one natural beat before the mic opens
export const MIN_SPEECH_MS = 4000;        // never auto-end before this much mic time
export const SILENCE_MS = 3500;           // trailing silence that ends the turn
export const MAX_TURN_MS = 120000;        // a Part 1/3 answer never runs past 2 minutes
export const RECORDER_MIN_MS = 10000;     // Whisper path has no live word count — wait longer

/* ── §8 Visual-only backchanneling ────────────────────────────
   A silent glow-shift when a natural sentence-boundary pause is
   detected mid-answer — deliberately NEVER audio: any sound
   ATLAS makes while the mic is open risks being transcribed by
   Whisper as part of the student's own answer. */
export const BACKCHANNEL_AFTER_MS = 1400; // pause length that earns a pulse
export const BACKCHANNEL_VISIBLE_MS = 900;

/* ── §12 Confirm-to-continue ──────────────────────────────────
   Client-side keyword matching, not an AI call — fast, free,
   and sufficient for the decision. A visible button always
   remains alongside it. */
export const CONTINUE_WORDS = /\b(yes|yeah|yep|sure|ready|go|next|okay|ok|continue|let'?s go)\b/i;
export const REPEAT_WORDS = /\b(repeat|again|what|pardon|say that again|one more time)\b/i;
export const PAUSE_WORDS = /\b(wait|hold on|pause|give me a (sec|second|minute))\b/i;

/** §12 — classify a short transcript into a continue intent.
 *  Note the deliberate nuance for the ambient feedback-card
 *  listener: plain 'continue' is only trusted for SHORT,
 *  command-like utterances (the caller checks length), because
 *  a student mid-answer saying "yes, and I think…" must never
 *  skip their feedback. */
export function classifyContinueIntent(transcript) {
  const text = String(transcript || '');
  if (REPEAT_WORDS.test(text)) return 'repeat';
  if (PAUSE_WORDS.test(text)) return 'pause';
  if (CONTINUE_WORDS.test(text)) return 'continue';
  return 'continue'; // ambiguous input defaults to moving forward
}