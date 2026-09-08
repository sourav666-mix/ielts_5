/* ============================================================
   ATLAS IELTS Academy — target band picker (onboarding)

   Options 6.0 → 9.0 per §1 ("Target band: 6.0 → 9.0+"). Hints are
   honest, plain descriptions — never pressure toward a number.
   ============================================================ */

import React from 'react';
import { cn, formatBand } from '../lib/utils.js';
import '../styles/views.css';

const OPTIONS = [
  { band: 6.0, hint: 'Competent — a solid foundation' },
  { band: 6.5, hint: 'Common course-entry requirement' },
  { band: 7.0, hint: 'Good user — many programmes ask this' },
  { band: 7.5, hint: 'Confident and precise' },
  { band: 8.0, hint: 'Very good user' },
  { band: 8.5, hint: 'Near-fluent precision' },
  { band: 9.0, hint: 'Expert user' },
];

export default function BandPicker({ value, onChange }) {
  return (
    <div className="band-options" role="radiogroup" aria-label="Target band">
      {OPTIONS.map((o) => (
        <button
          key={o.band}
          type="button"
          role="radio"
          aria-checked={value === o.band}
          className={cn('band-option', value === o.band && 'selected')}
          onClick={() => onChange?.(o.band)}
        >
          <span className="bo-band">{formatBand(o.band)}</span>
          <span className="bo-hint">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}