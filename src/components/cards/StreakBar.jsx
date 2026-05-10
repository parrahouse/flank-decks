import { cn } from '@/lib/utils';
import { Flame } from 'lucide-react';

function getStreakStyle(streak) {
  if (streak >= 10) return { bar: 'from-purple-500 to-pink-500', flame: 'text-purple-500' };
  if (streak >= 7)  return { bar: 'from-red-500 to-orange-500',  flame: 'text-red-500' };
  if (streak >= 5)  return { bar: 'from-amber-400 to-orange-500', flame: 'text-orange-500' };
  if (streak >= 3)  return { bar: 'from-yellow-400 to-amber-400', flame: 'text-amber-500' };
  return { bar: 'from-primary to-primary', flame: 'text-primary' };
}

export default function StreakBar({ cardIndex, total, done, streak = 0 }) {
  const pct = total > 0 ? ((cardIndex + (done ? 1 : 0)) / total) * 100 : 0;
  const style = getStreakStyle(streak);

  return (
    <div className="space-y-1.5 mb-6">
      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className={cn(
            'h-2 rounded-full transition-all duration-300 bg-gradient-to-r',
            style.bar
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{done ? 'Complete!' : `Card ${cardIndex + 1} of ${total}`}</span>
        {streak >= 3 && (
          <div className={cn('flex items-center gap-1 font-semibold', style.flame)}>
            <Flame className={cn('w-3.5 h-3.5', streak >= 5 && 'animate-pulse')} />
            <span>{streak} in a row!</span>
          </div>
        )}
      </div>
    </div>
  );
}