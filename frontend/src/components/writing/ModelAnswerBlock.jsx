/* ============================================================
   ATLAS IELTS Academy — §6.6 model answer block (Training only)

   An on-demand Band 9 response at the correct word count, for
   comparison against the student's own attempt. Rendered inside
   .paper-raised — the design system's model-answer panel (§15.2:
   Fraunces). Mounted only when phase !== 'mock' (WritingSession
   gates it); the backend enforces the rule too.
   ============================================================ */

import React from 'react';
import { countWords } from '../../lib/utils.js';
import VocabXRayText from '../VocabXRayText.jsx';
import '../../styles/writing.css';

const splitParagraphs = (t) => String(t || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

export default function ModelAnswerBlock({ modelAnswer, busy, onGenerate, xray = false, vocab = [] }) {
  if (modelAnswer) {
    const words = countWords(modelAnswer);
    return (
      <div className="stack-t">
        <p className="kicker">A Band 9 model answer — for comparison</p>
        {xray ? (
          <VocabXRayText text={modelAnswer} vocab={vocab} bodyClass="paper paper-raised" />
        ) : (
          <div className="paper paper-raised">
            {splitParagraphs(modelAnswer).map((p, i) => <p key={i}>{p}</p>)}
          </div>
        )}
        <p className="model-note">
          <span className="model-words">{words} words</span> — the right length for this task.
          Compare it line by line with yours: the interesting question is always what it chose
          to leave out.
        </p>
      </div>
    );
  }

  return (
    <div className="row">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={onGenerate}
      >
        {busy ? 'Writing the model…' : 'Generate AI model answer'}
      </button>
      <span className="upload-hint">
        Write yours first — the model lands better with something to compare against.
      </span>
    </div>
  );
}