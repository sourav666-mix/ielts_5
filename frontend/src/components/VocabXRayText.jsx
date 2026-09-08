/* ============================================================
   ATLAS IELTS Academy — Vocab X-Ray text renderer

   The futuristic counterpart of VocabText: when the X-Ray is
   engaged, EVERY occurrence of each vocabulary word AND phrase
   lights up with a holographic 3D treatment (staggered
   "materialise" reveal on activation). Tapping any highlight
   opens a floating glass card with the word, its simple English
   meaning, a related example sentence and a related word.

   `inline` renders without a wrapper (for use inside <p>
   contexts such as writing task prompts); the popover itself is
   portalled to <body> with fixed positioning, so it never
   clips inside scrollable parchment panes.
   ============================================================ */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils.js';
import { segmentsForXray } from '../lib/vocabXray.js';
import '../styles/vocab-xray.css';

export default function VocabXRayText({
  text = '',
  vocab = [],
  disabled = false,
  inline = false,
  bodyClass = 'paper',
}) {
  const [open, setOpen] = useState(null);   // { vi, top, left }

  const paragraphs = useMemo(() => {
    if (disabled) {
      const flat = String(text).replace(/\s*\n\s*/g, ' ').trim();
      return flat ? [[{ text: flat }]] : [];
    }
    return String(text)
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .map((p) => segmentsForXray(p, vocab));
  }, [text, vocab, disabled]);

  /* The popover is fixed-positioned, so close it on any scroll,
     resize or Escape — it would otherwise float away from its
     highlight. */
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(null);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openFor(vi, el) {
    const r = el.getBoundingClientRect();
    const popW = Math.min(340, window.innerWidth - 32);
    const left = Math.max(16, Math.min(r.left + r.width / 2 - popW / 2, window.innerWidth - popW - 16));
    const below = r.bottom + 10;
    /* Flip above when it would spill past the viewport bottom. */
    const top = below + 220 > window.innerHeight && r.top > 240
      ? Math.max(12, r.top - 10 - 220)
      : below;
    setOpen({ vi, top, left });
  }

  const toggle = (vi, el) => (open?.vi === vi ? setOpen(null) : openFor(vi, el));

  const renderSegs = (segs, pi) =>
    segs.map((seg, si) => {
      if (seg.vi == null || disabled) {
        return <React.Fragment key={si}>{seg.text}</React.Fragment>;
      }
      return (
        <span
          key={si}
          role="button"
          tabIndex={0}
          className={cn('vx-hl', open?.vi === seg.vi && 'open')}
          style={{ '--vx-i': si + pi * 3 }}
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
      );
    });

  const item = open != null ? vocab[open.vi] : null;

  if (inline) {
    return (
      <>
        {paragraphs.map((segs, pi) => (
          <React.Fragment key={pi}>
            {renderSegs(segs, pi)}
            {pi < paragraphs.length - 1 ? ' ' : ''}
          </React.Fragment>
        ))}
        {item && !disabled && <XRayPopover item={item} pos={open} />}
      </>
    );
  }

  return (
    <div className={cn('vx-root', !disabled && 'vx-scanning')}>
      <div className={bodyClass}>
        {paragraphs.map((segs, pi) => (
          <p key={pi}>{renderSegs(segs, pi)}</p>
        ))}
      </div>
      {item && !disabled && <XRayPopover item={item} pos={open} />}
    </div>
  );
}

/* Floating glass card — portalled to <body>, fixed-positioned. */
function XRayPopover({ item, pos }) {
  if (!pos) return null;
  return createPortal(
    <div
      className="vx-pop"
      style={{ top: pos.top, left: pos.left, width: 'min(340px, calc(100vw - 32px))' }}
      role="dialog"
      aria-label={`Meaning of ${item.word}`}
    >
      <div className="vx-pop-head">
        <span className="vx-pop-scan" aria-hidden="true" />
        <span className="vx-pop-word">{item.word}</span>
      </div>
      {item.definition && (
        <div className="vx-pop-block">
          <p className="vx-pop-label">Simple meaning</p>
          <p className="vx-pop-def">{item.definition}</p>
        </div>
      )}
      {item.example && (
        <div className="vx-pop-block">
          <p className="vx-pop-label">Related sentence</p>
          <p className="vx-pop-example">“{item.example}”</p>
        </div>
      )}
      {item.related && (
        <p className="vx-pop-related">
          Related: <strong>{item.related}</strong>
        </p>
      )}
    </div>,
    document.body,
  );
}
