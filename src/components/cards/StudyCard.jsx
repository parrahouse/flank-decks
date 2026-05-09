import { useState, useEffect } from 'react';
import { RotateCcw, Lightbulb, Check, X, Eye, AlertCircle, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import BonusQuestion from './BonusQuestion';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Scoring constants
const SCORE = {
  correct: 1,
  second_guess: 0.75,
  correct_after_clue: 0.5,
  second_guess_after_clue: 0.35,
  wrong: 0,
};

export default function StudyCard({ card, deck, onNext, onPrev, isFirst, isLast, onScore }) {
  const [shuffledChoices, setShuffledChoices] = useState([]);
  const [firstWrong, setFirstWrong] = useState(null);
  const [finalAnswer, setFinalAnswer] = useState(null);
  const [eliminated, setEliminated] = useState([]);
  const [clueRevealed, setClueRevealed] = useState(!!deck?.clue_default_revealed);
  // Only penalise if the user manually revealed the clue (not when it's shown by default)
  const [clueManuallyRevealed, setClueManuallyRevealed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [shake, setShake] = useState(false);
  const [showBonus, setShowBonus] = useState(false);
  const [wrongModal, setWrongModal] = useState(null); // the wrong choice that triggered it

  const clueAllowed = deck?.clue_mode !== 'disabled';
  const hasClue = !!card.clue;
  const hasExplanation = !!card.explanation;
  const eliminateUsed = eliminated.length > 0;

  useEffect(() => {
    setShuffledChoices(shuffle(card.choices));
    setFirstWrong(null);
    setFinalAnswer(null);
    setEliminated([]);
    setClueRevealed(!!deck?.clue_default_revealed);
    setClueManuallyRevealed(false);
    setFlipped(false);
    setShake(false);
    setShowBonus(false);
    setWrongModal(null);
  }, [card.id]);

  const handleSelect = (choice) => {
    if (finalAnswer) return; // already locked
    const correct = choice === card.correct_answer;

    if (correct) {
      // Determine score
      const penaliseClue = clueManuallyRevealed;
      const scoreKey = firstWrong
        ? (penaliseClue ? 'second_guess_after_clue' : 'second_guess')
        : (penaliseClue ? 'correct_after_clue' : 'correct');
      setFinalAnswer(choice);
      onScore && onScore(SCORE[scoreKey], scoreKey);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      if (!firstWrong && !eliminateUsed) {
        // First wrong guess — show modal with try-again / skip
        setFirstWrong(choice);
        setWrongModal(choice);
      } else {
        // Second wrong OR eliminate was used — lock as wrong, no modal
        setFinalAnswer(choice);
        onScore && onScore(SCORE.wrong, 'wrong');
      }
    }
  };

  const handleEliminate = () => {
    if (finalAnswer || firstWrong) return; // can't use after any wrong guess
    const wrong = shuffledChoices.filter(c => c !== card.correct_answer && !eliminated.includes(c));
    if (wrong.length === 0) return;
    const toElim = wrong[Math.floor(Math.random() * wrong.length)];
    setEliminated(prev => [...prev, toElim]);
  };

  const answered = !!finalAnswer;
  const isCorrect = finalAnswer === card.correct_answer;
  const hasBonus = isCorrect && card.bonus_question && card.bonus_choices?.length >= 2;

  // A choice is "wrong-first" (orange) but not locked
  const getChoiceState = (choice) => {
    const isElim = eliminated.includes(choice);
    const correct = choice === card.correct_answer;
    if (isElim) return 'eliminated';
    if (!answered && !firstWrong) return 'idle';
    if (!answered && firstWrong) {
      // one wrong guess used, waiting for second pick
      if (choice === firstWrong) return 'first-wrong';
      if (isElim) return 'eliminated';
      return 'idle-retry';
    }
    // answered (locked)
    if (choice === finalAnswer && correct) return 'correct';
    if (choice === finalAnswer && !correct) return 'wrong-final';
    if (!choice === finalAnswer && correct) return 'reveal-correct';
    if (correct) return 'reveal-correct';
    return 'dim';
  };

  const handleSkip = () => {
    setWrongModal(null);
    // Mark as wrong if not already locked
    if (!finalAnswer) {
      setFinalAnswer(firstWrong);
      onScore && onScore(SCORE.wrong, 'wrong');
    }
    onNext();
  };

  const handleTryAgain = () => {
    setWrongModal(null);
  };

  if (showBonus) {
    return <BonusQuestion card={card} onNext={onNext} isLast={isLast} />;
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="card-flip w-full">
        <div className={cn('card-flip-inner w-full', flipped && card.explanation && 'flipped')} style={{ minHeight: 480 }}>

          {/* FRONT */}
          <div className="card-face bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col w-full">

            {/* Image */}
            <div className="bg-muted flex items-center justify-center relative" style={{ minHeight: 200 }}>
              {card.image_url ? (
                <img src={card.image_url} alt="card" className="w-full h-auto object-contain" />
              ) : (
                <div className="text-muted-foreground text-sm">No image</div>
              )}
            </div>

            {/* Short clue panel — revealed before answering */}
            {hasClue && clueAllowed && (
              <div className={cn(
                'border-t border-border transition-all duration-300 overflow-hidden',
                clueRevealed ? 'bg-accent/60 px-5 py-3' : 'px-5 py-2'
              )}>
                {clueRevealed ? (
                  <p className="text-sm text-accent-foreground leading-snug">{card.clue}</p>
                ) : (
                  !answered && (
                    <button
                      onClick={() => { setClueRevealed(true); setClueManuallyRevealed(true); }}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> Reveal clue
                    </button>
                  )
                )}
              </div>
            )}



            {/* Choices */}
            <div className="p-5 flex flex-col gap-3 flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {shuffledChoices.map((choice) => {
                  const state = getChoiceState(choice);
                  const isShaking = shake && (state === 'first-wrong' || state === 'wrong-final');

                  return (
                    <button
                      key={choice}
                      disabled={state === 'eliminated' || answered}
                      onClick={() => handleSelect(choice)}
                      className={cn(
                        'relative rounded-xl border-2 px-3 py-2.5 text-sm font-medium text-center transition-all duration-150',
                        state === 'eliminated' && 'opacity-25 line-through cursor-not-allowed border-border text-muted-foreground',
                        state === 'idle' && 'border-border hover:border-primary hover:bg-accent cursor-pointer',
                        state === 'idle-retry' && 'border-border hover:border-primary hover:bg-accent cursor-pointer',
                        state === 'first-wrong' && cn('border-orange-400 bg-orange-50 text-orange-700', isShaking && 'animate-shake'),
                        state === 'correct' && 'border-success bg-success/10 text-success animate-pop-in',
                        state === 'wrong-final' && cn('border-destructive bg-destructive/10 text-destructive', isShaking && 'animate-shake'),
                        state === 'reveal-correct' && 'border-success bg-success/10 text-success',
                        state === 'dim' && 'border-border text-muted-foreground opacity-50',
                      )}
                    >
                      {state === 'correct' && <Check className="inline w-3.5 h-3.5 mr-1" />}
                      {(state === 'wrong-final') && <X className="inline w-3.5 h-3.5 mr-1" />}
                      {choice}
                    </button>
                  );
                })}
              </div>

              {/* Actions row */}
              <div className="flex items-center justify-between pt-2 mt-auto">
                <div className="flex gap-2 flex-wrap">
                  {/* Eliminate — only before any wrong guess, and if clue mode allowed */}
                  {clueAllowed && !answered && !firstWrong && eliminated.length < shuffledChoices.length - 2 && shuffledChoices.length > 2 && (
                    <Button variant="outline" size="sm" onClick={handleEliminate} className="h-8 text-xs gap-1">
                      <Lightbulb className="w-3.5 h-3.5" /> Eliminate one
                    </Button>
                  )}
                  {/* See full explanation after answering */}
                  {answered && hasExplanation && (
                    <Button variant="outline" size="sm" onClick={() => setFlipped(true)} className="h-8 text-xs gap-1">
                      <RotateCcw className="w-3.5 h-3.5" /> See explanation
                    </Button>
                  )}
                </div>
                {answered && !hasBonus && (
                  <Button size="sm" onClick={onNext} className="h-8 text-xs">
                    {isLast ? 'Finish →' : 'Next →'}
                  </Button>
                )}
                {answered && hasBonus && (
                  <Button size="sm" onClick={() => setShowBonus(true)} className="h-8 text-xs gap-1">
                    ⭐ Bonus Question
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* BACK — full explanation */}
          <div className="card-face card-face-back bg-card border border-border rounded-2xl flex flex-col p-6 gap-4 shadow-sm w-full overflow-y-auto" style={{ minHeight: 480 }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                <RotateCcw className="w-4 h-4 text-accent-foreground" />
              </div>
              <h3 className="font-semibold text-lg text-foreground">{card.correct_answer}</h3>
            </div>
            <div
              className="prose prose-sm max-w-none text-muted-foreground flex-1"
              dangerouslySetInnerHTML={{ __html: card.explanation }}
            />
            <Button variant="outline" size="sm" onClick={() => setFlipped(false)} className="self-start mt-auto">
              ← Back to card
            </Button>
          </div>
        </div>
      </div>
      {/* Wrong answer modal */}
      <Dialog open={!!wrongModal} onOpenChange={(open) => { if (!open) handleTryAgain(); }}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <X className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Not quite!</h3>
              {!finalAnswer ? (
                <p className="text-muted-foreground text-sm mt-1">You have one attempt remaining.</p>
              ) : (
                <p className="text-muted-foreground text-sm mt-1">
                  The correct answer was <span className="font-semibold text-foreground">{card.correct_answer}</span>.
                </p>
              )}
            </div>
            <div className="flex gap-2 w-full">
              {!finalAnswer && (
                <Button className="flex-1" onClick={handleTryAgain}>
                  Try Again
                </Button>
              )}
              <Button
                variant={finalAnswer ? 'default' : 'outline'}
                className="flex-1 gap-1.5"
                onClick={handleSkip}
              >
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