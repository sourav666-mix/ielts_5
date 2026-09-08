/* ============================================================
   ATLAS IELTS Academy — AudioPane (§5.7 listening playback)

   The play surface for one listening part. ListeningSession owns
   the SpeechPlayer; this component is a pure control surface:

     · Play   → onPlay(partIndex)   (consumes a play)
     · Pause  → onPause()
     · Resume → onResume()
     · Stop   → onStop()            (play already counted)

   Props (see ListeningSession.jsx for the wiring):
     partIndex  number  — which part this pane is for
     plays      number  — plays already consumed for this part
     maxPlays   number  — 1 in Mock, 2 in Training
     status     string  — 'playing' | 'paused' | null (other part)
     playback   object  — { lineIdx, total, speaker } | null
     onPlay/onPause/onResume/onStop  — callbacks
   ============================================================ */

import React from 'react';
import { cn } from '../../lib/utils.js';

export default function AudioPane({
  partIndex,
  plays = 0,
  maxPlays = 1,
  status = null,
  playback = null,
  onPlay,
  onPause,
  onResume,
  onStop,
}) {
  const isThisPart = status !== null;         // parent already gated on part
  const playing = status === 'playing';
  const paused = status === 'paused';
  const playsLeft = Math.max(0, maxPlays - plays);
  const exhausted = playsLeft === 0 && !isThisPart;

  const line = playback?.lineIdx;
  const total = playback?.total || 0;
  const progress = total > 0 && Number.isFinite(line) ? (line + 1) / total : 0;

  return (
    <div className={cn('audio-pane panel', playing && 'is-playing')} data-part={partIndex}>
      <div className="spread">
        <div className="row">
          <span className="audio-icon" aria-hidden="true">
            {playing ? '🔊' : paused ? '⏸' : '🎧'}
          </span>
          <div>
            <p className="kicker">Audio · Part {partIndex + 1}</p>
            <p className="small">
              {isThisPart
                ? paused
                  ? 'Paused — the clock keeps running.'
                  : `Playing… ${playback?.speaker ? `${playback.speaker} · ` : ''}${
                      total ? `line ${line + 1} of ${total}` : ''
                    }`
                : exhausted
                  ? 'No plays left for this part — answer from what you heard.'
                  : `${playsLeft} play${playsLeft === 1 ? '' : 's'} left for this part.`}
            </p>
          </div>
        </div>

        <div className="row">
          {!isThisPart && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={exhausted}
              onClick={() => onPlay(partIndex)}
            >
              {plays > 0 ? 'Use replay' : 'Play recording'}
            </button>
          )}

          {playing && (
            <>
              <button type="button" className="btn btn-ghost" onClick={onPause}>
                Pause
              </button>
              <button type="button" className="btn btn-danger" onClick={onStop}>
                Stop
              </button>
            </>
          )}

          {paused && (
            <>
              <button type="button" className="btn btn-primary" onClick={onResume}>
                Resume
              </button>
              <button type="button" className="btn btn-danger" onClick={onStop}>
                Stop
              </button>
            </>
          )}
        </div>
      </div>

      {/* Playback position — only meaningful while a line is active. */}
      <div
        className="audio-progress"
        role="progressbar"
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={total || undefined}
        aria-valuenow={total ? line + 1 : undefined}
      >
        <span className="audio-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}
