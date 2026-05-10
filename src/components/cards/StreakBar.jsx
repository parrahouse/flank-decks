import { cn } from '@/lib/utils';
import { Flame, Trophy } from 'lucide-react';

const MILESTONES = [3, 7, 14, 30, 60, 100];

function getMilestoneLabel(n) {
  if (n >= 100) return '100';
  if (n >= 60) return '60';
  if (n >= 30) return '30';
  if (n >= 14) return '14';
  if (n >= 7) return '7';
  return '3';
}

function getStreakStyle(streak) {
  if (streak >= 30) return { bar: 'from-purple-500 to-pink-500', flame: 'text-purple-500', glow: 'shadow-purple-400/40' };
  if (streak >= 14) return { bar: 'from-orange-500 to-red-500', flame: 'text-red-500', glow: 'shadow-red-400/40' };
  if (streak >= 7) return { bar: 'from-amber-400 to-orange-500', flame: 'text-orange-500', glow: 'shadow-orange-400/40' };
  if (streak >= 3) return { bar: 'from-yellow-400 to-amber-400', flame: 'text-amber-500', glow: 'shadow-amber-300/40' };
  return { bar: 'from-primary to-primary', flame: 'text-primary', glow: '' };
}

export default function StreakBar({ cardIndex, total, done, streak = 0, longestStreak = 0 }) {
  const pct = total > 0 ? ((cardIndex + (done ? 1 : 0)) / total) * 100 : 0;
  const style = getStreakStyle(streak);

  // Find next milestone
  const nextMilestone = MILESTONES.find(m => m > streak) || null;

  // Which milestones have been passed
  const reachedMilestones = MILESTONES.filter(m => streak >= m);
  const nextMilestoneToShow = nextMilestone;

  return (
    <div className="space-y-2 mb-6">
      {/* Streak header */}
      {streak > 0 && (
        <div className="flex items-center justify-between text-xs">
          <div className={cn('flex items-center gap-1 font-semibold', style.flame)}>
            <Flame className={cn('w-3.5 h-3.5', streak >= 7 && 'animate-pulse')} />
            <span>{streak}-day streak</span>
            {streak > 0 && streak === longestStreak && streak >= 3 && (
              <span className="ml-1 text-muted-foreground font-normal">(personal best!)</span>
            )}
          </div>
          {nextMilestoneToShow && (
            <span className="text-muted-foreground">
              Next milestone: <span className="font-semibold text-foreground">{nextMilestoneToShow} days</span>
              {' '}({nextMilestoneToShow - streak} to go)
            </span>
          )}
        </div>
      )}

      {/* Progress bar with milestone markers */}
      <div className="relative">
        <div className="w-full bg-muted rounded-full h-2 overflow-visible relative">
          {/* Filled bar */}
          <div
            className={cn(
              'h-2 rounded-full transition-all duration-300 bg-gradient-to-r',
              style.bar,
              streak >= 7 && `shadow-sm ${style.glow}`
            )}
            style={{ width: `${pct}%` }}
          />

          {/* Milestone markers on the bar */}
          {MILESTONES.map(m => {
            const reached = streak >= m;
            return (
              <div
                key={m}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 group"
                style={{ left: `${Math.min((m / Math.max(nextMilestoneToShow || m, longestStreak || m, streak || 1, 3)) * 100, 100)}%` }}
              >
                <div className={cn(
                  'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all',
                  reached
                    ? 'bg-amber-400 border-amber-500 shadow-sm shadow-amber-300/50'
                    : 'bg-muted border-border'
                )}>
                  {reached && <Trophy className="w-2 h-2 text-white" />}
                </div>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20 whitespace-nowrap">
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded font-medium',
                    reached ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'
                  )}>
                    {m} days {reached ? '✓' : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Session progress label */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{done ? 'Complete!' : `Card ${cardIndex + 1} of ${total}`}</span>
        {streak === 0 && <span>Complete a session every day to build a streak 🔥</span>}
      </div>
    </div>
  );
}