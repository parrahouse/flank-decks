import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const CORRECT_KEYS = new Set(['correct', 'second_guess', 'correct_after_clue', 'second_guess_after_clue']);

export default function ContactSheet({ cards, scores, cardIndex, onJump, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="font-semibold text-sm">All Cards</h2>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {cards.map((card, i) => {
              const score = scores[i];
              const isCurrent = i === cardIndex;
              const isAnswered = !!score;
              const isCorrect = isAnswered && CORRECT_KEYS.has(score.key);
              const isWrong = isAnswered && !isCorrect;

              return (
                <button
                  key={card.id}
                  onClick={() => { onJump(i); onClose(); }}
                  className={cn(
                    'relative rounded-lg overflow-hidden border-2 aspect-[3/4] flex flex-col transition-all hover:opacity-90',
                    isCurrent && 'border-primary ring-2 ring-primary/30',
                    !isCurrent && isCorrect && 'border-success',
                    !isCurrent && isWrong && 'border-destructive',
                    !isCurrent && !isAnswered && 'border-border'
                  )}
                >
                  {/* Image or placeholder */}
                  {card.image_url ? (
                    <img src={card.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 bg-muted flex items-center justify-center text-muted-foreground text-xs">
                      #{i + 1}
                    </div>
                  )}

                  {/* Overlay: card number */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-1 flex items-center justify-between">
                    <span className="text-white text-xs font-medium">{i + 1}</span>
                    {isCorrect && <span className="text-success text-xs">✓</span>}
                    {isWrong && <span className="text-destructive text-xs">✗</span>}
                  </div>

                  {/* Current indicator */}
                  {isCurrent && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}