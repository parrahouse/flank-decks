/**
 * ShortAnswerInput — renders the answer pane for short_answer question type.
 * Layout-agnostic: renders its own pane content; parent wraps it however it likes.
 *
 * Grading flow:
 *  1. Normalized match (free, instant)
 *  2. LLM fallback (only on tier-1 miss)
 */
import { useState, useRef, useEffect } from 'react';
import { Loader2, SendHorizonal, GraduationCap, SkipForward, RotateCcw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';

const SCORE = {
  correct: 1,
  correct_after_clue: 0.5,
  second_guess: 0.75,
  second_guess_after_clue: 0.35,
  wrong: 0
};

// Normalise a string for tier-1 comparison
function normalise(str) {
  return str.
  toLowerCase().
  trim().
  replace(/\s+/g, ' ').
  replace(/[^\w\s]/g, '').
  replace(/^(a|an|the)\s+/, '');
}

function tier1Match(response, canonical, variants = []) {
  const n = normalise(response);
  const targets = [canonical, ...(variants || [])].map(normalise);
  return targets.some((t) => t && t === n);
}

async function tier2Grade(card, studentResponse) {
  const prompt = `You are a strict exam grader. Grade the student's response ONLY against the provided rubric. Do NOT give credit for unrelated information.

Question/Clue: ${card.clue || '(none)'}
Canonical answer: ${card.canonical_answer}
Accepted variants: ${(card.accepted_variants || []).join(', ') || '(none)'}
Grading guidance: ${card.grading_guidance || '(none)'}
Student response: ${studentResponse}

Respond ONLY with valid JSON (no markdown, no preamble):
{"verdict":"correct"|"partial"|"incorrect","value":<number 0-1>,"reason":"<one sentence>"}`;

  const raw = await base44.integrations.Core.InvokeLLM({ prompt });
  // Strip code fences defensively
  const cleaned = (typeof raw === 'string' ? raw : JSON.stringify(raw)).
  replace(/```[a-z]*\n?/g, '').
  trim();
  return JSON.parse(cleaned);
}

export default function ShortAnswerInput({
  card,
  deck,
  onScore,
  onNext,
  onFirstWrong,
  isLast = false,
  soundEnabled = true,
  autoAdvance = false,
  clueManuallyRevealed = false,
  learningMode = false,
  hasExplanation = false,
  onShowExplanation,
  cardStats = null,
  // For the action bar
  introReady = true
}) {
  const [response, setResponse] = useState('');
  const [grading, setGrading] = useState(false);
  const [committed, setCommitted] = useState(false); // final answer locked in
  const [firstWrongText, setFirstWrongText] = useState(null); // null = no wrong yet
  const [verdict, setVerdict] = useState(null); // {verdict, value, reason}
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const textareaRef = useRef(null);

  const minSessions = deck?.mastery_min_sessions ?? 3;
  const masteryPct = cardStats && cardStats.sessions_completed >= minSessions ?
  Math.round(cardStats.correct_attempts / cardStats.total_attempts * 100) :
  null;
  const timesStudied = cardStats?.sessions_completed ?? null;

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineH = 24;
    const maxH = lineH * 6 + 16; // 6 rows + padding
    ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
    ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
  }, [response]);

  useEffect(() => {
    if (!committed && textareaRef.current) textareaRef.current.focus();
  }, [committed]);

  const submit = async () => {
    if (!response.trim() || grading || committed) return;
    setGrading(true);
    setAiUnavailable(false);

    const isMatch = tier1Match(response, card.canonical_answer, card.accepted_variants);

    let result;
    if (isMatch) {
      result = { verdict: 'correct', value: 1, reason: 'Exact match' };
    } else {
      // Tier 2: LLM
      try {
        result = await tier2Grade(card, response);
        // Persist grading log
        base44.entities.ShortAnswerGradingLog.create({
          card_id: card.id,
          student_response: response,
          verdict: result.verdict,
          value: result.value,
          reason: result.reason,
          graded_at: new Date().toISOString()
        }).catch(() => {}); // fire-and-forget, don't block UI
      } catch {
        result = { verdict: 'incorrect', value: 0, reason: 'AI grading unavailable' };
        setAiUnavailable(true);
      }
    }

    setGrading(false);
    const v = result.verdict;

    if (v === 'correct') {
      const scoreKey = clueManuallyRevealed ?
      firstWrongText ? 'second_guess_after_clue' : 'correct_after_clue' :
      firstWrongText ? 'second_guess' : 'correct';
      setVerdict(result);
      setCommitted(true);
      onScore && onScore(SCORE[scoreKey], scoreKey);
    } else if (v === 'partial') {
      setVerdict(result);
      setCommitted(true);
      onScore && onScore(result.value, 'partial');
    } else {
      // incorrect
      if (firstWrongText === null) {
        // First wrong attempt — allow retry
        setFirstWrongText(response);
        onFirstWrong && onFirstWrong(response, { retry: true });
        setVerdict(result);
        // Don't commit — keep input editable
        setResponse('');
      } else {
        // Second wrong — commit
        setVerdict(result);
        setCommitted(true);
        const scoreKey = clueManuallyRevealed ? 'second_guess_after_clue' : 'second_guess';
        onScore && onScore(SCORE.wrong, 'wrong');
      }
    }
  };

  const handleKeyDown = (e) => {
    if (committed || grading) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
    // Enter alone = newline (default textarea behaviour — do nothing)
  };

  const verdictColor = !verdict ? '#6b7280' :
  verdict.verdict === 'correct' ? '#00A842' :
  verdict.verdict === 'partial' ? '#d97706' :
  '#dc2626';

  const isRetry = firstWrongText !== null && !committed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: introReady ? 'auto' : 'none' }}>

      {/* Textarea */}
      <div style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={committed || grading}
          placeholder={isRetry ? 'Try again…' : 'Type your answer…'}
          rows={1}
          style={{
            width: '100%',
            resize: 'none',
            overflowY: 'hidden',
            boxSizing: 'border-box',
            padding: '10px 44px 10px 14px',
            fontSize: 16,
            lineHeight: '24px',
            border: `2px solid ${isRetry ? '#f97316' : committed && verdict ? verdictColor : '#000'}`,
            borderRadius: 8,
            outline: 'none',
            backgroundColor: committed && verdict ?
            verdict.verdict === 'correct' ? '#f0fdf4' :
            verdict.verdict === 'partial' ? '#fffbeb' :
            '#fef2f2' :
            '#fff',
            transition: 'border-color 0.3s, background-color 0.3s',
            fontFamily: 'inherit',
            opacity: committed ? 0.85 : 1
          }} />
        
        {/* Submit button inside textarea */}
        {!committed &&
        <button
          onClick={submit}
          disabled={!response.trim() || grading}
          title="Submit (Ctrl+Enter)"
          style={{
            position: 'absolute', right: 8, bottom: 8,
            width: 28, height: 28,
            background: response.trim() && !grading ? '#000' : '#d1d5db',
            border: 'none', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: response.trim() && !grading ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s'
          }}>
          
            {grading ?
          <Loader2 style={{ width: 14, height: 14, color: '#fff' }} className="animate-spin" /> :
          <SendHorizonal style={{ width: 14, height: 14, color: '#fff' }} className="" />
          }
          </button>
        }
      </div>

      {/* Status / feedback */}
      {grading &&
      <p style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> Checking…
        </p>
      }

      {aiUnavailable &&
      <p style={{ fontSize: 12, color: '#d97706' }}>
          ⚠ AI grading was unavailable — answer marked incorrect.
        </p>
      }

      {verdict &&
      <div style={{ padding: '8px 12px', borderRadius: 7, backgroundColor: verdictColor + '18', border: `1.5px solid ${verdictColor}22` }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: verdictColor, margin: 0 }}>
            {verdict.verdict === 'correct' ? '✓ Correct' : verdict.verdict === 'partial' ? '~ Partial credit' : isRetry ? '✗ Try again' : '✗ Incorrect'}
          </p>
          {verdict.reason && verdict.verdict !== 'correct' &&
        <p style={{ fontSize: 12, color: '#374151', margin: '3px 0 0' }}>{verdict.reason}</p>
        }
          {committed && verdict.verdict !== 'correct' &&
        <p style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
              Correct answer: <strong>{card.canonical_answer}</strong>
              {card.accepted_variants?.length ? ` (also: ${card.accepted_variants.join(', ')})` : ''}
            </p>
        }
        </div>
      }

      {isRetry &&
      <p style={{ fontSize: 12, color: '#f97316' }}>
          <RotateCcw style={{ width: 12, height: 12, display: 'inline', marginRight: 4 }} />
          One more try.
        </p>
      }

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTop: '1px solid #E5E5E5' }}>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
          {!committed ? 'Cmd/Ctrl+Enter to submit' : ''}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {committed && hasExplanation &&
          <button onClick={onShowExplanation} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
              <GraduationCap style={{ width: 14, height: 14 }} />
              <span style={{ borderBottom: '1.5px dotted #555', paddingBottom: 1 }}>Learn More</span>
            </button>
          }
          <button
            onClick={() => {
              if (!committed) {
                onScore && onScore(SCORE.wrong, 'wrong');
              }
              onNext && onNext();
            }}
            style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer' }}>
            
            <SkipForward style={{ width: 14, height: 14 }} />
            <span style={{ borderBottom: '1.5px dotted #555', paddingBottom: 1 }}>
              {committed ? isLast ? 'Finish' : 'Next' : 'Skip'}
            </span>
          </button>
        </div>
      </div>
    </div>);

}