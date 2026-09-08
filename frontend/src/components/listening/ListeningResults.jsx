/* ============================================================
   ATLAS IELTS Academy — Listening results (§5.6)

   Same full-breakdown review as Reading: honest score hero →
   per-question-type accuracy table → all 40 questions explained
   (ResultsReview) → per-part transcript reveals (listening's
   own review layer) → back to the dashboard. Per-type data is
   recomputed from stored content+answers; nothing extra is
   persisted (§10.2 score stays {correct, total, band}).
   Shares .type-row / .minibar / .band-pill-lg with Reading by
   importing reading.css (CSS is global once loaded).
   ============================================================ */

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDayStore } from '../../store/useDayStore.js';
import { finalizeListening } from '../../lib/listeningFlow.js';
import { bandTone } from '../../lib/scoring.js';
import { cn, formatBand, formatDuration, pct, humanType } from '../../lib/utils.js';
import ResultsReview from '../ResultsReview.jsx';
import { TYPE_LABELS } from '../QuestionRenderer.jsx';
import TranscriptReveal from './TranscriptReveal.jsx';
import RetakePanel from '../RetakePanel.jsx';
import '../../styles/listening.css';
import '../../styles/reading.css';   // shared results classes (documented)

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
  } explained below, and the transcripts let you hear-check every miss.`;
}

export default function ListeningResults({ phase, target }) {
  const m = useDayStore((s) => s.record?.listening);
  const content = m?.content;
  const answers = m?.answers || {};
  const score = m?.score || {};

  const result = useMemo(
    () => (content ? finalizeListening(content, answers) : null),
    [content, answers],
  );

  if (!content || !result) return null;

  return (
    <div className="stack">
      <section className="panel stack-t">
        <div className="spread">
          <p className="kicker">Module 2 · Listening · complete</p>
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
          moduleLabel="Listening"
        />
      </section>

      <section className="panel stack-t">
        <p className="kicker">What you heard</p>
        <p className="small">
          The transcripts were hidden while the audio played — now they’re yours. Reading a
          missed answer against the exact line it came from is one of the fastest fixes in
          Listening.
        </p>
        {content.parts.map((p, i) => (
          <TranscriptReveal key={i} part={p} partIndex={i} />
        ))}
      </section>

      <RetakePanel
        module="listening"
        label="listening test"
        sameLabel="Practise these questions again"
        freshLabel="Try a brand-new test"
      />

      <Link to="/" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
        Back to the dashboard
      </Link>
    </div>
  );
}