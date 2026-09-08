/* ============================================================
   ATLAS IELTS Academy — toast notifications.
   Tones map directly onto File 10's classes:
   'info' → .toast · 'success' → .toast.success · 'error' → .toast.error
   ============================================================ */

import { create } from 'zustand';
import { uid } from '../lib/utils.js';

const MAX_VISIBLE = 4;

export const useToastStore = create((set, get) => ({
  toasts: [],

  /**
   * Warm, human copy only (§15.4) — callers pass messages that
   * read like a person, never a system code.
   * @param {string} message
   * @param {'info'|'success'|'error'} [tone]
   * @param {number} [ttl] ms before auto-dismiss (0 = sticky)
   */
  push(message, tone = 'info', ttl = 4200) {
    const id = uid();
    set((state) => ({
      toasts: [...state.toasts, { id, message, tone }].slice(-MAX_VISIBLE),
    }));
    if (ttl > 0) setTimeout(() => get().dismiss(id), ttl);
    return id;
  },

  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));