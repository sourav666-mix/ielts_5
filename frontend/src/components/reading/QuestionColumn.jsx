/* ============================================================
   ATLAS IELTS Academy — questions for the active passage

   Every type renders through the universal QuestionRenderer
   (Batch 3 contract). Bank provision per type:
     · MATCHING_HEADINGS     → roman-labelled heading bank
     · MATCHING_INFORMATION  → paragraph letters A–N
   The question's own bank (normalised in readingFlow) always
   wins; these are the fallback layer.
   ============================================================ */

import React from 'react';
import QuestionRenderer from '../QuestionRenderer.jsx';
import { rangeForPassage, toRoman, passageLetters } from '../../lib/readingFlow.js';
import '../../styles/reading.css';

export default function QuestionColumn({ content, passageIndex, answers, onAnswer }) {
  const questions = (content?.questions || []).filter((q) => q.passage === passageIndex);

  const headingBank = content?.headingBanks?.[passageIndex] || [];
  const headingLabels = headingBank.map((_, i) => toRoman(i + 1));
  const infoBank = passageLetters(content?.passages?.[passageIndex]?.text || '');
  const range = rangeForPassage(content, passageIndex);

  function bankFor(q) {
    if (q.bank?.length) return q.bank;
    if (q.type === 'MATCHING_HEADINGS') return headingBank;
    if (q.type === 'MATCHING_INFORMATION') return infoBank;
    return undefined;
  }

  if (!questions.length) return null;

  return (
    <section className="stack-t" aria-label={`Questions for passage ${passageIndex + 1}`}>
      <p className="kicker">Questions {range || ''}</p>
      {questions.map((q) => (
        <QuestionRenderer
          key={q.id}
          question={q}
          value={answers[q.id]}
          onChange={(v) => onAnswer(q.id, v)}
          bank={bankFor(q)}
          bankLabels={q.type === 'MATCHING_HEADINGS' ? headingLabels : undefined}
        />
      ))}
    </section>
  );
}