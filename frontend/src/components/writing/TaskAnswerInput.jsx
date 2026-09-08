/* ============================================================
   ATLAS IELTS Academy — one task's answer input (§6.4)

   Three input modes with full parity: typed text (live word
   counter against the §6.1 minimums), a photo of handwriting,
   or a PDF. Uploading REPLACES typed text (day-store semantics
   from Batch 2 — one input per task); "use typing instead"
   clears the file. Files travel to the AI untouched — reading
   handwriting and grading happen in one step.
   ============================================================ */

import React from 'react';
import { useToastStore } from '../../store/useToastStore.js';
import { cn, countWords } from '../../lib/utils.js';
import '../../styles/writing.css';

const MAX_FILE_BYTES = 10 * 1024 * 1024;   // 10 MB — generous for essay photos/PDFs

const DocIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V8h4.5L13 3.5zM8 12h8M8 16h8M8 20h5"
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
    />
  </svg>
);

const formatBytes = (n) => (n >= 1024 * 1024
  ? `${(n / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(n / 1024))} KB`);

const fileKind = (file) => (String(file?.type || '').startsWith('image/') ? 'photo' : 'PDF');

export default function TaskAnswerInput({
  taskKey,
  minWords,
  targetWords,
  text,
  file,            // { name, type, size } metadata from the day record
  onText,
  onFile,
  onClearFile,
  disabled = false,
}) {
  const words = countWords(text);

  function handleFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';                    // allow re-selecting the same file after a fix
    if (!f) return;
    const okType = String(f.type).startsWith('image/') || f.type === 'application/pdf';
    if (!okType) {
      useToastStore.getState().push('That file type won’t work — a photo or a PDF, please.', 'error');
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      useToastStore.getState().push('That file is over 10 MB — a photo or a scan of two essays should be well under.', 'error');
      return;
    }
    onFile?.(f);                            // store keeps the File out of the record (Batch 2)
  }

  const inputId = `writing-${taskKey}`;

  return (
    <div className="stack-t" aria-label={`Answer input for ${taskKey}`}>
      <label className="field-label" htmlFor={inputId}>
        Your answer — at least {minWords} words (suggested around {targetWords})
      </label>

      {file ? (
        <>
          <div className="file-chip">
            <span className="file-chip-icon"><DocIcon /></span>
            <span className="file-chip-name">{file.name}</span>
            <span className="file-chip-size">{formatBytes(file.size)} · {fileKind(file)}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClearFile}
              disabled={disabled}
            >
              Use typing instead
            </button>
          </div>
          <p className="upload-hint">
            Your {fileKind(file)} goes to the coach exactly as-is — handwriting is read and graded
            in one step. The word count comes back with your feedback.
          </p>
        </>
      ) : (
        <>
          <textarea
            id={inputId}
            className="textarea"
            value={text}
            disabled={disabled}
            placeholder="Write your answer here — it saves as you go."
            onChange={(e) => onText?.(e.target.value)}
            aria-describedby={`${inputId}-count`}
          />
          <p id={`${inputId}-count`} className={cn('word-count', words > 0 && words < minWords && 'under', words >= minWords && 'ok')}>
            {words === 0
              ? `0 words · minimum ${minWords}`
              : words < minWords
                ? `${words} of ${minWords} — under the minimum`
                : `${words} words`}
          </p>
        </>
      )}

      <div className="or-divider"><span>or</span></div>
      <div className="row">
        <label className={`btn btn-ghost btn-sm${disabled ? ' is-disabled' : ''}`}>
          Upload a photo or PDF instead
          <input
            className="file-input"
            type="file"
            accept="image/*,application/pdf"
            disabled={disabled}
            onChange={handleFile}
          />
        </label>
        {!file && (
          <span className="upload-hint">Uploading replaces typed text — pick one per task.</span>
        )}
      </div>
    </div>
  );
}