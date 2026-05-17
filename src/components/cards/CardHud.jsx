import { useEffect, useRef, useState } from 'react';
import { Heart, Lightbulb, StickyNote, Flame, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function CardHud({
  // Progress
  cardIndex,
  total,
  // Timer
  timeLimitSecs = null,
  sessionStartTime,
  // Streak
  currentStreak = 0,
  bestStreak = 0,
  // Lives (sudden death)
  suddenDeath = false,
  livesRemaining = 3,
  // Actions
  notesAllowed = true,
  canEliminate = true,
  onEliminate,
  onNoteToggle,
  noteActive = false,
  // Deck stats
  pastSessions = [],
  masteredCount = 0,
  totalCards = 0,
}) {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!sessionStartTime) return;
    const tick = () => {
      setElapsed(Math.floor((Date.now() - sessionStartTime.getTime()) / 1000));
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [sessionStartTime]);

  const cardNum = String(cardIndex + 1).padStart(3, '0');
  const totalStr = String(total).padStart(3, '0');
  const pct = total > 0 ? ((cardIndex + 1) / total) * 100 : 0;

  const timerDimmed = timeLimitSecs === null;
  const lifesDimmed = !suddenDeath;

  return (
    <div className="w-full bg-card border border-border mb-3">
      <div className="flex items-stretch divide-x divide-border">

        {/* Section 1 — Progress + Timer */}
        <div className="flex-1 px-4 py-3 flex flex-col gap-1.5 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-mono font-semibold text-foreground">
              Card {cardNum} <span className="text-muted-foreground font-normal">of</span> {totalStr}
            </span>
            <span className={cn(
              'text-xs font-mono tabular-nums shrink-0',
              timerDimmed ? 'text-muted-foreground/40' : 'text-foreground'
            )}>
              {formatTime(elapsed)}
              {timeLimitSecs !== null && (
                <span className="text-muted-foreground"> / {formatTime(timeLimitSecs)}</span>
              )}
              {timeLimitSecs === null && (
                <span className="text-muted-foreground/40"> / --:--</span>
              )}
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Section 2 — Streak + Lives */}
        <div className="px-4 py-3 flex flex-col justify-center gap-1 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Flame className={cn('w-3.5 h-3.5', currentStreak > 0 ? 'text-orange-500' : 'text-muted-foreground/40')} />
              <span className={cn('text-xs font-semibold tabular-nums', currentStreak > 0 ? 'text-orange-500' : 'text-muted-foreground/40')}>
                {currentStreak}
              </span>
            </div>
            {bestStreak > 0 && (
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground/50 tabular-nums">{bestStreak}</span>
              </div>
            )}
          </div>
          {/* Lives */}
          <div className="flex items-center gap-1">
            {[0, 1, 2].map(i => (
              <Heart
                key={i}
                className={cn(
                  'w-3.5 h-3.5 transition-colors',
                  lifesDimmed
                    ? 'text-muted-foreground/20'
                    : i < livesRemaining
                      ? 'text-red-500 fill-red-500'
                      : 'text-muted-foreground/30'
                )}
              />
            ))}
          </div>
        </div>

        {/* Section 3 — Action buttons */}
        <div className="px-4 py-3 flex flex-col justify-center gap-1.5 shrink-0">
          <button
            onClick={canEliminate ? onEliminate : undefined}
            disabled={!canEliminate}
            title="Eliminate one wrong answer"
            className={cn(
              'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors',
              canEliminate
                ? 'text-foreground hover:bg-muted cursor-pointer'
                : 'text-muted-foreground/30 cursor-not-allowed'
            )}
          >
            <Lightbulb className="w-3.5 h-3.5 shrink-0" />
            <span>Eliminate</span>
          </button>
          <button
            onClick={notesAllowed ? onNoteToggle : undefined}
            disabled={!notesAllowed}
            title="Show / add note"
            className={cn(
              'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors',
              notesAllowed
                ? noteActive
                  ? 'text-amber-600 bg-amber-50 hover:bg-amber-100 cursor-pointer'
                  : 'text-foreground hover:bg-muted cursor-pointer'
                : 'text-muted-foreground/30 cursor-not-allowed'
            )}
          >
            <StickyNote className="w-3.5 h-3.5 shrink-0" />
            <span>Notes</span>
          </button>
        </div>

      </div>

      {/* Stats row */}
      {pastSessions.length > 0 && (() => {
        const allScores = pastSessions.map(s => s.score_pct);
        const avg = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
        const best = Math.round(Math.max(...allScores));
        return (
          <div className="border-t border-border px-4 py-2 flex items-center gap-4 bg-muted/30 flex-wrap text-xs text-muted-foreground">
            <span><span className="font-medium text-foreground">{pastSessions.length}</span> sessions</span>
            <span>Avg <span className="font-medium text-foreground">{avg}%</span></span>
            <span>Best <span className="font-medium text-success">{best}%</span></span>
            {totalCards > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="whitespace-nowrap"><span className="text-success font-medium">{masteredCount}</span>/{totalCards} mastered</span>
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-success rounded-full" style={{ width: `${(masteredCount / totalCards) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}