/* ============================================================
   ATLAS IELTS Academy — results review (Reading §4.5,
   Listening §5.6)

   Renders the full question-by-question breakdown: for radio
   types the OMR options light up correct/wrong/dimmed; for
   select/text types an honest "Your answer vs Accepted" row
   (Accepted shows the slash-separated alternatives); every item
   carries its explanation. Composed by module views under their
   own score hero — this component is just the breakdown.
   ============================================================ */

import React from 'react';
import QuestionRenderer, { gradeAnswer, scoreQuestions } from './QuestionRenderer.jsx';
import { BandPill } from './ui.jsx';

export default function ResultsReview({
  questions = [],
  answers = {},
  band,
  targetBand,
  moduleLabel = 'Test',
}) {
  const { correct, total } = scoreQuestions(questions, answers);

  return (
    <section className="stack-t" aria-label={`${moduleLabel} answer review`}>
      <div className="spread" style={{ flexWrap: 'wrap', padding: '4px 0 12px' }}>
        <div className="row">
          {band != null && <BandPill band={band} target={targetBand} />}
          <span className="muted small">
            {correct} of {total} correct
          </span>
        </div>
      </div>

      {questions.map((q, i) => (
        <QuestionRenderer
          key={q.id || i}
          question={q}
          value={answers[q.id]}
          review={{ correct: gradeAnswer(q, answers[q.id]) }}
        />
      ))}
    </section>
  );
}