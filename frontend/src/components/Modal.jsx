/* ============================================================
   ATLAS IELTS Academy — shared modal
   Uses design-system .modal-backdrop / .modal / .modal-title.
   Escape + backdrop close, body scroll-lock, focus restore.
   Consumed by Reading now; Listening/Writing/Speaking in
   Batches 6–8.
   ============================================================ */

import React, { useEffect, useRef } from 'react';

export default function Modal({ title, children, footer, onClose }) {
  const boxRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prevActive = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    boxRef.current?.focus();

    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      if (prevActive && typeof prevActive.focus === 'function') prevActive.focus();
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        // backdrop-only close (mouse-down so text selection never triggers it)
        if (e.target === e.currentTarget) onCloseRef.current?.();
      }}
    >
      <div ref={boxRef} className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <h3 className="modal-title">{title}</h3>
        <div>{children}</div>
        {footer && (
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-4)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}