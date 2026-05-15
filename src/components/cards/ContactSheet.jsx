import { cn } from '@/lib/utils';

const CORRECT_KEYS = new Set(['correct', 'second_guess', 'correct_after_clue', 'second_guess_after_clue']);

export default function ContactSheet({ cards, scores, cardIndex, onJump }) {
  return (
    <div className="w-full">
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
        {cards.map((card, i) => {
          const score = scores[i];
          const isCurrent = i === cardIndex;
          const isAnswered = !!score;
          const isCorrect = isAnswered && CORRECT_KEYS.has(score.key);
          const isWrong = isAnswered && !isCorrect;

          return (
            <button
              key={card.id}
              onClick={() => onJump(i)}
              className={cn(
                'relative rounded-lg overflow-hidden border-2 aspect-[3/4] transition-all hover:opacity-90 hover:scale-105',
                isCurrent && 'border-primary ring-2 ring-primary/30',
                !isCurrent && isCorrect && 'border-success',
                !isCurrent && isWrong && 'border-destructive',
                !isCurrent && !isAnswered && 'border-border'
              )}
            >
              {card.image_url ? (
                <img src={card.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-muted flex items-center justify-center text-muted-foreground text-xs font-medium">
                  {i + 1}
                </div>
              )}

              {/* Bottom bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-1 flex items-center justify-between">
                <span className="text-white text-xs font-medium">{i + 1}</span>
                {isCorrect && <span className="text-success text-xs leading-none">✓</span>}
                {isWrong && <span className="text-red-400 text-xs leading-none">✗</span>}
              </div>

              {/* Current dot */}
              {isCurrent && (
                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary shadow" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}