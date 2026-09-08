/* ============================================================
   ATLAS IELTS Academy — VoiceOrb (voice v2 §15)

   The conversation's state is something the student should be
   able to READ at a glance, not decoration. The state list is
   deliberately expanded over v1's single "speaking" state:

     · speaking-interruptible — thin bright ring = "you can
       jump in" (the barge-in affordance, Parts 1/3)
     · speaking-protected — NO ring: Part 2's read-out is a
       protected monologue, explicitly not silently different
     · listening — driven pulse while the student holds the
       floor
     · backchannel — brief silent glow-shift on a detected
       mid-answer pause (§8 — visual ONLY, never a sound: audio
       would be transcribed by Whisper as the student's answer)
     · thinking — slow rotating gradient, deliberately calmer
       than listening
     · confirming — faint green wash: "ready for the next one?"
   ============================================================ */

import React from 'react';
import { cn } from '../../lib/utils.js';
import '../../styles/speaking.css';

const LABELS = {
  idle: 'Your coach is ready',
  'speaking-interruptible': 'Your coach is speaking — jump in any time',
  'speaking-protected': 'Your coach is speaking — listen through, this one can’t be interrupted',
  listening: 'Listening to you',
  backchannel: 'Listening to you',
  thinking: 'Your coach is thinking',
  confirming: 'Ready for the next one?',
};

export default function VoiceOrb({ state = 'idle' }) {
  const label = LABELS[state] || LABELS.idle;
  return (
    <div
      className={cn('voice-orb', `orb-${state}`)}
      role="status"
      aria-label={label}
      title={label}
    >
      <span className="orb-core" aria-hidden="true" />
      {state === 'speaking-interruptible' && (
        <span className="orb-ring" aria-hidden="true" />
      )}
    </div>
  );
}