/* ============================================================
   ATLAS IELTS Academy — slim top bar (§15.3)
   Brand → dashboard · phase/day pill · streak pill. Nothing
   heavier than that: no sidebar, no nav clutter.
   ============================================================ */

import React from 'react';
import { Link } from 'react-router-dom';
import { useProfileStore } from '../store/useProfileStore.js';
import { cn } from '../lib/utils.js';

const FlameIcon = () => (
  <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
    <path
      d="M8 1c.5 2.2-.6 3.2-1.7 4.3C5 6.6 3.8 7.8 3.8 9.8a4.2 4.2 0 0 0 8.4 0c0-1.6-.8-2.7-1.7-3.7-.2 1-.7 1.6-1.4 2 .3-1.9-.4-3.4-1.1-4.4A6 6 0 0 0 8 1z"
      fill="currentColor"
    />
  </svg>
);

export default function TopBar() {
  const profile = useProfileStore((s) => s.profile);
  const phase = profile?.phase;
  const day = profile?.day;
  const streak = profile?.streak ?? 0;
  const complete = profile?.status === 'complete';

  const phaseName = phase === 'mock' ? 'Mock Exam' : 'Training';
  const dayPill = complete
    ? 'Programme complete'
    : `${phaseName} · Day ${day}${phase === 'mock' ? ' / 120' : ' / 150'}`;

  return (
    <header className="app-topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand" aria-label="ATLAS IELTS Academy — back to your dashboard">
          <span className="brand-mark">ATLAS</span>
          <span className="brand-sub">IELTS Academy</span>
        </Link>
        <div className="topbar-meta">
          <span className={cn('topbar-pill', !complete && 'gold')}>{dayPill}</span>
          {streak > 0 && (
            <span className="topbar-pill" title="Consecutive days with all four sections completed">
              <FlameIcon />
              {streak}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}