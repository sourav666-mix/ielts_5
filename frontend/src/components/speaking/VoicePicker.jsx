/* ============================================================
   ATLAS IELTS Academy — Coach voice picker (§13.5)

   Lets the student choose WHO coaches them out of the Kokoro-82M
   catalogue. The choice persists (localStorage via speech.js) and
   applies everywhere the coach speaks: Speaking questions, cue
   cards, and the Listening coach lines that don't carry a
   per-speaker voice.

   Friendly by design: a compact dropdown (grouped by accent &
   gender) + a one-tap preview so choosing is hearing, not
   guessing. Changing the voice mid-session is always safe — the
   audio cache is keyed by voice, so nothing stale plays.
   ============================================================ */

import React, { useMemo, useState } from 'react';
import {
  KOKORO_VOICES, getCoachVoice, setCoachVoice, speakOnce, stopAllSpeech,
} from '../../lib/speech.js';
import { Spinner } from '../ui.jsx';
import '../../styles/speaking.css';

const PREVIEW_LINE =
  "Hi, I'm your speaking coach. Take a breath — we'll go at your pace, " +
  'and every answer you give is worth coaching.';

export default function VoicePicker() {
  const [voice, setVoice] = useState(() => getCoachVoice());
  const [previewing, setPreviewing] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const v of KOKORO_VOICES) {
      if (!map.has(v.group)) map.set(v.group, []);
      map.get(v.group).push(v);
    }
    return [...map.entries()];
  }, []);

  const selected = KOKORO_VOICES.find((v) => v.id === voice);

  function choose(id) {
    const saved = setCoachVoice(id);
    setVoice(saved);
  }

  function preview() {
    stopAllSpeech();
    setPreviewing(true);
    speakOnce(PREVIEW_LINE, voice).finally(() => setPreviewing(false));
  }

  return (
    <section className="voice-picker panel" aria-label="Coach voice">
      <div className="voice-picker-row">
        <span className="voice-picker-icon" aria-hidden="true">🎙️</span>
        <div className="voice-picker-copy">
          <p className="kicker">Your coach&rsquo;s voice</p>
          <p className="small">
            {selected
              ? `${selected.name} — ${selected.tone}.`
              : 'Pick who coaches you today.'}{' '}
            You can change it any time.
          </p>
        </div>
        <div className="voice-picker-controls">
          <select
            className="voice-select"
            value={voice}
            aria-label="Choose your coach's voice"
            onChange={(e) => choose(e.target.value)}
          >
            {grouped.map(([group, voices]) => (
              <optgroup key={group} label={group}>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={preview}
            disabled={previewing}
            aria-label="Preview the selected voice"
          >
            {previewing ? <Spinner /> : '🔊'} {previewing ? 'Playing…' : 'Preview'}
          </button>
        </div>
      </div>
    </section>
  );
}
