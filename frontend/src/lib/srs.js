/* ============================================================
   ATLAS IELTS Academy — vocabulary spaced repetition (spec §8.2)

   SM-2-family scheduling, same family as Anki:
   new word → 1 day → 3 → 7 → 16 → 35 → (doubling, capped),
   and a failed recall resets the ladder. 30 words per day feed
   this deck; the "Yesterday's words" warm-up (5–8 due cards)
   opens each Reading session before the new passages.
   ============================================================ */

import { isoDate, addDays } from './utils.js';

export const SRS_INTERVALS = [1, 3, 7, 16, 35];
const MAX_INTERVAL = 120; // days — a mastered word can rest a season

const normalizeWord = (w) => String(w || '').toLowerCase().trim();

/** Build a card from a generated vocabulary item (§4.2 shape). */
export function makeCard(item, firstSeenDay) {
  return {
    word: item.word,
    definition: item.definition || '',
    example: item.example || '',
    related: item.related || '',
    firstSeenDay: firstSeenDay ?? 0,
    interval: 0,                          // 0 = never reviewed
    dueDate: addDays(isoDate(), 1),       // new word → again after 1 day
    lapses: 0,
    reviews: 0,
  };
}

function nextInterval(current) {
  if (!current || current < 1) return SRS_INTERVALS[0];
  const i = SRS_INTERVALS.indexOf(current);
  if (i === -1) return SRS_INTERVALS[0];
  if (i === SRS_INTERVALS.length - 1) return Math.min(current * 2, MAX_INTERVAL);
  return SRS_INTERVALS[i + 1];
}

/** Append new items, deduped case-insensitively by word. */
export function addWords(deck = [], items = [], firstSeenDay) {
  const existing = new Set(deck.map((c) => normalizeWord(c.word)));
  const out = [...deck];
  for (const item of items || []) {
    if (!item?.word || existing.has(normalizeWord(item.word))) continue;
    out.push(makeCard(item, firstSeenDay));
    existing.add(normalizeWord(item.word));
  }
  return out;
}

/**
 * Apply one review outcome. `remembered: false` resets the ladder
 * (next review tomorrow) and counts a lapse — the spec's "resets
 * on failure". Returns a NEW card; never mutates the deck.
 */
export function reviewCard(card, remembered) {
  const today = isoDate();
  if (remembered) {
    const interval = nextInterval(card.interval);
    return {
      ...card,
      interval,
      dueDate: addDays(today, interval),
      reviews: (card.reviews || 0) + 1,
    };
  }
  return {
    ...card,
    interval: SRS_INTERVALS[0],
    dueDate: addDays(today, 1),
    lapses: (card.lapses || 0) + 1,
  };
}

/**
 * Cards due for today's warm-up (§8.2: 5–8 words, ~2 minutes).
 * Most-overdue first, then the most-lapsed — the words that most
 * need the student's attention get it.
 */
export function dueCards(deck = [], today = isoDate(), limit = 8) {
  return (deck || [])
    .filter((c) => c.dueDate <= today)
    .sort((a, b) =>
      a.dueDate.localeCompare(b.dueDate) || (b.lapses || 0) - (a.lapses || 0))
    .slice(0, limit);
}

export function deckStats(deck = []) {
  const today = isoDate();
  const list = deck || [];
  return {
    total: list.length,
    dueToday: list.filter((c) => c.dueDate <= today).length,
    learning: list.filter((c) => (c.lapses || 0) > 0).length,
    mastered: list.filter((c) => c.interval >= SRS_INTERVALS[SRS_INTERVALS.length - 1]).length,
  };
}