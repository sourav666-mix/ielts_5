/* ============================================================
   ATLAS IELTS Academy — Reading results (§4.5)

   Score hero (honest, band-vs-target summary) → per-question-
   type accuracy table → full 40-question breakdown with
   explanations (ResultsReview) → optional one-tap coaching
   insight (§4.5, warm voice per §12.4) → back to dashboard.
   Per-type data is RECOMPUTED from stored content+answers —
   nothing extra is persisted (§10.2 score stays {correct,
   total, band}).
   ============================================================ */

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDayStore } from '../../store/useDayStore.js';
import { api } from '../../lib/api.js';
import { finalizeReading } from '../../lib/readingFlow.js';
import { bandTone } from '../../lib/scoring.js';
import { cn, formatBand, formatDuration, pct, humanType } from '../../lib/utils.js';
import ResultsReview from '../ResultsReview.jsx';
import { TYPE_LABELS } from '../QuestionRenderer.jsx';
import RetakePanel from '../RetakePanel.jsx';
import { ErrorState, Spinner } from '../ui.jsx';
import '../../styles/reading.css';

function summaryLine(band, target, missedCount) {
  const gap = target - band;
  if (gap <= 0) {
    return `Band ${formatBand(band)} — at or above your ${formatBand(target)} target, and the type table below shows exactly which questions earned it.`;
  }
  if (gap <= 0.5) {
    return `Band ${formatBand(band)} — half a band from your target. The type table shows where those marks are hiding.`;
  }
  return `Band ${formatBand(band)} — ${formatBand(gap)} below your ${formatBand(target)} target. ${
    missedCount === 1 ? 'One question is' : `${missedCount} questions are`
  } explained below, and the pattern in them is your fastest route forward.`;
}

export default function ReadingResults({ phase, target }) {
  const m = useDayStore((s) => s.record?.reading);
  const content = m?.content;
  const answers = m?.answers || {};
  const score = m?.score || {};

  const result = useMemo(
    () => (content ? finalizeReading(content, answers) : null),
    [content, answers],
  );

  if (!content || !result) return null;

  return (
    <div className="stack">
      <section className="panel stack-t">
        <div className="spread">
          <p className="kicker">Module 1 · Reading · complete</p>
          {phase === 'mock' && <span className="tag gold">Full exam conditions</span>}
        </div>
        <div className="row">
          <span className={cn('band-pill', 'band-pill-lg', bandTone(score.band, target))}>
            {formatBand(score.band)}
          </span>
          <span className="mono small">
            {score.correct} of {score.total} correct · {formatDuration(m.timeSpentSec || 0)} on the clock
          </span>
        </div>
        <p>{summaryLine(score.band, target, result.missed.length)}</p>
      </section>

      <section className="panel stack-t">
        <p className="kicker">By question type</p>
        {result.perType.map((t) => {
          const rate = t.total ? t.correct / t.total : 0;
          const tone = rate >= 0.75 ? 'green' : rate >= 0.5 ? 'gold' : 'red';
          return (
            <div key={t.type} className="type-row">
              <span className="type-name">{TYPE_LABELS[t.type] || humanType(t.type)}</span>
              <span className="type-count">{t.correct}/{t.total} · {pct(rate)}</span>
              <span className="minibar">
                <span className={cn('minibar-fill', tone)} style={{ width: pct(rate) }} />
              </span>
            </div>
          );
        })}
      </section>

      <section className="panel stack-t">
        <p className="kicker">Every question, explained</p>
        <ResultsReview
          questions={content.questions}
          answers={answers}
          band={score.band}
          targetBand={target}
          moduleLabel="Reading"
        />
      </section>

      <InsightPanel result={result} target={target} />

      <RetakePanel
        module="reading"
        label="reading test"
        sameLabel="Practise these questions again"
        freshLabel="Try a brand-new test"
      />

      <Link to="/" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
        Back to the dashboard
      </Link>
    </div>
  );
}

/* ── §4.5 coaching insight — optional, one tap, warm voice ── */

function InsightPanel({ result, target }) {
  const [state, setState] = useState('idle');   // idle | loading | done | error
  const [insight, setInsight] = useState('');
  const missed = result?.missed || [];

  async function fetchInsight() {
    setState('loading');
    try {
      const res = await api.reading.insight({
        targetBand: target,
        band: result.band,
        correct: result.correct,
        total: result.total,
        perType: result.perType,
        missed: missed.map(({ q, yourAnswer }) => ({
          number: q.number,
          type: q.type,
          prompt: q.prompt,
          yourAnswer: yourAnswer ?? null,
          correctAnswer: q.answer,
          explanation: q.explanation || '',
        })),
      });
      setInsight(String(res?.insight || '').trim());
      setState('done');
    } catch {
      setState('error');
    }
  }

  if (!missed.length) {
    return (
      <section className="panel stack-t">
        <p className="kicker">Coaching insight</p>
        <div className="fb-block praise">
          <p>
            A clean sheet — all {result.total} correct. Nothing to find a pattern in today; enjoy
            this one.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel stack-t">
      <p className="kicker">Coaching insight</p>

      {state === 'idle' && (
        <>
          <p className="small">
            One tap, and your coach reads across all {missed.length}{' '}
            {missed.length === 1 ? 'miss' : 'misses'} for the pattern behind them.
          </p>
          <button type="button" className="btn btn-ghost" onClick={fetchInsight}>
            Get my coach’s read on today’s misses
          </button>
        </>
      )}

      {state === 'loading' && (
        <div className="row" role="status">
          <Spinner />
          <span className="small">Reading across today’s misses…</span>
        </div>
      )}

      {state === 'error' && (
        <ErrorState
          message="The coach couldn’t get through just now — try again in a moment."
          onRetry={fetchInsight}
        />
      )}

      {state === 'done' &&
        (insight ? (
          <div className="fb-block tip insight-body">
            {insight.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <div className="fb-block tip">
            <p>
              The coach looked it over and had nothing new to add — the explanations above already
              cover today’s pattern.
            </p>
          </div>
        ))}
    </section>
  );
}