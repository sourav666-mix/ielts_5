/* ============================================================
   ATLAS IELTS Academy — toast host (mounted once in App).
   Errors announce as alerts; everything else is polite status.
   ============================================================ */

import React from 'react';
import { useToastStore } from '../store/useToastStore.js';
import { cn } from '../lib/utils.js';

export default function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (!toasts.length) return null;

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={cn('toast', t.tone !== 'info' && t.tone)}
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}