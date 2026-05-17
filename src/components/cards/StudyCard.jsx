import { useState, useEffect, useCallback, useRef } from 'react';
import { Pointer, GraduationCap, Lightbulb, X, Eye, SkipForward, StickyNote, Pencil } from 'lucide-react';
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

// Scoring constants
const SCORE = {
  correct: 1,
  second_guess: 0.75,
  correct_after_clue: 0.5,
  second_guess_after_clue: 0.35,
  wrong: 0
};

export default function StudyCard({ card, deck, onNext, onPrev, isFirst, isLast, onScore, soundEnabled = true, autoAdvance = false, note = null }) {
  const { playCorrect, playWrong } = useSound(soundEnabled);
  const [shuffledChoices, setShuffledChoices] = useState([]);
  const [firstWrong, setFirstWrong] = useState(null);
  const [finalAnswer, setFinalAnswer] = useState(null);
  const [eliminated, setEliminated] = useState([]);
  const [clueRevealed, setClueRevealed] = useState(!!deck?.clue_default_revealed);
  // Only penalise if the user manually revealed the clue (not when it's shown by default)
  const [clueManuallyRevealed, setClueManuallyRevealed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [shake, setShake] = useState(false);
  const [wrongModal, setWrongModal] = useState(null); // the wrong choice that triggered it
  const [countdown, setCountdown] = useState(null);
  const [noteRevealed, setNoteRevealed] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const countdownRef = useRef(null);

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  const clueAllowed = deck?.clue_mode !== 'disabled';
  const hasClue = !!card.clue;
  const hasExplanation = !!card.explanation;
  const eliminateUsed = eliminated.length > 0;

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
    setNoteRevealed(false);
    setNoteEditing(false);
    cancelCountdown();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [card.id]);

  useEffect(() => () => cancelCountdown(), []);

  // Keyboard letter shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (wrongModal) return;
      const idx = e.key.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, ...
      if (idx < 0 || idx >= shuffledChoices.length) return;
      const choice = shuffledChoices[idx];
      if (eliminated.includes(choice) || finalAnswer) return;
      handleSelect(choice);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shuffledChoices, eliminated, finalAnswer, wrongModal, firstWrong, clueManuallyRevealed]);

  const correctAnswers = (card.correct_answers || card.correct_answer || '').split('|').map((s) => s.trim()).filter(Boolean);

  const handleSelect = (choice) => {
    if (finalAnswer) return; // already locked
    const correct = correctAnswers.includes(choice);

    if (correct) {
      // Determine score
      const penaliseClue = clueManuallyRevealed;
      const scoreKey = firstWrong ?
      penaliseClue ? 'second_guess_after_clue' : 'second_guess' :
      penaliseClue ? 'correct_after_clue' : 'correct';
      setFinalAnswer(choice);
      playCorrect();
      onScore && onScore(SCORE[scoreKey], scoreKey);
      if (autoAdvance && !isLast) startCountdown();
    } else {
      playWrong();
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
    const wrong = shuffledChoices.filter((c) => !correctAnswers.includes(c) && !eliminated.includes(c));
    if (wrong.length === 0) return;
    const toElim = wrong[Math.floor(Math.random() * wrong.length)];
    setEliminated((prev) => [...prev, toElim]);
  };

  const answered = !!finalAnswer;
  const isCorrect = correctAnswers.includes(finalAnswer);

  // A choice is "wrong-first" (orange) but not locked
  const getChoiceState = (choice) => {
    const isElim = eliminated.includes(choice);
    const correct = correctAnswers.includes(choice);
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

  return (
    <div className="w-full">
      <div className="card-flip w-full">
        <div className={cn('card-flip-inner w-full', flipped && card.explanation && 'flipped')}>

          {/* FRONT */}
          <div className="card-face bg-card border border-border rounded-b-2xl overflow-hidden shadow-sm flex flex-col w-full">

            {/* Image — 4:3 aspect ratio */}
            <div className="relative w-full bg-muted flex items-center justify-center" style={{ aspectRatio: '4/3' }}>
              {card.image_url ?
              <img src={card.image_url} alt="card" className="absolute inset-0 w-full h-full object-cover rounded-none" /> :

              <div className="text-muted-foreground text-sm">No image</div>
              }
            </div>

            {/* Clue */}
            {hasClue && clueAllowed &&
            <div className="border-t border-border flex items-center bg-accent/60 px-4 py-2" style={{ minHeight: '5rem' }}>
                {clueRevealed ?
              <p className="font-bricolage text-accent-foreground leading-snug my-2 text-2xl">{card.clue}</p> :

              !answered &&
              <button
                onClick={() => {setClueRevealed(true);setClueManuallyRevealed(true);}}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                
                      <Eye className="w-3.5 h-3.5" /> Reveal clue
                    </button>

              }
              </div>
            }

            {/* Choices + Actions */}
            <div className="p-5 flex flex-col gap-3 border-t border-border">
              <div className="flex flex-col gap-2">
                {shuffledChoices.map((choice, idx) => {
                  const state = getChoiceState(choice);
                  const isShaking = shake && (state === 'first-wrong' || state === 'wrong-final');
                  const letter = LETTERS[idx];

                  return (
                    <button
                      key={choice}
                      disabled={state === 'eliminated' || answered}
                      onClick={() => handleSelect(choice)}
                      className={cn(
                        'w-full rounded-xl border-2 px-3 py-2.5 text-sm font-medium text-left transition-all duration-150 min-h-[2.75rem] flex items-start gap-3',
                        state === 'eliminated' && 'opacity-25 line-through cursor-not-allowed border-border text-muted-foreground',
                        state === 'idle' && 'border-border hover:border-primary hover:bg-accent cursor-pointer',
                        state === 'idle-retry' && 'border-border hover:border-primary hover:bg-accent cursor-pointer',
                        state === 'first-wrong' && cn('border-orange-400 bg-orange-50 text-orange-700', isShaking && 'animate-shake'),
                        state === 'correct' && 'border-success bg-success/10 text-success animate-pop-in',
                        state === 'wrong-final' && cn('border-destructive bg-destructive/10 text-destructive', isShaking && 'animate-shake'),
                        state === 'reveal-correct' && 'border-success bg-success/10 text-success',
                        state === 'dim' && 'border-border text-muted-foreground opacity-50'
                      )}>
                      
                      <span className={cn(
                        'shrink-0 w-5 h-5 mt-0.5 rounded flex items-center justify-center text-xs font-bold',
                        state === 'idle' || state === 'idle-retry' ? 'bg-muted text-muted-foreground' : 'bg-current/10'
                      )}>
                        {letter}
                      </span>
                      <span className="whitespace-normal break-words">{choice}</span>
                    </button>);

                })}
              </div>

              {/* Personal Note */}
              <div className="border border-amber-200 bg-amber-50">
                {noteEditing ?
                <div className="p-2">
                    <CardNoteEditor cardId={card.id} />
                    <button
                    onClick={() => setNoteEditing(false)}
                    className="mt-2 w-full text-xs text-amber-600 hover:text-amber-800 transition-colors text-center">
                    
                      Done
                    </button>
                  </div> :
                note && noteRevealed ?
                <div className="px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <StickyNote className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Note</span>
                      </div>
                      <button onClick={() => setNoteEditing(true)} className="text-amber-500 hover:text-amber-700 transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm text-amber-900 leading-snug whitespace-pre-wrap">{note}</p>
                  </div> :
                note ?
                <div className="flex items-center justify-between px-3 py-2">
                    <button
                    onClick={() => setNoteRevealed(true)}
                    className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 transition-colors">
                    
                      <StickyNote className="w-3.5 h-3.5" />
                      Reveal note
                    </button>
                    <button onClick={() => setNoteEditing(true)} className="text-amber-400 hover:text-amber-700 transition-colors">
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div> :

                <button
                  onClick={() => setNoteEditing(true)}
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-amber-500 hover:text-amber-700 transition-colors">
                  
                    <StickyNote className="w-3.5 h-3.5" />
                    Add a note
                  </button>
                }
              </div>

              {/* Actions row */}
              <div className="flex items-center justify-between pt-2 mt-auto">
                <div className="flex gap-2 flex-wrap">
                  {clueAllowed && !answered && !firstWrong && eliminated.length < shuffledChoices.length - 2 && shuffledChoices.length > 2 &&
                  <Button variant="outline" size="sm" onClick={handleEliminate} className="h-8 text-xs gap-1">
                      <Lightbulb className="w-3.5 h-3.5" /> Eliminate one
                    </Button>
                  }
                  {answered && hasExplanation &&
                  <Button variant="outline" size="sm" onClick={() => {setFlipped(true);cancelCountdown();}} className="h-8 text-xs gap-1">
                      <GraduationCap className="w-3.5 h-3.5" /> Learn More
                    </Button>
                  }
                </div>
                {answered && !flipped &&
                <div className="flex items-center gap-2">
                    <button
                    onClick={() => {cancelCountdown();onNext();}}
                    className="relative h-8 px-3 rounded-md text-xs font-medium overflow-hidden"
                    style={{ minWidth: '4.5rem', backgroundColor: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}>
                    
                      {/* Progressive fill */}
                      <span
                      className="absolute inset-0 origin-left"
                      style={{
                        backgroundColor: 'hsl(var(--primary) / 0.35)',
                        transform: countdown !== null ?
                        `scaleX(${(COUNTDOWN_SECS - countdown + 1) / COUNTDOWN_SECS})` :
                        'scaleX(1)',
                        transition: countdown !== null ? 'transform 1s linear' : 'none'
                      }} />
                    
                      <span className="relative z-10">{isLast ? 'Finish →' : 'Next →'}</span>
                    </button>
                  </div>
                }

              </div>
            </div>
          </div>

          {/* BACK — full explanation */}
          <div className="card-face card-face-back bg-card border border-border rounded-2xl flex flex-col p-6 gap-4 shadow-sm w-full overflow-y-auto">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                <Pointer className="w-4 h-4 text-accent-foreground" />
              </div>
              <h3 className="font-semibold text-lg text-foreground">{correctAnswers.join(', ')}</h3>
            </div>
            <div
              className="prose prose-sm max-w-none text-muted-foreground flex-1"
              dangerouslySetInnerHTML={{ __html: card.explanation }} />
            
            <Button variant="outline" size="sm" onClick={() => setFlipped(false)} className="self-start mt-auto">
              ← Back to card
            </Button>
          </div>
        </div>
      </div>
      {/* Wrong answer modal */}
      <Dialog open={!!wrongModal} onOpenChange={(open) => {if (!open) handleTryAgain();}}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <X className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Not quite!</h3>
              {!finalAnswer ?
              <p className="text-muted-foreground text-sm mt-1">You have one attempt remaining.</p> :

              <p className="text-muted-foreground text-sm mt-1">
                  The correct answer was <span className="font-semibold text-foreground">{correctAnswers.join(', ')}</span>.
                </p>
              }
            </div>
            <div className="flex gap-2 w-full">
              {!finalAnswer &&
              <Button className="flex-1" onClick={handleTryAgain}>
                  Try Again
                </Button>
              }
              <Button
                variant={finalAnswer ? 'default' : 'outline'}
                className="flex-1 gap-1.5"
                onClick={handleSkip}>
                
                <SkipForward className="w-4 h-4" />
                {isLast ? 'Finish' : 'Skip'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>);

}