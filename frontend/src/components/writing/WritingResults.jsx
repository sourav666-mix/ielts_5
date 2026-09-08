/* ============================================================
   ATLAS IELTS Academy — Writing results (§6.8)

   Honest score hero (overall band with the real §6.7 weighting
   stated, not hidden) → the tasks for reference → each task's
   full TaskFeedback → back to the dashboard. Task bands come
   from the day record's score object, set once at grading time.
   ============================================================ */

import React from 'react';
import { Link } from 'react-router-dom';
import { useDayStore } from '../../store/useDayStore.js';
import { bandTone } from '../../lib/scoring.js';
import { cn, formatBand, formatDuration } from '../../lib/utils.js';
import Task1Visual, { TaskPrompt } from './Task1Visual.jsx';
import TaskFeedback from './TaskFeedback.jsx';
import RetakePanel from '../RetakePanel.jsx';
import { BandPill } from '../ui.jsx';
import '../../styles/writing.css';
import '../../styles/reading.css';   // shared .band-pill-lg (documented)

function summaryLine(band, target) {
  const gap = target - band;
  if (gap <= 0) {
    return `Band ${formatBand(band)} — at or above your ${formatBand(target)} target, and the criteria cards below show exactly where it came from.`;
  }
  if (gap <= 0.5) {
    return `Band ${formatBand(band)} — half a band from your target. The criteria cards below show which one is holding it back.`;
  }
  return `Band ${formatBand(band)} — ${formatBand(gap)} below your ${formatBand(target)} target. The criteria cards and specific fixes below are your fastest route to closing it.`;
}

export default function WritingResults({ phase, target }) {
  const w = useDayStore((s) => s.record?.writing);
  const content = w?.content;
  const score = w?.score || {};
  const t1 = w?.task1;
  const t2 = w?.task2;

  if (!content || !t1?.feedback || !t2?.feedback) return null;

  return (
    <div className="stack">
      <section className="panel stack-t">
        <div className="spread">
          <p className="kicker">Module 3 · Writing · complete</p>
          {phase === 'mock' && <span className="tag gold">Full exam conditions</span>}
        </div>
        <div className="row">
          <span className={cn('band-pill', 'band-pill-lg', bandTone(score.band, target))}>
            {formatBand(score.band)}
          </span>
          <span className="mono small">
            Task 1 {formatBand(score.task1Band)} · Task 2 {formatBand(score.task2Band)} ·{' '}
            {formatDuration(w.timeSpentSec || 0)} spent
          </span>
        </div>
        <p>{summaryLine(score.band, target)}</p>
        <p className="small">
          Task 1 counts one third, Task 2 two thirds — the real IELTS weighting, applied to the
          criteria-average of each task.
        </p>
      </section>

      <section className="panel stack-t">
        <p className="kicker">The tasks, for reference</p>
        <Task1Visual task1={content.task1} />
        <div>
          <p className="kicker" style={{ marginTop: 8 }}>Task 2</p>
          <TaskPrompt>{content.task2.prompt}</TaskPrompt>
        </div>
      </section>

      <TaskFeedback
        taskKey="task1"
        feedback={t1.feedback}
        band={score.task1Band}
        target={target}
        submittedText={t1.text || t1.feedback.extractedText || ''}
        fromFile={Boolean(t1.file)}
        modelAnswer={phase !== 'mock' ? t1.modelAnswer : null}
      />

      <TaskFeedback
        taskKey="task2"
        feedback={t2.feedback}
        band={score.task2Band}
        target={target}
        submittedText={t2.text || t2.feedback.extractedText || ''}
        fromFile={Boolean(t2.file)}
        modelAnswer={phase !== 'mock' ? t2.modelAnswer : null}
      />

      <RetakePanel
        module="writing"
        label="writing paper"
        sameLabel="Rewrite these same tasks"
        freshLabel="Ask for brand-new tasks"
      />

      <Link to="/" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
        Back to the dashboard
      </Link>
    </div>
  );
}