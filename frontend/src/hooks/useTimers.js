/* ============================================================
   ATLAS IELTS Academy — React bindings for the timer classes

   useCountdown: display-throttled — the Countdown class ticks
   at 250ms for accuracy, but the hook only re-renders when the
   DISPLAYED SECOND changes, so a 40-question view doesn't
   re-render four times a second.

   useStopwatch: 1s display granularity for the Speaking
   90-minute active-practice total (§7.1). Auto-pauses while the
   tab is hidden (that behaviour lives in the class).
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { Countdown, Stopwatch, formatClock } from '../lib/timers.js';

export function useCountdown(totalSec, { autoStart = true, warnAt = 300, dangerAt = 60, onExpire } = {}) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor(totalSec)));
  const [phase, setPhase] = useState('');
  const cdRef = useRef(null);

  /* Keep the latest onExpire without recreating the timer. */
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    setRemaining(Math.max(0, Math.floor(totalSec)));
    setPhase('');
    const cd = new Countdown({
      totalSec,
      warnAt,
      dangerAt,
      onTick: (sec, ph) => {
        setRemaining((prev) => (prev === sec ? prev : sec));
        setPhase((prev) => (prev === ph ? prev : ph));
      },
      onExpire: () => onExpireRef.current?.(),
    });
    cdRef.current = cd;
    if (autoStart) cd.start();
    return () => { cd.destroy(); cdRef.current = null; };
  }, [totalSec, warnAt, dangerAt, autoStart]);

  return {
    remainingSec: remaining,
    phase,
    clock: formatClock(remaining),
    start: () => cdRef.current?.start(),
    pause: () => cdRef.current?.pause(),
    resume: () => cdRef.current?.resume(),
    stop: () => cdRef.current?.stop(),
  };
}

export function useStopwatch(autoStart = false) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(autoStart);
  const ref = useRef(null);

  /* One Stopwatch instance for the hook's lifetime. */
  useEffect(() => {
    ref.current = new Stopwatch();
    return () => { ref.current?.destroy(); ref.current = null; };
  }, []);

  /* Drive the display at 1s while running. */
  useEffect(() => {
    if (!running) { ref.current?.pause(); return undefined; }
    ref.current?.start();
    const iv = setInterval(() => setElapsed(ref.current?.elapsedSec() ?? 0), 1000);
    return () => clearInterval(iv);
  }, [running]);

  return {
    elapsedSec: elapsed,
    running,
    start: () => setRunning(true),
    pause: () => setRunning(false),
  };
}