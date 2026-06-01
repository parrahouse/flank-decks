import { useState, useEffect, useRef } from 'react';
import {
  HelpCircle,
  SquareCheck,
  ToggleLeft,
  CopyCheck,
  Sparkles,
  Glasses,
  Bookmark,
  Pencil,
  SkipForward,
  GraduationCap,
  X,
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
}) {
  const { playCorrect, playWrong } = useSound(soundEnabled);
  const [shuffledChoices, setShuffledChoices] = useState([]);
  const [firstWrong, setFirstWrong] = useState(null);
  const [finalAnswer, setFinalAnswer] = useState(null);
  const [eliminated, setEliminated] = useState([]);
  const [clueRevealed, setClueRevealed] = useState(!!deck?.clue_default_revealed);
  const [clueManuallyRevealed, setClueManuallyRevealed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [shake, setShake] = useState(false);
  const [wrongModal, setWrongModal] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [eliminateShake, setEliminateShake] = useState(false);
  const [eliminateUsed, setEliminateUsed] = useState(false);
  const countdownRef = useRef(null);
  const idleTimerRef = useRef(null);

  const clueAllowed = deck?.clue_mode !== 'disabled';
  const hasClue = !!card.clue;
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
    setClueRevealed(!!deck?.clue_default_revealed);
    setClueManuallyRevealed(false);
    setFlipped(false);
    setShake(false);
    setWrongModal(null);
    setNoteEditing(false);
    setEliminateShake(false);
    setEliminateUsed(false);
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

  const answered = !!finalAnswer;

  const canEliminate =
    clueAllowed && !answered && !firstWrong && !isTrueFalse && !isSelectAll &&
    eliminated.length < shuffledChoices.length - 2 && shuffledChoices.length > 2;

  const handleSelect = (choice) => {
    if (finalAnswer) return;
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

  const handleEliminate = () => {
    if (finalAnswer || firstWrong) return;
    const wrong = shuffledChoices.filter((c) => !correctAnswers.includes(c) && !eliminated.includes(c));
    if (wrong.length === 0) return;
    const toElim = wrong[Math.floor(Math.random() * wrong.length)];
    setEliminated((prev) => [...prev, toElim]);
    setEliminateUsed(true);
    clearTimeout(idleTimerRef.current);
  };

  // 30-second idle shake for eliminate button
  useEffect(() => {
    if (answered || firstWrong || !canEliminate) return;
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setEliminateShake(true);
      setTimeout(() => setEliminateShake(false), 600);
    }, 30000);
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
    if (!answered && !firstWrong) return 'idle';
    if (!answered && firstWrong) {
      if (choice === firstWrong) return 'first-wrong';
      return 'idle-retry';
    }
    if (choice === finalAnswer && correct) return 'correct';
    if (choice === finalAnswer && !correct) return 'wrong-final';
    if (correct) return 'reveal-correct';
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
  const masteryPct = cardStats && cardStats.sessions_completed > 0
    ? Math.round((cardStats.correct_attempts / cardStats.sessions_completed) * 100)
    : null;

  const qtLabel = isTrueFalse ? 'True or False?' : isSelectAll ? 'Multi-Select' : 'Single Select';

  const choiceBorderColor = (state) => {
    if (state === 'correct' || state === 'reveal-correct') return '#00A842';
    if (state === 'wrong-final') return '#dc2626';
    if (state === 'first-wrong') return '#f97316';
    if (state === 'eliminated') return '#ccc';
    return '#000';
  };

  const choiceBgColor = (state) => {
    if (state === 'correct' || state === 'reveal-correct') return '#f0fdf4';
    if (state === 'wrong-final') return '#fef2f2';
    if (state === 'first-wrong') return '#fff7ed';
    if (state === 'eliminated') return '#f5f5f5';
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
          border: '2px solid #000',
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#f3f4f6',
        }}
      >
        {card.image_url
          ? <img src={card.image_url} alt="card" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ color: '#9ca3af', fontSize: 14 }}>No image</span>
        }
      </div>

      {/* ── Question Pane ── */}
      <div
        style={{
          width: '100%',
          backgroundColor: '#DFEDF5',
          position: 'relative',
          padding: '20px 20px 40px 20px',
          boxSizing: 'border-box',
          minHeight: 100,
        }}
      >
        <p style={{ color: '#113656', fontSize: 'clamp(22px, 4vw, 40px)', fontWeight: 600, lineHeight: 1.2, margin: 0 }}>
          {card.clue || correctAnswers[0] || ''}
        </p>

        {/* Bottom left: card counter */}
        <span style={{ position: 'absolute', bottom: 10, left: 20, color: '#113656', fontSize: 14 }}>
          {cardIndex + 1}/{total}
        </span>

        {/* Bottom right: clue toggle */}
        {hasClue && clueAllowed && (
          <button
            style={{ position: 'absolute', bottom: 8, right: 16, color: '#113656', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onClick={() => { setClueRevealed(v => !v); if (!clueRevealed) setClueManuallyRevealed(true); }}
            title={clueRevealed ? 'Hide clue' : 'Show clue'}
          >
            <HelpCircle style={{ width: 22, height: 22 }} />
          </button>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#00A842', fontSize: 24, fontWeight: 600 }}>
            <span>{qtLabel}</span>
            {isTrueFalse
              ? <ToggleLeft style={{ width: 28, height: 28 }} />
              : isSelectAll
                ? <span style={{ display: 'inline-flex', gap: 2 }}>
                    <SquareCheck style={{ width: 28, height: 28 }} />
                    <SquareCheck style={{ width: 22, height: 22 }} />
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
                      backgroundColor: '#000', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, flexShrink: 0,
                    }}>
                      {LETTERS[idx]}
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
                      backgroundColor: '#000', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, flexShrink: 0,
                    }}>
                      {LETTERS[idx]}
                    </span>
                    {choice}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          {/* Left: empty placeholder */}
          <span />

          {/* Right: Sparkles when not answered, Learn More + Next when answered */}
          {!answered ? (
            !isTrueFalse && (
              <button
                onClick={canEliminate ? handleEliminate : undefined}
                disabled={!canEliminate}
                title="Eliminate one wrong answer"
                className={cn(eliminateShake && 'animate-subtle-shake')}
                style={{
                  color: eliminateUsed ? '#d1d5db' : canEliminate ? '#765E09' : '#d1d5db',
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
                  style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', borderBottom: '1.5px dotted #555', paddingBottom: 1, cursor: 'pointer' }}
                >
                  <GraduationCap style={{ width: 14, height: 14 }} />
                  Learn More
                </button>
              )}
              <button
                onClick={() => { cancelCountdown(); onNext(); }}
                style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', borderBottom: '1.5px dotted #555', paddingBottom: 1, cursor: 'pointer', position: 'relative' }}
              >
                {countdown !== null && (
                  <span style={{
                    position: 'absolute', bottom: 0, left: 0,
                    height: '1.5px', backgroundColor: '#555',
                    width: `${((COUNTDOWN_SECS - countdown + 1) / COUNTDOWN_SECS) * 100}%`,
                    transition: 'width 1s linear',
                  }} />
                )}
                <SkipForward style={{ width: 14, height: 14 }} />
                {isLast ? 'Finish' : 'Next'}
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
          <button style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
            <Bookmark style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span style={{ borderBottom: '1.5px dotted #555', paddingBottom: 2 }}>Add Bookmark</span>
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
            style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <SkipForward style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span style={{ borderBottom: '1.5px dotted #555', paddingBottom: 2 }}>Skip</span>
          </button>
        </div>


      </div>

      {/* Note editor */}
      {noteEditing && (
        <div style={{ width: '100%', border: '2px solid #D9D9D9', backgroundColor: '#fffbeb', padding: 12, boxSizing: 'border-box' }}>
          <CardNoteEditor cardId={card.id} />
          <button onClick={() => setNoteEditing(false)} style={{ marginTop: 8, width: '100%', fontSize: 12, color: '#d97706', background: 'none', border: 'none', cursor: 'pointer' }}>
            Done
          </button>
        </div>
      )}

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