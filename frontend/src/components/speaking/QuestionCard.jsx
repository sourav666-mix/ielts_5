/* ============================================================
   ATLAS IELTS Academy — conversation turn (Parts 1 & 3, §7.4)

   A natural, hands-free exchange — v2 full-duplex-feel:

     1. the coach asks the question aloud (Kokoro TTS §13.1) —
        and the MIC NEVER TURNS OFF: a §6 confidence+duration
        gate watches the whole time, so confident speech stops
        the audio MID-SENTENCE and the student takes the floor
        (Parts 1/3 only — §7's per-part duplex config)
     2. without an interruption, the mic OPENS ITSELF a beat
        after the question finishes — no tap needed
     3. it listens through the WHOLE answer with live captions
        (raw transcript, fillers kept — §13.4), a §8 SILENT
        backchannel glow on natural pauses, and only ends the
        turn after real trailing silence, "Done speaking", or
        the 2-minute cap — never mid-thought
     4. the coach answers OUT LOUD instantly (§9 thinking ack)
        so the conversation never goes dead while feedback is
        written
     5. the feedback card lands, and is HANDS-FREE to leave:
        say "next" (or "repeat" to hear the question again) —
        §12's confirm-to-continue, with the button alongside

   Typing stays full parity everywhere — the mic never blocks
   progress (§7.4). Keyed by the parent (question identity), so
   every question gets a fresh conversation turn.
   ============================================================ */

import React, { useEffect, useRef, useState } from 'react';
import { cn, countWords } from '../../lib/utils.js';
import {
  speakOnce, stopAllSpeech, ackLine, createLevelMeter,
  MicRecognizer, RecorderTranscriber, webSpeechSupported,
} from '../../lib/speech.js';
import {
  PART_DUPLEX_CONFIG, START_DELAY_MS, MIN_SPEECH_MS, SILENCE_MS,
  MAX_TURN_MS, RECORDER_MIN_MS, BACKCHANNEL_AFTER_MS, BACKCHANNEL_VISIBLE_MS,
} from '../../config/duplexConfig.js';
import { useBargeIn } from '../../hooks/useBargeIn.js';
import { useContinueIntent } from '../../hooks/useContinueIntent.js';
import { useToastStore } from '../../store/useToastStore.js';
import AnswerFeedback from './AnswerFeedback.jsx';
import VoiceOrb from './VoiceOrb.jsx';
import { ErrorState } from '../ui.jsx';
import '../../styles/speaking.css';

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <rect x="9" y="3.5" width="6" height="11" rx="3" fill="currentColor" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const clockOf = (sec) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

export default function QuestionCard({
  part,          // 1 | 3
  index,
  total,
  question,
  mode,
  micSupported,
  onModeChange,
  busy,
  feedback,
  error,
  onRetry,
  onSubmit,
  onNext,
  nextLabel,
}) {
  const [phase, setPhase] = useState('speaking');   // speaking | listening | writing | thinking
  const [heard, setHeard] = useState('');
  const [interim, setInterim] = useState('');
  const [userText, setUserText] = useState('');
  const [typed, setTyped] = useState('');
  const [recSec, setRecSec] = useState(0);
  const [endingSoon, setEndingSoon] = useState(false);
  const [backchannel, setBackchannel] = useState(false);  // §8 silent glow
  const [ackText, setAckText] = useState('');             // §9 shown + spoken

  const recRef = useRef(null);
  const kindRef = useRef(null);              // 'webspeech' | 'recorder'
  const stopMeterRef = useRef(null);
  const tickRef = useRef(null);
  const startTimerRef = useRef(null);
  const startedAtRef = useRef(0);
  const lastActivityRef = useRef(0);
  const heardRef = useRef('');
  const liveTextRef = useRef('');
  const endingRef = useRef(false);
  const aliveRef = useRef(true);
  const bcRef = useRef(false);             // §8 backchannel pulse in flight

  const modeRef = useRef(mode); modeRef.current = mode;
  const busyRef = useRef(busy); busyRef.current = busy;
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const submitRef = useRef(onSubmit); submitRef.current = onSubmit;
  const onModeChangeRef = useRef(onModeChange); onModeChangeRef.current = onModeChange;

  const waiting = Boolean(busy) || phase === 'thinking';
  const liveText = [heard, interim].filter(Boolean).join(' ');
  const partLabel = part === 1 ? 'Part 1 · about you' : 'Part 3 · discussion';

  /* ── §7 per-part duplex: Parts 1/3 conversational, barge-in ON.
   * (Part 2's CueCardStage never mounts this card, and typing
   * disables the gate — nothing to interrupt the coach over.) ── */
  const bargeInAllowed = PART_DUPLEX_CONFIG[part]?.bargeInEnabled !== false;

  /* ── §6 BARGE-IN: the mic never turns off while the coach
   * speaks. Confident speech (≥0.6 confidence held ≥180ms, per
   * duplexConfig) stops the question MID-SENTENCE and the mic
   * takes the floor immediately. The gate disarms itself the
   * moment the phase leaves 'speaking'. ── */
  const canBargeIn = phase === 'speaking' && mode === 'mic' && micSupported
    && !waiting && bargeInAllowed;
  useBargeIn({
    enabled: canBargeIn,
    onBargeIn: () => {
      if (endingRef.current || busyRef.current || phaseRef.current !== 'speaking') return;
      clearTimeout(startTimerRef.current);
      stopAllSpeech();                 // the question stops mid-sentence — now
      startListening();                // the student has the floor, no tap
      // Synchronous double-fire guard, set AFTER startListening so its
      // own phase guard still passes: until React re-renders, no further
      // gate frame can re-enter here.
      phaseRef.current = 'listening';
    },
  });

  /* ── §15 Orb state — the "can I interrupt?" signal, readable
   * at a glance. ── */
  const orbState = (feedback || error)
    ? 'confirming'
    : waiting
      ? 'thinking'
      : phase === 'listening'
        ? (backchannel ? 'backchannel' : 'listening')
        : phase === 'speaking'
          ? (mode === 'mic' && micSupported && bargeInAllowed
            ? 'speaking-interruptible'
            : 'speaking-protected')
          : 'idle';

  /* ── §12 Hands-free confirm-to-continue on the feedback card.
   * Only while mic mode; the visible button always remains. ── */
  const intent = useContinueIntent({
    enabled: Boolean(feedback) && !error && mode === 'mic' && micSupported && !busy,
    onContinue: onNext,
    onRepeat: replayQuestion,
  });

  /* ── 1. The coach asks the question… 2. the mic opens itself ── */
  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;
    (async () => {
      await speakOnce(question);
      if (cancelled || !aliveRef.current) return;
      if (modeRef.current === 'mic' && micSupported) {
        startTimerRef.current = setTimeout(() => {
          if (!cancelled && aliveRef.current && !busyRef.current) startListening();
        }, START_DELAY_MS);
      } else {
        setPhase('writing');
      }
    })();
    return () => {
      cancelled = true;
      aliveRef.current = false;
      clearTimeout(startTimerRef.current);
      teardownCapture();
      stopAllSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  function teardownCapture() {
    clearInterval(tickRef.current);
    stopMeterRef.current?.();
    stopMeterRef.current = null;
    const r = recRef.current;
    if (r) {
      try {
        if (kindRef.current === 'webspeech') r.abort();
        else r.stop().catch(() => {});      // discard the half-turn's audio
      } catch { /* ignore */ }
    }
    recRef.current = null;
    kindRef.current = null;
  }

  function noteActivity() {
    lastActivityRef.current = Date.now();
  }

  function handleMicError(e) {
    teardownCapture();
    onModeChangeRef.current?.('type');
    setPhase('writing');
    useToastStore.getState().push(
      e === 'not-allowed' || e === 'service-not-allowed'
        ? 'Microphone access was blocked — typing has every feature the mic has, so nothing is lost.'
        : 'The mic didn’t start cleanly — typing works just as well here.',
      'error',
      7000,
    );
  }

  /* ── 3. Listen through the whole answer ───────────────────── */
  function startListening() {
    if (endingRef.current || phaseRef.current === 'listening' || busyRef.current) return;
    endingRef.current = false;
    setEndingSoon(false);
    setHeard(''); setInterim(''); setUserText(''); setRecSec(0);
    heardRef.current = '';
    liveTextRef.current = '';
    startedAtRef.current = Date.now();
    lastActivityRef.current = Date.now();

    if (webSpeechSupported()) {
      kindRef.current = 'webspeech';
      const rec = new MicRecognizer({
        onInterim: (t) => {
          setInterim(t);
          liveTextRef.current = [heardRef.current, t].filter(Boolean).join(' ');
          noteActivity();
        },
        onFinal: (t) => {
          heardRef.current = heardRef.current ? `${heardRef.current} ${t}` : t;
          setHeard(heardRef.current);
          liveTextRef.current = heardRef.current;
          noteActivity();
        },
        onError: handleMicError,
      });
      recRef.current = rec;
      rec.start();
    } else {
      kindRef.current = 'recorder';
      const rec = new RecorderTranscriber();
      recRef.current = rec;
      rec.start()
        .then((stream) => {
          if (!aliveRef.current || recRef.current !== rec) return;
          stopMeterRef.current = createLevelMeter(stream, noteActivity);
        })
        .catch(() => handleMicError('start-failed'));
    }
    setPhase('listening');
    tickRef.current = setInterval(tick, 250);
  }

  /* Auto end-of-turn: enough said + real trailing silence — or cap. */
  function tick() {
    const now = Date.now();
    const elapsed = now - startedAtRef.current;
    setRecSec(Math.floor(elapsed / 1000));
    if (elapsed > MAX_TURN_MS) { endTurn(); return; }

    const enough = kindRef.current === 'webspeech'
      ? countWords(liveTextRef.current) >= 5
      : elapsed >= RECORDER_MIN_MS;
    const silence = now - lastActivityRef.current;
    const canEnd = enough && elapsed >= MIN_SPEECH_MS;
    setEndingSoon(canEnd && silence >= SILENCE_MS - 1500);

    /* §8 — visual-ONLY backchannel: a natural pause mid-answer
     * (well short of the silence-timeout) earns a silent glow
     * pulse on the orb. Never a sound: anything ATLAS plays
     * while the mic is open risks Whisper transcribing it as
     * part of the answer being graded. */
    const hasSpeech = kindRef.current === 'webspeech'
      ? countWords(liveTextRef.current) >= 3
      : elapsed >= RECORDER_MIN_MS;
    if (canEnd && hasSpeech
        && silence >= BACKCHANNEL_AFTER_MS && silence < SILENCE_MS
        && !bcRef.current) {
      bcRef.current = true;
      setBackchannel(true);
      setTimeout(() => {
        bcRef.current = false;
        setBackchannel(false);
      }, BACKCHANNEL_VISIBLE_MS);
    }

    if (canEnd && silence >= SILENCE_MS) endTurn();
  }

  /* ── 4. Hand back to the coach — spoken ack, then feedback ── */
  async function endTurn() {
    if (endingRef.current || phaseRef.current !== 'listening') return;
    endingRef.current = true;
    setEndingSoon(false);
    clearInterval(tickRef.current);
    stopMeterRef.current?.();
    stopMeterRef.current = null;
    setPhase('thinking');

    let text = '';
    const rec = recRef.current;
    if (kindRef.current === 'webspeech') {
      try { text = rec?.stop() || ''; } catch { /* ignore */ }
    } else {
      try { text = (await rec?.stop()) || ''; } catch { /* ignore */ }
    }
    recRef.current = null;
    kindRef.current = null;
    setInterim('');

    const finalText = String(text || '').trim();
    heardRef.current = '';
    liveTextRef.current = '';

    if (finalText) {
      setUserText(finalText);
      const ack = ackLine();
      setAckText(ack);
      speakOnce(ack);                  // §9 — instant, masks the grading call
      submitRef.current?.(finalText);
      endingRef.current = false;
    } else {
      // Nothing caught — reopen the mic so the flow never stalls.
      useToastStore.getState().push(
        'I didn’t catch anything there — the mic is open again, take another go.',
        'info',
        5000,
      );
      endingRef.current = false;
      startListening();
    }
  }

  function replayQuestion() {
    stopAllSpeech();
    speakOnce(question);
  }

  function submitTyped() {
    const text = typed.trim();
    if (!text) {
      useToastStore.getState().push(
        'Type your answer first — even a rough one is worth coaching.',
        'info',
      );
      return;
    }
    setUserText(text);
    setPhase('thinking');
    submitRef.current?.(text);
  }

  if (feedback || error) {
    return (
      <article className="convo-wrap stack-t" aria-label={`${partLabel} — feedback`}>
        <TurnMeta partLabel={partLabel} index={index} total={total} />
        <div className="convo-row coach">
          <VoiceOrb state={orbState} />
          <div className="convo-bubble coach-bubble">
            <p className="speak-q">{question}</p>
          </div>
        </div>
        {userText && (
          <div className="convo-row user">
            <div className="convo-bubble user-bubble"><p className="convo-you">{userText}</p></div>
          </div>
        )}
        {error ? (
          <ErrorState
            title="The feedback didn’t come through"
            message={error}
            onRetry={onRetry}
            retryLabel="Try again"
          />
        ) : (
          <>
            <AnswerFeedback feedback={feedback} onNext={onNext} nextLabel={nextLabel} />
            {intent.supported && mode === 'mic' && micSupported && (
              <p className="voice-continue-hint" aria-live="polite">
                {intent.hint === 'paused' ? (
                  <>Take your time — say <strong>“next”</strong> whenever you’re ready.</>
                ) : intent.hint === 'repeated' ? (
                  <>Here it is again — say <strong>“next”</strong> when you want to move on.</>
                ) : intent.heard ? (
                  <span className="interim">…{intent.heard}</span>
                ) : (
                  <>Hands-free: say <strong>“next”</strong> to continue, or <strong>“repeat”</strong> to hear the question again.</>
                )}
              </p>
            )}
          </>
        )}
      </article>
    );
  }

  return (
    <article className="convo-wrap stack-t" aria-label={`${partLabel}, question ${index + 1} of ${total}`}>
      <TurnMeta partLabel={partLabel} index={index} total={total} />

      {/* The coach asks — the orb's ring is the "you can jump in" affordance */}
      <div className="convo-row coach">
        <VoiceOrb state={orbState} />
        <div className="convo-bubble coach-bubble">
          {phase === 'speaking' && (
            <div className="wave" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          )}
          <p className="speak-q">{question}</p>
        </div>
      </div>

      <div className="convo-actions">
        {phase !== 'listening' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={replayQuestion}>
            Hear it again
          </button>
        )}
        {micSupported && !waiting && phase !== 'listening' && (
          <div className="mode-toggle" role="radiogroup" aria-label="Answer by voice or by typing">
            <button
              type="button" role="radio" aria-checked={mode === 'mic'}
              className={cn('mode-opt', mode === 'mic' && 'active')}
              onClick={() => onModeChange?.('mic')}
            >
              Microphone
            </button>
            <button
              type="button" role="radio" aria-checked={mode === 'type'}
              className={cn('mode-opt', mode === 'type' && 'active')}
              onClick={() => onModeChange?.('type')}
            >
              Typing
            </button>
          </div>
        )}
      </div>

      {/* Your turn, in flight */}
      {phase === 'listening' && (
        <div className="convo-row user">
          <div className="convo-bubble user-bubble listening">
            <div className="listen-head">
              <span className="mic-live" aria-hidden="true"><MicIcon /></span>
              <span className="listen-label">Listening…</span>
              <span className="rec-time">{clockOf(recSec)}</span>
            </div>
            <div className="interim convo-caption caret" aria-live="polite">
              {liveText || 'The mic is open — start whenever you’re ready. Pauses of a few seconds are fine.'}
            </div>
            <div className="listen-foot">
              {endingSoon ? (
                <>
                  <span className="silence-hint">Finishing your turn…</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={noteActivity}>
                    Keep talking
                  </button>
                </>
              ) : (
                <span className="convo-hint">I’ll hand back to your coach when you pause.</span>
              )}
              <button type="button" className="btn btn-primary btn-sm" onClick={endTurn}>
                Done speaking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Typed parity */}
      {phase === 'writing' && !waiting && (
        <div className="convo-row user">
          <div className="convo-bubble user-bubble writing">
            <textarea
              className="textarea"
              value={typed}
              placeholder="Type your answer — take your time."
              aria-label="Type your answer"
              onChange={(e) => setTyped(e.target.value)}
            />
            <div className="listen-foot">
              <span className="convo-hint">{countWords(typed)} words</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={submitTyped}>
                Submit answer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The coach is listening back while feedback is written — the
          §9 acknowledgment is spoken AND shown, so the wait is masked */}
      {waiting && (
        <div className="convo-row user">
          <div className="convo-bubble user-bubble thinking">
            <div className="thinking-row">
              <span className="dots" aria-hidden="true"><i /><i /><i /></span>
              <span className="convo-hint">Your coach is listening back…</span>
            </div>
            {ackText && <p className="convo-ack">“{ackText}”</p>}
            {userText && <p className="convo-you">{userText}</p>}
          </div>
        </div>
      )}
    </article>
  );
}

/* ── Small shared pieces ────────────────────────────────────── */

function TurnMeta({ partLabel, index, total }) {
  return (
    <div className="spread">
      <span className="kicker">{partLabel}</span>
      <span className="mono small">Question {index + 1} of {total}</span>
    </div>
  );
}

