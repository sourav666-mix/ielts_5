/* ============================================================
   ATLAS IELTS Academy — manual timer pause/play toggle

   The little round ⏸/▶ button beside every session clock
   (Reading, Listening, Writing, Speaking). Shared so all four
   modules look and behave identically.
   ============================================================ */

import React from 'react';
import { cn } from '../lib/utils.js';

export default function TimerToggle({ paused, onToggle, title }) {
  return (
    <button
      type="button"
      className={cn('timer-toggle', paused && 'paused')}
      onClick={onToggle}
      aria-label={paused ? 'Resume timer' : 'Pause timer'}
      aria-pressed={paused}
      title={title || (paused ? 'Resume timer' : 'Pause timer')}
    >
      {paused ? (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
        </svg>
      )}
    </button>
  );
}
