/**
 * StudyCardHorizontal — side-by-side layout for wide screens.
 * Left/right hand mode controls which side the answer pane sits on.
 * All interaction logic is identical to StudyCard; this component just
 * re-arranges the panes without duplicating the logic by accepting the
 * same props and delegating rendering.
 *
 * Layout:
 *   [Image + Question] | [Progress + Answers + Actions]
 *   (or reversed for right-hand mode)
 */
import { useState, useEffect, useRef } from 'react';
import {
  SquareCheck, ToggleLeft, CopyCheck, Sparkles, Glasses,
  Bookmark, Pencil, SkipForward, GraduationCap,
  X, MessageCircleQuestion, Check, PlusCircle,
} from 'lucide-react';
import CardNoteEditor from './CardNoteEditor';
import { STUDY_CARD_H } from '@/lib/studyLayout';
import ShortAnswerInput from './ShortAnswerInput';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useSound } from '@/hooks/useSound';
import { motion } from 'framer-motion';

const COUNTDOWN_SECS = 6;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SCORE = {
  correct: 1, second_guess: 0.75,
  correct_after_clue: 0.5, second_guess_after_clue: 0.35,
  partial: null, wrong: 0,
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function getChoiceStyle(choices) {
  const count = choices.length;
  const maxLen = Math.max(...choices.map(c => c.length));
  let fontSize = 20; let minHeight = 52; let padding = '9px 14px';
  if (count >= 5 || maxLen > 60) { fontSize = 15; minHeight = 38; padding = '5px 12px'; }
  else if (count >= 4 || maxLen > 40) { fontSize = 17; minHeight = 44; padding = '6px 12px'; }
  else if (maxLen > 25) { fontSize = 18; minHeight = 48; padding = '7px 12px'; }
  return { fontSize, minHeight, padding };
}

export default function StudyCardHorizontal({
  card, deck, onNext, onPrev, isFirst, isLast, onScore, onSkip, canSkip = true,
  soundEnabled = true, autoAdvance = false,
  note = null, cardIndex = 0, total = 1,
  correctStreak = 0, bestStreak = 0, pastSessions = [],
  masteredCount = 0, totalCards = 0, cardStats = null,
  isBookmarked = false, onToggleBookmark = null,
  eliminateAllowed = true,
  secondGuessAllowed = true,
  learningMode = false,
  handedness = 'left', // 'left' = answers on right, 'right' = answers on left
  onFirstWrong = null,
  introReady = true,
  childVariant = null,
}) {
  const { playCorrect, playWrong } = useSound(soundEnabled);
  const [shuffledChoices, setShuffledChoices] = useState([]);
  const [firstWrong, setFirstWrong] = useState(null);
  const [finalAnswer, setFinalAnswer] = useState(null);
  const [eliminated, setEliminated] = useState([]);
  const [clueManuallyRevealed, setClueManuallyRevealed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [shakingChoice, setShakingChoice] = useState(null);
  const shakeTimerRef = useRef(null);
  const [countdown, setCountdown] = useState(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [eliminateShake, setEliminateShake] = useState(false);
  const [eliminateUsed, setEliminateUsed] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [selectAllPending, setSelectAllPending] = useState(new Set());
  const countdownRef = useRef(null);
  const idleTimerRef = useRef(null);

  const clueAllowed = deck?.clue_mode !== 'disabled';
  const hasExplanation = !!card.explanation;
  const isTrueFalse = card.question_type === 'true_false';
  const isSelectAll = card.question_type === 'select_all';
  const isShortAnswer = card.question_type === 'short_answer';
  const hasImage = !!card.image_url;
  const cardPoints = card.point_value ?? 20;

  const correctAnswers = (card.correct_answers || card.correct_answer || '')
    .split('|').map(s => s.trim()).filter(Boolean);

  const answered = !!finalAnswer && finalAnswer !== '';

  const canEliminate = eliminateAllowed && !answered && !firstWrong && !isTrueFalse && !isSelectAll &&
    eliminated.length < shuffledChoices.length - 2 && shuffledChoices.length > 2;

  const cancelCountdown = () => {
    clearInterval(countdownRef.current);
    countdownRef.current = null;
    setCountdown(null);
  };

  const startCountdown = () => {
    setCountdown(COUNTDOWN_SECS);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current); countdownRef.current = null; onNext(); return null; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    setShuffledChoices(shuffle(card.choices || []));
    setFirstWrong(null); setFinalAnswer(null); setEliminated([]);
    setClueManuallyRevealed(false); setFlipped(false); setShakingChoice(null); clearTimeout(shakeTimerRef.current);
    setNoteEditing(false); setEliminateShake(false); setEliminateUsed(false);
    setHintVisible(false); setBookmarked(isBookmarked); setSelectAllPending(new Set());
    cancelCountdown(); clearTimeout(idleTimerRef.current);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [card.id]);

  useEffect(() => () => { cancelCountdown(); clearTimeout(idleTimerRef.current); clearTimeout(shakeTimerRef.current); }, []);

  const handleSelect = (choice) => {
    if (finalAnswer) return;
    if (isSelectAll) {
      setSelectAllPending(prev => {
        const next = new Set(prev);
        if (next.has(choice)) next.delete(choice); else next.add(choice);
        return next;
      });
      return;
    }
    const correct = correctAnswers.includes(choice);
    if (correct) {
      const penaliseClue = clueManuallyRevealed;
      const scoreKey = firstWrong
        ? penaliseClue ? 'second_guess_after_clue' : 'second_guess'
        : penaliseClue ? 'correct_after_clue' : 'correct';
      setFinalAnswer(choice); playCorrect();
      onScore && onScore(cardPoints * SCORE[scoreKey], scoreKey);
      if (autoAdvance && !isLast) startCountdown();
    } else {
      playWrong(); setShakingChoice(choice); clearTimeout(shakeTimerRef.current); shakeTimerRef.current = setTimeout(() => setShakingChoice(null), 400);
      if (secondGuessAllowed && !firstWrong && !eliminated.length && !isTrueFalse) {
        setFirstWrong(choice);
        onFirstWrong && onFirstWrong(choice, { retry: true });
      } else {
        if (!firstWrong) onFirstWrong && onFirstWrong(choice, { retry: false });
        setFinalAnswer(choice); onScore && onScore(SCORE.wrong, 'wrong');
        if (learningMode && hasExplanation) setTimeout(() => setFlipped(true), 400);
      }
    }
  };

  const handleSelectAllDone = () => {
    const selectedArr = Array.from(selectAllPending);
    const numCorrect = selectedArr.filter(c => correctAnswers.includes(c)).length;
    const numWrong = selectedArr.filter(c => !correctAnswers.includes(c)).length;
    const total = correctAnswers.length;
    const allCorrect = numCorrect === total && numWrong === 0;
    if (allCorrect) {
      playCorrect();
      const scoreKey = clueManuallyRevealed ? 'correct_after_clue' : 'correct';
      setFinalAnswer('__select_all_correct__');
      onScore && onScore(cardPoints * SCORE[scoreKey], scoreKey);
      if (autoAdvance && !isLast) startCountdown();
    } else {
      const partialScore = Math.max(0, (numCorrect - numWrong) / total);
      partialScore > 0 ? playCorrect() : playWrong();
      setFinalAnswer('__select_all_partial__');
      onScore && onScore(cardPoints * partialScore, 'partial');
    }
  };

  const handleEliminate = () => {
    if (finalAnswer || firstWrong) return;
    const wrong = shuffledChoices.filter(c => !correctAnswers.includes(c) && !eliminated.includes(c));
    if (wrong.length === 0) return;
    const toElim = wrong[Math.floor(Math.random() * wrong.length)];
    setEliminated(prev => [...prev, toElim]);
    setEliminateUsed(true);
    clearTimeout(idleTimerRef.current);
  };

  useEffect(() => {
    if (answered && hintVisible) {
      const t = setTimeout(() => setHintVisible(false), 1200);
      return () => clearTimeout(t);
    }
  }, [answered, hintVisible]);

  useEffect(() => {
    if (answered || firstWrong || !canEliminate) return;
    clearTimeout(idleTimerRef.current);
    const doShake = () => {
      setEliminateShake(true);
      setTimeout(() => setEliminateShake(false), 600);
      idleTimerRef.current = setTimeout(doShake, 5000);
    };
    idleTimerRef.current = setTimeout(doShake, 30000);
    return () => clearTimeout(idleTimerRef.current);
  }, [answered, firstWrong, canEliminate, card.id]);

  useEffect(() => {
    const onKey = (e) => {
      const idx = e.key.toUpperCase().charCodeAt(0) - 65;
      if (idx < 0 || idx >= shuffledChoices.length) return;
      const choice = shuffledChoices[idx];
      if (eliminated.includes(choice) || finalAnswer) return;
      handleSelect(choice);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shuffledChoices, eliminated, finalAnswer, firstWrong, clueManuallyRevealed]);

  const getChoiceState = (choice) => {
    const isElim = eliminated.includes(choice);
    const correct = correctAnswers.includes(choice);
    if (isElim) return 'eliminated';
    if (isSelectAll && !answered) return selectAllPending.has(choice) ? 'selected-pending' : 'idle';
    if (isSelectAll && answered) {
      if (correct && selectAllPending.has(choice)) return 'correct';
      if (correct && !selectAllPending.has(choice)) return 'missed-correct';
      if (!correct && selectAllPending.has(choice)) return 'first-wrong';
      return 'dim';
    }
    if (!answered && !firstWrong) return 'idle';
    if (!answered && firstWrong) return choice === firstWrong ? 'first-wrong' : 'idle-retry';
    if (correct) return 'correct';
    // Any wrong pick — the first attempt (firstWrong) or the final wrong guess
    // (finalAnswer) — holds the red "wrong-final" state once the card is answered.
    if (answered && (choice === finalAnswer || choice === firstWrong)) return 'wrong-final';
    return 'dim';
  };

  const timesStudied = cardStats?.sessions_completed ?? null;
  const minSessions = deck?.mastery_min_sessions ?? 3;
  const masteryPct = cardStats && cardStats.sessions_completed >= minSessions
    ? Math.round((cardStats.correct_attempts / cardStats.total_attempts) * 100) : null;

  const qtLabel = isTrueFalse ? 'True or False?' : isSelectAll ? 'Multi-Select' : isShortAnswer ? 'Short Answer' : 'Single Select';

  const choiceBorderColor = (state) => {
    if (state === 'correct') return '#00A842';
    if (state === 'wrong-final') return '#dc2626';
    if (state === 'first-wrong') return '#f97316';
    if (state === 'missed-correct') return '#0165fc';
    if (state === 'eliminated') return '#ccc';
    if (state === 'selected-pending') return '#0165fc';
    return '#000';
  };
  const choiceBgColor = (state) => {
    if (state === 'correct') return '#f0fdf4';
    if (state === 'wrong-final') return '#fef2f2';
    if (state === 'first-wrong') return '#fff7ed';
    if (state === 'missed-correct') return '#eff6ff';
    if (state === 'eliminated') return '#f5f5f5';
    if (state === 'selected-pending') return '#eff6ff';
    return '#fff';
  };

  const choiceStyle = getChoiceStyle(shuffledChoices);

  const Pane = childVariant ? motion.div : 'div';
  const paneProps = childVariant ? { variants: childVariant } : {};

  // ── Left column: image + question ──────────────────────────────────────────
  const ImageQuestionCol = (
    <Pane {...paneProps} style={{ display: 'flex', flexDirection: 'column', flex: '0 0 48%', minWidth: 0, gap: 8 }}>
      {/* Image — only when present */}
      {hasImage && (
        <div style={{ width: '100%', flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={card.image_url} alt="card" style={{ width: '100%', height: '100%', objectFit: card.image_fit || 'cover', objectPosition: (card.image_fit !== 'contain' && card.image_focal_point) ? `${card.image_focal_point.x}% ${card.image_focal_point.y}%` : 'center' }} />
        </div>
      )}

      {/* Question pane — fills the image space when there's no image */}
      <div style={{
        width: '100%',
        ...(hasImage ? { height: 110, flexShrink: 0, padding: '16px 16px 36px 16px' } : { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', padding: '20px 20px 40px 20px' }),
        backgroundColor: hintVisible ? '#EEFF41' : '#DFEDF5',
        position: 'relative',
        boxSizing: 'border-box', overflow: 'hidden', transition: 'background-color 0.2s',
      }}>
        <p style={{ color: '#113656', fontSize: hasImage ? 'clamp(13px, 1.8vw, 20px)' : 'clamp(20px, 3vw, 36px)', fontWeight: 500, lineHeight: 1.35, margin: 0, visibility: hintVisible ? 'hidden' : 'visible' }}>
          {card.clue || ''}
        </p>
        {hintVisible && note && (
          <div style={{ position: 'absolute', inset: 0, padding: '16px 16px 36px 16px', display: 'flex', alignItems: 'flex-start' }}>
            <p style={{ color: '#1a237e', fontSize: 'clamp(13px, 1.6vw, 18px)', fontWeight: 500, lineHeight: 1.35, margin: 0 }}>{note}</p>
          </div>
        )}
        <span style={{ position: 'absolute', bottom: 8, left: 16, color: hintVisible ? '#1a237e' : '#113656', fontSize: 13, fontWeight: hintVisible ? 400 : 700, opacity: hintVisible ? 0.7 : 1 }}>
          {hintVisible ? 'Hint' : `${cardIndex + 1}/${total}`}
        </span>
        {/* Hint button — bottom right of question pane */}
        {hintVisible && note ? (
          // Hint is open + exists: show close and edit buttons
          <div style={{ position: 'absolute', bottom: 6, right: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setNoteEditing(true)} title="Edit hint" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a237e', padding: 0, lineHeight: 0 }}>
              <Pencil style={{ width: 15, height: 15 }} />
            </button>
            <button onClick={() => setHintVisible(false)} title="Close hint" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a237e', padding: 0, lineHeight: 0 }}>
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
        ) : note ? (
          // Hint exists but not visible: show message icon to open it
          <button onClick={() => setHintVisible(true)} title="View your hint" style={{ position: 'absolute', bottom: 6, right: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#113656', opacity: 0.6, lineHeight: 0 }}>
            <MessageCircleQuestion style={{ width: 18, height: 18 }} />
          </button>
        ) : (
          // No hint: show + icon to add one
          <button onClick={() => setNoteEditing(true)} title="Add a hint" style={{ position: 'absolute', bottom: 6, right: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#113656', opacity: 0.45, lineHeight: 0 }}>
            <PlusCircle style={{ width: 18, height: 18 }} />
          </button>
        )}
      </div>
    </Pane>
  );

  // ── Right column: progress bar + answers + actions ─────────────────────────
  const AnswerCol = (
    <Pane {...paneProps} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 0, minHeight: 0, alignSelf: 'stretch', gap: 8, pointerEvents: introReady ? 'auto' : 'none' }}>
      {/* Answer pane */}
      <div style={{
        flex: 1, minHeight: 0, boxSizing: 'border-box', padding: '10px 14px',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#00A842', fontSize: 20, fontWeight: 500 }}>
            <span>{qtLabel}</span>
            {isTrueFalse ? <ToggleLeft style={{ width: 24, height: 24 }} />
              : isSelectAll ? <span style={{ display: 'inline-flex', gap: 2 }}>
                <SquareCheck style={{ width: 22, height: 22 }} /><SquareCheck style={{ width: 22, height: 22 }} />
              </span>
              : !isShortAnswer && <SquareCheck style={{ width: 22, height: 22 }} />
            }
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!isTrueFalse && !isShortAnswer && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280', fontSize: 12 }}>
                <CopyCheck style={{ width: 13, height: 13 }} />
                <span>2nd Guess: {secondGuessAllowed ? 'ON' : 'OFF'}</span>
              </div>
            )}
            <button
              onClick={() => { const next = !bookmarked; setBookmarked(next); onToggleBookmark && onToggleBookmark(card.id, next); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}
            >
              <Bookmark style={{ width: 20, height: 20, fill: bookmarked ? '#d97706' : 'none', color: bookmarked ? '#d97706' : '#9ca3af', strokeWidth: 2 }} />
            </button>
          </div>
        </div>

        {/* Short answer — fixed pane; content fills a reserved flex slot, scrolls if tall */}
        {isShortAnswer && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <ShortAnswerInput
              card={card}
              deck={deck}
              onScore={onScore}
              onNext={() => { cancelCountdown(); onNext(); }}
              onFirstWrong={onFirstWrong}
              isLast={isLast}
              soundEnabled={soundEnabled}
              autoAdvance={autoAdvance}
              clueManuallyRevealed={clueManuallyRevealed}
              learningMode={learningMode}
              hasExplanation={hasExplanation}
              onShowExplanation={() => setFlipped(true)}
              cardStats={cardStats}
              introReady={introReady}
            />
          </div>
        )}

        {/* Choices (non-short-answer) */}
        {!isShortAnswer && (
          <>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '0 8px' }}>
              {isTrueFalse ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  {shuffledChoices.map((choice, idx) => {
                    const state = getChoiceState(choice);
                    return (
                      <button key={choice} disabled={answered} onClick={() => handleSelect(choice)}
                        className={cn('choice-btn', shakingChoice === choice && 'animate-shake')}
                        style={{ flex: 1, minHeight: 56, borderRadius: 10, border: `2px solid ${choiceBorderColor(state)}`, backgroundColor: choiceBgColor(state), display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: answered ? 'default' : 'pointer', fontSize: 15, fontWeight: 500, textAlign: 'left', transition: state === 'correct' ? 'none' : 'border-color 0.4s ease 0.15s, background-color 0.4s ease 0.15s' }}
                      >
                        <span style={{ width: 26, height: 26, borderRadius: 5, flexShrink: 0, backgroundColor: state === 'correct' ? '#00A842' : state === 'wrong-final' ? '#dc2626' : '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                          {state === 'correct' ? <Check style={{ width: 14, height: 14 }} /> : state === 'wrong-final' ? <X style={{ width: 13, height: 13 }} /> : LETTERS[idx]}
                        </span>
                        {choice}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {shuffledChoices.map((choice, idx) => {
                    const state = getChoiceState(choice);
                    return (
                      <button key={choice} disabled={state === 'eliminated' || answered} onClick={() => handleSelect(choice)}
                        className={cn('choice-btn', shakingChoice === choice && 'animate-shake')}
                        style={{ width: '100%', minHeight: choiceStyle.minHeight, borderRadius: 8, border: `2px solid ${choiceBorderColor(state)}`, backgroundColor: choiceBgColor(state), opacity: state === 'eliminated' || state === 'dim' ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: 8, padding: choiceStyle.padding, cursor: answered || state === 'eliminated' ? 'default' : 'pointer', fontSize: choiceStyle.fontSize, fontWeight: 500, textAlign: 'left', transition: state === 'correct' ? 'none' : 'border-color 0.4s ease 0.15s, background-color 0.4s ease 0.15s, opacity 0.4s ease 0.15s' }}
                      >
                        <span style={{ width: 26, height: 26, borderRadius: 5, flexShrink: 0, backgroundColor: state === 'correct' ? '#00A842' : state === 'wrong-final' ? '#dc2626' : state === 'missed-correct' ? '#0165fc' : state === 'selected-pending' ? '#0165fc' : '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                          {state === 'correct' || state === 'missed-correct' ? <Check style={{ width: 13, height: 13 }} /> : state === 'wrong-final' ? <X style={{ width: 13, height: 13 }} /> : (isSelectAll && state === 'first-wrong') ? <X style={{ width: 13, height: 13 }} /> : LETTERS[idx]}
                        </span>
                        <span style={{ flex: 1, lineHeight: 1.3 }}>{choice}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Secondary actions — reserved fixed slot; contents toggle (empty after answer) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10, height: 36, flexShrink: 0 }}>
              {!answered && (
                isSelectAll ? (
                  selectAllPending.size >= 2 && (
                    <button onClick={handleSelectAllDone} style={{ backgroundColor: '#00A842', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Check style={{ width: 14, height: 14 }} /> Done
                    </button>
                  )
                ) : !isTrueFalse && (
                  <button onClick={canEliminate ? handleEliminate : undefined} disabled={!canEliminate}
                    className={cn(eliminateShake && 'animate-subtle-shake')}
                    style={{ color: eliminateUsed ? '#d1d5db' : canEliminate ? '#0165fc' : '#d1d5db', opacity: eliminateUsed ? 0.4 : 1, cursor: canEliminate && !eliminateUsed ? 'pointer' : 'not-allowed', background: 'none', border: 'none', padding: 0, transition: 'opacity 0.3s, color 0.3s' }}
                  >
                    <Sparkles style={{ width: 18, height: 18 }} />
                  </button>
                )
              )}
            </div>

            {/* Action row — reserved fixed slot; Learn More space reserved via visibility */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, paddingTop: 10, borderTop: '1px solid #E5E5E5', height: 44, flexShrink: 0, boxSizing: 'border-box', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#F5F5F0', borderRadius: 18, padding: '5px 12px', fontSize: 12, flexShrink: 0 }}>
                <Glasses style={{ width: 17, height: 17, flexShrink: 0 }} />
                <span>Mastery: <strong>{masteryPct !== null ? `${masteryPct}%` : '--'}</strong></span>
                <span>Studied: <strong>{timesStudied !== null ? timesStudied : '--'}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                {hasExplanation && (
                  <div style={{ visibility: answered ? 'visible' : 'hidden', display: 'flex', alignItems: 'center' }}>
                    <button onClick={() => { setFlipped(true); cancelCountdown(); }} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                      <GraduationCap style={{ width: 14, height: 14, flexShrink: 0 }} />
                      <span style={{ borderBottom: '1.5px dotted #555', paddingBottom: 2 }}>Learn More</span>
                    </button>
                  </div>
                )}
                <button
                  onClick={() => {
                    if (!answered) { onSkip && onSkip(); }
                    else { cancelCountdown(); onNext(); }
                  }}
                  disabled={!answered && !canSkip}
                  style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: (!answered && !canSkip) ? 'not-allowed' : 'pointer', opacity: (!answered && !canSkip) ? 0.35 : 1, transition: 'opacity 0.3s', position: 'relative' }}
                >
                  <SkipForward style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ borderBottom: '1.5px dotted #555', paddingBottom: 2, position: 'relative' }}>
                    {countdown !== null && (
                      <span style={{ position: 'absolute', bottom: 0, left: 0, height: '1.5px', backgroundColor: '#555', width: `${((COUNTDOWN_SECS - countdown + 1) / COUNTDOWN_SECS) * 100}%`, transition: 'width 1s linear' }} />
                    )}
                    {answered ? (isLast ? 'Finish' : 'Next') : 'Skip'}
                  </span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Pane>
  );

  // handedness: 'left' = image on left (right-handed mouse), 'right' = image on right (left-handed)
  const leftCol = handedness === 'right' ? AnswerCol : ImageQuestionCol;
  const rightCol = handedness === 'right' ? ImageQuestionCol : AnswerCol;

  return (
    <div style={{ display: 'flex', gap: 16, width: '100%', alignItems: 'stretch', height: STUDY_CARD_H.horizontal }}>
      {leftCol}
      {rightCol}

      {/* Note editor modal */}
      <Dialog open={noteEditing} onOpenChange={setNoteEditing}>
        <DialogContent className="max-w-md">
          <h3 className="font-semibold text-base flex items-center gap-2 mb-3">
            <Pencil className="w-4 h-4 text-amber-600" /> Add / Edit Hint
          </h3>
          <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5 mb-4 space-y-1">
            {card.clue && <p className="text-sm font-semibold">{card.clue}</p>}
            <p className="text-sm text-muted-foreground">Answer: <span className="font-semibold text-foreground">{correctAnswers.join(', ')}</span></p>
          </div>
          <CardNoteEditor cardId={card.id} onSaved={() => setNoteEditing(false)} />
        </DialogContent>
      </Dialog>

      {/* Learn More modal */}
      <Dialog open={flipped && hasExplanation} onOpenChange={(open) => { if (!open) setFlipped(false); }}>
        <DialogContent className="max-w-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4 text-accent-foreground" />
            </div>
            <h3 className="font-semibold text-lg">{correctAnswers.join(', ')}</h3>
          </div>
          <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: card.explanation }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}