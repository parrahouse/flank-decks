import { useState, useEffect, useRef } from 'react';
import {
  SquareCheck,
  ToggleLeft,
  CopyCheck,
  Sparkles,
  Glasses,
  Bookmark,
  BookmarkX,
  Pencil,
  SkipForward,
  GraduationCap,
  X,
  MessageCircleQuestion,
  Check,
} from 'lucide-react';
import CardNoteEditor from './CardNoteEditor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useSound } from '@/hooks/useSound';

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
  correct: 1,
  second_guess: 0.75,
  correct_after_clue: 0.5,
  second_guess_after_clue: 0.35,
  partial: null, // computed dynamically for select_all
  wrong: 0,
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function getChoiceFontSize(choices) {
  const maxLen = Math.max(...choices.map(c => c.length));
  if (maxLen > 60) return 16;
  if (maxLen > 40) return 20;
  if (maxLen > 25) return 24;
  return 30;
}

export default function StudyCard({
  card,
  deck,
  onNext,
  onPrev,
  isFirst,
  isLast,
  onScore,
  soundEnabled = true,
  autoAdvance = false,
  note = null,
  cardIndex = 0,
  total = 1,
  sessionStartTime = null,
  correctStreak = 0,
  bestStreak = 0,
  pastSessions = [],
  masteredCount = 0,
  totalCards = 0,
  cardStats = null,
  isBookmarked = false,
  onToggleBookmark = null,
  eliminateAllowed = true,
}) {
  const { playCorrect, playWrong } = useSound(soundEnabled);
  const [shuffledChoices, setShuffledChoices] = useState([]);
  const [firstWrong, setFirstWrong] = useState(null);
  const [finalAnswer, setFinalAnswer] = useState(null);
  const [eliminated, setEliminated] = useState([]);
  const [questionRevealed] = useState(true);
  const [clueManuallyRevealed, setClueManuallyRevealed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [shake, setShake] = useState(false);
  const [wrongModal, setWrongModal] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [eliminateShake, setEliminateShake] = useState(false);
  const [eliminateUsed, setEliminateUsed] = useState(false);
  const [noteRevealed, setNoteRevealed] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [selectAllPending, setSelectAllPending] = useState(new Set()); // choices toggled but not yet graded
  const countdownRef = useRef(null);
  const idleTimerRef = useRef(null);

  const clueAllowed = deck?.clue_mode !== 'disabled';
  const hasExplanation = !!card.explanation;
  const isTrueFalse = card.question_type === 'true_false';
  const isSelectAll = card.question_type === 'select_all';
  const secondGuessAllowed = true;

  const cancelCountdown = () => {
    clearInterval(countdownRef.current);
    countdownRef.current = null;
    setCountdown(null);
  };

  const startCountdown = () => {
    setCountdown(COUNTDOWN_SECS);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
          onNext();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    setShuffledChoices(shuffle(card.choices));
    setFirstWrong(null);
    setFinalAnswer(null);
    setEliminated([]);
    setClueManuallyRevealed(false);
    setFlipped(false);
    setShake(false);
    setWrongModal(null);
    setNoteEditing(false);
    setEliminateShake(false);
    setEliminateUsed(false);
    setNoteRevealed(false);
    setHintVisible(false);
    setBookmarked(isBookmarked);
    setSelectAllPending(new Set());
    cancelCountdown();
    clearTimeout(idleTimerRef.current);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [card.id]);

  useEffect(() => () => { cancelCountdown(); clearTimeout(idleTimerRef.current); }, []);

  // Derived values (must be before effects that use them)
  const correctAnswers = (card.correct_answers || card.correct_answer || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  const answered = !!finalAnswer && finalAnswer !== '';

  const canEliminate =
    eliminateAllowed &&
    !answered && !firstWrong && !isTrueFalse && !isSelectAll &&
    eliminated.length < shuffledChoices.length - 2 && shuffledChoices.length > 2;

  const handleSelect = (choice) => {
    if (finalAnswer) return;

    // Select-all: just toggle the pending set, grading happens on "Done"
    if (isSelectAll) {
      setSelectAllPending(prev => {
        const next = new Set(prev);
        if (next.has(choice)) next.delete(choice);
        else next.add(choice);
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
      setFinalAnswer(choice);
      playCorrect();
      onScore && onScore(SCORE[scoreKey], scoreKey);
      if (autoAdvance && !isLast) startCountdown();
    } else {
      playWrong();
      setShake(true);
      setTimeout(() => setShake(false), 400);
      if (!firstWrong && !eliminated.length) {
        setFirstWrong(choice);
      } else {
        setFinalAnswer(choice);
        onScore && onScore(SCORE.wrong, 'wrong');
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
      onScore && onScore(SCORE[scoreKey], scoreKey);
      if (autoAdvance && !isLast) startCountdown();
    } else {
      // Partial credit: (correct hits - wrong picks) / total, floored at 0
      const partialScore = Math.max(0, (numCorrect - numWrong) / total);
      if (partialScore > 0) {
        playCorrect();
      } else {
        playWrong();
      }
      setFinalAnswer('__select_all_partial__');
      onScore && onScore(partialScore, 'partial');
    }
  };

  const handleEliminate = () => {
    if (finalAnswer || firstWrong) return;
    const wrong = shuffledChoices.filter((c) => !correctAnswers.includes(c) && !eliminated.includes(c));
    if (wrong.length === 0) return;
    const toElim = wrong[Math.floor(Math.random() * wrong.length)];
    setEliminated((prev) => [...prev, toElim]);
    setEliminateUsed(true);
    clearTimeout(idleTimerRef.current);
  };

  // Auto-hide hint after answer
  useEffect(() => {
    if (answered && hintVisible) {
      const t = setTimeout(() => setHintVisible(false), 1200);
      return () => clearTimeout(t);
    }
  }, [answered, hintVisible]);

  // 30-second idle shake for eliminate button, then repeat every 5 seconds
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
      if (wrongModal) return;
      const idx = e.key.toUpperCase().charCodeAt(0) - 65;
      if (idx < 0 || idx >= shuffledChoices.length) return;
      const choice = shuffledChoices[idx];
      if (eliminated.includes(choice) || finalAnswer) return;
      handleSelect(choice);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shuffledChoices, eliminated, finalAnswer, wrongModal, firstWrong, clueManuallyRevealed]);

  const getChoiceState = (choice) => {
    const isElim = eliminated.includes(choice);
    const correct = correctAnswers.includes(choice);
    if (isElim) return 'eliminated';

    // Select-all: pending (not yet submitted)
    if (isSelectAll && !answered) {
      return selectAllPending.has(choice) ? 'selected-pending' : 'idle';
    }

    // Select-all: after grading
    if (isSelectAll && answered) {
      if (correct && selectAllPending.has(choice)) return 'correct';        // hit correctly
      if (correct && !selectAllPending.has(choice)) return 'missed-correct'; // should have selected
      if (!correct && selectAllPending.has(choice)) return 'first-wrong';    // wrongly selected
      return 'dim';
    }

    if (!answered && !firstWrong) return 'idle';
    if (!answered && firstWrong) {
      if (choice === firstWrong) return 'first-wrong';
      return 'idle-retry';
    }
    if (correct) return 'correct';
    return 'dim';
  };

  const handleSkip = () => {
    setWrongModal(null);
    if (!finalAnswer) {
      setFinalAnswer(firstWrong);
      onScore && onScore(SCORE.wrong, 'wrong');
    }
    onNext();
  };

  const handleTryAgain = () => setWrongModal(null);

  const timesStudied = cardStats?.sessions_completed ?? null;
  const minSessions = deck?.mastery_min_sessions ?? 3;
  const masteryPct = cardStats && cardStats.sessions_completed >= minSessions
    ? Math.round((cardStats.correct_attempts / cardStats.total_attempts) * 100)
    : null;

  const qtLabel = isTrueFalse ? 'True or False?' : isSelectAll ? 'Multi-Select' : 'Single Select';

  const choiceBorderColor = (state) => {
    if (state === 'correct' || state === 'reveal-correct') return '#00A842';
    if (state === 'wrong-final') return '#dc2626';
    if (state === 'first-wrong') return '#f97316';
    if (state === 'missed-correct') return '#d97706';
    if (state === 'eliminated') return '#ccc';
    if (state === 'selected-pending') return '#0165fc';
    return '#000';
  };

  const choiceBgColor = (state) => {
    if (state === 'correct' || state === 'reveal-correct') return '#f0fdf4';
    if (state === 'wrong-final') return '#fef2f2';
    if (state === 'first-wrong') return '#fff7ed';
    if (state === 'missed-correct') return '#fffbeb';
    if (state === 'eliminated') return '#f5f5f5';
    if (state === 'selected-pending') return '#eff6ff';
    return '#fff';
  };

  const choiceFontSize = getChoiceFontSize(shuffledChoices);

  return (
    <div className="mx-auto flex flex-col gap-3 w-full max-w-[700px]">

      {/* ── Card Pane: 4:3 aspect ratio ── */}
      <div
        style={{
          width: '100%',
          aspectRatio: '700 / 525',
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#f3f4f6',
        }}
      >
        {card.image_url
          ? <img src={card.image_url} alt="card" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: card.image_focal_point ? `${card.image_focal_point.x}% ${card.image_focal_point.y}%` : 'center' }} />
          : <span style={{ color: '#9ca3af', fontSize: 14 }}>No image</span>
        }
      </div>

      {/* ── Question Pane ── */}
      <div
        style={{
          width: '100%',
          backgroundColor: hintVisible ? '#EEFF41' : '#DFEDF5',
          position: 'relative',
          padding: '20px 20px 40px 20px',
          boxSizing: 'border-box',
          minHeight: 120,
          transition: 'background-color 0.2s',
        }}
      >
        <p style={{ color: '#113656', fontSize: 'clamp(18px, 3.2vw, 32px)', fontWeight: 500, lineHeight: 1.3, margin: 0, visibility: hintVisible ? 'hidden' : 'visible' }}>
          {card.clue || ''}
        </p>

        {/* Hint overlay — absolutely positioned so it doesn't affect pane height */}
        {hintVisible && note && (
          <div style={{ position: 'absolute', inset: 0, padding: '20px 20px 40px 20px', display: 'flex', alignItems: 'flex-start' }}>
            <p style={{ color: '#1a237e', fontSize: 'clamp(14px, 2vw, 20px)', fontWeight: 500, lineHeight: 1.3, margin: 0 }}>
              {note}
            </p>
          </div>
        )}

        {/* Bottom left: card counter or "Hint" label */}
        <span style={{ position: 'absolute', bottom: 10, left: 20, color: hintVisible ? '#1a237e' : '#113656', fontSize: 14, fontWeight: hintVisible ? 400 : 700, opacity: hintVisible ? 0.7 : 1 }}>
          {hintVisible ? 'Hint' : `${cardIndex + 1}/${total}`}
        </span>

        {/* Bottom right: hint icon or back arrow */}
        {note && (
          hintVisible ? (
            <button
              onClick={() => setHintVisible(false)}
              style={{ position: 'absolute', bottom: 8, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#1a237e', padding: 0, lineHeight: 0 }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 14L4 9l5-5"/>
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>
              </svg>
            </button>
          ) : (
            <button
              onClick={() => setHintVisible(true)}
              title="View your hint"
              style={{ position: 'absolute', bottom: 8, right: 14, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#113656', opacity: 0.6, lineHeight: 0 }}
            >
              <MessageCircleQuestion style={{ width: 20, height: 20 }} />
            </button>
          )
        )}
      </div>

      {/* ── Progress Pane ── */}
      <div
        style={{
          width: '100%',
          height: 100,
          border: '2px solid #000',
          boxSizing: 'border-box',
        }}
      />

      {/* ── Answer Pane ── */}
      <div
        style={{
          width: '100%',
          backgroundColor: '#FAFAFA',
          border: '2px solid #D9D9D9',
          boxSizing: 'border-box',
          padding: '12px 16px',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Top row: question type + second guess */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#00A842', fontSize: 24, fontWeight: 500 }}>
            <span>{qtLabel}</span>
            {isTrueFalse
              ? <ToggleLeft style={{ width: 28, height: 28 }} />
              : isSelectAll
                ? <span style={{ display: 'inline-flex', gap: 2 }}>
                    <SquareCheck style={{ width: 28, height: 28 }} />
                    <SquareCheck style={{ width: 28, height: 28 }} />
                  </span>
                : <SquareCheck style={{ width: 28, height: 28 }} />
            }
          </div>

          {!isTrueFalse && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6b7280', fontSize: 13 }}>
              <CopyCheck style={{ width: 15, height: 15 }} />
              <span>Second Guess: {secondGuessAllowed ? 'ON' : 'OFF'}</span>
            </div>
          )}
        </div>

        {/* Choice buttons */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {isTrueFalse ? (
            <div style={{ display: 'flex', gap: 12 }}>
              {shuffledChoices.map((choice, idx) => {
                const state = getChoiceState(choice);
                return (
                  <button
                    key={choice}
                    disabled={answered}
                    onClick={() => handleSelect(choice)}
                    className={cn(shake && (state === 'first-wrong' || state === 'wrong-final') && 'animate-shake')}
                    style={{
                      flex: 1, minHeight: 80,
                      borderRadius: 14,
                      border: `2px solid ${choiceBorderColor(state)}`,
                      backgroundColor: choiceBgColor(state),
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 20px',
                      cursor: answered ? 'default' : 'pointer',
                      fontSize: choiceFontSize, fontWeight: 500,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: 34, height: 34, borderRadius: 6,
                      backgroundColor: state === 'correct' ? '#00A842' : '#000',
                      color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: state === 'correct' ? 18 : 14, fontWeight: 700, flexShrink: 0,
                    }}>
                      {state === 'correct' ? <Check style={{ width: 18, height: 18 }} /> : LETTERS[idx]}
                    </span>
                    {choice}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignContent: 'flex-start' }}>
              {shuffledChoices.map((choice, idx) => {
                const state = getChoiceState(choice);
                return (
                  <button
                    key={choice}
                    disabled={state === 'eliminated' || answered}
                    onClick={() => handleSelect(choice)}
                    className={cn(shake && (state === 'first-wrong' || state === 'wrong-final') && 'animate-shake')}
                    style={{
                      minHeight: 64,
                      borderRadius: 14,
                      border: `2px solid ${choiceBorderColor(state)}`,
                      backgroundColor: choiceBgColor(state),
                      opacity: state === 'eliminated' || state === 'dim' ? 0.4 : 1,
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 18px',
                      cursor: answered || state === 'eliminated' ? 'default' : 'pointer',
                      fontSize: choiceFontSize, fontWeight: 500,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{
                     width: 34, height: 34, borderRadius: 6,
                     backgroundColor:
                       state === 'correct' ? '#00A842' :
                       state === 'missed-correct' ? '#d97706' :
                       state === 'selected-pending' ? '#0165fc' :
                       '#000',
                     color: '#fff',
                     display: 'flex', alignItems: 'center', justifyContent: 'center',
                     fontSize: 14, fontWeight: 700, flexShrink: 0,
                    }}>
                     {state === 'correct' ? <Check style={{ width: 18, height: 18 }} /> :
                      state === 'missed-correct' ? <Check style={{ width: 18, height: 18 }} /> :
                      state === 'selected-pending' ? <Check style={{ width: 18, height: 18 }} /> :
                      LETTERS[idx]}
                    </span>
                    {choice}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          {/* Left: empty placeholder */}
          <span />

          {/* Right: Sparkles / Done when not answered, Learn More + Next when answered */}
          {!answered ? (
            isSelectAll ? (
              <button
                onClick={handleSelectAllDone}
                disabled={selectAllPending.size === 0}
                style={{
                  backgroundColor: selectAllPending.size > 0 ? '#00A842' : '#d1d5db',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: selectAllPending.size > 0 ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'background-color 0.2s',
                }}
              >
                <Check style={{ width: 16, height: 16 }} /> Done
              </button>
            ) : !isTrueFalse && (
              <button
                onClick={canEliminate ? handleEliminate : undefined}
                disabled={!canEliminate}
                title="Eliminate one wrong answer"
                className={cn(eliminateShake && 'animate-subtle-shake')}
                style={{
                  color: eliminateUsed ? '#d1d5db' : canEliminate ? '#0165fc' : '#d1d5db',
                  opacity: eliminateUsed ? 0.4 : 1,
                  cursor: canEliminate && !eliminateUsed ? 'pointer' : 'not-allowed',
                  background: 'none', border: 'none', padding: 0,
                  transition: 'opacity 0.3s, color 0.3s',
                }}
              >
                <Sparkles style={{ width: 20, height: 20 }} />
              </button>
            )
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              {hasExplanation && (
                <button
                  onClick={() => { setFlipped(true); cancelCountdown(); }}
                  style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <GraduationCap style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ borderBottom: '1.5px dotted #555', paddingBottom: 1 }}>Learn More</span>
                </button>
              )}
              <button
                onClick={() => { cancelCountdown(); onNext(); }}
                style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', position: 'relative' }}
              >
                <SkipForward style={{ width: 14, height: 14, flexShrink: 0 }} />
                <span style={{ borderBottom: '1.5px dotted #555', paddingBottom: 1, position: 'relative' }}>
                  {countdown !== null && (
                    <span style={{
                      position: 'absolute', bottom: 0, left: 0,
                      height: '1.5px', backgroundColor: '#555',
                      width: `${((COUNTDOWN_SECS - countdown + 1) / COUNTDOWN_SECS) * 100}%`,
                      transition: 'width 1s linear',
                    }} />
                  )}
                  {isLast ? 'Finish' : 'Next'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Card Action Pane ── */}
      <div
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          backgroundColor: '#fff',
        }}
      >
        {/* Mastery pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          backgroundColor: '#F5F5F0', borderRadius: 20,
          padding: '6px 16px', fontSize: 13, flexShrink: 0,
        }}>
          <Glasses style={{ width: 20, height: 20, flexShrink: 0 }} />
          <span style={{ fontSize: 15 }}>Mastery: <strong>{masteryPct !== null ? `${masteryPct}%` : '--'}</strong></span>
          <span style={{ fontSize: 15 }}>Times Studied: <strong>{timesStudied !== null ? timesStudied : '--'}</strong></span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button
            onClick={() => {
              const next = !bookmarked;
              setBookmarked(next);
              onToggleBookmark && onToggleBookmark(card.id, next);
            }}
            style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: bookmarked ? '#d97706' : 'inherit' }}
          >
            {bookmarked
              ? <BookmarkX style={{ width: 20, height: 20, flexShrink: 0 }} />
              : <Bookmark style={{ width: 20, height: 20, flexShrink: 0 }} />
            }
          </button>
          <button
            onClick={() => setNoteEditing(v => !v)}
            style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Pencil style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span style={{ borderBottom: '1.5px dotted #555', paddingBottom: 2 }}>Add/Edit Hint</span>
          </button>
          <button
            onClick={() => { if (!finalAnswer) { onScore && onScore(SCORE.wrong, 'wrong'); } onNext(); }}
            disabled={!!finalAnswer}
            style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: finalAnswer ? 'not-allowed' : 'pointer', opacity: finalAnswer ? 0.35 : 1, transition: 'opacity 0.3s' }}
          >
            <SkipForward style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span style={{ borderBottom: '1.5px dotted #555', paddingBottom: 2 }}>Skip</span>
          </button>
        </div>


      </div>

      {/* Note editor modal */}
      <Dialog open={noteEditing} onOpenChange={setNoteEditing}>
        <DialogContent className="max-w-md">
          <h3 className="font-semibold text-base flex items-center gap-2 mb-3">
            <Pencil className="w-4 h-4 text-amber-600" /> Add / Edit Hint
          </h3>
          {/* Card reference */}
          <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5 mb-4 space-y-1">
            {card.clue && <p className="text-sm font-semibold">{card.clue}</p>}
            <p className="text-sm text-muted-foreground">Answer: <span className="font-semibold text-foreground">{correctAnswers.join(', ')}</span></p>
          </div>
          <CardNoteEditor cardId={card.id} />
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

      {/* Wrong answer modal */}
      <Dialog open={!!wrongModal} onOpenChange={(open) => { if (!open) handleTryAgain(); }}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <X className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Not quite!</h3>
              {!finalAnswer
                ? <p className="text-muted-foreground text-sm mt-1">You have one attempt remaining.</p>
                : <p className="text-muted-foreground text-sm mt-1">The correct answer was <span className="font-semibold text-foreground">{correctAnswers.join(', ')}</span>.</p>
              }
            </div>
            <div className="flex gap-2 w-full">
              {!finalAnswer && <Button className="flex-1" onClick={handleTryAgain}>Try Again</Button>}
              <Button variant={finalAnswer ? 'default' : 'outline'} className="flex-1 gap-1.5" onClick={handleSkip}>
                <SkipForward className="w-4 h-4" />
                {isLast ? 'Finish' : 'Skip'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}