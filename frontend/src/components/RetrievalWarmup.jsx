/* ============================================================
   ATLAS IELTS Academy — retrieval warm-up (spec §8.3)

   2–3 quick questions rebuilt from YESTERDAY'S missed items —
   same underlying facts, reworded by the AI — opening each day's
   Reading and Listening sessions (mounted by Batches 5–6).

   Flow: resolve the previous day (crossing the practice→mock
   boundary) → fetch that day's record → extract the missed
   questions → POST /warmup/{module} → render via the universal
   QuestionRenderer → check → continue into today's test.

   Stated decisions:
   · FAIL OPEN — any error skips the warm-up; it must never block
     a session.
   · Mock Exam phase: no warm-up (§2.2 exam conditions).
   · Warm-up answers are NOT fed into the §8.1 weak-area profile —
     retrieval practice isn't assessment, and counting it would
     double-weight old material.
   ============================================================ */

import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import QuestionRenderer, { gradeAnswer, scoreQuestions } from './QuestionRenderer.jsx';
import { Spinner } from './ui.jsx';
import { MODULE_META, previousDayRef } from '../lib/moduleMeta.js';
import { useProfileStore } from '../store/useProfileStore.js';
import '../styles/views.css';

/* Yesterday's missed items, pared to what the AI needs.
   Relies on the day-record contract: content.questions[] with
   answers{} — the same contract Batches 5–6 write. */
function extractMissed(moduleRecord) {
  const questions = moduleRecord?.content?.questions || [];
  const answers = moduleRecord?.answers || {};
  return questions
    .filter((q) => q && answers[q.id] != null && !gradeAnswer(q, answers[q.id]))
    .slice(-6)
    .map((q) => ({
      question: q.prompt,
      correctAnswer: q.answer,
      userAnswer: answers[q.id],
      explanation: q.explanation,
    }));
}

export default function RetrievalWarmup({ module, onDone }) {
  const phase = useProfileStore((s) => s.profile?.phase);
  const day = useProfileStore((s) => s.profile?.day);

  const [state, setState] = useState('loading'); // loading | ready | none
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const finishedRef = useRef(false);

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setState('none');
    onDoneRef.current?.();
  }

  useEffect(() => {
    if (!phase || !day) return undefined;
    if (phase === 'mock') { finish(); return undefined; } // exam conditions
    const prev = previousDayRef(phase, day);
    if (!prev) { finish(); return undefined; }             // Day 1 — nothing behind you

    let cancelled = false;
    (async () => {
      try {
        const prevRecord = await api.days.get(prev.phase, prev.day);
        const missed = extractMissed(prevRecord?.[module]);
        if (cancelled) return;
        if (!missed.length) { finish(); return; }          // a clean sheet yesterday
        const { questions: qs } = await api.warmup[module](missed);
        if (cancelled) return;
        if (!qs?.length) { finish(); return; }
        setQuestions(qs);
        setState('ready');
      } catch {
        if (!cancelled) finish();                          // fail open
      }
    })();
    return () => { cancelled = true; };
  }, [phase, day, module]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'none') return null;

  if (state === 'loading') {
    return (
      <div className="row" role="status">
        <Spinner />
        <span className="small">Rebuilding yesterday’s misses…</span>
      </div>
    );
  }

  const { correct, total } = scoreQuestions(questions, answers);
  const feedback = correct === total
    ? 'All correct — yesterday’s material stuck.'
    : correct === 0
      ? 'None landed this time — worth a slower read after today’s test.'
      : `${correct} of ${total} correct — yesterday’s material is mostly sticking.`;

  return (
    <section className="stack-t" aria-label="Retrieval warm-up">
      <div className="warmup-head">
        <div>
          <p className="kicker">Warm-up</p>
          <h3 className="title-3">A quick look back first</h3>
          <p className="small">Rebuilt from yesterday’s misses — same facts, new wording.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={finish}>
          Skip
        </button>
      </div>

      <div className="warmup-card stack-t">
        {questions.map((q, idx) => (
          <QuestionRenderer
            key={q.id || idx}
            question={q}
            value={answers[q.id]}
            onChange={submitted ? undefined : (v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            review={submitted ? { correct: gradeAnswer(q, answers[q.id]) } : null}
          />
        ))}

        {!submitted ? (
          <div className="warmup-check">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!Object.keys(answers).length}
              onClick={() => setSubmitted(true)}
            >
              Check answers
            </button>
          </div>
        ) : (
          <div className="warmup-check">
            <span className="small">{feedback}</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={finish}>
              Start today’s {MODULE_META[module].label}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}