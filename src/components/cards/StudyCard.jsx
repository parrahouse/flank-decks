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
  MessageCircleQuestion,
  Check,
  X,
} from 'lucide-react';
import CardNoteEditor from './CardNoteEditor';
import ShortAnswerInput from './ShortAnswerInput';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useSound } from '@/hooks/useSound';
import MathRenderer from '@/components/ui/MathRenderer';
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
  correct: 1,
  second_guess: 0.75,
  correct_after_clue: 0.5,
  second_guess_after_clue: 0.35,
  partial: null, // computed dynamically for select_all
  wrong: 0,
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function getChoiceStyle(choices) {
  const count = choices.length;
  const maxLen = Math.max(...choices.map(c => c.length));
  // More choices or longer text → smaller font + less padding
  let fontSize = 18;
  let minHeight = 52;
  let padding = '8px 14px';
  if (count >= 5 || maxLen > 60) { fontSize = 13; minHeight = 36; padding = '5px 10px'; }
  else if (count >= 4 || maxLen > 40) { fontSize = 14; minHeight = 42; padding = '6px 12px'; }
  else if (maxLen > 25) { fontSize = 16; minHeight = 46; padding = '7px 12px'; }
  return { fontSize, minHeight, padding };
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
  learningMode = false,
  onFirstWrong = null,
  introReady = true,
  childVariant = null,
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
  const isShortAnswer = card.question_type === 'short_answer';
  const hasImage = !!card.image_url;
  const secondGuessAllowed = true;
  const cardPoints = card.point_value ?? 20;

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
    setShuffledChoices(shuffle(card.choices || []));
    setFirstWrong(null);
    setFinalAnswer(null);
    setEliminated([]);
    setClueManuallyRevealed(false);
    setFlipped(false);
    setShake(false);
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
    // Prevent re-selecting a choice already tried (first wrong)
    if (firstWrong && choice === firstWrong) return;

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
      onScore && onScore(cardPoints * SCORE[scoreKey], scoreKey);
      if (autoAdvance && !isLast) startCountdown();
    } else {
      playWrong();
      setShake(true);
      setTimeout(() => setShake(false), 400);
      if (!firstWrong && !eliminated.length && !isTrueFalse) {
        setFirstWrong(choice);
        onFirstWrong && onFirstWrong(choice, { retry: true });
      } else {
        if (!firstWrong) onFirstWrong && onFirstWrong(choice, { retry: false });
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
      onScore && onScore(cardPoints * SCORE[scoreKey], scoreKey);
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
      onScore && onScore(cardPoints * partialScore, 'partial');
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

  const timesStudied = cardStats?.sessions_completed ?? null;
  const minSessions = deck?.mastery_min_sessions ?? 3;
  const masteryPct = cardStats && cardStats.sessions_completed >= minSessions
    ? Math.round((cardStats.correct_attempts / cardStats.total_attempts) * 100)
    : null;

  const qtLabel = isTrueFalse ? 'True or False?' : isSelectAll ? 'Multi-Select' : isShortAnswer ? 'Short Answer' : 'Single Select';

  const choiceBorderColor = (state) => {
    if (state === 'correct' || state === 'reveal-correct') return '#00A842';
    if (state === 'wrong-final') return '#dc2626';
    if (state === 'first-wrong') return '#f97316';
    if (state === 'missed-correct') return '#0165fc';
    if (state === 'eliminated') return '#ccc';
    if (state === 'selected-pending') return '#0165fc';
    return '#000';
  };

  const choiceBgColor = (state) => {
    if (state === 'correct' || state === 'reveal-correct') return '#f0fdf4';
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

  return (
    <div className="mx-auto flex flex-col gap-3 w-full max-w-[700px]">

      {/* ── Top section — fixed height whether or not an image is present ── */}
      <div style={{ width: '100%', height: 'clamp(380px, 50vw, 520px)', display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box', overflow: 'hidden' }}>
        {hasImage && (
          <Pane
            {...paneProps}
            style={{
              flex: 1,
              width: '100%',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#f3f4f6',
            }}
          >
            <img src={card.image_url} alt="card" style={{ width: '100%', height: '100%', objectFit: card.image_fit || 'cover', objectPosition: (card.image_fit !== 'contain' && card.image_focal_point) ? `${card.image_focal_point.x}% ${card.image_focal_point.y}%` : 'center' }} />
          </Pane>
        )}

        {/* Question pane (fills the image space when there's no image) */}
        <Pane
          {...paneProps}
          style={{
            width: '100%',
            ...(hasImage
              ? { height: 120, flexShrink: 0, padding: '20px 20px 40px 20px' }
              : { flex: 1, display: 'flex', alignItems: 'center', padding: '24px 28px 48px 28px' }),
            backgroundColor: hintVisible ? '#EEFF41' : '#DFEDF5',
            position: 'relative',
            boxSizing: 'border-box',
            overflow: 'hidden',
            transition: 'background-color 0.2s',
          }}
        >
          <MathRenderer text={card.clue || ''} className="block" style={{ color: '#113656', fontSize: hasImage ? 'clamp(14px, 2.2vw, 22px)' : 'clamp(22px, 4.5vw, 44px)', fontWeight: 500, lineHeight: 1.3, visibility: hintVisible ? 'hidden' : 'visible' }} />

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
        </Pane>
      </div>

      {/* ── Answer Pane ── */}
      <Pane
        {...paneProps}
        style={{
          width: '100%',
          height: 360,
          backgroundColor: '#FAFAFA',
          border: '2px solid #D9D9D9',
          boxSizing: 'border-box',
          padding: '12px 16px',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          pointerEvents: introReady ? 'auto' : 'none',
        }}
      >
        {/* Top row: question type + second guess */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#00A842', fontSize: 24, fontWeight: 500 }}>
            <span>{qtLabel}</span>
            {isTrueFalse
              ? <ToggleLeft style={{ width: 28, height: 28 }} />
              : isSelectAll
                ? <span style={{ display: 'inline-flex', gap: 2 }}>
                    <SquareCheck style={{ width: 28, height: 28 }} />
                    <SquareCheck style={{ width: 28, height: 28 }} />
                  </span>
                : !isShortAnswer && <SquareCheck style={{ width: 28, height: 28 }} />
            }
          </div>
          {!isTrueFalse && !isShortAnswer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6b7280', fontSize: 13 }}>
              <CopyCheck style={{ width: 15, height: 15 }} />
              <span>Second Guess: {secondGuessAllowed ? 'ON' : 'OFF'}</span>
            </div>
          )}
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

        {/* Choice buttons (multiple_choice / true_false / select_all) */}
        {!isShortAnswer && (
          <>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {isTrueFalse ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  {shuffledChoices.map((choice, idx) => {
                    const state = getChoiceState(choice);
                    return (
                      <button
                        key={choice}
                        disabled={answered}
                        onClick={() => handleSelect(choice)}
                        className={cn('choice-btn', shake && (state === 'first-wrong' || state === 'wrong-final') && 'animate-shake')}
                        style={{
                          flex: 1, minHeight: 64,
                          borderRadius: 12,
                          border: `2px solid ${choiceBorderColor(state)}`,
                          backgroundColor: choiceBgColor(state),
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 16px',
                          cursor: answered ? 'default' : 'pointer',
                          fontSize: 16, fontWeight: 500,
                          textAlign: 'left',
                          transition: 'border-color 0.4s ease 0.15s, background-color 0.4s ease 0.15s',
                        }}
                      >
                        <span style={{
                          width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                          backgroundColor: state === 'correct' ? '#00A842' : '#000',
                          color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700,
                        }}>
                          {state === 'correct' ? <Check style={{ width: 16, height: 16 }} /> : LETTERS[idx]}
                        </span>
                        <MathRenderer text={choice} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {shuffledChoices.map((choice, idx) => {
                    const state = getChoiceState(choice);
                    return (
                      <button
                        key={choice}
                        disabled={state === 'eliminated' || answered}
                        onClick={() => handleSelect(choice)}
                        className={cn('choice-btn', shake && (state === 'first-wrong' || state === 'wrong-final') && 'animate-shake')}
                        style={{
                          width: '100%',
                          minHeight: choiceStyle.minHeight,
                          borderRadius: 10,
                          border: `2px solid ${choiceBorderColor(state)}`,
                          backgroundColor: choiceBgColor(state),
                          opacity: state === 'eliminated' || state === 'dim' ? 0.4 : 1,
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: choiceStyle.padding,
                          cursor: answered || state === 'eliminated' ? 'default' : 'pointer',
                          fontSize: choiceStyle.fontSize, fontWeight: 500,
                          textAlign: 'left',
                          transition: 'border-color 0.4s ease 0.15s, background-color 0.4s ease 0.15s, opacity 0.4s ease 0.15s, transform 0.12s ease',
                        }}
                      >
                        <span style={{
                          width: 28, height: 28, borderRadius: 5, flexShrink: 0,
                          backgroundColor:
                            state === 'correct' ? '#00A842' :
                            state === 'missed-correct' ? '#0165fc' :
                            state === 'selected-pending' ? '#0165fc' :
                            '#000',
                          color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                        }}>
                          {state === 'correct' || state === 'missed-correct' || state === 'selected-pending'
                            ? <Check style={{ width: 14, height: 14 }} />
                            : (isSelectAll && state === 'first-wrong')
                              ? <X style={{ width: 14, height: 14 }} />
                              : LETTERS[idx]}
                        </span>
                        <MathRenderer text={choice} className="flex-1" style={{ lineHeight: 1.3 }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, height: 40, flexShrink: 0 }}>
              <span />
              {!answered ? (
                isSelectAll ? (
                  selectAllPending.size >= 2 && (
                    <button
                      onClick={handleSelectAllDone}
                      style={{
                        backgroundColor: '#00A842', color: '#fff',
                        border: 'none', borderRadius: 8, padding: '8px 20px',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                        transition: 'background-color 0.2s',
                      }}
                    >
                      <Check style={{ width: 16, height: 16 }} /> Done
                    </button>
                  )
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
          </>
        )}
      </Pane>

      {/* ── Card Action Pane ── */}
      <Pane
        {...paneProps}
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


      </Pane>

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

    </div>
  );
}