/* ============================================================
   ATLAS IELTS Academy — one task's coaching feedback (§6.5)

   Per-criterion scorecards → genuine strengths → specific fixes
   (original → corrected → why) → the improved rewrite framed as
   THE STUDENT'S OWN ESSAY TIGHTENED UP (§3.3 — never "here's the
   right answer") → next steps → optionally the Band 9 model for
   comparison. The student's own submission is collapsible so
   line-by-line comparison is one tap away.
   ============================================================ */

import React, { useState } from 'react';
import { BandPill } from '../ui.jsx';
import { countWords } from '../../lib/utils.js';
import '../../styles/writing.css';

const CRITERIA_NAMES = {
  taskAchievement: 'Task Achievement',
  taskResponse: 'Task Response',
  coherenceCohesion: 'Coherence & Cohesion',
  lexicalResource: 'Lexical Resource',
  grammaticalRangeAccuracy: 'Grammatical Range & Accuracy',
};

const splitParagraphs = (t) => String(t || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

export default function TaskFeedback({
  taskKey,
  feedback,
  band,
  target,
  submittedText,
  fromFile,
  modelAnswer,
}) {
  const [showYours, setShowYours] = useState(false);
  if (!feedback) return null;

  const label = taskKey === 'task1' ? 'Task 1' : 'Task 2';
  const criteriaEntries = Object.entries(feedback.criteria || {});

  return (
    <section className="panel stack-t" aria-label={`${label} feedback`}>
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <div>
          <p className="kicker">{label} · marked</p>
          <div className="row">
            <BandPill band={band} target={target} />
            {feedback.wordCount != null && (
              <span className="mono small">{feedback.wordCount} words</span>
            )}
            {fromFile && <span className="tag">from your upload</span>}
          </div>
        </div>
        {(submittedText || fromFile) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowYours((v) => !v)}
            aria-expanded={showYours}
          >
            {showYours ? 'Hide your submission' : 'Show your submission'}
          </button>
        )}
      </div>

      {showYours && (
        submittedText ? (
          <div className="paper">
            {splitParagraphs(submittedText).map((p, i) => <p key={i}>{p}</p>)}
          </div>
        ) : (
          <p className="small">
            Your upload went straight to the coach — the marking below is based on exactly what
            it read.
          </p>
        )
      )}

      {criteriaEntries.length > 0 && (
        <div className="crit-grid">
          {criteriaEntries.map(([key, c]) => (
            <div key={key} className="crit-card">
              <div className="spread">
                <span className="crit-name">{CRITERIA_NAMES[key] || key}</span>
                <BandPill band={c.score} target={target} />
              </div>
              {c.feedback && <p className="crit-note">{c.feedback}</p>}
            </div>
          ))}
        </div>
      )}

      {feedback.strengths?.length > 0 && (
        <div className="stack-t">
          <p className="kicker">What you did well</p>
          {feedback.strengths.map((s, i) => (
            <div key={i} className="fb-block praise"><p>{s}</p></div>
          ))}
        </div>
      )}

      {feedback.errors?.length > 0 && (
        <div className="stack-t">
          <p className="kicker">Specific fixes</p>
          {feedback.errors.map((e, i) => (
            <div key={i} className="fb-block fix">
              <p className="corr-line">
                <span className="fb-original">{e.original}</span>
                <span className="corr-arrow" aria-hidden="true">→</span>
                <span className="fb-corrected">{e.corrected}</span>
              </p>
              {e.why && <p className="corr-why">{e.why}</p>}
            </div>
          ))}
        </div>
      )}

      {feedback.improvedVersion && (
        <div className="stack-t">
          <p className="kicker">Your essay, tightened up</p>
          <div className="paper paper-raised">
            {splitParagraphs(feedback.improvedVersion).map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <p className="model-note">
            Same ideas, sharper English — this is your essay, not a replacement. Compare it
            paragraph by paragraph with what you wrote.
          </p>
        </div>
      )}

      {feedback.nextSteps?.length > 0 && (
        <div className="stack-t">
          <p className="kicker">Where to go next</p>
          <div className="fb-block tip">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {feedback.nextSteps.map((s, i) => <li key={i} style={{ marginBottom: 6 }}>{s}</li>)}
            </ul>
          </div>
        </div>
      )}

      {modelAnswer && (
        <div className="stack-t">
          <p className="kicker">The Band 9 model, for comparison</p>
          <div className="paper">
            {splitParagraphs(modelAnswer).map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <p className="model-note">
            <span className="model-words">{countWords(modelAnswer)} words</span> — notice how
            much of a Band 9 answer is choosing what to leave out.
          </p>
        </div>
      )}
    </section>
  );
}