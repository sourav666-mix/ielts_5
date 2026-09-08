/* ============================================================
   ATLAS IELTS Academy — universal question renderer

   ⚠ CONTRACT FILE — the question data shape defined here is
   what the backend prompt library (Batch 10) must emit and what
   the Reading (B5) & Listening (B6) views consume:

   {
     id:      "q1",                      stable key (answers map onto it)
     number:  1,                          1–40 display number
     type:    "TFNG",                     see TYPE_LABELS below
     prompt:  "…",                        question stem (may hold ____ blanks)
     options: ["True","False","Not Given"],  radio types
     optionLabels: ["A","B","C","D"],     optional letters (MC default A–D)
     bank:    ["…","…"],                  dropdown bank (matching/plan types)
     bankLabels: ["i","ii",…],            optional roman/letters for the bank
     wordLimit: "NO MORE THAN THREE WORDS",  completion types
     answer:  "True",                     graded key — free-text accepts
                                           slash-separated alternatives,
                                           matched case-insensitively (§4.3)
     explanation: "…",                    shown in review (§4.5/§5.6)
   }

   Review mode: pass review={{ correct }} — OMR options light up
   green/red/dimmed, inputs lock, explanations appear.
   ============================================================ */

import React from 'react';
import { isAnswerCorrect, normalizeAnswer, countWords, humanType, cn } from '../lib/utils.js';

export const TYPE_LABELS = {
  TFNG: 'True / False / Not Given',
  YNNG: 'Yes / No / Not Given',
  MULTIPLE_CHOICE: 'Multiple Choice',
  MATCHING_HEADINGS: 'Matching Headings',
  MATCHING_INFORMATION: 'Matching Information',
  MATCHING: 'Matching',
  PLAN_MAP_LABELING: 'Plan / Map Labelling',
  SUMMARY_COMPLETION: 'Summary Completion',
  SENTENCE_COMPLETION: 'Sentence Completion',
  TABLE_COMPLETION: 'Table Completion',
  FLOWCHART_COMPLETION: 'Flow-chart Completion',
  FORM_COMPLETION: 'Form Completion',
  NOTE_COMPLETION: 'Note Completion',
};

const RADIO_TYPES = new Set(['TFNG', 'YNNG', 'MULTIPLE_CHOICE']);
const SELECT_TYPES = new Set(['MATCHING_HEADINGS', 'MATCHING_INFORMATION', 'MATCHING', 'PLAN_MAP_LABELING']);
const TEXT_TYPES = new Set([
  'SUMMARY_COMPLETION', 'SENTENCE_COMPLETION', 'TABLE_COMPLETION',
  'FLOWCHART_COMPLETION', 'FORM_COMPLETION', 'NOTE_COMPLETION',
]);

export const isRadioType = (t) => RADIO_TYPES.has(t);
export const isSelectType = (t) => SELECT_TYPES.has(t);
export const isTextType = (t) => TEXT_TYPES.has(t);

const DEFAULT_OPTIONS = {
  TFNG: ['True', 'False', 'Not Given'],
  YNNG: ['Yes', 'No', 'Not Given'],
};

/* "NO MORE THAN THREE WORDS" → 3 (for the live over-limit hint) */
const WORD_NUMS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8 };
function parseWordLimit(str) {
  const m = /\b(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT)\b/i.exec(String(str || ''));
  return m ? WORD_NUMS[m[1].toUpperCase()] : null;
}

/* ── Grading (§4.3: case-insensitive, whitespace-trimmed,
      slash-separated alternatives, trailing punctuation forgiven) ── */

export function gradeAnswer(question, value) {
  if (value == null || String(value).trim() === '') return false;
  return isAnswerCorrect(value, question?.answer);
}

export function scoreQuestions(questions = [], answers = {}) {
  let correct = 0;
  for (const q of questions) if (gradeAnswer(q, answers[q.id])) correct += 1;
  return { correct, total: questions.length };
}

/* ── Review answer row (select & text types) ───────────────── */

function ReviewAnswers({ question, value, correct }) {
  return (
    <div className="review-answers">
      <span>
        Your answer:{' '}
        <b style={{ color: correct ? 'var(--green-bright)' : 'var(--red-bright)' }}>
          {value ? String(value) : '—'}
        </b>
      </span>
      <span>
        Accepted: <b style={{ color: 'var(--green-bright)' }}>{question.answer}</b>
      </span>
    </div>
  );
}

/* ── The renderer ──────────────────────────────────────────── */

export default function QuestionRenderer({
  question,
  value,
  onChange,
  disabled = false,
  review = null,          // { correct: boolean } — presence = review mode
  bank: propBank,         // shared bank fallback (e.g. one heading list per passage)
  bankLabels: propBankLabels,
}) {
  if (!question) return null;

  const t = question.type || 'SENTENCE_COMPLETION';
  const locked = disabled || Boolean(review);

  return (
    <div className="question-block">
      <div className="q-head">
        {question.number != null && <span className="q-num">Q{question.number}</span>}
        <span className="tag">{TYPE_LABELS[t] || humanType(t)}</span>
      </div>

      {question.prompt ? <p className="q-prompt">{question.prompt}</p> : null}

      {isRadioType(t) && (
        <RadioBody question={question} value={value} onChange={onChange} locked={locked} review={review} />
      )}
      {isSelectType(t) && (
        <SelectBody
          question={question}
          value={value}
          onChange={onChange}
          locked={locked}
          review={review}
          propBank={propBank}
          propBankLabels={propBankLabels}
        />
      )}
      {isTextType(t) && (
        <TextBody question={question} value={value} onChange={onChange} locked={locked} review={review} />
      )}

      {review && question.explanation && (
        <div className="review-explain">{question.explanation}</div>
      )}
    </div>
  );
}

/* Radio — the "OMR bubble" options (§15.3) */
function RadioBody({ question, value, onChange, locked, review }) {
  const t = question.type;
  const options = question.options?.length ? question.options : DEFAULT_OPTIONS[t] || [];
  const letters =
    question.optionLabels || (t === 'MULTIPLE_CHOICE' ? ['A', 'B', 'C', 'D'] : null);
  const correctNorm = normalizeAnswer(question.answer);

  const optionClass = (opt, selected) => {
    if (review) {
      if (review.correct && selected) return 'correct';
      if (!review.correct && selected) return 'wrong';
      if (normalizeAnswer(opt) === correctNorm) return 'correct';
      return 'dimmed';
    }
    return selected ? 'selected' : '';
  };

  return (
    <div className="omr" role="radiogroup" aria-label={question.prompt || `Question ${question.number}`}>
      {options.map((opt, i) => {
        const selected = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={selected}
            className={cn('omr-option', optionClass(opt, selected))}
            disabled={locked}
            onClick={() => onChange?.(opt)}
          >
            <span className="omr-bubble" aria-hidden="true" />
            {letters && <span className="omr-letter">{letters[i]}</span>}
            <span className="omr-text">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

/* Select — matching banks / plan labels. Value = bank item TEXT,
   which is also what `answer` holds (grading stays uniform). */
function SelectBody({ question, value, onChange, locked, review, propBank, propBankLabels }) {
  const bank = question.bank?.length ? question.bank : propBank || [];
  const labels = question.bankLabels || propBankLabels;

  return (
    <>
      <select
        className="select"
        value={value ?? ''}
        disabled={locked}
        aria-label={question.prompt || `Question ${question.number}`}
        onChange={(e) => onChange?.(e.target.value)}
      >
        <option value="" disabled>{question.placeholder || 'Choose an answer'}</option>
        {bank.map((b, i) => (
          <option key={b} value={b}>{labels ? `${labels[i]} — ${b}` : b}</option>
        ))}
      </select>
      {review && <ReviewAnswers question={question} value={value} correct={review.correct} />}
    </>
  );
}

/* Free text — completion types (word-limit stated in the question) */
function TextBody({ question, value, onChange, locked, review }) {
  const limit = parseWordLimit(question.wordLimit);
  const words = countWords(value);
  const over = limit != null && words > limit;

  return (
    <>
      <input
        className="input"
        type="text"
        value={value ?? ''}
        disabled={locked}
        placeholder={locked ? '' : 'Type your answer'}
        aria-label={question.prompt || `Question ${question.number}`}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {question.wordLimit && (
        <p className={cn('q-wordlimit', over && 'over')}>
          {question.wordLimit}
          {over ? ` — you're at ${words} words` : ''}
        </p>
      )}
      {review && <ReviewAnswers question={question} value={value} correct={review.correct} />}
    </>
  );
}