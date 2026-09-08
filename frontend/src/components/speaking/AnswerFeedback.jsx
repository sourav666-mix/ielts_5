/* ============================================================
   ATLAS IELTS Academy — per-answer feedback body (§7.6)

   Shown immediately after EVERY single answer, in the §3.3
   content-reactive order: reaction to WHAT was said first, then
   the band, then faults grouped grammar / sentence / meaning
   (each original → corrected → why), the fully corrected
   version, a vocabulary tip and a fluency note. The Next button
   is passed in by the card so its label fits the flow position.
   ============================================================ */

import React from 'react';
import { BandPill } from '../ui.jsx';
import { speakOnce } from '../../lib/speech.js';
import '../../styles/speaking.css';

const FAULT_GROUPS = [
  ['Grammar', 'grammarFaults'],
  ['Sentence construction', 'sentenceFaults'],
  ['Meaning & clarity', 'meaningFaults'],
];

export function paragraphs(t) { return String(t || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean); }

export default function AnswerFeedback({ feedback, nextLabel, onNext }) {
  if (!feedback) return null;
  const fb = feedback;
  const totalFaults =
    (fb.grammarFaults?.length || 0) +
    (fb.sentenceFaults?.length || 0) +
    (fb.meaningFaults?.length || 0);

  return (
    <div className="stack-t">
      {fb.reaction && <p className="reaction-line">{fb.reaction}</p>}

      <div className="row">
        <BandPill band={fb.band} />
        <span className="small mono">band for this answer</span>
      </div>

      {totalFaults === 0 && (
        <div className="fb-block praise">
          <p>
            No faults to flag in that answer — clean grammar, clear structure, meaning lands
            first time. Keep exactly this.
          </p>
        </div>
      )}

      {FAULT_GROUPS.map(([label, key]) =>
        fb[key]?.length ? (
          <div key={key} className="stack-t">
            <p className="kicker">{label}</p>
            {fb[key].map((f, i) => (
              <div key={i} className="fb-block fix">
                <p className="corr-line">
                  <span className="fb-original">{f.original}</span>
                  <span className="corr-arrow" aria-hidden="true">→</span>
                  <span className="fb-corrected">{f.corrected}</span>
                </p>
                {f.why && <p className="corr-why">{f.why}</p>}
              </div>
            ))}
          </div>
        ) : null
      )}

      {fb.correctedVersion && (
        <div className="stack-t">
          <p className="kicker">Your answer, cleaned up</p>
          <div className="paper">
            {paragraphs(fb.correctedVersion).map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
      )}

      {fb.bestAnswer && (
        <div className="stack-t">
          <p className="kicker">Best answer to this question</p>
          <div className="paper best-answer">
            {paragraphs(fb.bestAnswer).map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => speakOnce(fb.bestAnswer)}
          >
            Hear the best answer
          </button>
        </div>
      )}

      {fb.vocabularyTip && (
        <div className="fb-block tip">
          <p><strong>Worth stealing:</strong> {fb.vocabularyTip}</p>
        </div>
      )}

      {fb.fluencyNote && (
        <div className="fb-block tip">
          <p>{fb.fluencyNote}</p>
        </div>
      )}

      {onNext && (
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {nextLabel || 'Next'}
        </button>
      )}
    </div>
  );
}