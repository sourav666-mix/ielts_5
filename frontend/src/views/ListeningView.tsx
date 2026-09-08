/* ============================================================
   ATLAS IELTS Academy — Listening view (replaces Batch 3
   scaffold)

   Orchestration, derived entirely from the day record:
     status 'done'           → results (review any time)
     content present + warmups done → session (resume-safe)
     fresh + practice        → RetrievalWarmup (§8.3) then session
     otherwise               → generation loading → session

   Generation fires the moment a FRESH day opens (during the
   warm-up) and is memoised in listeningFlow — one network spend
   per (phase, day). Store writes happen even if the student
   navigates away mid-flight; the content waits on return.

   Note the strict warm-up gate: in Training, the retrieval
   warm-up ALWAYS precedes the session, even if generation
   finishes first. (Reading's variant lets a fast generation
   bypass a remaining warm-up step — flagged in Batch 6's
   double-check for alignment.)

   Additive day-record fields (documented supersets of §10.2):
     listening.warmupsDone    — skips warm-up on return
     listening.timerStartedAt — exam-clock anchor (wall-clock honest)
     listening.plays          — { [partIndex]: count } play accounting
   ============================================================ */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProfileStore, weakAreaSummary } from '../store/useProfileStore.js';
import { useDayStore } from '../store/useDayStore.js';
import { useHistoryStore } from '../store/useHistoryStore.js';
import { useToastStore } from '../store/useToastStore.js';
import RetrievalWarmup from '../components/RetrievalWarmup.jsx';
import ListeningSession from '../components/listening/ListeningSession.jsx';
import ListeningResults from '../components/listening/ListeningResults.jsx';
import { ErrorState, LoadingHero } from '../components/ui.jsx';
import { generateListeningDay, finalizeListening, LISTENING_SECONDS } from '../lib/listeningFlow.js';
import { applyAccuracySignals } from '../lib/accuracyBatch.js';
import { formatBand } from '../lib/utils.js';

function writeStores(content) {
  const ds = useDayStore.getState();
  ds.setContent('listening', content);                    // status → 'progress'
  const ps = useProfileStore.getState();
  if (content.theme) ps.addTopics('listening', [content.theme]);   // §4.1-style avoid-list
}

export default function ListeningView() {
  const phase = useProfileStore((s) => s.profile?.phase);
  const day = useProfileStore((s) => s.profile?.day);
  const target = useProfileStore((s) => s.profile?.targetBand) ?? 6.5;
  const record = useDayStore((s) => s.record);

  const [genError, setGenError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);
  const submittedRef = useRef(false);

  const m = record?.listening;
  const hasContent = Boolean(m?.content?.questions?.length);

  /* Generation options — §8.1 targeting + §8.4 difficulty,
     snapshotted once per day. */
  const genOpts = useMemo(() => {
    const p = useProfileStore.getState().profile;
    return {
      phase: p?.phase ?? 'practice',
      day: p?.day ?? 1,
      targetBand: p?.targetBand ?? 6.5,
      avoidTopics: p?.topicsUsed?.listening || [],
      weakAreas: weakAreaSummary(p, 'listening'),
      difficulty: useHistoryStore.getState().moduleDifficulty('listening', p?.targetBand ?? 6.5),
    };
  }, [phase, day]);

  /* Fire generation for a fresh day (memoised; idempotent writes). */
  useEffect(() => {
    if (hasContent) return undefined;
    let alive = true;
    setGenError(null);
    generateListeningDay(genOpts)
      .then((content) => {
        writeStores(content);                             // even if the student left
      })
      .catch((err) => {
        if (alive) {
          setGenError(err?.message || "The coach couldn’t finish today’s audio — one more try usually sorts it.");
        }
      });
    return () => { alive = false; };
  }, [genOpts, retryTick, hasContent]);

  /* A retake (resetModule) flips the module off 'done' — re-arm the
     submit guard so the new attempt can actually be submitted. */
  useEffect(() => {
    if (m?.status !== 'done') submittedRef.current = false;
  }, [m?.status]);

  /* §5.6 + §8.1 + §10.2 — grade, record, persist. Idempotent. */
  function submit(auto) {
    if (submittedRef.current) return;
    const ds = useDayStore.getState();
    const mm = ds.record?.listening;
    if (!mm?.content) return;
    submittedRef.current = true;

    const result = finalizeListening(mm.content, mm.answers || {});
    const started = mm.timerStartedAt ? Date.parse(mm.timerStartedAt) : NaN;
    const timeSpentSec = Number.isFinite(started)
      ? Math.max(0, Math.min(LISTENING_SECONDS, Math.floor((Date.now() - started) / 1000)))
      : (auto ? LISTENING_SECONDS : 0);

    ds.patchModule('listening', { timeSpentSec });
    ds.setScore('listening', {
      correct: result.correct,
      total: result.total,
      band: result.band,
    });
    ds.saveNow();   // the result is banked even if the tab closes this second

    /* §8.1 — one batched profile update, not 40. */
    const ps = useProfileStore.getState();
    if (ps.profile) {
      ps.update({ weakAreaProfile: applyAccuracySignals(ps.profile, 'listening', result.signals) });
    }

    const push = useToastStore.getState().push;
    if (auto) {
      push('Time’s up — submitted exactly as the real test would be.', 'info', 6000);
    } else {
      push(
        `Listening’s in the books — ${result.correct}/${result.total}, Band ${formatBand(result.band)}. The breakdown and transcripts are waiting.`,
        'success',
        6000,
      );
    }
  }

  function finishWarmup() {
    useDayStore.getState().patchModule('listening', { warmupsDone: true });
  }

  /* ── Render, derived from the record ─────────────────────── */

  if (m?.status === 'done' && hasContent) {
    return <ListeningResults phase={phase} target={target} />;
  }

  if (genError && !hasContent) {
    return (
      <ErrorState
        title="Today’s audio didn’t come back complete"
        message={genError}
        onRetry={() => { setGenError(null); setRetryTick((t) => t + 1); }}
      />
    );
  }

  const skipWarmups = phase === 'mock' || m?.warmupsDone;   // §2.2 exam conditions

  if (!hasContent) {
    if (skipWarmups) return <LoadingHero kind="listening-gen" />;
    return <RetrievalWarmup module="listening" onDone={finishWarmup} />;
  }

  /* Content ready — Training still takes the warm-up first. */
  if (!skipWarmups) {
    return <RetrievalWarmup module="listening" onDone={finishWarmup} />;
  }

  return <ListeningSession phase={phase} onSubmit={submit} />;
}