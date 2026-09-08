/* ============================================================
   ATLAS IELTS Academy — exam timers

   Countdown: strict exam semantics (§2.2/§4.1) — a 60:00 Reading
   clock auto-submits at 0:00 and NEVER pauses when the tab hides.
   Internally it stores an absolute end-time, so interval
   throttling in background tabs cannot drift the clock.

   Stopwatch: tracks ACTIVE practice (the Speaking 90-minute
   rule §7.1) — this one DOES auto-pause while the tab is hidden,
   because timeSpent should mean time actually spent.
   ============================================================ */

import { formatClock } from './utils.js';

export { formatClock };

export class Countdown {
  /**
   * @param {object} [opts]
   * @param {number} opts.totalSec
   * @param {(remainingSec:number, phase:string)=>void} [opts.onTick]
   * @param {()=>void} [opts.onExpire]  fires once at 0 → the module auto-submits (§4.1)
   * @param {number} [opts.warnAt]    seconds remaining → 'warn'  (default 5 min)
   * @param {number} [opts.dangerAt]  seconds remaining → 'danger' (default 1 min)
   */
  constructor({ totalSec, onTick, onExpire, warnAt = 300, dangerAt = 60 } = {}) {
    this.total = Math.max(0, Math.floor(totalSec));
    this.remainingSec = this.total;
    this.onTick = onTick;
    this.onExpire = onExpire;
    this.warnAt = warnAt;
    this.dangerAt = dangerAt;
    this._endsAt = null;
    this._timer = null;
    this._expired = false;
    // force an honest re-tick the moment the tab becomes visible again
    this._onVisible = () => this._tick();
    document.addEventListener('visibilitychange', this._onVisible);
  }

  get running() { return this._timer !== null; }
  get phase() {
    if (this.remainingSec <= this.dangerAt) return 'danger';
    if (this.remainingSec <= this.warnAt) return 'warn';
    return '';
  }

  start() {
    if (this.running || this._expired) return;
    this._endsAt = Date.now() + this.remainingSec * 1000;
    this._timer = setInterval(() => this._tick(), 250);
    this._tick();
  }

  /** Pausing exists for resume-after-interruption flows only —
   *  never for tab visibility. Exam time is exam time (§2.2). */
  pause() {
    if (!this.running) return;
    this.remainingSec = this._remaining();
    clearInterval(this._timer);
    this._timer = null;
    this._endsAt = null;
  }

  resume() { this.start(); }
  stop() { this.pause(); }

  _remaining() {
    if (this._endsAt == null) return this.remainingSec;
    return Math.max(0, Math.round((this._endsAt - Date.now()) / 1000));
  }

  _tick() {
    if (this._endsAt == null) return;
    this.remainingSec = this._remaining();
    this.onTick?.(this.remainingSec, this.phase);
    if (this.remainingSec <= 0) this._expire();
  }

  _expire() {
    if (this._expired) return;
    this._expired = true;
    clearInterval(this._timer);
    this._timer = null;
    this.onExpire?.();
  }

  clock() { return formatClock(this.remainingSec); }

  destroy() {
    clearInterval(this._timer);
    this._timer = null;
    document.removeEventListener('visibilitychange', this._onVisible);
  }
}

export class Stopwatch {
  constructor() {
    this._accumMs = 0;
    this._startedAt = null;
    this._onVisible = () => {
      if (document.hidden) this.pause();
      else if (this._autoResume) this.start();
    };
    this._autoResume = false;
  }

  start() {
    if (this._startedAt != null) return;
    this._startedAt = Date.now();
    this._autoResume = true;
    document.addEventListener('visibilitychange', this._onVisible);
  }

  pause() {
    if (this._startedAt == null) return;
    this._accumMs += Date.now() - this._startedAt;
    this._startedAt = null;
  }

  elapsedSec() {
    const live = this._startedAt != null ? Date.now() - this._startedAt : 0;
    return Math.floor((this._accumMs + live) / 1000);
  }

  destroy() {
    this.pause();
    this._autoResume = false;
    document.removeEventListener('visibilitychange', this._onVisible);
  }
}

/* §7.3 — the Speaking 24-hour completion window. */
export function hoursSince(isoTimestamp) {
  const t = Date.parse(isoTimestamp);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 3_600_000;
}

export const within24hWindow = (isoTimestamp) => hoursSince(isoTimestamp) < 24;