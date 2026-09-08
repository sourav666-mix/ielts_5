/* ============================================================
   ATLAS IELTS Academy — questions for the active part (§5.7)

   Gating rule: questions are READABLE before the part is played
   (reading ahead is a genuine exam skill) and ANSWERABLE only
   after at least one play of that part — exactly the spec's
   "Play Part N → this part's questions become answerable".
   All types render through the universal QuestionRenderer
   (Batch 3 contract); banks for MATCHING / PLAN_MAP_LABELING
   are guaranteed by listeningFlow's normalisation.
   ============================================================ */

import React from 'react';
import QuestionRenderer from '../QuestionRenderer.jsx';
import { rangeForPart } from '../../lib/listeningFlow.js';
import '../../styles/listening.css';

export default function QuestionColumn({
  content,
  partIndex,
  answers,
  onAnswer,
  unlocked,
}) {
  const questions = (content?.questions || []).filter((q) => q.part === partIndex);
  if (!questions.length) return null;

  const part = content.parts[partIndex];
  const range = rangeForPart(content, partIndex);

  function bankFor(q) {
    if (q.bank?.length) return q.bank;
    if (q.type === 'PLAN_MAP_LABELING' && part?.mapData) return part.mapData.letters;
    return undefined;
  }

  return (
    <section className="stack-t" aria-label={`Questions for part ${partIndex + 1}`}>
      <p className="kicker">Questions {range}</p>

      {!unlocked && (
        <div className="audio-lock">
          You can read these now — answering unlocks once you play Part {partIndex + 1},
          just like glancing over the question paper before the audio starts in the real test.
        </div>
      )}

      {questions.map((q) => (
        <QuestionRenderer
          key={q.id}
          question={q}
          value={answers[q.id]}
          onChange={unlocked ? (v) => onAnswer(q.id, v) : undefined}
          disabled={!unlocked}
          bank={bankFor(q)}
        />
      ))}
    </section>
  );
}