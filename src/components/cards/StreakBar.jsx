import { Tally1, Tally2, Tally3, Tally4, Tally5 } from 'lucide-react';

const TALLY_ICONS = [null, Tally1, Tally2, Tally3, Tally4, Tally5];

export default function StreakBar({ cardIndex, total, done, streak = 0 }) {
  const pct = total > 0 ? ((cardIndex + (done ? 1 : 0)) / total) * 100 : 0;

  // How many complete groups of 5 and remainder
  const completeGroups = Math.floor(streak / 5);
  const remainder = streak % 5;

  // Build icon list: full Tally5 groups + one partial if any
  const tallies = [
    ...Array(completeGroups).fill(5),
    ...(remainder > 0 ? [remainder] : []),
  ];

  return (
    <div className="space-y-2 mb-6">
      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all duration-300 bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{done ? 'Complete!' : `Card ${cardIndex + 1} of ${total}`}</span>
        {streak > 0 && (
          <span className="font-medium text-primary">{streak} correct in a row</span>
        )}
      </div>

      {/* Tally icons */}
      {streak > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {tallies.map((count, i) => {
            const Icon = TALLY_ICONS[count];
            return <Icon key={i} className="w-5 h-5 text-primary" />;
          })}
        </div>
      )}
    </div>
  );
}