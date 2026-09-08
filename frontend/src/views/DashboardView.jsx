/* ============================================================
   ATLAS IELTS Academy — dashboard (replaces Batch 3 scaffold)

   Composition:
     · offline note (honest, when the server can't be reached)
     · DashboardHero          — §9.5 estimate + §2.4 stats
     · phase note             — Mock conditions / home stretch
     · DayTOC                 — §2.3 four sections + advance gate
     · difficulty flags       — §8.4, surfaced honestly
     · trend panel            — §2.4 chart + §8.5 milestones
     · ProgrammeComplete      — the Day-270 state
   ============================================================ */

import React, { useMemo, useState } from 'react';
import { useProfileStore } from '../store/useProfileStore.js';
import { useDayStore } from '../store/useDayStore.js';
import { useHistoryStore } from '../store/useHistoryStore.js';
import { estimateOverall, roundBand } from '../lib/scoring.js';
import { mean, formatBand, cn } from '../lib/utils.js';
import { deckStats } from '../lib/srs.js';
import { MODULES, MODULE_META, PROGRAMME_LENGTH, PHASE_LENGTH } from '../lib/moduleMeta.js';
import DashboardHero from '../components/DashboardHero.jsx';
import DayTOC from '../components/DayTOC.jsx';
import MilestoneCallouts from '../components/MilestoneCallouts.jsx';
import TrendChart from '../components/TrendChart';
import { BandPill, LoadingHero, StatBlock } from '../components/ui.jsx';
import '../styles/views.css';

function difficultyCopy(label, d, target) {
  if (d === 'easier') {
    return `${label} has been averaging about a band below your ${formatBand(target)} target, so today’s material is slightly gentler in complexity — the questions stay honest. Closing that gap is the job, and it’s a very closable one.`;
  }
  return `${label} has been running a band or more above your ${formatBand(target)} target — today’s material steps up a notch so it keeps earning its keep. Well earned.`;
}

export default function DashboardView() {
  const profile = useProfileStore((s) => s.profile);
  const offline = useProfileStore((s) => s.offline);
  const record = useDayStore((s) => s.record);
  const dayLoading = useDayStore((s) => s.loading);
  const entries = useHistoryStore((s) => s.entries);
  const moduleDifficulty = useHistoryStore((s) => s.moduleDifficulty);

  const deck = useMemo(() => deckStats(profile?.vocabDeck || []), [profile?.vocabDeck]);

  const avg7 = useMemo(() => {
    const vals = entries.slice(-7).map((e) => e.overall).filter(Number.isFinite);
    return vals.length ? roundBand(mean(vals)) : null;
  }, [entries]);

  /* §8.4 flags — only with ≥3 days of module history, per the store. */
  const flags = useMemo(() => {
    if (!profile?.targetBand) return [];
    return MODULES
      .map((m) => ({ key: m, d: moduleDifficulty(m, profile.targetBand) }))
      .filter((f) => f.d !== 'steady');
  }, [entries, profile?.targetBand, moduleDifficulty]);

  /* Hooks above are unconditional; early returns below. */
  if (!record || dayLoading) return <LoadingHero kind="route" />;
  if (profile?.status === 'complete') {
    return <ProgrammeComplete profile={profile} entries={entries} />;
  }

  const phase = profile.phase;
  const day = profile.day;
  const target = profile.targetBand;
  const overall = estimateOverall(record);

  return (
    <div className="stack">
      {offline && (
        <div className="day-note">
          You’re offline — this is your saved progress. Generating fresh content needs a
          connection, but everything you’ve finished is right here.
        </div>
      )}

      <DashboardHero
        overall={overall}
        target={target}
        phase={phase}
        day={day}
        streak={profile.streak}
        completedDays={entries.length}
        avg7={avg7}
        dueToday={deck.dueToday}
        deckTotal={deck.total}
      />

      {phase === 'mock' ? (
        <div className="day-note">
          <strong>Mock Exam conditions:</strong> strict clocks, no vocabulary help, one
          Listening play, no model answers. This is the rehearsal — treat it like the real thing.
        </div>
      ) : day >= 144 && day < PHASE_LENGTH.practice ? (
        <div className="day-note">
          <strong>The home stretch:</strong> {PHASE_LENGTH.practice - day}{' '}
          {PHASE_LENGTH.practice - day === 1 ? 'day' : 'days'} of Training left before the Mock
          Exams begin. Worth finishing strong.
        </div>
      ) : null}

      <DayTOC record={record} phase={phase} day={day} target={target} />

      {flags.length > 0 && (
        <section className="stack-t" aria-label="Difficulty adjustments">
          <p className="kicker">Today’s difficulty, set honestly</p>
          {flags.map((f) => (
            <div key={f.key} className={cn('fb-block', f.d === 'easier' ? 'tip' : 'praise')}>
              <p>{difficultyCopy(MODULE_META[f.key].label, f.d, target)}</p>
            </div>
          ))}
        </section>
      )}

      <section className="panel stack-t">
        <div className="spread">
          <div>
            <p className="kicker">Band trend</p>
            <h2 className="title-3">The last 30 completed days</h2>
          </div>
          {avg7 != null && (
            <BandPill band={avg7} target={target} label={`7-day avg · ${formatBand(avg7)}`} />
          )}
        </div>
        <TrendChart entries={entries.slice(-30)} />
        <MilestoneCallouts profile={profile} />
      </section>
    </div>
  );
}

/* ── Day 270 — the end of the programme ────────────────────── */

function ProgrammeComplete({ profile, entries }) {
  const target = profile?.targetBand ?? 6.5;
  const last30 = entries.slice(-30);
  const overalls = last30.map((e) => e.overall).filter(Number.isFinite);
  const finalAvg = overalls.length ? roundBand(mean(overalls)) : null;
  const deck = deckStats(profile?.vocabDeck || []);

  let bestSkill = null;
  for (const m of MODULES) {
    const vals = last30.map((e) => e[m]).filter(Number.isFinite);
    if (vals.length >= 5) {
      const a = mean(vals);
      if (!bestSkill || a > bestSkill.avg) bestSkill = { m, avg: a };
    }
  }

  return (
    <div className="stack">
      <section className="panel complete-hero">
        <p className="kicker">270 days · done</p>
        <h1 className="display-1">You finished the whole thing.</h1>
        <p className="muted" style={{ maxWidth: 560, margin: '12px auto 0' }}>
          150 days of Training, 120 days of Mock Exams, four sections every one of those days.
          Whatever happens in the test room, this is a thing you did.
        </p>

        <div className="grid-auto complete-stats">
          <StatBlock value={entries.length} label="days completed" />
          <StatBlock value={finalAvg != null ? formatBand(finalAvg) : '—'} label="final 30-day average" />
          {bestSkill && (
            <StatBlock
              value={formatBand(bestSkill.avg)}
              label={`strongest · ${MODULE_META[bestSkill.m].label.toLowerCase()}`}
            />
          )}
          <StatBlock value={deck.mastered} label="words in long-term memory" />
        </div>

        {finalAvg != null && (
          <p className="muted" style={{ maxWidth: 620, margin: '0 auto' }}>
            {finalAvg >= target
              ? `Your final 30-day average is ${formatBand(finalAvg)} — at or above the ${formatBand(target)} you set on day one. That’s the number that matters.`
              : `Your final 30-day average is ${formatBand(finalAvg)} against the ${formatBand(target)} you set on day one — a real gap, plainly stated. The trend below is your evidence for how fast you close gaps: look how far behind you Day 1 already is.`}
          </p>
        )}
      </section>

      <section className="panel stack-t">
        <p className="kicker">Your last 30 days</p>
        <TrendChart entries={last30} />
      </section>
    </div>
  );
}