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
import VocabLens from '../VocabLens.jsx';
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
  const [xray, setXray] = useState(false);          // Vocab X-Ray mode
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

  const isMock = phase === 'mock';
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
          {!isMock && (
            <button
              type="button"
              className={cn('vx-toggle', xray && 'on')}
              onClick={() => setXray((v) => !v)}
              aria-pressed={xray}
              title="Vocab X-Ray — light up every key word and phrase with instant meanings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.5" y2="16.5" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
              {xray ? 'X-Ray ON' : 'Vocab X-Ray'}
            </button>
          )}
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
          xray={xray && !isMock}
        />
        <QuestionColumn content={content} passageIndex={tab} answers={answers} onAnswer={onAnswer} />
      </div>

      {xray && !isMock && (
        <VocabLens
          open
          items={passages[tab]?.vocab || []}
          onClose={() => setXray(false)}
          title="Reading Vocab Lens"
          subtitle={`Passage ${tab + 1} · ${((passages[tab]?.vocab) || []).length} terms detected`}
        />
      )}

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