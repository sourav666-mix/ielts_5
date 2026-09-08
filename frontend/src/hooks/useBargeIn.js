/* ============================================================
   ATLAS IELTS Academy — useBargeIn (voice v2 §6/§17)

   React binding for the §6 confidence+duration gate. Arm it
   whenever the coach is speaking during a BARGE-IN-ENABLED part
   (§7's PART_DUPLEX_CONFIG) — it watches the live mic the whole
   time TTS is playing, even mid-question. Cleanup is total: no
   gate, stream or AudioContext is ever left running behind us.
   ============================================================ */

import { useEffect, useRef } from 'react';
import { createBargeInGate } from '../lib/bargeIn.js';

/**
 * @param {boolean}  enabled    gate is armed while true
 * @param {()=>void} onBargeIn  fired ONCE per confident interruption
 */
export function useBargeIn({ enabled, onBargeIn }) {
  const cbRef = useRef(onBargeIn);
  cbRef.current = onBargeIn;
  const gateRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const gate = createBargeInGate({ onBargeIn: () => cbRef.current?.() });
    gateRef.current = gate;
    gate.start(); // async; permission/infra failures disable barge-in silently
    return () => {
      gateRef.current = null;
      gate.stop();
    };
  }, [enabled]);

  return gateRef;
}