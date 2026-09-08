/* ============================================================
   ATLAS IELTS Academy — Part 2, the long turn (§7.2/§7.8)

   card → prep (60s silent, mic off, skippable) → speak
   (120s, mic auto-started, auto-stopped at 0:00) → the session
   swaps in feedback.

   v2 §7 — Part 2 is a PROTECTED MONOLOGUE: barge-in is
   deliberately OFF for the whole stage, exactly like the real
   IELTS examiner who doesn't speak for two minutes. The cue
   card read-out renders the orb with NO interruptible ring, and
   the long turn carries an explicit "Recording your long turn —
   I'll wait" caption, so the no-interrupt state is stated
   rather than silently different (§15).

   Countdown semantics: the 2-minute turn ends ITSELF at 0:00
   (mic mode) exactly like an examiner stopping you — the
   student can also press "Done speaking" early inside the
   capture. Typed parity: the countdown runs, but at 0 it only
   nudges ("wrap up and submit") — typed answers are never
   force-cleared mid-sentence. Documented medium adjustment.
   ============================================================ */

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils.js';
import { speakOnce, stopAllSpeech } from '../../lib/speech.js';
import { useCountdown } from '../../hooks/useTimers.js';
import { PART2_PREP_SEC, LONG_TURN_SEC } from '../../lib/speakingFlow.js';
import MicTypeCapture from './MicTypeCapture.jsx';
import AnswerFeedback from './AnswerFeedback.jsx';
import VoiceOrb from './VoiceOrb.jsx';
import { ErrorState, Spinner } from '../ui.jsx';
import '../../styles/speaking.css';

export default function CueCardStage({
  cueCard,
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
  onRestartTurn,
}) {
  const [stage, setStage] = useState('card');   // card | prep | speak
  const [timesUp, setTimesUp] = useState(false);
  const capRef = useRef(null);
  const submittedRef = useRef(false);

  const prep = useCountdown(PART2_PREP_SEC, {
    autoStart: false,
    warnAt: 15,
    dangerAt: 5,
    onExpire: () => enterSpeak(),
  });

  const speak = useCountdown(LONG_TURN_SEC, {
    autoStart: false,
    warnAt: 30,
    dangerAt: 10,
    onExpire: () => handleExpire(),
  });

  /* Read the cue card aloud when it appears (§7.4) — PROTECTED:
   * no barge-in during a Part 2 read-out (§7). */
  useEffect(() => {
    const spoken = `${cueCard.prompt} You should say: ${cueCard.bullets.join('. ')}.`;
    speakOnce(spoken);
    return () => stopAllSpeech();
  }, [cueCard]);

  /* §15 — the orb states the protected flow explicitly. */
  const orbState = feedback
    ? 'confirming'
    : busy
      ? 'thinking'
      : stage === 'card'
        ? 'speaking-protected'   // cue-card read-out — no interrupt ring
        : stage === 'prep'
          ? 'idle'
          : 'listening';         // the 2-minute turn belongs to the student

  function enterPrep() {
    setStage('prep');
    prep.start();
  }

  function enterSpeak() {
    prep.stop();
    speak.start();
    setStage('speak');
  }

  /* Mic auto-starts the moment the speaking minute begins. */
  useEffect(() => {
    if (stage === 'speak' && mode === 'mic' && !feedback && !busy && !timesUp) {
      capRef.current?.start();
    }
  }, [stage, mode, feedback, busy, timesUp]);

  /* 0:00 — the examiner stops you (mic); typed gets a nudge. */
  async function handleExpire() {
    if (submittedRef.current || feedback) return;
    if (mode === 'mic') {
      submittedRef.current = true;
      const text = (await capRef.current?.stopAndCollect?.()) || '';
      if (text) onSubmit?.(text);
      else {
        submittedRef.current = false;
        setTimesUp(true);
      }
    } else {
      setTimesUp(true);
    }
  }

  return (
    <article className="panel stack-t" aria-label="Part 2, your long turn">
      <div className="spread">
        <span className="kicker">Part 2 · your long turn</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => speakOnce(`${cueCard.prompt} You should say: ${cueCard.bullets.join('. ')}.`)}
        >
          Hear it again
        </button>
      </div>

      <div className="cue-card">
        <div className="spread">
          <p className="kicker" style={{ color: '#7A5A16' }}>Speak for one to two minutes on this</p>
          <VoiceOrb state={orbState} />
        </div>
        <h3 className="title-3">{cueCard.prompt}</h3>
        <p style={{ margin: '10px 0 4px', fontWeight: 600 }}>You should say:</p>
        <ul className="cue-bullets">
          {cueCard.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      </div>

      {feedback ? (
        <AnswerFeedback feedback={feedback} onNext={onNext} nextLabel={nextLabel} />
      ) : error ? (
        <ErrorState
          title="The feedback didn’t come through"
          message={error}
          onRetry={onRetry}
          retryLabel="Try again"
        />
      ) : busy ? (
        <div className="row" role="status">
          <Spinner />
          <span className="small">Your coach is reading your long turn…</span>
        </div>
      ) : stage === 'card' ? (
        <>
          <p className="capture-guide">
            Take a silent minute to look it over first — just like the real test. When you’re
            ready, the prep minute starts, and after that you speak for two minutes without
            stopping.
          </p>
          <button type="button" className="btn btn-primary" onClick={enterPrep}>
            I’m ready — start my prep minute
          </button>
        </>
      ) : stage === 'prep' ? (
        <div className="turn-stage stack-t">
          <div className={cn('big-count', prep.phase)} role="timer" aria-live="off">
            {prep.clock}
          </div>
          <p className="count-label">Silent prep — the mic is off. Notes in your head, not on paper.</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={enterSpeak}>
            Start speaking now
          </button>
        </div>
      ) : (
        <div className="stack-t">
          <div className="turn-stage">
            <div className={cn('big-count', speak.phase)} role="timer" aria-live="off">
              {speak.clock}
            </div>
            <p className="count-label">Keep going — the examiner stops you at 0:00.</p>
            <p className="protected-note">Recording your long turn — I’ll wait.</p>
          </div>

          {timesUp && (
            <div className="stack-t">
              {mode === 'mic' ? (
                <>
                  <p className="timesup-note">Time — I didn’t catch enough to mark. Take the turn again.</p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={onRestartTurn}
                  >
                    Try my long turn again
                  </button>
                </>
              ) : (
                <p className="timesup-note">
                  Time’s up — wrap up your sentence and submit when you’re ready.
                </p>
              )}
            </div>
          )}

          {!timesUp || mode === 'type' ? (
            <MicTypeCapture
              ref={capRef}
              mode={mode}
              onModeChange={onModeChange}
              micSupported={micSupported}
              onSubmit={onSubmit}
            />
          ) : null}
        </div>
      )}
    </article>
  );
}