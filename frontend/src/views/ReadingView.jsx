/* ============================================================
   ATLAS IELTS Academy — Reading view (replaces Batch 3 scaffold)

   Orchestration, derived entirely from the day record:
     status 'done'                    → results (review any time)
     content present                  → session (resume-safe)
     fresh + practice + no warmupsDone→ VocabWarmup → RetrievalWarmup
     otherwise                        → generation loading → session

   Generation is fired the moment a FRESH day opens (during the
   warm-ups, not after them) and memoised in readingFlow, so the
   student rarely waits after the two-minute refresher. Store
   writes happen even if the student navigates away mid-flight —
   the content is waiting when they return.

   Additive day-record fields (documented supersets of §10.2):
     reading.warmupsDone    — skips warm-ups on return
     reading.timerStartedAt — exam-clock anchor (wall-clock honest)
   ============================================================ */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProfileStore, weakAreaSummary } from '../store/useProfileStore.js';
import { useDayStore } from '../store/useDayStore.js';
import { useHistoryStore } from '../store/useHistoryStore.js';
import { useToastStore } from '../store/useToastStore.js';
import VocabWarmup from '../components/VocabWarmup.jsx';
import RetrievalWarmup from '../components/RetrievalWarmup.jsx';
import ReadingSession from '../components/reading/ReadingSession.jsx';
import ReadingResults from '../components/reading/ReadingResults.jsx';
import { ErrorState } from '../components/ui.jsx';
import { generateReadingDay, finalizeReading, READING_SECONDS } from '../lib/readingFlow.js';
import { applyAccuracySignals } from '../lib/accuracyBatch.js';
import { formatBand } from '../lib/utils.js';

function writeStores(content) {
  const ds = useDayStore.getState();
  ds.setContent('reading', content);                     // status → 'progress'
  const ps = useProfileStore.getState();
  if (content.theme) ps.addTopics('reading', [content.theme]);         // §4.1 avoid-list
  const items = content.passages.flatMap((p) => p.vocab || []);
  if (items.length) ps.addVocabulary(items);              // §4.2/§8.2 → SRS deck
}

export default function ReadingView() {
  const phase = useProfileStore((s) => s.profile?.phase);
  const day = useProfileStore((s) => s.profile?.day);
  const target = useProfileStore((s) => s.profile?.targetBand) ?? 6.5;
  const record = useDayStore((s) => s.record);

  const [warmStep, setWarmStep] = useState('vocab');      // vocab → retrieval → done
  const [genError, setGenError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);
  const submittedRef = useRef(false);

  const m = record?.reading;
  const hasContent = Boolean(m?.content?.questions?.length);

  /* Generation options — weak-area targeting (§8.1) and adaptive
     difficulty (§8.4) snapshotted once per day. */
  const genOpts = useMemo(() => {
    const p = useProfileStore.getState().profile;
    return {
      phase: p?.phase ?? 'practice',
      day: p?.day ?? 1,
      targetBand: p?.targetBand ?? 6.5,
      avoidTopics: p?.topicsUsed?.reading || [],
      weakAreas: weakAreaSummary(p, 'reading'),
      difficulty: useHistoryStore.getState().moduleDifficulty('reading', p?.targetBand ?? 6.5),
    };
  }, [phase, day]);

  /* Fire generation for a fresh day (memoised; idempotent writes). */
  useEffect(() => {
    if (hasContent) return undefined;
    let alive = true;
    setGenError(null);
    generateReadingDay(genOpts)
      .then((content) => {
        writeStores(content);                             // even if the student left
      })
      .catch((err) => {
        // Only surface if still here; a returning student auto-retries.
        if (alive) setGenError(err?.message || "The coach couldn’t finish today’s test — one more try usually sorts it.");
      });
    return () => { alive = false; };
  }, [genOpts, retryTick, hasContent]);

  /* A retake (resetModule) flips the module off 'done' — re-arm the
     submit guard so the new attempt can actually be submitted. */
  useEffect(() => {
    if (m?.status !== 'done') submittedRef.current = false;
  }, [m?.status]);

  /* §4.5 + §8.1 + §10.2 — grade, record, persist. Idempotent. */
  function submit(auto) {
    if (submittedRef.current) return;
    const ds = useDayStore.getState();
    const mm = ds.record?.reading;
    if (!mm?.content) return;
    submittedRef.current = true;

    const result = finalizeReading(mm.content, mm.answers || {});
    const started = mm.timerStartedAt ? Date.parse(mm.timerStartedAt) : NaN;
    const timeSpentSec = Number.isFinite(started)
      ? Math.max(0, Math.min(READING_SECONDS, Math.floor((Date.now() - started) / 1000)))
      : (auto ? READING_SECONDS : 0);

    ds.patchModule('reading', { timeSpentSec });
    ds.setScore('reading', {
      correct: result.correct,
      total: result.total,
      band: result.band,
    });
    ds.saveNow();   // the result is banked even if the tab closes this second

    /* §8.1 — one batched profile update, not 40. */
    const ps = useProfileStore.getState();
    if (ps.profile) {
      ps.update({ weakAreaProfile: applyAccuracySignals(ps.profile, 'reading', result.signals) });
    }

    const push = useToastStore.getState().push;
    if (auto) {
      push('Time’s up — submitted exactly as the real test would be.', 'info', 6000);
    } else {
      push(
        `Reading’s in the books — ${result.correct}/${result.total}, Band ${formatBand(result.band)}. The full breakdown’s waiting.`,
        'success',
        6000,
      );
    }
  }

  /* ── Render, derived from the record ─────────────────────── */

  if (m?.status === 'done' && hasContent) {
    return <ReadingResults phase={phase} target={target} />;
  }

  if (genError && !hasContent) {
    return (
      <ErrorState
        title="Today’s test didn’t come back complete"
        message={genError}
        onRetry={() => { setGenError(null); setRetryTick((t) => t + 1); }}
      />
    );
  }

  if (!hasContent) {
    const skipWarmups = phase === 'mock' || m?.warmupsDone;
    if (!skipWarmups && warmStep === 'vocab') {
      return <VocabWarmup onDone={() => setWarmStep('retrieval')} />;
    }
    if (!skipWarmups && warmStep === 'retrieval') {
      return (
        <RetrievalWarmup
          module="reading"
          onDone={() => {
            useDayStore.getState().patchModule('reading', { warmupsDone: true });
            setWarmStep('done');
          }}
        />
      );
    }
    return <LoadingHero kind="reading-gen" />;
  }

  return <ReadingSession phase={phase} onSubmit={submit} />;
}

/* LoadingHero imported lazily-style at the bottom to keep the
   orchestration reads clean — a plain import would be hoisted
   anyway; kept here for readability. */
import { LoadingHero } from '../components/ui.jsx';