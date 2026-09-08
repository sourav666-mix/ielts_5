/* ============================================================
   ATLAS IELTS Academy — onboarding (replaces Batch 3 scaffold)

   A parchment letter from the four coaches (the design system's
   signature moment), then one honest question — the target band —
   then the programme begins. Copy follows §3: warm voice, honest
   about the daily commitment, and an explicit no-inflated-scores
   promise before a single score exists.
   ============================================================ */

import React, { useState } from 'react';
import { useProfileStore } from '../store/useProfileStore.js';
import BandPicker from '../components/BandPicker.jsx';
import '../styles/views.css';

export default function OnboardingView() {
  const [target, setTarget] = useState(6.5);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const onboard = useProfileStore((s) => s.onboard);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      await onboard({ targetBand: target });
      // profile.onboarded flips → App routes "/" to the dashboard
    } catch (err) {
      setError(err?.message || 'Something went wrong starting your programme — try again.');
      setStarting(false);
    }
  }

  return (
    <div className="stack onboard-wrap">
      <div className="paper onboard-letter">
        <p className="kicker">A letter from your four coaches</p>
        <h1 className="display-2">Welcome to ATLAS</h1>
        <p>
          Hello — and welcome. Over the next 270 days, the four of us will take you from where
          you are now to genuinely ready for the Academic IELTS test. The first 150 days are
          Training: fresh passages, new audio and new questions every single day, with
          vocabulary help and model answers while you build. The last 120 are Mock Exams —
          real exam conditions, so that on the real day, none of it feels new.
        </p>
        <p>
          Fair warning on the shape of the work: all four sections, every day — sixty minutes
          of Reading, around forty of Listening, two Writing tasks, and (in Training) rolling
          Speaking practice you keep going until ninety minutes are logged. It drops to one
          real-length interview in the Mock phase. This is a serious programme, and it works
          if you show up for it.
        </p>
        <p>
          One promise, up front: we will never inflate a score to be kind. A 6.5 here is a
          real 6.5. What you get instead of flattery is a coach’s voice — specific about what
          worked, honest about what didn’t, and on your side the whole way.
        </p>
      </div>

      <section className="panel">
        <p className="kicker">One question first</p>
        <h2 className="title-3">What band are you aiming for?</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Be honest rather than modest — the coaching gets better the truer this number is.
        </p>
        <BandPicker value={target} onChange={setTarget} />
        <div className="step-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={start}
            disabled={starting}
          >
            {starting ? 'Setting up your programme…' : 'Start Day 1'}
          </button>
          {error && <span className="step-error">{error}</span>}
        </div>
        <p className="small" style={{ marginTop: 16 }}>
          Your progress is saved as you go — leave any time and pick up exactly where you left off.
        </p>
      </section>
    </div>
  );
}