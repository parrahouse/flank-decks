import { useState, useEffect, useRef } from 'react';
import { Tally1, Tally2, Tally3, Tally4, Tally5, Trophy } from 'lucide-react';
import StudyBuddy from './StudyBuddy';
import { cn } from '@/lib/utils';

const TALLY_ICONS = [null, Tally1, Tally2, Tally3, Tally4, Tally5];

function TallyDisplay({ streak, animateKey }) {
  if (streak === 0) return <span className="text-xs text-muted-foreground italic">—</span>;
  const completeGroups = Math.floor(streak / 5);
  const remainder = streak % 5;
  const tallies = [
    ...Array(completeGroups).fill(5),
    ...(remainder > 0 ? [remainder] : []),
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {tallies.map((count, i) => {
        const Icon = TALLY_ICONS[count];
        const isLast = i === tallies.length - 1;
        return (
          <Icon
            key={`${i}-${isLast ? animateKey : i}`}
            className="w-5 h-5 text-primary"
            style={isLast ? { animation: 'tallyBounce 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97)' } : undefined}
          />
        );
      })}
      <style>{`
        @keyframes tallyBounce {
          0%   { transform: scale(0.4) translateY(4px); opacity: 0; }
          60%  { transform: scale(1.25) translateY(-3px); opacity: 1; }
          80%  { transform: scale(0.9) translateY(1px); }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function StreakPanel({ currentStreak, bestStreak, allTimeBest, hasPastSession, pastSessions = [], masteredCount = 0, totalCards = 0 }) {
  const [animateKey, setAnimateKey] = useState(0);
  const panelRef = useRef(null);
  const [panelWidth, setPanelWidth] = useState(160);

  // Persist buddy preference
  const [buddyOn, setBuddyOn] = useState(() => {
    return localStorage.getItem('flashdeck_buddy') === '1';
  });

  useEffect(() => {
    if (currentStreak > 0) setAnimateKey(k => k + 1);
  }, [currentStreak]);

  useEffect(() => {
    if (!panelRef.current) return;
    const ro = new ResizeObserver(entries => {
      setPanelWidth(entries[0].contentRect.width);
    });
    ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, []);

  const toggleBuddy = () => {
    const next = !buddyOn;
    setBuddyOn(next);
    localStorage.setItem('flashdeck_buddy', next ? '1' : '0');
  };

  return (
    <div ref={panelRef} className="border border-border rounded-xl bg-card overflow-hidden min-w-[160px]">
      <div className="p-4 space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Current streak</p>
          <TallyDisplay streak={currentStreak} animateKey={animateKey} />
          {currentStreak > 0 && (
            <p className="text-xs text-primary font-medium mt-1">{currentStreak} in a row</p>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Session best</p>
          <p className="text-lg font-bold text-foreground">{bestStreak}</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">All-time best</p>
          <p className="text-lg font-bold text-foreground">{allTimeBest ?? '—'}</p>
        </div>

        {/* Historical stats — sessions, avg, best */}
        {pastSessions.length > 0 && (() => {
          const allScores = pastSessions.map(s => s.score_pct);
          const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
          const best = Math.max(...allScores);
          return (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">History</p>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="bg-muted/60 rounded-lg py-1.5">
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Sessions</p>
                  <p className="text-sm font-bold">{pastSessions.length}</p>
                </div>
                <div className="bg-muted/60 rounded-lg py-1.5">
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Avg</p>
                  <p className="text-sm font-bold">{Math.round(avg)}%</p>
                </div>
                <div className="bg-muted/60 rounded-lg py-1.5">
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Best</p>
                  <p className="text-sm font-bold text-success">{Math.round(best)}%</p>
                </div>
              </div>

              {/* Recent sessions mini-list */}
              <div className="space-y-1 pt-1">
                {[...pastSessions].slice(0, 5).map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', s.score_pct >= 75 ? 'bg-success' : s.score_pct >= 50 ? 'bg-amber-400' : 'bg-destructive')}
                        style={{ width: `${s.score_pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">{Math.round(s.score_pct)}%</span>
                  </div>
                ))}
              </div>

              {/* Mastery bar */}
              {totalCards > 0 && (
                <div className="pt-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">Mastered</p>
                    <p className="text-[10px] font-medium text-success">{masteredCount}/{totalCards}</p>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-success rounded-full transition-all duration-500"
                      style={{ width: `${totalCards > 0 ? (masteredCount / totalCards) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Study Buddy toggle — only after at least one past session */}
        {hasPastSession && (
          <div className="border-t border-border pt-3">
            <button
              onClick={toggleBuddy}
              className="flex items-center justify-between w-full group"
              title={buddyOn ? 'Hide Study Buddy' : 'Show Study Buddy'}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
                Study Buddy
              </span>
              <span className={`relative inline-flex h-4 w-8 shrink-0 rounded-full border-2 border-transparent transition-colors ${buddyOn ? 'bg-primary' : 'bg-muted'}`}>
                <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform ${buddyOn ? 'translate-x-4' : 'translate-x-0'}`} />
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Study Buddy walking strip */}
      {hasPastSession && buddyOn && (
        <div className="border-t border-border bg-muted/30">
          <StudyBuddy containerWidth={panelWidth} />
        </div>
      )}
    </div>
  );
}