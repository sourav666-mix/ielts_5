/* ============================================================
   ATLAS IELTS Academy — app shell & bootstrap

   Boot sequence (exactly once per session):
     1. profileStore.bootstrap()  — guest token → profile
     2. historyStore.load()       — §10.3 trend log
     3. dayStore.load(phase, day) — §10.2 today's record
     4. checkSpeakingWindow()     — §7.3 24-hour rule

   Routing: "/" is Onboarding or Dashboard; each module route is
   gated on (a) onboarded, (b) today's record loaded — so a
   module view can always assume `record` exists.

   §15.3 motion: <main key={pathname}> remounts per navigation,
   replaying the single deliberate `.view` transition.
   ============================================================ */

import React, { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './styles/components.css';

import { useProfileStore } from './store/useProfileStore.js';
import { useDayStore } from './store/useDayStore.js';
import { useHistoryStore } from './store/useHistoryStore.js';

import TopBar from './components/TopBar';
import ToastViewport from './components/ToastViewport';
import { ErrorState, LoadingHero } from './components/ui';

import OnboardingView from './views/OnboardingView';   // Batch 4
import DashboardView from './views/DashboardView';     // Batch 4
import ReadingView from './views/ReadingView';         // Batch 5
import ListeningView from './views/ListeningView';     // Batch 6
import WritingView from './views/WritingView';         // Batch 7
import SpeakingView from './views/SpeakingView';       // Batch 8

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/* Per-route error boundary — a crash inside one module never
   takes the whole app down, and progress is already persisted
   (debounced day-store saves), so "head back and reopen" is
   honest advice, not a cop-out. */
class ViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorState
        title={`${this.props.viewName} hit a snag`}
        message="Something went wrong inside this module. Everything you finished is saved — heading back to the dashboard and re-opening usually sorts it out."
      >
        <Link to="/" className="btn btn-ghost btn-sm">Back to the dashboard</Link>
      </ErrorState>
    );
  }
}

/* Module routes require an onboarded profile and today's record. */
function ModuleGate({ children }) {
  const onboarded = useProfileStore((s) => s.profile?.onboarded);
  const loading = useDayStore((s) => s.loading);
  const record = useDayStore((s) => s.record);

  if (!onboarded) return <Navigate to="/" replace />;
  if (loading || !record) return <LoadingHero kind="route" />;
  return children;
}

const guarded = (path, viewName, View) => (
  <Route
    path={path}
    element={
      <ModuleGate>
        <ViewErrorBoundary viewName={viewName}>
          <View />
        </ViewErrorBoundary>
      </ModuleGate>
    }
  />
);

export default function App() {
  const bootstrap = useProfileStore((s) => s.bootstrap);
  const profile = useProfileStore((s) => s.profile);
  const [booted, setBooted] = useState(false);
  const { pathname } = useLocation();

  /* 1 ── bootstrap the session & profile */
  useEffect(() => {
    let alive = true;
    bootstrap().finally(() => { if (alive) setBooted(true); });
    return () => { alive = false; };
  }, [bootstrap]);

  const onboarded = profile?.onboarded;
  const phase = profile?.phase;
  const day = profile?.day;

  /* 2–4 ── history, today's record, §7.3 window. Re-runs on day
     change (e.g. after advanceDay) to pull the fresh record. */
  useEffect(() => {
    if (!booted || !onboarded) return undefined;
    useHistoryStore.getState().load();
    let cancelled = false;
    useDayStore
      .getState()
      .load(phase, day)
      .then(() => { if (!cancelled) useDayStore.getState().checkSpeakingWindow(); })
      .catch(() => { /* offline — local cache already loaded */ });
    return () => { cancelled = true; };
  }, [booted, onboarded, phase, day]);

  if (!booted) {
    return (
      <main className="app-main view">
        <LoadingHero kind="boot" title="ATLAS IELTS Academy" />
      </main>
    );
  }

  return (
    <>
      <TopBar />
      <ScrollToTop />
      <main className="app-main view" key={pathname}>
        <Routes>
          <Route
            path="/"
            element={onboarded ? <DashboardView /> : <OnboardingView />}
          />
          {guarded('/reading', 'Reading', ReadingView)}
          {guarded('/listening', 'Listening', ListeningView)}
          {guarded('/writing', 'Writing', WritingView)}
          {guarded('/speaking', 'Speaking', SpeakingView)}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ToastViewport />
    </>
  );
}