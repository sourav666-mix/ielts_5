/* ============================================================
   ATLAS IELTS Academy — one passage, parchment + highlights

   §4.2: 10 vocabulary items per passage, first occurrence
   highlighted, tap → popover. Mock Exam (§2.2): disabled —
   plain text, no pop-ups, no highlight hint.
   Paragraphs are lettered A, B, C… via CSS counters on the
   .passage-lettered wrapper (MATCHING_INFORMATION references
   these letters).
   ============================================================ */

import React from 'react';
import VocabText from '../VocabText.jsx';
import '../../styles/reading.css';

export default function PassagePane({ passage, index, phase, questionRange }) {
  if (!passage) return null;
  const vocabCount = (passage.vocab || []).length;
  const isMock = phase === 'mock';

  return (
    <article className="stack-t" aria-label={`Passage ${index + 1}`}>
      <div>
        <p className="kicker">
          Passage {index + 1}{questionRange ? ` · ${questionRange}` : ''}
        </p>
        <h2 className="title-3">{passage.title}</h2>
        {!isMock && vocabCount > 0 && (
          <p className="small">
            {vocabCount} {vocabCount === 1 ? 'word is' : 'words are'} highlighted — tap one for its meaning.
          </p>
        )}
      </div>
      <div className="passage-lettered">
        <VocabText text={passage.text} vocab={passage.vocab} disabled={isMock} />
      </div>
    </article>
  );
}