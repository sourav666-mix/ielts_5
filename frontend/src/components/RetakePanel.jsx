/* ============================================================
   ATLAS IELTS Academy — retake panel (results pages)

   "Practice more times": every module's results screen offers two
   honest ways to go again —
     · Same paper, fresh attempt — content stays; answers, score,
       clock and play-counts reset (redo exactly what you reviewed).
     · Brand-new paper — the module resets to zero and the view's
       generation effect fires again (in-flight memoisation is
       transient, so a second request genuinely regenerates; the
       avoid-topics list already holds this paper's theme, so the
       new paper gets a new one).

   Destructive by design, so both options confirm through a modal
   before useDayStore.resetModule does its work.
   ============================================================ */

import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { useDayStore } from '../store/useDayStore.js';
import { useToastStore } from '../store/useToastStore.js';

export default function RetakePanel({ module, label, sameLabel, freshLabel }) {
  const [confirming, setConfirming] = useState(null);   // null | 'same' | 'fresh'

  function retake(keepContent) {
    setConfirming(null);
    useDayStore.getState().resetModule(module, { keepContent });
    useToastStore.getState().push(
      keepContent
        ? `Same ${label}, fresh attempt — answers and score cleared, and the clock starts over.`
        : `A brand-new ${label} is on its way — the coach is writing it now.`,
      'info',
      5000,
    );
  }

  const copy = {
    same: `Your answers and score for this ${label} will be cleared and the same questions reopen with a restarted clock — the paper stays exactly as you just reviewed it.`,
    fresh: `This clears the whole ${label} for today and the coach writes a brand-new paper — new theme, new questions. The paper you just reviewed won't come back.`,
  };

  return (
    <section className="panel stack-t">
      <p className="kicker">Practice again</p>
      <p className="small">
        One result is never the whole story — run it back as many times as you like.
      </p>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={() => setConfirming('same')}>
          {sameLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setConfirming('fresh')}>
          {freshLabel}
        </button>
      </div>

      {confirming && (
        <Modal
          title={confirming === 'same' ? sameLabel : freshLabel}
          onClose={() => setConfirming(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(null)}>
                Not now
              </button>
              <button type="button" className="btn btn-primary" onClick={() => retake(confirming === 'same')}>
                Yes, go again
              </button>
            </>
          }
        >
          <p>{copy[confirming]}</p>
        </Modal>
      )}
    </section>
  );
}
