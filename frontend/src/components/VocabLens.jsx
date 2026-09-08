/* ============================================================
   ATLAS IELTS Academy — Vocab Lens dock

   The 3D glass side-dock that opens with the Vocab X-Ray:
   lists every detected term with its simple meaning, related
   example sentence and related word, with live filtering.
   PC: fixed right-hand holographic panel.
   Mobile: bottom sheet (media query in vocab-xray.css).
   Portalled to <body> so nothing clips it.
   ============================================================ */

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export default function VocabLens({ open, items = [], onClose, title = 'Vocab Lens', subtitle }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter(
      (i) =>
        i.word.toLowerCase().includes(t) ||
        (i.definition || '').toLowerCase().includes(t) ||
        (i.related || '').toLowerCase().includes(t),
    );
  }, [items, q]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="vx-lens-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="vx-lens" role="dialog" aria-label={title}>
        <header className="vx-lens-head">
          <div className="vx-lens-title">
            <span className="vx-lens-core" aria-hidden="true" />
            <div>
              <h3>{title}</h3>
              <p>{subtitle || `${items.length} ${items.length === 1 ? 'term' : 'terms'} detected`}</p>
            </div>
          </div>
          <button
            type="button"
            className="vx-lens-close"
            onClick={onClose}
            aria-label="Close vocabulary lens"
          >
            ×
          </button>
        </header>

        <div className="vx-lens-search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter words…"
            aria-label="Filter vocabulary"
            spellCheck={false}
          />
        </div>

        <div className="vx-lens-body">
          {filtered.length === 0 ? (
            <p className="vx-lens-empty">
              {items.length === 0
                ? 'No key vocabulary found on this page yet.'
                : 'No matching terms — try a shorter filter.'}
            </p>
          ) : (
            filtered.map((item, i) => (
              <article className="vx-card" key={`${item.word}-${i}`} style={{ '--vx-i': i }}>
                <h4 className="vx-card-word">{item.word}</h4>
                {item.definition && <p className="vx-card-def">{item.definition}</p>}
                {item.example && <p className="vx-card-ex">“{item.example}”</p>}
                {item.related && (
                  <p className="vx-card-rel">
                    Related: <strong>{item.related}</strong>
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}
