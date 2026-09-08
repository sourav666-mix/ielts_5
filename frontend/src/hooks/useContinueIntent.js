/* ============================================================
   ATLAS IELTS Academy — useContinueIntent (voice v2 §12/§17)

   Hands-free confirm-to-continue: while the feedback card is
   open, a lightweight Web Speech listener classifies short
   spoken commands with CLIENT-SIDE keyword matching — no AI
   call, fast and free.

     "next" / "yes" / "go"   → continue (onContinue)
     "repeat" / "one more"   → replay (onRepeat)
     "wait" / "hold on"      → hold still for a few seconds

   Deliberate safety nuance over §12's bare classifier: the
   classifier defaults ambiguous input to 'continue', which is
   right for a direct "Ready for the next one?" exchange — but
   this listener runs AMBIENTLY while the student may still be
   reading. So long utterances (≥6 words — clearly an answer or
   muttering, not a command) are ignored, and nothing fires
   while the coach's own voice is playing. The visible button
   always remains alongside (§12).
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { classifyContinueIntent } from '../config/duplexConfig.js';
import { MicRecognizer, webSpeechSupported, isCoachSpeaking } from '../lib/speech.js';

const PAUSE_HOLD_MS = 8000;    // "wait / hold on" holds the card still for this long
const REPEAT_COOLDOWN_MS = 2500;
const MAX_COMMAND_WORDS = 6;   // longer speech is never treated as a command

export function useContinueIntent({ enabled, onContinue, onRepeat }) {
  const [heard, setHeard] = useState('');
  const [hint, setHint] = useState(null);    // null | 'paused' | 'repeated'

  const contRef = useRef(onContinue);
  contRef.current = onContinue;
  const repRef = useRef(onRepeat);
  repRef.current = onRepeat;

  useEffect(() => {
    if (!enabled || !webSpeechSupported()) return undefined;
    let alive = true;
    let rec = null;
    let holdUntil = 0;
    let lastRepeat = 0;

    rec = new MicRecognizer({
      onInterim: (t) => { if (alive) setHeard(t); },
      onFinal: (t) => {
        if (!alive) return;
        const text = String(t || '').trim();
        setHeard('');
        if (!text || isCoachSpeaking()) return;      // never react to the coach's own audio
        if (Date.now() < holdUntil) return;
        if (text.split(/\s+/).length >= MAX_COMMAND_WORDS) return;

        const intent = classifyContinueIntent(text);
        if (intent === 'repeat') {
          const now = Date.now();
          if (now - lastRepeat < REPEAT_COOLDOWN_MS) return;
          lastRepeat = now;
          setHint('repeated');
          holdUntil = now + REPEAT_COOLDOWN_MS;
          repRef.current?.();
        } else if (intent === 'pause') {
          setHint('paused');
          holdUntil = Date.now() + PAUSE_HOLD_MS;
          setTimeout(() => { if (alive) setHint(null); }, PAUSE_HOLD_MS);
        } else {
          contRef.current?.();                       // explicit "next" — advance
        }
      },
      onError: () => { /* ambient listener — errors are never surfaced */ },
    });
    rec.start();

    return () => {
      alive = false;
      try { rec?.abort(); } catch { /* ignore */ }
    };
  }, [enabled]);

  return { heard, hint, supported: webSpeechSupported() };
}