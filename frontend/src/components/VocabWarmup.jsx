/* ============================================================
   ATLAS IELTS Academy — vocabulary warm-up (spec §8.2)

   "Yesterday's words": 5–8 cards due for review, ~2 minutes,
   at the start of each day's Reading session (mounted by
   ReadingView, Batch 5). Self-assessed recall drives the SM-2
   outcomes in lib/srs.js — remembered advances the ladder
   (1→3→7→16→35), a slip resets to tomorrow.

   Design decisions, stated plainly:
   · The due-card list is SNAPSHOTTED at mount — reviews mutate
     the deck, and the queue must not shift mid-session.
   · Both answer buttons are deliberately neutral (ghost style):
     honest self-assessment, no colour-biasing toward "remembered".
   · Mock Exam phase: no warm-up — exam conditions (§2.2).
   · Finishing/skipping is idempotent (StrictMode-safe).
   ============================================================ */

import React, { useEffect, useRef, useState } from 'react';
import { useProfileStore } from '../store/useProfileStore.js';
import { useToastStore } from '../store/useToastStore.js';
import { dueCards } from '../lib/srs.js';
import { todayISO, cn } from '../lib/utils.js';
import '../styles/views.css';

export default function VocabWarmup({ onDone }) {
  const phase = useProfileStore((s) => s.profile?.phase);
  const reviewVocabulary = useProfileStore((s) => s.reviewVocabulary);

  const [cards] = useState(() =>
    dueCards(useProfileStore.getState().profile?.vocabDeck || [], todayISO(), 8));

  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState([]);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const finishedRef = useRef(false);

  function finish(finalResults, silent = false) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (!silent && finalResults?.length) {
      const remembered = finalResults.filter((r) => r.remembered).length;
      const forgot = finalResults.length - remembered;
      const push = useToastStore.getState().push;
      if (!forgot) {
        push(`${remembered} of ${finalResults.length} words remembered — nicely held.`, 'success');
      } else if (forgot === 1) {
        push(`${remembered} of ${finalResults.length} remembered — the one that slipped comes back tomorrow.`, 'success');
      } else {
        push(`${remembered} of ${finalResults.length} remembered — the ${forgot} that slipped come back tomorrow.`, 'success');
      }
    }
    onDoneRef.current?.(finalResults || []);
  }

  /* Nothing due, or Mock Exam → auto-finish, once. */
  useEffect(() => {
    if (!cards.length || phase === 'mock') finish([], true);
  }, [cards.length, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cards.length || phase === 'mock') return null;

  const card = cards[i];

  function answer(remembered) {
    reviewVocabulary([{ word: card.word, remembered }]);
    const next = [...results, { word: card.word, remembered }];
    setResults(next);
    if (i + 1 >= cards.length) {
      finish(next);
    } else {
      setI(i + 1);
      setRevealed(false);
    }
  }

  return (
    <section className="stack-t" aria-label="Vocabulary warm-up">
      <div className="warmup-head">
        <div>
          <p className="kicker">Yesterday’s words</p>
          <h3 className="title-3">A two-minute refresher first</h3>
          <p className="small">
            Words you’ve met before, back for a quick check before today’s new passages.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => finish(results, true)}
        >
          Skip
        </button>
      </div>

      <div className="warmup-card stack-t">
        <div className="spread">
          <span className="mono small">{i + 1} of {cards.length}</span>
          <div className="warmup-progress" style={{ flex: 1, maxWidth: 220, marginLeft: 'auto' }}>
            {cards.map((c, idx) => (
              <span
                key={c.word}
                className={cn('warmup-dot', idx < i && 'done', idx === i && 'now')}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="small">Do you remember this one?</p>
          <div className="warmup-word">{card.word}</div>
        </div>

        {!revealed ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setRevealed(true)}
          >
            Show me the meaning
          </button>
        ) : (
          <div className="warmup-reveal stack-t">
            {card.definition && <p>{card.definition}</p>}
            {card.example && <p className="warmup-example">“{card.example}”</p>}
            {card.related && (
              <p className="small">Related: <strong>{card.related}</strong></p>
            )}
            <div className="warmup-choices">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => answer(true)}>
                I remembered it
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => answer(false)}>
                It slipped
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}