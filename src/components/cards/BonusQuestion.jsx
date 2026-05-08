import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function BonusQuestion({ card, onNext, isLast }) {
  const [shuffledChoices, setShuffledChoices] = useState([]);
  const [finalAnswer, setFinalAnswer] = useState(null);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    setShuffledChoices(shuffle(card.bonus_choices));
    setFinalAnswer(null);
    setShake(false);
  }, [card.id]);

  const answered = !!finalAnswer;
  const isCorrect = finalAnswer === card.bonus_correct_answer;

  const handleSelect = (choice) => {
    if (answered) return;
    setFinalAnswer(choice);
    if (choice !== card.bonus_correct_answer) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
  };

  const getState = (choice) => {
    if (!answered) return 'idle';
    if (choice === card.bonus_correct_answer) return 'correct';
    if (choice === finalAnswer) return 'wrong';
    return 'dim';
  };

  const imageUrl = card.bonus_image_url || card.image_url;

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
        {/* Bonus badge */}
        <div className="bg-accent/70 px-5 py-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-accent-foreground uppercase tracking-wide">⭐ Bonus Question</span>
        </div>

        {/* Image */}
        {imageUrl && (
          <div className="bg-muted flex items-center justify-center">
            <img src={imageUrl} alt="bonus" className="w-full h-auto object-contain" />
          </div>
        )}

        {/* Question */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-base font-medium text-foreground">{card.bonus_question}</p>
        </div>

        {/* Choices */}
        <div className="px-5 pb-5 flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {shuffledChoices.map((choice) => {
              const state = getState(choice);
              return (
                <button
                  key={choice}
                  disabled={answered}
                  onClick={() => handleSelect(choice)}
                  className={cn(
                    'relative rounded-xl border-2 px-3 py-2.5 text-sm font-medium text-center transition-all duration-150',
                    state === 'idle' && 'border-border hover:border-primary hover:bg-accent cursor-pointer',
                    state === 'correct' && 'border-success bg-success/10 text-success animate-pop-in',
                    state === 'wrong' && cn('border-destructive bg-destructive/10 text-destructive', shake && 'animate-shake'),
                    state === 'dim' && 'border-border text-muted-foreground opacity-50',
                  )}
                >
                  {state === 'correct' && <Check className="inline w-3.5 h-3.5 mr-1" />}
                  {state === 'wrong' && <X className="inline w-3.5 h-3.5 mr-1" />}
                  {choice}
                </button>
              );
            })}
          </div>

          {answered && (
            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={onNext} disabled={isLast} className="h-8 text-xs">
                {isLast ? 'Finished' : 'Next →'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}