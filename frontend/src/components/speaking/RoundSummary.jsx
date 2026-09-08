/* ============================================================
   ATLAS IELTS Academy — round summary (§7.8)

   Round average + per-part bands, then the day's decision:
   Training → "Start another round" (always) / "Finish today's
   speaking" (enabled only at 90 minutes of ACTIVE practice,
   shown live) · Mock → "Complete today's interview" (single
   pass, §7.1). The hint is honest about exactly how many
   minutes remain.
   ============================================================ */

import React, { useEffect, useState } from 'react';
import { BandPill, ProgressBar } from '../ui.jsx';
import { formatBand } from '../../lib/utils.js';
import { TRAINING_TARGET_SEC } from '../../lib/speakingFlow.js';
import '../../styles/speaking.css';

export default function RoundSummary({
  round,
  roundNumber,
  phase,
  getLiveSec,      // () => seconds of active practice logged so far
  onContinue,
  onFinish,
  finishing,
}) {
  const [t, setT] = useState(() => (getLiveSec ? getLiveSec() : 0));

  useEffect(() => {
    if (!getLiveSec) return undefined;
    setT(getLiveSec());
    const iv = setInterval(() => setT(getLiveSec()), 1000);
    return () => clearInterval(iv);
  }, [getLiveSec]);

  const training = phase !== 'mock';
  const targetMet = !training || t >= TRAINING_TARGET_SEC;
  const remainingMin = Math.max(0, Math.ceil((TRAINING_TARGET_SEC - t) / 60));

  const answers = round.answers || [];
  const parts = [1, 2, 3].map((p) => {
    const bands = answers.filter((a) => a.part === p).map((a) => a.band).filter(Number.isFinite);
    const mean = bands.length ? bands.reduce((x, y) => x + y, 0) / bands.length : null;
    return { part: p, n: bands.length, band: mean != null ? Math.round(mean * 2) / 2 : null };
  });

  return (
    <section className="panel stack-t" aria-label={`Round ${roundNumber} summary`}>
      <p className="kicker">Round {roundNumber} · complete</p>
      <h2 className="title-3">{round.topic}</h2>

      <div className="row">
        <BandPill band={round.avgBand} />
        <span className="mono small">{answers.length} answers · round average</span>
      </div>

      <div className="row">
        {parts.map((p) => (
          <span key={p.part} className="tag">
            Part {p.part}{p.band != null ? ` · ${formatBand(p.band)}` : ''}
          </span>
        ))}
      </div>

      {training && (
        <div className="stack-t">
          <div className="spread">
            <span className="small">{Math.floor(t / 60)} of 90 minutes logged</span>
            {!targetMet && <span className="small">{remainingMin} min to go</span>}
          </div>
          <ProgressBar value={Math.min(t, TRAINING_TARGET_SEC)} max={TRAINING_TARGET_SEC} ariaLabel="Active speaking practice logged today" />
          {targetMet ? (
            <p className="small">
              That’s your ninety minutes of active practice — the daily target, met. You can
              finish here, or bank another round while you’re warmed up.
            </p>
          ) : (
            <p className="small">
              The daily target is 90 minutes of active practice — roughly{' '}
              {remainingMin > 15 ? 'one more round or two' : 'one more round'} to go.
            </p>
          )}
        </div>
      )}

      <div className="row">
        {training && (
          <button type="button" className="btn btn-primary" onClick={onContinue} disabled={finishing}>
            Start another round
          </button>
        )}
        <button
          type="button"
          className={training ? 'btn btn-ghost' : 'btn btn-primary'}
          disabled={(training && !targetMet) || finishing}
          onClick={onFinish}
        >
          {finishing
            ? 'Wrapping up…'
            : training
              ? 'Finish today’s speaking'
              : 'Complete today’s interview'}
        </button>
      </div>
    </section>
  );
}