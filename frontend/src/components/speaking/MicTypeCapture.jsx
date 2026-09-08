/* ============================================================
   ATLAS IELTS Academy — answer capture (mic or typing, §7.4)

   §3.5 "let the student finish a thought": mic capture is
   CONTINUOUS with live interim captions — it never cuts off at
   the first pause; the student presses "Done speaking". The
   transcript stays RAW (fillers preserved, §13.4) — only the
   AI's displayed corrected version is cleaned.

   Mic paths: Web Speech API (live captions) where supported;
   MediaRecorder → backend Whisper elsewhere. Typed fallback is
   full parity everywhere, so the mic NEVER blocks progress.

   Imperative handle (used by the Part 2 long turn):
     start()               — begin mic capture (mic mode only)
     stopAndCollect()      — async; returns the captured text
   ============================================================ */

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useToastStore } from '../../store/useToastStore.js';
import { MicRecognizer, RecorderTranscriber, webSpeechSupported } from '../../lib/speech.js';
import { countWords, cn } from '../../lib/utils.js';
import { Spinner } from '../ui.jsx';
import '../../styles/speaking.css';

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    <rect x="9" y="3.5" width="6" height="11" rx="3" fill="currentColor" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const MicTypeCapture = forwardRef(function MicTypeCapture({
  mode,
  onModeChange,
  micSupported = true,
  onSubmit,
  busy = false,
  disabled = false,
  placeholder = 'Type your answer — take your time.',
}, ref) {
  const [capturing, setCapturing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [heard, setHeard] = useState('');
  const [interim, setInterim] = useState('');
  const [typed, setTyped] = useState('');
  const [micDead, setMicDead] = useState(false);
  const [recSec, setRecSec] = useState(0);

  const recRef = useRef(null);          // MicRecognizer | RecorderTranscriber
  const kindRef = useRef(null);         // 'webspeech' | 'recorder'
  const recTimerRef = useRef(null);

  /* Ref mirrors so the imperative handle and timers always see
   * fresh values without re-creating the handle. */
  const modeRef = useRef(mode); modeRef.current = mode;
  const busyRef = useRef(busy); busyRef.current = busy;
  const capturingRef = useRef(false); capturingRef.current = capturing || processing;
  const typedRef = useRef(''); typedRef.current = typed;

  const micAvailable = micSupported && !micDead;
  const locked = busy || disabled;

  useImperativeHandle(ref, () => ({
    /** Long-turn auto-start (CueCardStage, mic mode only). */
    start: () => {
      if (modeRef.current === 'mic' && !busyRef.current && !capturingRef.current) startMic();
    },
    /** Long-turn auto-stop at 0:00 — returns the RAW text. */
    stopAndCollect: async () => {
      if (modeRef.current === 'type') return typedRef.current.trim();
      return await finishMic();
    },
  }));

  /* Never leave a recognizer or stream running behind us. */
  useEffect(() => () => {
    clearInterval(recTimerRef.current);
    const r = recRef.current;
    if (!r) return;
    try {
      if (kindRef.current === 'webspeech') r.abort();
      else r.stop().catch(() => {});    // recorder: stop stream, discard transcript
    } catch { /* ignore */ }
    recRef.current = null;
    kindRef.current = null;
  }, []);

  function startMic() {
    if (capturingRef.current || locked || !micAvailable) return;
    setHeard('');
    setInterim('');
    setRecSec(0);

    if (webSpeechSupported()) {
      const rec = new MicRecognizer({
        onInterim: (t) => setInterim(t),                          // live caption §3.5
        onFinal: (t) => setHeard((h) => (h ? `${h} ${t}` : t)),
        onError: (e) => {
          if (e === 'not-allowed' || e === 'service-not-allowed') {
            setCapturing(false);
            capturingRef.current = false;
            setMicDead(true);
            onModeChange?.('type');
            useToastStore.getState().push(
              'Microphone access was blocked — typing has every feature the mic has, so nothing is lost.',
              'error',
              7000,
            );
          }
        },
      });
      recRef.current = rec;
      kindRef.current = 'webspeech';
      rec.start();
      capturingRef.current = true;
      setCapturing(true);
    } else {
      const rec = new RecorderTranscriber();
      recRef.current = rec;
      kindRef.current = 'recorder';
      rec.start()
        .then(() => {
          capturingRef.current = true;
          setCapturing(true);
          recTimerRef.current = setInterval(() => setRecSec((s) => s + 1), 1000);
        })
        .catch(() => {
          recRef.current = null;
          kindRef.current = null;
          setMicDead(true);
          onModeChange?.('type');
          useToastStore.getState().push(
            'Recording didn’t start — switching you to typing, which works just as well here.',
            'error',
            7000,
          );
        });
    }
  }

  /** Stop capture; return the RAW transcript ('' if nothing caught). */
  async function finishMic() {
    const rec = recRef.current;
    if (!rec || !capturingRef.current) return '';
    clearInterval(recTimerRef.current);
    capturingRef.current = false;
    setCapturing(false);

    let text = '';
    if (kindRef.current === 'webspeech') {
      text = rec.stop() || '';
    } else {
      setProcessing(true);
      try { text = (await rec.stop()) || ''; } catch { text = ''; }
      setProcessing(false);
    }
    recRef.current = null;
    kindRef.current = null;
    setInterim('');

    if (!text.trim()) {
      useToastStore.getState().push(
        'I didn’t catch anything there — give it another go.',
        'info',
      );
    }
    return text.trim();
  }

  async function handleDoneSpeaking() {
    const text = await finishMic();
    if (text) onSubmit?.(text);
  }

  function handleTypedSubmit() {
    const text = typed.trim();
    if (!text) {
      useToastStore.getState().push(
        'Type your answer first — even a rough one is worth coaching.',
        'info',
      );
      return;
    }
    onSubmit?.(text);
  }

  const liveCaption = [heard, interim].filter(Boolean).join(' ');

  return (
    <div className="stack-t">
      {/* Mic-or-type toggle */}
      {micAvailable && (
        <div className="mode-toggle" role="radiogroup" aria-label="How would you like to answer?">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'mic'}
            className={cn('mode-opt', mode === 'mic' && 'active')}
            disabled={capturing || processing || locked}
            onClick={() => onModeChange?.('mic')}
          >
            Microphone
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'type'}
            className={cn('mode-opt', mode === 'type' && 'active')}
            disabled={capturing || processing || locked}
            onClick={() => onModeChange?.('type')}
          >
            Typing
          </button>
        </div>
      )}

      {mode === 'mic' ? (
        <>
          {processing ? (
            <div className="row" role="status">
              <Spinner />
              <span className="small">Turning your audio into text…</span>
            </div>
          ) : capturing ? (
            <>
              <div className="cap-row">
                <span className="mic-btn recording" aria-hidden="true"><MicIcon /></span>
                {kindRef.current === 'recorder' && (
                  <span className="rec-time">{String(Math.floor(recSec / 60)).padStart(2, '0')}:{String(recSec % 60).padStart(2, '0')}</span>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleDoneSpeaking}
                  disabled={busy}
                >
                  Done speaking
                </button>
              </div>
              <p className="capture-guide">
                I’m listening — take your time and finish your thought. Fillers are completely
                fine; the coach ignores them.
              </p>
              <div className="interim interim-live" aria-live="polite">
                {liveCaption || '…'}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="mic-btn"
                onClick={startMic}
                disabled={locked}
                aria-label="Start speaking your answer"
              >
                <MicIcon />
              </button>
              <p className="capture-guide">
                Tap to speak — the mic keeps listening until you press “Done speaking”, so
                pauses never cut you off.
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <textarea
            className="textarea"
            value={typed}
            disabled={locked}
            placeholder={placeholder}
            aria-label="Type your answer"
            onChange={(e) => setTyped(e.target.value)}
          />
          <div className="typed-submit">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleTypedSubmit}
              disabled={locked}
            >
              Submit answer
            </button>
            <span className={cn('word-count', typed.trim() && countWords(typed) >= 20 && 'ok')}>
              {countWords(typed)} words
            </span>
          </div>
        </>
      )}
    </div>
  );
});

export default MicTypeCapture;