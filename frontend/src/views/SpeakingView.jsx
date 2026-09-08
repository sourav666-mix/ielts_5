/* ============================================================
   ATLAS IELTS Academy — Speaking view (replaces the FINAL
   Batch-3 scaffold — with this file, every frontend view is
   real)

   Thin by design: the day record drives everything. The session
   owns the §7.3 window re-check, coarse mid-round resume, round
   generation, per-answer feedback, active-time banking and day
   completion (§7.7 + §8.1). Done days render the review.
   ============================================================ */

import React from 'react';
import { useProfileStore } from '../store/useProfileStore.js';
import { useDayStore } from '../store/useDayStore.js';
import SpeakingSession from '../components/speaking/SpeakingSession.jsx';
import SpeakingResults from '../components/speaking/SpeakingResults.jsx';

export default function SpeakingView() {
  const phase = useProfileStore((s) => s.profile?.phase);
  const target = useProfileStore((s) => s.profile?.targetBand) ?? 6.5;
  const status = useDayStore((s) => s.record?.speaking?.status);

  if (status === 'done') {
    return <SpeakingResults phase={phase} target={target} />;
  }
  return <SpeakingSession phase={phase} target={target} />;
}