/* ============================================================
   ATLAS IELTS Academy — §6 barge-in gate (voice v2)

   The mic never turns off while the coach speaks: this gate
   watches live mic energy and fires onBargeIn() the moment
   speech-like confidence stays above threshold long enough —
   which the caller answers by stopping TTS audio mid-sentence
   and handing the floor to the student.

   This is fast, responsive barge-in on a half-duplex pipeline
   (§4's honest architecture note), NOT native full-duplex: the
   interruption's CONTENT isn't understood while the coach is
   still talking — the system simply yields the floor fast
   enough that it feels the same.

   False-barge-in defences (§6 — production bar is <2%):
     · adaptive noise floor — room tone and speaker bleed raise
       it slowly; genuine quiet resets it downward instantly
     · confidence gate — energy must map to ≥ threshold (0–1)
     · duration gate — must stay confident ≥ minMs, so a cough
       or creak (brief) never accumulates into a trigger
     · arm delay — the first armMs after start() are ignored,
       so playback settle never counts
   ============================================================ */

import {
  BARGE_IN_CONFIDENCE, BARGE_IN_MIN_MS, BARGE_IN_ARM_MS,
} from '../config/duplexConfig.js';

export function createBargeInGate({
  onBargeIn,
  threshold = BARGE_IN_CONFIDENCE,
  minMs = BARGE_IN_MIN_MS,
  armMs = BARGE_IN_ARM_MS,
} = {}) {
  let ctx = null;
  let stream = null;
  let raf = 0;
  let running = false;
  let confidentSince = null;
  let armedAt = 0;
  let noiseFloor = 0.015;

  function frame(analyser, buf) {
    if (!running) return;                  // stopped — never touch a closed context
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);

    /* Adaptive noise floor: creeps UP slowly (so a passing lorry
     * doesn't permanently deafen the gate) but snaps DOWN to any
     * genuinely quieter moment. */
    noiseFloor = rms < noiseFloor
      ? Math.max(0.008, rms)
      : Math.min(noiseFloor + 0.0002, 0.05);

    /* §6 — speech energy well above the floor, mapped to 0..1. */
    const above = rms - noiseFloor * 1.5;
    const conf = Math.max(0, Math.min(1, above / 0.06));

    const now = performance.now();
    if (now - armedAt < armMs) {
      confidentSince = null;                 // still settling — never counts
    } else if (conf >= threshold) {
      confidentSince = confidentSince ?? now;
      if (now - confidentSince >= minMs) {
        confidentSince = null;
        onBargeIn?.();                       // the caller stops TTS + opens the mic
      }
    } else {
      confidentSince = null;                 // brief noise doesn't accumulate
    }
    if (running) raf = requestAnimationFrame(() => frame(analyser, buf));
  }

  async function start() {
    if (running) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor || !navigator.mediaDevices?.getUserMedia) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!running) {                        // stopped while the prompt was pending
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
        return;
      }
      ctx = new AudioCtor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      armedAt = performance.now();
      confidentSince = null;
      frame(analyser, new Uint8Array(analyser.fftSize));
    } catch {
      stop();                                // no mic / denied — barge-in silently off
    }
  }

  function stop() {
    running = false;
    try { cancelAnimationFrame(raf); } catch { /* ignore */ }
    raf = 0;
    try { stream?.getTracks?.().forEach((t) => t.stop()); } catch { /* ignore */ }
    stream = null;
    try { ctx?.close(); } catch { /* ignore */ }
    ctx = null;
    confidentSince = null;
  }

  running = true;
  return { start, stop, get active() { return running; } };
}