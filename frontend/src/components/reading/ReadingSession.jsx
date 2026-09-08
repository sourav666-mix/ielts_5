/* ============================================================
   ATLAS IELTS Academy — Reading session (§4.6)

   Timer semantics (exam-honest, resume-safe):
     · timerStartedAt is stamped ONCE, on first session entry
     · remaining time = 3600 − wall-clock elapsed — leaving the
       page does NOT pause it, exactly like the real test
     · returning after expiry auto-submits on mount
     · 0:00 auto-submits with no confirmation (§4.1 strict)

   Layout: passage tabs → question map → split (passage |
   questions; stacks on mobile) → bottom submit with honest
   pre-submit confirmation (blanks score zero — never lost by
   accident, never silently padded).
   ============================================================ */

import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils.js';
import { phaseLabel } from '../../lib/moduleMeta.js';
import { useDayStore } from '../../store/useDayStore.js';
import { useCountdown } from '../../hooks/useTimers.js';
import { READING_SECONDS, rangeForPassage } from '../../lib/readingFlow.js';
import PassagePane from './PassagePane.jsx';
import QuestionMap from './QuestionMap.jsx';
import QuestionColumn from './QuestionColumn.jsx';
import Modal from '../Modal.jsx';
import '../../styles/reading.css';

function computeRemaining() {
  const m = useDayStore.getState().record?.reading;
  const started = m?.timerStartedAt ? Date.parse(m.timerStartedAt) : NaN;
  if (!Number.isFinite(started)) return READING_SECONDS;
  const elapsed = Math.floor((Date.now() - started) / 1000);
  return Math.max(0, Math.min(READING_SECONDS, READING_SECONDS - elapsed));
}

export default function ReadingSession({ phase, onSubmit }) {
  const content = useDayStore((s) => s.record?.reading?.content);
  const answers = useDayStore((s) => s.record?.reading?.answers) || {};
  const patchAnswer = useDayStore((s) => s.patchAnswer);

  const [tab, setTab] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [totalSec] = useState(computeRemaining);   // computed ONCE per session

  const { clock, phase: timerPhase } = useCountdown(totalSec, {
    onExpire: () => onSubmit(true),                // 0:00 → auto-submit, no dialog
  });

  /* Stamp the exam start once (idempotent under StrictMode). */
  useEffect(() => {
    const m = useDayStore.getState().record?.reading;
    if (m && !m.timerStartedAt) {
      useDayStore.getState().patchModule('reading', {
        timerStartedAt: new Date().toISOString(),
      });
    }
  }, []);

  if (!content) return null;

  const passages = content.passages || [];
  const questions = content.questions || [];
  const answeredCount = questions.filter((q) => {
    const v = answers[q.id];
    return v != null && String(v).trim() !== '';
  }).length;

  const onAnswer = (id, value) => patchAnswer('reading', id, value);

  return (
    <div className="stack">
      <div className="module-header">
        <div>
          <p className="kicker">
            Module 1 · Reading · {phaseLabel(phase)}
            {phase === 'mock' ? ' · exam conditions' : ''}
          </p>
          <h1 className="display-2">{content.theme}</h1>
          <p className="small">
            {passages.length} passages · {questions.length} questions · answers save as you go
          </p>
        </div>
        <div className="session-controls">
          <span className={cn('timer', timerPhase)} role="timer" aria-live="off">
            {clock}
          </span>
          <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
            Submit
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Passages">
        {passages.map((p, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={tab === i}
            className={cn('tab', tab === i && 'active')}
            onClick={() => setTab(i)}
          >
            Passage {i + 1}{rangeForPassage(content, i) ? ` · ${rangeForPassage(content, i)}` : ''}
          </button>
        ))}
      </div>

      <QuestionMap questions={questions} answers={answers} activePassage={tab} onSelect={setTab} />

      <div className="split">
        <PassagePane
          passage={passages[tab]}
          index={tab}
          phase={phase}
          questionRange={rangeForPassage(content, tab)}
        />
        <QuestionColumn content={content} passageIndex={tab} answers={answers} onAnswer={onAnswer} />
      </div>

      <div className="submit-row">
        <span className="small">
          Leaving doesn’t stop the clock — the timer keeps running, exactly like the real test.
        </span>
        <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
          Submit Reading Test
        </button>
      </div>

      {confirming && (
        <SubmitDialog
          answered={answeredCount}
          total={questions.length}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onSubmit(false); }}
        />
      )}
    </div>
  );
}

function SubmitDialog({ answered, total, onCancel, onConfirm }) {
  const unanswered = total - answered;
  return (
    <Modal
      title="Submit your Reading test?"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Keep working</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>Submit test</button>
        </>
      }
    >
      {unanswered === 0 ? (
        <p>All {total} answered. Once it’s in, the full breakdown and your coach’s feedback unlock.</p>
      ) : (
        <p>
          You still have <strong>{unanswered}</strong>{' '}
          {unanswered === 1 ? 'question' : 'questions'} unanswered — blanks score zero, exactly as
          in the real test. Happy to submit anyway?
        </p>
      )}
    </Modal>
  );
}