/* ============================================================
   ATLAS IELTS Academy — Speaking session (§7.1, §7.8)

   The round state machine: loading → Part 1 (5) → Part 2 (cue
   card) → Part 3 (6) → summary → next round / finish.

   Resume is deliberately COARSE, per the spec's own documented
   limitation (§11.3): leaving mid-round drops that round and
   starts a fresh one on return — while time-toward-90-minutes
   is preserved exactly (banked active time).

   §7.3 window: checked on mount AND every banking tick — a
   lapsed window wipes today's speaking (the store does the
   wiping + toast) and the session restarts honestly.

   Active time: Stopwatch semantics — tab-hidden time doesn't
   count, banked to the record every 30s and on unmount. One
   accounting owner (this component) so it can never
   double-count.
   ============================================================ */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { phaseLabel } from '../../lib/moduleMeta.js';
import { useDayStore, newRound } from '../../store/useDayStore.js';
import { useProfileStore, weakAreaSummary } from '../../store/useProfileStore.js';
import { useHistoryStore } from '../../store/useHistoryStore.js';
import { useToastStore } from '../../store/useToastStore.js';
import { Stopwatch, hoursSince } from '../../lib/timers.js';
import { pickCaptureMode, stopAllSpeech } from '../../lib/speech.js';
import { speakingRoundBand } from '../../lib/scoring.js';
import { cn, formatBand } from '../../lib/utils.js';
import {
  generateRound, buildFeedbackPayload, normalizeSpeakingFeedback,
  speakingSignals, finalizeSpeaking, roundAverage,
  TRAINING_TARGET_SEC,
} from '../../lib/speakingFlow.js';
import { applyAccuracySignals } from '../../lib/accuracyBatch.js';
import { api } from '../../lib/api.js';
import QuestionCard from './QuestionCard.jsx';
import CueCardStage from './CueCardStage.jsx';
import RoundSummary from './RoundSummary.jsx';
import { ErrorState, LoadingHero } from '../ui.jsx';
import TimerToggle from '../TimerToggle.jsx';
import VoicePicker from './VoicePicker.jsx';
import '../../styles/speaking.css';
import '../../styles/reading.css';   // shared .session-controls (documented)

export default function SpeakingSession({ phase, target }) {
  const timeSpentSec = useDayStore((s) => s.record?.speaking?.timeSpentSec) || 0;
  const startedAt = useDayStore((s) => s.record?.speaking?.sessionStartedAt);
  const roundsDone = useDayStore(
    (s) => (s.record?.speaking?.rounds || []).filter((r) => r.completedAt).length
  );

  const [round, setRound] = useState(null);
  const [stage, setStage] = useState('loading');   // loading | part1 | part2 | part3 | summary | reset
  const [genError, setGenError] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [currentFeedback, setCurrentFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(() => (pickCaptureMode() === 'typed' ? 'type' : 'mic'));
  const [genToken, setGenToken] = useState(0);
  const [cueNonce, setCueNonce] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const micSupported = useMemo(() => pickCaptureMode() !== 'typed', []);
  const training = phase !== 'mock';
  const roundNumber = roundsDone + 1;

  const lastSubmitRef = useRef(null);
  const roundRef = useRef(null); roundRef.current = round;
  const swRef = useRef(null);
  const bankedRef = useRef(0);
  const clockPausedRef = useRef(false);
  const [clockPaused, setClockPaused] = useState(false);

  /* ── Mount: §7.3 re-check → drop any incomplete round (coarse
     resume, §11.3) → stamp the session window. Idempotent. ── */
  useEffect(() => {
    useDayStore.getState().checkSpeakingWindow();
    const rec = useDayStore.getState().record;
    const rounds = rec?.speaking?.rounds || [];
    if (rounds.some((r) => !r.completedAt)) {
      useDayStore.getState().patchModule('speaking', {
        rounds: rounds.filter((r) => r.completedAt),
      });
    }
    useDayStore.getState().startSpeakingSession();
  }, []);

  /* ── Active-time banking: every 30s + on unmount, one owner. */
  function bankTime(final = false) {
    const sw = swRef.current;
    if (!sw) return;
    sw.pause();
    const total = sw.elapsedSec();
    const delta = total - bankedRef.current;
    bankedRef.current = total;
    if (delta >= 1) useDayStore.getState().addTimeSpent('speaking', delta);

    /* §7.3 — the window can lapse mid-session; the store wipes
     * and toasts; we restart accounting from zero (the wiped
     * record starts at 0, and bankedRef now equals `total`). */
    if (useDayStore.getState().checkSpeakingWindow()) {
      stopAllSpeech();
      setRound(null);
      setCurrentFeedback(null);
      setBusy(false);
      setError(null);
      setQIndex(0);
      setStage('reset');
    }

    /* A manual pause survives the banking tick — the clock only
     * restarts here when the student hasn't stopped it. */
    if (!final && !clockPausedRef.current) sw.start();
  }

  /* Manual pause/play for the active-practice clock. A deliberate
   * pause freezes the "x / 90 min" total and survives tab switches. */
  function toggleClock() {
    const sw = swRef.current;
    if (!sw) return;
    if (clockPausedRef.current) {
      sw.resume();
      clockPausedRef.current = false;
      setClockPaused(false);
    } else {
      sw.pauseManually();
      clockPausedRef.current = true;
      setClockPaused(true);
      bankTime();                 // bank what's accrued so far, then stay frozen
    }
  }

  useEffect(() => {
    const sw = new Stopwatch();
    swRef.current = sw;
    sw.start();
    const iv = setInterval(() => bankTime(), 30000);
    return () => {
      clearInterval(iv);
      bankTime(true);
      swRef.current = null;
    };
  }, []);

  /* ── Round generation (memoised in speakingFlow; StrictMode-
     proof; store writes happen even if the student leaves). ── */
  useEffect(() => {
    if (stage !== 'loading') return undefined;
    let alive = true;
    setGenError(null);

    const p = useProfileStore.getState().profile;
    const ds = useDayStore.getState();
    const roundsCount = ds.record?.speaking?.rounds?.length ?? 0;

    generateRound({
      phase,
      day: p?.day ?? 1,
      roundIndex: roundsCount,
      targetBand: p?.targetBand ?? 6.5,
      avoidTopics: p?.topicsUsed?.speaking || [],
      weakAreas: weakAreaSummary(p, 'speaking'),
      difficulty: useHistoryStore.getState().moduleDifficulty('speaking', p?.targetBand ?? 6.5),
    })
      .then((r) => {
        if (!alive) return;
        const nr = newRound(r.topic, r);
        setRound(nr);
        setStage('part1');
        setQIndex(0);
        setCurrentFeedback(null);
        ds.upsertSpeakingRound(nr);
        useProfileStore.getState().addTopics('speaking', [r.topic]);
        useToastStore.getState().push(
          `Today’s topic: “${r.topic}”. Take your time — every answer gets coached.`,
          'success',
          6000,
        );
      })
      .catch((err) => {
        if (alive) {
          setGenError(err?.message || "The coach couldn't prepare this round — one more try usually sorts it.");
        }
      });

    return () => { alive = false; };
  }, [stage, genToken, phase]);

  /* ── §7.6 feedback after EVERY answer. ── */
  async function submitAnswer(part, question, answer) {
    const r = roundRef.current;
    if (!r) return;
    lastSubmitRef.current = { part, question, answer };
    setBusy(true);
    setError(null);
    try {
      const raw = await api.speaking.feedback(
        buildFeedbackPayload({ phase, part, question, answer, targetBand: target, topic: r.topic })
      );
      const fb = normalizeSpeakingFeedback(raw);
      setCurrentFeedback(fb);
      const updated = {
        ...r,
        answers: [...r.answers, { part, question, answer, band: fb.band, feedback: fb }],
      };
      setRound(updated);
      useDayStore.getState().upsertSpeakingRound(updated);
    } catch (err) {
      setError(err?.message || "The coach couldn't get through just now — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  function retryFeedback() {
    const l = lastSubmitRef.current;
    if (l) submitAnswer(l.part, l.question, l.answer);
  }

  /* ── Flow transitions ── */
  function next() {
    stopAllSpeech();
    setCurrentFeedback(null);
    const r = roundRef.current;
    if (!r) return;

    if (stage === 'part1') {
      if (qIndex + 1 < r.part1.length) setQIndex(qIndex + 1);
      else { setStage('part2'); setQIndex(0); }
    } else if (stage === 'part2') {
      setStage('part3');
      setQIndex(0);
    } else if (stage === 'part3') {
      if (qIndex + 1 < r.part3.length) setQIndex(qIndex + 1);
      else completeRound();
    }
  }

  function completeRound() {
    const r = roundRef.current;
    if (!r) return;
    const completed = {
      ...r,
      avgBand: roundAverage(r.answers),           // §7.7 round average
      completedAt: new Date().toISOString(),
    };
    setRound(completed);
    useDayStore.getState().upsertSpeakingRound(completed);
    setStage('summary');
  }

  function continueRound() {
    stopAllSpeech();
    setCurrentFeedback(null);
    setRound(null);
    setQIndex(0);
    setError(null);
    setStage('loading');
    setGenToken((t) => t + 1);
  }

  function restartTurn() {
    setCurrentFeedback(null);
    setCueNonce((n) => n + 1);                    // remounts CueCardStage fresh
  }

  function restartAfterWindowReset() {
    useDayStore.getState().startSpeakingSession(); // re-stamp the new window
    setStage('loading');
    setGenToken((t) => t + 1);
  }

  /* ─§7.7 day band + §8.1 signals + §10.2 score. ── */
  function finishDay() {
    if (finishing) return;
    setFinishing(true);
    try {
      bankTime(true);
      const rounds = useDayStore.getState().record?.speaking?.rounds || [];
      const fin = finalizeSpeaking(rounds);
      if (!Number.isFinite(fin.band)) {
        useToastStore.getState().push(
          'No completed rounds to score yet — finish a round first.',
          'error',
        );
        return;
      }
      useDayStore.getState().setScore('speaking', { band: fin.band });

      const ps = useProfileStore.getState();
      if (ps.profile) {
        ps.update({
          weakAreaProfile: applyAccuracySignals(ps.profile, 'speaking', speakingSignals(rounds)),
        });
      }

      useToastStore.getState().push(
        `Speaking’s logged — Band ${formatBand(fin.band)} across ${fin.roundsCompleted} ${
          fin.roundsCompleted === 1 ? 'round' : 'rounds'
        }. The full review’s waiting.`,
        'success',
        7000,
      );
    } finally {
      setFinishing(false);
    }
  }

  /* Live active-time for the summary's Finish gate. */
  const getLiveSec = useCallback(() => {
    const store = useDayStore.getState().record?.speaking?.timeSpentSec || 0;
    const sw = swRef.current;
    const live = sw ? sw.elapsedSec() - bankedRef.current : 0;
    return store + Math.max(0, live);
  }, []);

  /* ── Window countdown text (training only) ── */
  let windowText = null;
  if (training && startedAt) {
    const left = 24 - hoursSince(startedAt);
    if (Number.isFinite(left)) {
      if (left <= 0) windowText = 'window closed';
      else {
        const h = Math.floor(left);
        const m = Math.max(0, Math.round((left - h) * 60));
        windowText = `${h}h ${String(m).padStart(2, '0')}m left in today’s window`;
      }
    }
  }

  /* ── Render ── */
  if (stage === 'reset') {
    return (
      <div className="stack">
        <SessionHeader phase={phase} training={training} timeSpentSec={0} windowText={null} topic={null} roundNumber={1} />
        <VoicePicker />
        <section className="panel window-reset">
          <h2 className="title-3">The 24-hour window closed</h2>
          <p className="muted" style={{ maxWidth: 460, margin: '10px auto 20px' }}>
            Today’s speaking practice started fresh — no partial credit carries past the window,
            but every lesson you logged before it still counts. Whenever you’re ready, we go
            again.
          </p>
          <button type="button" className="btn btn-primary" onClick={restartAfterWindowReset}>
            Start today’s speaking again
          </button>
        </section>
      </div>
    );
  }

  if (stage === 'loading') {
    return (
      <div className="stack">
        <SessionHeader
          phase={phase}
          training={training}
          timeSpentSec={timeSpentSec}
          windowText={windowText}
          topic={null}
          roundNumber={roundNumber}
        />
        <VoicePicker />
        {genError ? (
          <ErrorState
            title="This round didn’t come back complete"
            message={genError}
            onRetry={() => { setGenError(null); setGenToken((t) => t + 1); }}
          />
        ) : (
          <LoadingHero kind="speaking-gen" />
        )}
      </div>
    );
  }

  if (stage === 'part1' || stage === 'part3') {
    const list = stage === 'part1' ? round.part1 : round.part3;
    const q = list[qIndex];
    const nextLabel = stage === 'part1'
      ? (qIndex + 1 < list.length ? 'Next question' : 'On to your long turn')
      : (qIndex + 1 < list.length ? 'Next question' : 'See your round summary');

    return (
      <div className="stack">
        <SessionHeader
          phase={phase}
          training={training}
          timeSpentSec={timeSpentSec}
          windowText={windowText}
          topic={round.topic}
          roundNumber={roundNumber}
        />
        <VoicePicker />
        <QuestionCard
          key={`${stage}-${qIndex}`}
          part={stage === 'part1' ? 1 : 3}
          index={qIndex}
          total={list.length}
          question={q}
          mode={mode}
          micSupported={micSupported}
          onModeChange={setMode}
          busy={busy}
          feedback={currentFeedback}
          error={error}
          onRetry={retryFeedback}
          onSubmit={(text) => submitAnswer(stage === 'part1' ? 1 : 3, q, text)}
          onNext={next}
          nextLabel={nextLabel}
        />
      </div>
    );
  }

  if (stage === 'part2') {
    return (
      <div className="stack">
        <SessionHeader
          phase={phase}
          training={training}
          timeSpentSec={timeSpentSec}
          windowText={windowText}
          topic={round.topic}
          roundNumber={roundNumber}
        />
        <VoicePicker />
        <CueCardStage
          key={`cue-${cueNonce}`}
          cueCard={round.cueCard}
          mode={mode}
          micSupported={micSupported}
          onModeChange={setMode}
          busy={busy}
          feedback={currentFeedback}
          error={error}
          onRetry={retryFeedback}
          onSubmit={(text) => submitAnswer(2, round.cueCard.prompt, text)}
          onNext={next}
          nextLabel="On to Part 3"
          onRestartTurn={restartTurn}
        />
      </div>
    );
  }

  /* summary */
  return (
    <div className="stack">
      <SessionHeader
        phase={phase}
        training={training}
        timeSpentSec={timeSpentSec}
        windowText={windowText}
        topic={round.topic}
        roundNumber={roundNumber}
        clockPaused={clockPaused}
        onToggleClock={toggleClock}
      />
      <VoicePicker />
      <RoundSummary
        round={round}
        roundNumber={roundNumber}
        phase={phase}
        getLiveSec={getLiveSec}
        onContinue={continueRound}
        onFinish={finishDay}
        finishing={finishing}
      />
      <p className="pron-note">
        One honest note: pronunciation here is estimated from your transcribed speech patterns,
        not a phonetic analysis of your audio — the other three criteria are marked the way an
        examiner marks them.
      </p>
    </div>
  );
}

/* ── Slim per-module header (shared classes only) ─────────── */

function SessionHeader({ phase, training, timeSpentSec, windowText, topic, roundNumber, clockPaused, onToggleClock }) {
  return (
    <div className="module-header">
      <div>
        <p className="kicker">
          Module 4 · Speaking · {phaseLabel(phase)}{training ? '' : ' · one interview'}
        </p>
        <h1 className="display-2">{topic || 'Today’s interview'}</h1>
        <p className="small">
          {training
            ? `Round ${roundNumber} · rolling interviews until 90 minutes are logged`
            : 'One real-length interview — Parts 1, 2 and 3, just like the test'}
        </p>
      </div>
      <div className="session-controls">
        {windowText && <span className="topbar-pill gold">{windowText}</span>}
        {training && (
          <>
            <TimerToggle
              paused={clockPaused}
              onToggle={onToggleClock}
              title={clockPaused ? 'Resume practice clock' : 'Pause practice clock'}
            />
            <span
              className={clockPaused ? 'mono small paused' : 'mono small'}
              title="Active practice — time away from the tab doesn’t count"
              style={clockPaused ? { opacity: 0.7 } : undefined}
            >
              {Math.floor(timeSpentSec / 60)} / 90 min{clockPaused ? ' · paused' : ''}
            </span>
          </>
        )}
      </div>
    </div>
  );
}