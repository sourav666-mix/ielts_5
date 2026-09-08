/* ============================================================
   ATLAS IELTS Academy — Listening session (§5.7)

   Timer semantics — identical contract to Reading:
     · timerStartedAt stamped ONCE on first entry
     · remaining = 2400 − wall-clock elapsed; leaving the page
       never pauses it (§2.2), 0:00 auto-submits (§5.1)
     · returning after expiry auto-submits on mount

   Playback semantics:
     · ONE SpeechPlayer at a time (starting part N stops part M)
     · stale async callbacks are guarded by player-identity checks
     · plays are counted in the day record (resume-safe):
       Training max 2 (original + replay), Mock max 1
     · pause/resume allowed because the CLOCK never pauses —
       audio control is a courtesy, time honesty is not
   ============================================================ */

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils.js';
import { phaseLabel, joinList } from '../../lib/moduleMeta.js';
import { useDayStore } from '../../store/useDayStore.js';
import { useCountdown } from '../../hooks/useTimers.js';
import { SpeechPlayer } from '../../lib/speech.js';
import { LISTENING_SECONDS, rangeForPart } from '../../lib/listeningFlow.js';
import AudioPane from './AudioPane.jsx';
import MapPlan from './MapPlan.jsx';
import QuestionColumn from './QuestionColumn.jsx';
import Modal from '../Modal.jsx';
import TimerToggle from '../TimerToggle.jsx';
import '../../styles/listening.css';
import '../../styles/reading.css';   // shared .session-controls (documented)

function computeRemaining() {
  const m = useDayStore.getState().record?.listening;
  /* A manually paused clock resumes exactly where it stopped —
     the frozen remainder wins over wall-clock arithmetic. */
  const paused = m?.pausedRemainingSec;
  if (Number.isFinite(paused) && paused >= 0) {
    return Math.max(0, Math.min(LISTENING_SECONDS, Math.floor(paused)));
  }
  const started = m?.timerStartedAt ? Date.parse(m.timerStartedAt) : NaN;
  if (!Number.isFinite(started)) return LISTENING_SECONDS;
  const elapsed = Math.floor((Date.now() - started) / 1000);
  return Math.max(0, Math.min(LISTENING_SECONDS, LISTENING_SECONDS - elapsed));
}

export default function ListeningSession({ phase, onSubmit }) {
  const content = useDayStore((s) => s.record?.listening?.content);
  const answers = useDayStore((s) => s.record?.listening?.answers) || {};
  const plays = useDayStore((s) => s.record?.listening?.plays) || {};
  const patchAnswer = useDayStore((s) => s.patchAnswer);
  const patchModule = useDayStore((s) => s.patchModule);

  const [tab, setTab] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [totalSec] = useState(computeRemaining);          // computed ONCE per session
  const [playState, setPlayState] = useState(null);       // { part, status }
  const [playback, setPlayback] = useState(null);         // { lineIdx, total, speaker }
  const [startPaused] = useState(() =>
    Number.isFinite(useDayStore.getState().record?.listening?.pausedRemainingSec));
  const [timerPaused, setTimerPaused] = useState(startPaused);

  const playerRef = useRef(null);

  const maxPlays = phase === 'mock' ? 1 : 2;              // §5.1 + §2.2

  const { clock, phase: timerPhase, remainingSec, pause: pauseClock, resume: resumeClock } =
    useCountdown(totalSec, {
      autoStart: !startPaused,                            // a paused clock waits for play
      onExpire: () => handleSubmit(true),                 // 0:00 → auto-submit, no dialog
    });

  /* Manual pause/play — same resume-safe persistence as Reading:
     the frozen remainder is stored, and resuming re-anchors the
     wall-clock stamp so the arithmetic continues from there. */
  function toggleTimer() {
    const ds = useDayStore.getState();
    if (!timerPaused) {
      pauseClock();
      ds.patchModule('listening', { pausedRemainingSec: Math.max(0, Math.floor(remainingSec)) });
      setTimerPaused(true);
      stopPlayback();                                     // no audio while the clock sleeps
    } else {
      const remaining = Math.max(0, Math.floor(remainingSec));
      ds.patchModule('listening', {
        timerStartedAt: new Date(Date.now() - (LISTENING_SECONDS - remaining) * 1000).toISOString(),
        pausedRemainingSec: null,
      });
      resumeClock();
      setTimerPaused(false);
    }
  }

  /* Stamp the exam start once (idempotent under StrictMode). */
  useEffect(() => {
    const m = useDayStore.getState().record?.listening;
    if (m && !m.timerStartedAt) {
      useDayStore.getState().patchModule('listening', {
        timerStartedAt: new Date().toISOString(),
      });
    }
  }, []);

  /* Never leave audio running after the session unmounts. */
  useEffect(() => () => { playerRef.current?.stop(); }, []);

  if (!content) return null;

  const parts = content.parts;
  const questions = content.questions;
  const activeTab = Math.min(tab, parts.length - 1);
  const part = parts[activeTab];

  /* ── Playback control ───────────────────────────────────── */

  function stopPlayback() {
    const p = playerRef.current;
    playerRef.current = null;      // null FIRST so stale handlers bail
    setPlayState(null);
    setPlayback(null);
    try { p?.stop(); } catch { /* ignore */ }
  }

  function playPart(i) {
    if (playerRef.current) stopPlayback();               // one player at a time
    const target = parts[i];
    if (!target?.lines?.length) return;

    /* Consume a play BEFORE audio starts (counted even if the
       student ends it early — real tests have no stop button). */
    const current = useDayStore.getState().record?.listening?.plays || {};
    patchModule('listening', { plays: { ...current, [i]: (current[i] || 0) + 1 } });

    setPlayState({ part: i, status: 'playing' });

    const player = new SpeechPlayer({
      onLineStart: (idx, line) => {
        if (playerRef.current !== player) return;        // stale-guard
        setPlayback({ lineIdx: idx, total: target.lines.length, speaker: line?.speaker || '' });
      },
      onStateChange: (state) => {
        if (playerRef.current !== player) return;        // stale-guard
        if (state === 'finished') {
          playerRef.current = null;
          setPlayState(null);
          setPlayback(null);
        } else if (state === 'playing' || state === 'paused') {
          setPlayState((s) => (s && s.part === i ? { ...s, status: state } : s));
        }
      },
    });
    playerRef.current = player;
    player.play(target.lines);
  }

  function pausePlayback() { try { playerRef.current?.pause(); } catch { /* ignore */ } }
  function resumePlayback() { try { playerRef.current?.resume(); } catch { /* ignore */ } }

  function handleSubmit(auto) {
    stopPlayback();                                       // no listening after submit
    setConfirming(false);
    onSubmit(auto);
  }

  const onAnswer = (id, v) => patchAnswer('listening', id, v);

  const answeredCount = questions.filter((q) => {
    const v = answers[q.id];
    return v != null && String(v).trim() !== '';
  }).length;
  const unplayedParts = parts
    .map((_, i) => (plays[i] > 0 ? null : i + 1))
    .filter(Boolean);

  return (
    <div className="stack">
      <div className="module-header">
        <div>
          <p className="kicker">
            Module 2 · Listening · {phaseLabel(phase)}
            {phase === 'mock' ? ' · one play only' : ''}
          </p>
          <h1 className="display-2">{content.theme}</h1>
          <p className="small">
            {parts.length} parts · {questions.length} questions ·{' '}
            {phase === 'mock'
              ? 'one play per part, exam conditions'
              : 'one replay per part in Training'}
          </p>
        </div>
        <div className="session-controls">
          <TimerToggle paused={timerPaused} onToggle={toggleTimer} />
          <span className={cn('timer', timerPhase, timerPaused && 'paused')} role="timer" aria-live="off">
            {clock}
          </span>
          <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
            Submit
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Listening parts">
        {parts.map((p, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={activeTab === i}
            className={cn('tab', activeTab === i && 'active')}
            onClick={() => setTab(i)}
          >
            Part {i + 1}{rangeForPart(content, i) ? ` · ${rangeForPart(content, i)}` : ''}
            {plays[i] > 0 && playState?.part !== i && (
              <span className="tab-done" aria-label="played">✓</span>
            )}
            {playState?.part === i && <span className="tab-live" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <section className="stack-t">
        <div>
          <p className="kicker">Part {activeTab + 1}</p>
          <h2 className="title-3">{part.title}</h2>
          <p className="small">
            {part.speakers.map((s) => s.name).join(' · ')} — {part.lines.length} lines
          </p>
        </div>

        <AudioPane
          partIndex={activeTab}
          plays={plays[activeTab] || 0}
          maxPlays={maxPlays}
          status={playState?.part === activeTab ? playState.status : null}
          playback={playback}
          onPlay={playPart}
          onPause={pausePlayback}
          onResume={resumePlayback}
          onStop={stopPlayback}
        />

        {part.mapData && <MapPlan mapData={part.mapData} revealed={false} />}

        <QuestionColumn
          content={content}
          partIndex={activeTab}
          answers={answers}
          onAnswer={onAnswer}
          unlocked={(plays[activeTab] || 0) > 0}
        />
      </section>

      <div className="submit-row">
        <span className="small">
          The transcript stays hidden until you submit — exactly like the real test. Leaving
          doesn’t stop the clock.
        </span>
        <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
          Submit Listening Test
        </button>
      </div>

      {confirming && (
        <SubmitDialog
          unplayedParts={unplayedParts}
          unanswered={questions.length - answeredCount}
          total={questions.length}
          onCancel={() => setConfirming(false)}
          onConfirm={() => handleSubmit(false)}
        />
      )}
    </div>
  );
}

function SubmitDialog({ unplayedParts, unanswered, total, onCancel, onConfirm }) {
  return (
    <Modal
      title="Submit your Listening test?"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Keep working</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>Submit test</button>
        </>
      }
    >
      {unplayedParts.length === 0 && unanswered === 0 ? (
        <p>
          All {total} answered and every part played. On submit, the full breakdown,
          explanations and what-you-heard transcripts unlock.
        </p>
      ) : (
        <div className="stack-t">
          {unplayedParts.length > 0 && (
            <p>
              You never played {joinList(unplayedParts.map((n) => `Part ${n}`))} —
              {unplayedParts.length === 1 ? ' that part’s questions' : ' those parts’ questions'}{' '}
              can’t have been heard, and blanks score zero, exactly as in the real test.
            </p>
          )}
          {unanswered > 0 && (
            <p>
              <strong>{unanswered}</strong>{' '}
              {unanswered === 1 ? 'question is' : 'questions are'} still unanswered
              {unplayedParts.length === 0 ? ' — blanks score zero' : ''}. Happy to submit anyway?
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}