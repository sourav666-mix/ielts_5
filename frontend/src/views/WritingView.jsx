/* ============================================================
   ATLAS IELTS Academy — Writing view (replaces Batch 3 scaffold)

   Orchestration, derived entirely from the day record:
     status 'done'   → results
     content present → session
     otherwise       → generation loading → session

   Generation fires the moment a fresh day opens and is memoised
   in writingFlow — one network spend per (phase, day), idempotent
   store writes even if the student navigates away mid-flight.

   Submit: session unmounts (banking active time) → grading
   LoadingHero → normalize feedback → patch tasks + setScore
   (§6.7 band via writingDayBand) → §8.1 criteria metrics in one
   batched profile update → results.
   ============================================================ */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProfileStore, weakAreaSummary } from '../store/useProfileStore.js';
import { useDayStore } from '../store/useDayStore.js';
import { useHistoryStore } from '../store/useHistoryStore.js';
import { useToastStore } from '../store/useToastStore.js';
import WritingSession from '../components/writing/WritingSession.jsx';
import WritingResults from '../components/writing/WritingResults.jsx';
import RetakePanel from '../components/RetakePanel.jsx';
import { ErrorState, LoadingHero } from '../components/ui.jsx';
import {
  generateWritingDay, gradeWriting, requestModelAnswer, writingSignals,
} from '../lib/writingFlow.js';
import { applyAccuracySignals } from '../lib/accuracyBatch.js';
import { formatBand } from '../lib/utils.js';

function writeStores(content) {
  const ds = useDayStore.getState();
  ds.setContent('writing', content);                      // status → 'progress'
  const ps = useProfileStore.getState();
  if (content.theme) ps.addTopics('writing', [content.theme]);   // §4.1-style avoid-list
}

export default function WritingView() {
  const phase = useProfileStore((s) => s.profile?.phase);
  const day = useProfileStore((s) => s.profile?.day);
  const target = useProfileStore((s) => s.profile?.targetBand) ?? 6.5;
  const record = useDayStore((s) => s.record);

  const [genError, setGenError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState(null);
  const [modelBusy, setModelBusy] = useState(null);       // 'task1' | 'task2' | null
  const gradingRef = useRef(false);

  const m = record?.writing;
  const hasContent = Boolean(m?.content?.task1?.prompt && m?.content?.task2?.prompt);

  /* Generation options — §8.1 criteria weighting + §8.4 difficulty. */
  const genOpts = useMemo(() => {
    const p = useProfileStore.getState().profile;
    return {
      phase: p?.phase ?? 'practice',
      day: p?.day ?? 1,
      targetBand: p?.targetBand ?? 6.5,
      avoidTopics: p?.topicsUsed?.writing || [],
      weakAreas: weakAreaSummary(p, 'writing'),
      difficulty: useHistoryStore.getState().moduleDifficulty('writing', p?.targetBand ?? 6.5),
    };
  }, [phase, day]);

  /* Fire generation for a fresh day (memoised; idempotent writes). */
  useEffect(() => {
    if (hasContent) return undefined;
    let alive = true;
    setGenError(null);
    generateWritingDay(genOpts)
      .then((content) => { writeStores(content); })       // even if the student left
      .catch((err) => {
        if (alive) setGenError(err?.message || "The coach couldn’t finish today’s tasks — one more try usually sorts it.");
      });
    return () => { alive = false; };
  }, [genOpts, retryTick, hasContent]);

  /* §6.5 + §6.7 + §8.1 — grade, record, persist. One-shot. */
  async function submit() {
    if (gradingRef.current) return;
    const ds = useDayStore.getState();
    const w = ds.record?.writing;
    if (!w?.content) return;
    gradingRef.current = true;
    setGrading(true);
    setGradeError(null);
    try {
      const res = await gradeWriting({
        task1: w.content.task1,
        task2: w.content.task2,
        task1Text: w.task1?.text || '',
        task2Text: w.task2?.text || '',
        task1File: ds.getWritingFile('task1'),
        task2File: ds.getWritingFile('task2'),
      });

      /* res.task1/res.task2 ARE the normalised TaskFeedback objects
       * (gradeWriting returns { task1, task2, band }) — they land on
       * the record as `.feedback`. Storing `res.task1.feedback` here
       * wrote undefined, which left status 'done' with no feedback
       * and blanked the results screen (§6.8). */
      ds.patchWritingTask('task1', { feedback: res.task1 });
      ds.patchWritingTask('task2', { feedback: res.task2 });
      ds.setScore('writing', {
        band: res.band,
        task1Band: res.task1.band,
        task2Band: res.task2.band,
      });
      ds.saveNow();   // grading took minutes — never let a quick refresh lose it

      /* §8.1 — eight criteria signals, one batched profile update. */
      const ps = useProfileStore.getState();
      if (ps.profile) {
        ps.update({
          weakAreaProfile: applyAccuracySignals(ps.profile, 'writing', writingSignals(res.task1, res.task2)),
        });
      }

      useToastStore.getState().push(
        `Writing’s marked — Band ${formatBand(res.band)} overall (Task 1 ${formatBand(res.task1.band)}, Task 2 ${formatBand(res.task2.band)}). The full breakdown’s waiting.`,
        'success',
        7000,
      );
    } catch (err) {
      setGradeError(err?.message || "The coach couldn’t finish marking — try again in a moment. Your drafts are safe.");
    } finally {
      gradingRef.current = false;
      setGrading(false);
    }
  }

  /* §6.6 — Training-only model answer (server enforces too). */
  async function genModel(taskKey) {
    if (modelBusy) return;
    const ds = useDayStore.getState();
    const w = ds.record?.writing;
    const taskData = taskKey === 'task1' ? w?.content?.task1 : w?.content?.task2;
    if (!taskData) return;
    setModelBusy(taskKey);
    try {
      const text = await requestModelAnswer(taskKey, taskData, target);
      ds.patchWritingTask(taskKey, { modelAnswer: text });
      useToastStore.getState().push('Model answer ready — compare it against yours line by line.', 'success');
    } catch (err) {
      useToastStore.getState().push(err?.message || 'The model answer didn’t come back — try again.', 'error');
    } finally {
      setModelBusy(null);
    }
  }

  /* ── Render, derived from the record ─────────────────────── */

  const marked = Boolean(m?.task1?.feedback && m?.task2?.feedback);

  if (grading) return <LoadingHero kind="grading" />;

  if (m?.status === 'done' && marked) {
    return <WritingResults phase={phase} target={target} />;
  }

  /* Stale-record recovery: a record saved before the feedback fix
     (or after a lost save) can carry status 'done' + a score with
     NO feedback — WritingResults' guard would render a permanent
     blank page and lock the student out of every retry. Recover
     honestly: one re-grade of the saved drafts, or a clean retake. */
  if (m?.status === 'done' && !marked) {
    return (
      <div className="stack">
        <ErrorState
          title="Your marks didn’t come back clean"
          message="The score was saved without the full analysis — marking your saved drafts again usually sorts it. Or start the paper over below."
          onRetry={submit}
          retryLabel="Mark my drafts again"
        />
        <RetakePanel
          module="writing"
          label="writing paper"
          sameLabel="Rewrite these same tasks"
          freshLabel="Ask for brand-new tasks"
        />
      </div>
    );
  }

  if (genError && !hasContent) {
    return (
      <ErrorState
        title="Today’s tasks didn’t come back complete"
        message={genError}
        onRetry={() => { setGenError(null); setRetryTick((t) => t + 1); }}
      />
    );
  }

  if (!hasContent) return <LoadingHero kind="writing-gen" />;

  return (
    <div className="stack">
      {gradeError && (
        <ErrorState
          title="Marking didn’t come back clean"
          message={gradeError}
          onRetry={submit}
          retryLabel="Try marking again"
        />
      )}
      <WritingSession
        phase={phase}
        onSubmit={submit}
        onModelAnswer={genModel}
        modelBusy={modelBusy}
      />
    </div>
  );
}