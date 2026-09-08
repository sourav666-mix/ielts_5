/* ============================================================
   ATLAS IELTS Academy — post-submit transcript reveal (§5.6)

   "What you heard": rendered ONLY after the test is submitted —
   during playback the transcript is never shown (§5.4). Speaker
   names are colour-coded per speaker (functional differentiation,
   not semantics) so multi-speaker Part 3/4 discussions read
   clearly. If the part carried a map, the labelled plan is
   revealed alongside (§5.3).
   ============================================================ */

import React, { useState } from 'react';
import { cn } from '../../lib/utils.js';
import MapPlan from './MapPlan.jsx';
import '../../styles/listening.css';

const SPEAKER_TONES = ['s0', 's1', 's2', 's3'];

export default function TranscriptReveal({ part, partIndex }) {
  const [open, setOpen] = useState(false);

  const toneOf = new Map(
    part.speakers.map((s, i) => [s.name, SPEAKER_TONES[i % SPEAKER_TONES.length]]),
  );

  return (
    <div className="stack-t">
      <div className="spread">
        <p className="kicker">Part {partIndex + 1} · {part.title}</p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? 'Hide what was said' : 'Show what was said'}
        </button>
      </div>

      {open && (
        <div className="stack-t">
          {part.mapData && <MapPlan mapData={part.mapData} revealed />}
          <div className="transcript">
            {part.lines.map((l, i) => (
              <div key={i} className="t-line">
                <span className={cn('t-speaker', toneOf.get(l.speaker) || 's0')}>{l.speaker}</span>
                <span className="t-text">{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}