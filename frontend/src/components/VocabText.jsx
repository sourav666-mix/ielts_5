/* ============================================================
   ATLAS IELTS Academy — passage with vocabulary highlights

   Renders a parchment passage (Fraunces, §15.2) and highlights
   the FIRST occurrence of each of the passage's 10 vocabulary
   items (§4.2) — later occurrences stay plain, exactly as in a
   real reading. Tapping a highlight opens the popover with the
   word, plain-English definition, example sentence and related
   word. `disabled` (Mock Exam, §2.2) renders plain text — no
   pop-ups under exam conditions.
   ============================================================ */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/utils.js';

const escapeRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Per-paragraph segmentation. `claimed` is shared across
   paragraphs so only the very first occurrence in the WHOLE
   passage highlights. Overlapping matches resolve first-come. */
function segmentsForPara(para, vocab, claimed) {
  const found = [];
  (vocab || []).forEach((v, vi) => {
    const word = String(v?.word || '').trim();
    if (!word || claimed.has(word.toLowerCase())) return;
    const re = new RegExp(`\\b${escapeRe(word)}\\b`, 'i');
    const m = re.exec(para);
    if (m) found.push({ start: m.index, end: m.index + m[0].length, vi, word });
  });
  found.sort((a, b) => a.start - b.start);

  const segs = [];
  let cursor = 0;
  for (const f of found) {
    if (f.start < cursor) continue; // overlap — first claimant wins
    claimed.add(f.word.toLowerCase());
    if (f.start > cursor) segs.push({ text: para.slice(cursor, f.start) });
    segs.push({ text: para.slice(f.start, f.end), vi: f.vi });
    cursor = f.end;
  }
  if (cursor < para.length) segs.push({ text: para.slice(cursor) });
  return segs.length ? segs : [{ text: para }];
}

export default function VocabText({ text = '', vocab = [], disabled = false }) {
  const [open, setOpen] = useState(null);       // open vocab index
  const [pos, setPos] = useState(null);
  const containerRef = useRef(null);

  const paragraphs = useMemo(() => {
    const claimed = new Set();
    return String(text)
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .map((p) => segmentsForPara(p, vocab, claimed));
  }, [text, vocab]);

  function openFor(vi, el) {
    const container = containerRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const popW = Math.min(320, window.innerWidth - 48);
    const maxLeft = Math.max(8, cr.width - popW - 8);
    setPos({
      top: r.bottom - cr.top + 8,
      left: Math.max(8, Math.min(r.left - cr.left, maxLeft)),
    });
    setOpen(vi);
  }

  /* Close on outside click / Escape while open. */
  useEffect(() => {
    if (open == null) return undefined;
    const onDoc = (e) => {
      if (!e.target.closest?.('.popover') && !e.target.closest?.('.vocab-hl')) setOpen(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (vi, el) => (open === vi ? setOpen(null) : openFor(vi, el));
  const item = open != null ? vocab[open] : null;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div className="paper">
        {paragraphs.map((segs, pi) => (
          <p key={pi}>
            {segs.map((seg, si) =>
              seg.vi == null || disabled ? (
                <React.Fragment key={si}>{seg.text}</React.Fragment>
              ) : (
                <span
                  key={si}
                  role="button"
                  tabIndex={0}
                  className={cn('vocab-hl', open === seg.vi && 'open')}
                  onClick={(e) => { e.stopPropagation(); toggle(seg.vi, e.currentTarget); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(seg.vi, e.currentTarget);
                    }
                  }}
                >
                  {seg.text}
                </span>
              )
            )}
          </p>
        ))}
      </div>

      {item && !disabled && pos && (
        <div className="popover" style={pos} role="dialog" aria-label={`Meaning of ${item.word}`}>
          <div className="popover-word">{item.word}</div>
          {item.definition && <p className="popover-def">{item.definition}</p>}
          {item.example && <p className="popover-example">“{item.example}”</p>}
          {item.related && (
            <p className="popover-related">
              Related: <strong>{item.related}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}