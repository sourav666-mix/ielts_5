/* ============================================================
   ATLAS IELTS Academy — progress narrative (spec §8.5)

   Plain-language milestone callouts generated from real history
   data (see useHistoryStore.milestones): "Your Matching Headings
   accuracy has gone from 40% to 75%." Nothing renders until real
   movement exists — no empty praise, no invented claims (§3.4).
   ============================================================ */

import React, { useMemo } from 'react';
import { useHistoryStore } from '../store/useHistoryStore.js';

export default function MilestoneCallouts({ profile }) {
  const milestones = useHistoryStore((s) => s.milestones);
  const items = useMemo(() => milestones(profile), [milestones, profile]);

  if (!items.length) return null;

  return (
    <div className="stack-t">
      <p className="kicker">Real movement</p>
      {items.map((text, i) => (
        <div key={i} className="fb-block tip">
          <p>{text}</p>
        </div>
      ))}
    </div>
  );
}