/* ============================================================
   ATLAS IELTS Academy — question map (40 chips)

   A gap-finder before submitting: answered questions fill
   green, and tapping any chip jumps to its passage. Lives
   between the passage tabs and the split layout.
   ============================================================ */

import React from 'react';
import { cn } from '../../lib/utils.js';
import '../../styles/reading.css';

const isAnswered = (answers, q) => {
  const v = answers[q.id];
  return v != null && String(v).trim() !== '';
};

export default function QuestionMap({ questions = [], answers = {}, activePassage, onSelect }) {
  const answeredCount = questions.filter((q) => isAnswered(answers, q)).length;

  return (
    <div className="stack-t">
      <div className="spread">
        <span className="small">{answeredCount} of {questions.length} answered</span>
        <span className="small">tap a number to jump</span>
      </div>
      <div className="qmap" role="group" aria-label="Question map">
        {questions.map((q) => (
          <button
            key={q.id}
            type="button"
            className={cn(
              'qmap-chip',
              isAnswered(answers, q) && 'answered',
              q.passage === activePassage && 'here',
            )}
            onClick={() => onSelect?.(q.passage)}
            aria-label={`Question ${q.number}, ${isAnswered(answers, q) ? 'answered' : 'unanswered'}, passage ${q.passage + 1}`}
          >
            {q.number}
          </button>
        ))}
      </div>
    </div>
  );
}