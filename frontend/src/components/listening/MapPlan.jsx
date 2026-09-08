/* ============================================================
   ATLAS IELTS Academy — plan / map visual (§5.3 Plan/Map
   Labelling when a Part carries mapData)

   During the test: pins show LETTERS ONLY (A, B, C…) — the
   labels are the answers, so they stay hidden until review.
   In review (revealed): pins stay letters, a legend maps each
   letter to its location name. Positions are percentages, so
   the plan scales cleanly from phone to laptop.
   ============================================================ */

import React from 'react';
import '../../styles/listening.css';

const letterAt = (i) => String.fromCharCode(65 + i);

export default function MapPlan({ mapData, revealed = false }) {
  const features = mapData?.features || [];
  if (!features.length) return null;

  const letters = mapData.letters?.length === features.length
    ? mapData.letters
    : features.map((_, i) => letterAt(i));
  const first = letters[0];
  const last = letters[letters.length - 1];

  return (
    <figure className="stack-t" style={{ margin: 0 }}>
      <div
        className="map-pane"
        role="img"
        aria-label={
          revealed
            ? `Plan with locations marked: ${features
                .map((f, i) => `${letters[i]} is ${f.label}`)
                .join(', ')}`
            : `Plan with locations ${first} to ${last} marked. Labels appear after you submit.`
        }
      >
        {features.map((f, i) => (
          <span
            key={i}
            className="map-pin"
            style={{ left: `${f.x}%`, top: `${f.y}%` }}
          >
            {letters[i]}
          </span>
        ))}
      </div>
      <figcaption className="map-caption">
        {revealed ? (
          <span className="map-legend">
            {features.map((f, i) => (
              <span key={i}>
                <b className="mono">{letters[i]}</b> — {f.label}
              </span>
            ))}
          </span>
        ) : (
          `Letters ${first}–${last} mark locations on the plan — listen for where each one is.`
        )}
      </figcaption>
    </figure>
  );
}