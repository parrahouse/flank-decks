import { cn } from '@/lib/utils';

// A single tally group: 4 vertical bars + 1 diagonal = 5
function TallyGroup({ count, filled }) {
  // count = how many of this group's 5 marks are filled (1-5)
  const bars = [0, 1, 2, 3]; // indices for the 4 vertical bars
  const hasDiagonal = count >= 5;

  return (
    <div className="relative flex items-end gap-[2px]" style={{ width: 22, height: 20 }}>
      {bars.map(i => (
        <div
          key={i}
          className={cn(
            'rounded-full transition-all duration-200',
            i < count ? 'bg-primary' : 'bg-muted',
          )}
          style={{ width: 2.5, height: 16 }}
        />
      ))}
      {/* Diagonal strike-through for 5th mark */}
      {filled >= 5 ? (
        <svg
          className="absolute inset-0"
          width={22}
          height={20}
          style={{ pointerEvents: 'none' }}
        >
          <line
            x1={1} y1={17} x2={21} y2={3}
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </svg>
      ) : count >= 5 ? (
        <svg
          className="absolute inset-0"
          width={22}
          height={20}
          style={{ pointerEvents: 'none' }}
        >
          <line
            x1={1} y1={17} x2={21} y2={3}
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </svg>
      ) : null}
    </div>
  );
}

export default function StreakBar({ cardIndex, total, done, streak = 0 }) {
  const pct = total > 0 ? ((cardIndex + (done ? 1 : 0)) / total) * 100 : 0;

  // Build 20 tally groups (up to 100 marks)
  const groups = Array.from({ length: 20 }, (_, g) => {
    const groupStart = g * 5;        // 0, 5, 10, …
    const filled = Math.max(0, Math.min(5, streak - groupStart));
    return filled;
  });

  return (
    <div className="space-y-2 mb-6">
      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all duration-300 bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Labels row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{done ? 'Complete!' : `Card ${cardIndex + 1} of ${total}`}</span>
        {streak > 0 && (
          <span className="font-medium text-primary">{streak} correct in a row</span>
        )}
      </div>

      {/* Tally marks — only show groups that have at least 1 mark filled */}
      {streak > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          {groups.map((filled, g) => {
            if (filled === 0) return null;
            return (
              <TallyGroup key={g} count={filled} filled={filled} />
            );
          })}
        </div>
      )}
    </div>
  );
}