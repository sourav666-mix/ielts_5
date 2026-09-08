/* ============================================================
   ATLAS IELTS Academy — Writing session (§6.8)

   Both tasks shown TOGETHER (Task 1's visual renders inline),
   drafts save as you go, "Submit Both Tasks for AI Analysis"
   ends the session.

   Clock: the spec gives Writing no strict auto-submitting timer
   (unlike §4.1/§5.1), so this is an advisory rehearsal clock —
   the real test's 60 minutes (20 + 40) stated plainly — while
   timeSpentSec accumulates as ACTIVE time (Stopwatch semantics:
   tab-hidden time doesn't count; navigating away banks what you
   did via the unmount cleanup, a single accounting owner).
   ============================================================ */

import React, { useEffect, useRef, useState } from 'react';
import { phaseLabel } from '../../lib/moduleMeta.js';
import { useDayStore } from '../../store/useDayStore.js';
import { Stopwatch, formatClock } from '../../lib/timers.js';
import {
  TASK1_MIN, TASK1_TARGET, TASK2_MIN, TASK2_TARGET,
  VISUAL_LABELS, ESSAY_LABELS,
} from '../../lib/writingFlow.js';
import { countWords } from '../../lib/utils.js';
import Task1Visual, { TaskPrompt } from './Task1Visual.jsx';
import TaskAnswerInput from './TaskAnswerInput.jsx';
import ModelAnswerBlock from './ModelAnswerBlock.jsx';
import Modal from '../Modal.jsx';
import '../../styles/writing.css';
import '../../styles/reading.css';   // shared .session-controls / .submit-row (documented)

const fileWord = (file) => (String(file?.type || '').startsWith('image/') ? 'photo' : 'PDF');

export default function WritingSession({ phase, onSubmit, onModelAnswer, modelBusy }) {
  const content = useDayStore((s) => s.record?.writing?.content);
  const t1 = useDayStore((s) => s.record?.writing?.task1);
  const t2 = useDayStore((s) => s.record?.writing?.task2);
  const patchWritingTask = useDayStore((s) => s.patchWritingTask);
  const setWritingFile = useDayStore((s) => s.setWritingFile);

  const [elapsed, setElapsed] = useState(0);
  const [confirming, setConfirming] = useState(false);

  /* Active-time accounting: ONE owner — this unmount cleanup.
   * Covers submit (view swaps to the grading screen → unmount),
   * navigating away mid-draft, and grading failure alike; the
   * view's submit deliberately never adds time. StrictMode's
   * probe cleanup adds ~0s and is guarded. */
  useEffect(() => {
    const sw = new Stopwatch();
    sw.start();                                  // auto-pauses on tab-hide
    const iv = setInterval(() => setElapsed(sw.elapsedSec()), 1000);
    return () => {
      clearInterval(iv);
      sw.pause();
      const sec = sw.elapsedSec();
      if (sec > 0) useDayStore.getState().addTimeSpent('writing', sec);
    };
  }, []);

  if (!content) return null;

  const isMock = phase === 'mock';
  const t1Ready = countWords(t1?.text) > 0 || Boolean(t1?.file);
  const t2Ready = countWords(t2?.text) > 0 || Boolean(t2?.file);
  const bothReady = t1Ready && t2Ready;

  const jump = (id) => {
    try { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch { /* older browsers */ }
  };

  return (
    <div className="stack">
      <div className="module-header">
        <div>
          <p className="kicker">
            Module 3 · Writing · {phaseLabel(phase)}
            {isMock ? ' · no model answers' : ''}
          </p>
          <h1 className="display-2">Today’s writing tasks</h1>
          <p className="small">
            Task 1 (at least {TASK1_MIN} words) + Task 2 (at least {TASK2_MIN} words) · drafts
            save as you go
          </p>
        </div>
        <div className="session-controls">
          <span className="session-clock" role="timer" aria-live="off">
            <b>{formatClock(elapsed)}</b> spent
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!bothReady}
            onClick={() => setConfirming(true)}
          >
            Submit
          </button>
        </div>
      </div>

      <div className="task-jump">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => jump('wt1')}>
          Jump to Task 1
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => jump('wt2')}>
          Jump to Task 2
        </button>
        <span className="upload-hint">
          No hard clock here — the real test gives 60 minutes (20 for Task 1, 40 for Task 2).
          This timer is your rehearsal.
        </span>
      </div>

      {/* ── Task 1 ─────────────────────────────────────────── */}
      <section className="panel stack-t" id="wt1">
        <div>
          <p className="kicker">Task 1 · {VISUAL_LABELS[content.task1.visualType]}</p>
          <p className="small">
            At least {TASK1_MIN} words · suggested around {TASK1_TARGET}. The visual is real
            data — read values off it rather than guessing.
          </p>
        </div>

        <Task1Visual task1={content.task1} />

        <TaskAnswerInput
          taskKey="task1"
          minWords={TASK1_MIN}
          targetWords={TASK1_TARGET}
          text={t1?.text || ''}
          file={t1?.file}
          onText={(v) => patchWritingTask('task1', { text: v })}
          onFile={(f) => setWritingFile('task1', f)}
          onClearFile={() => setWritingFile('task1', null)}
        />

        {!isMock && (
          <ModelAnswerBlock
            modelAnswer={t1?.modelAnswer}
            busy={modelBusy === 'task1'}
            onGenerate={() => onModelAnswer?.('task1')}
          />
        )}
      </section>

      {/* ── Task 2 ─────────────────────────────────────────── */}
      <section className="panel stack-t" id="wt2">
        <div>
          <p className="kicker">Task 2 · {ESSAY_LABELS[content.task2.essayType]}</p>
          <p className="small">
            At least {TASK2_MIN} words · suggested around {TASK2_TARGET}. Task 2 counts twice
            as much as Task 1 — give it the bigger share of your effort.
          </p>
        </div>

        <TaskPrompt>{content.task2.prompt}</TaskPrompt>

        <TaskAnswerInput
          taskKey="task2"
          minWords={TASK2_MIN}
          targetWords={TASK2_TARGET}
          text={t2?.text || ''}
          file={t2?.file}
          onText={(v) => patchWritingTask('task2', { text: v })}
          onFile={(f) => setWritingFile('task2', f)}
          onClearFile={() => setWritingFile('task2', null)}
        />

        {!isMock && (
          <ModelAnswerBlock
            modelAnswer={t2?.modelAnswer}
            busy={modelBusy === 'task2'}
            onGenerate={() => onModelAnswer?.('task2')}
          />
        )}
      </section>

      <div className="submit-row">
        <span className="small">
          Once it’s in, your coach marks both tasks against the four official criteria — no
          edits after that. Drafts save as you go, so leaving and coming back is safe.
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!bothReady}
          onClick={() => setConfirming(true)}
        >
          Submit Both Tasks for AI Analysis
        </button>
      </div>

      {confirming && (
        <SubmitDialog
          t1={t1}
          t2={t2}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onSubmit?.(); }}
        />
      )}
    </div>
  );
}

function SubmitDialog({ t1, t2, onCancel, onConfirm }) {
  const notes = [];
  for (const [label, task, min] of [
    ['Task 1', t1, TASK1_MIN],
    ['Task 2', t2, TASK2_MIN],
  ]) {
    if (task?.file) {
      notes.push(`${label}: your ${fileWord(task.file)} goes to the coach as-is.`);
    } else {
      const w = countWords(task?.text);
      if (w < min) {
        notes.push(`${label}: ${w} words — under the ${min} minimum, and under-length costs marks in the real test too.`);
      } else {
        notes.push(`${label}: ${w} words — comfortably over the minimum.`);
      }
    }
  }

  return (
    <Modal
      title="Submit both tasks for AI analysis?"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Keep writing</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>Submit both tasks</button>
        </>
      }
    >
      <div className="stack-t">
        {notes.map((n, i) => <p key={i}>{n}</p>)}
        <p className="small">
          Your coach reads every word, scores the four official criteria per task, and writes
          the feedback — including a tightened-up version of your own essay.
        </p>
      </div>
    </Modal>
  );
}