import { useState, useEffect } from 'react';
import { RotateCcw, Lightbulb, Check, X } from 'lucide-react';
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

export default function StudyCard({ card, onNext, onPrev, isFirst, isLast }) {
  const [shuffledChoices, setShuffledChoices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [eliminated, setEliminated] = useState([]);
  const [flipped, setFlipped] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    setShuffledChoices(shuffle(card.choices));
    setSelected(null);
    setEliminated([]);
    setFlipped(false);
    setShake(false);
  }, [card.id]);

  const handleSelect = (choice) => {
    if (selected) return;
    setSelected(choice);
    if (choice !== card.correct_answer) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
  };

  const handleEliminate = () => {
    if (selected) return;
    const wrong = shuffledChoices.filter(c => c !== card.correct_answer && !eliminated.includes(c));
    if (wrong.length === 0) return;
    const toElim = wrong[Math.floor(Math.random() * wrong.length)];
    setEliminated(prev => [...prev, toElim]);
  };

  const isCorrect = selected === card.correct_answer;
  const answered = !!selected;

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="card-flip w-full">
        <div className={cn('card-flip-inner w-full', flipped && card.explanation && 'flipped')} style={{ minHeight: 480 }}>

          {/* FRONT */}
          <div className="card-face bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col w-full">
            {/* Image */}
            <div className="bg-muted flex items-center justify-center" style={{ height: 220 }}>
              {card.image_url ? (
                <img src={card.image_url} alt="card" className="w-full h-full object-cover" />
              ) : (
                <div className="text-muted-foreground text-sm">No image</div>
              )}
            </div>

            {/* Choices */}
            <div className="p-5 flex flex-col gap-3 flex-1">
              <div className="grid grid-cols-2 gap-2">
                {shuffledChoices.map((choice) => {
                  const isElim = eliminated.includes(choice);
                  const isSelected = selected === choice;
                  const correct = choice === card.correct_answer;

                  return (
                    <button
                      key={choice}
                      disabled={isElim || !!selected}
                      onClick={() => handleSelect(choice)}
                      className={cn(
                        'relative rounded-xl border-2 px-3 py-2.5 text-sm font-medium text-center transition-all duration-150',
                        isElim && 'opacity-30 line-through cursor-not-allowed border-border text-muted-foreground',
                        !isElim && !answered && 'border-border hover:border-primary hover:bg-accent cursor-pointer',
                        isSelected && correct && 'border-success bg-success/10 text-success animate-pop-in',
                        isSelected && !correct && cn('border-destructive bg-destructive/10 text-destructive', shake && 'animate-shake'),
                        answered && !isSelected && correct && 'border-success bg-success/10 text-success',
                        answered && !isSelected && !correct && !isElim && 'border-border text-muted-foreground opacity-60',
                      )}
                    >
                      {isSelected && correct && <Check className="inline w-3.5 h-3.5 mr-1" />}
                      {isSelected && !correct && <X className="inline w-3.5 h-3.5 mr-1" />}
                      {choice}
                    </button>
                  );
                })}
              </div>

              {/* Actions row */}
              <div className="flex items-center justify-between pt-2 mt-auto">
                <div className="flex gap-2">
                  {!answered && eliminated.length < shuffledChoices.length - 2 && (
                    <Button variant="outline" size="sm" onClick={handleEliminate} className="h-8 text-xs gap-1">
                      <Lightbulb className="w-3.5 h-3.5" /> Eliminate one
                    </Button>
                  )}
                  {answered && card.explanation && (
                    <Button variant="outline" size="sm" onClick={() => setFlipped(true)} className="h-8 text-xs gap-1">
                      <RotateCcw className="w-3.5 h-3.5" /> See explanation
                    </Button>
                  )}
                </div>
                {answered && (
                  <Button size="sm" onClick={onNext} disabled={isLast} className="h-8 text-xs">
                    {isLast ? 'Finished' : 'Next →'}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* BACK */}
          <div className="card-face card-face-back bg-card border border-border rounded-2xl flex flex-col items-center justify-center p-8 gap-4 text-center shadow-sm w-full">
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-accent-foreground" />
            </div>
            <h3 className="font-semibold text-lg text-foreground">{card.correct_answer}</h3>
            <p className="text-muted-foreground leading-relaxed">{card.explanation}</p>
            <Button variant="outline" size="sm" onClick={() => setFlipped(false)} className="mt-2">
              ← Back to card
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}