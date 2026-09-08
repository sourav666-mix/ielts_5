/* ============================================================
   ATLAS IELTS Academy — day table of contents + advance (§2.3)

   The dashboard reads like a test-paper contents page (§15.3):
   hairline rows, a coloured left-edge status bar, no shadowed
   cards. A day unlocks only when ALL FOUR modules report done —
   and the advance itself is server-authoritative (§2.3 rollover
   rules live in one place, the backend).
   ============================================================ */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProfileStore } from '../store/useProfileStore.js';
import { useToastStore } from '../store/useToastStore.js';
import { cn } from '../lib/utils.js';
import {
  MODULES, MODULE_META, PHASE_LENGTH,
  joinList, moduleSubtitle, outstandingModules,
} from '../lib/moduleMeta.js';
import { BandPill } from './ui.jsx';
import '../styles/views.css';

export default function DayTOC({ record, phase, day, target }) {
  const [advancing, setAdvancing] = useState(false);

  const allDone = MODULES.every((k) => record?.[k]?.status === 'done');
  const lastPracticeDay = phase === 'practice' && day >= PHASE_LENGTH.practice;
  const lastMockDay = phase === 'mock' && day >= PHASE_LENGTH.mock;

  const buttonLabel = lastMockDay
    ? 'Complete the programme'
    : lastPracticeDay
      ? 'Begin Mock Exams'
      : `Advance to Day ${day + 1}`;

  const hint = !allDone
    ? `${joinList(outstandingModules(record))} still to finish — complete all four and tomorrow unlocks. Your progress is saved, so you can leave and come back.`
    : lastMockDay
      ? 'The final day is in the books. Close out the programme and see the whole 270-day journey.'
      : lastPracticeDay
        ? 'All four done — 150 days of Training, complete. Next: the Mock Exams. Strict clocks, no hints, one Listening play — the real rehearsal.'
        : `All four sections done — nice work today. Day ${day + 1} is ready whenever you are.`;

  async function advance() {
    setAdvancing(true);
    try {
      const p = await useProfileStore.getState().advanceDay();
      const push = useToastStore.getState().push;
      if (p.status === 'complete') {
        push('That’s 270 days, start to finish. Take a look at what you built.', 'success', 9000);
      } else if (phase === 'practice' && day >= PHASE_LENGTH.practice) {
        push('Training done — 150 days of it. The Mock Exams begin now: strict clocks, no hints, one Listening play. You’re ready for this.', 'success', 9000);
      } else {
        push(`Day ${p.day} is ready. Streak: ${p.streak}. See you tomorrow.`, 'success');
      }
    } catch (err) {
      useToastStore.getState().push(err.message, 'error');
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <section aria-label="Today’s sections">
      <div style={{ marginBottom: 'var(--sp-3)' }}>
        <p className="kicker">Today’s paper</p>
        <h2 className="title-3">Four sections, one graded day</h2>
      </div>

      <div className="toc">
        {MODULES.map((mod) => (
          <TocRow key={mod} record={record} phase={phase} mod={mod} target={target} />
        ))}
      </div>

      <div className="advance-bar">
        <span className="advance-hint">{hint}</span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!allDone || advancing}
          onClick={advance}
        >
          {advancing ? 'Moving you on…' : buttonLabel}
        </button>
      </div>
    </section>
  );
}

function TocRow({ record, phase, mod, target }) {
  const meta = MODULE_META[mod];
  const m = record?.[mod];
  const status = m?.status || 'todo';
  const sub = moduleSubtitle(record, mod)
    || (phase === 'mock' ? meta.mockDesc : meta.practiceDesc);
  const verb = status === 'done' ? 'Review' : status === 'progress' ? 'Continue' : 'Start';

  return (
    <Link to={meta.path} className="toc-row" aria-label={`${verb} ${meta.label} — ${sub}`}>
      <span className={cn('toc-edge', status)} />
      <div className="toc-body">
        <div className="toc-title">{meta.label}</div>
        <div className="toc-sub">{sub}</div>
      </div>
      <span className="toc-side">
        {status === 'done' ? (
          <BandPill band={m?.score?.band} target={target} />
        ) : (
          <span className={cn('tag', status === 'progress' && 'gold')}>
            {status === 'progress' ? 'Continue' : 'Start'}
          </span>
        )}
        <span className="toc-chevron" aria-hidden="true">›</span>
      </span>
    </Link>
  );
}