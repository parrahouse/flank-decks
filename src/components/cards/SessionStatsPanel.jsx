import { Link } from 'react-router-dom';
import { BarChart2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, cardLabel } from '@/lib/utils';

const SCORE_LABELS = {
  correct: { label: 'Correct', color: 'text-success' },
  second_guess: { label: '2nd try', color: 'text-orange-500' },
  correct_after_clue: { label: 'Correct (with clue)', color: 'text-amber-500' },
  second_guess_after_clue: { label: '2nd try + clue', color: 'text-orange-400' },
  partial: { label: 'Partial', color: 'text-amber-500' },
  wrong: { label: 'Incorrect', color: 'text-destructive' }
};

const CORRECT_KEYS = new Set(['correct', 'second_guess', 'correct_after_clue', 'second_guess_after_clue', 'partial']);

const fmtMs = (ms) => ms == null ? '—' : ms >= 60000
  ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`
  : `${(ms / 1000).toFixed(1)}s`;

function StreakTier({ streak }) {
  const cur = streak?.current_streak || 0;
  if (cur <= 0) return null;
  return (
    <p className={cn(
      'text-sm font-semibold mt-1',
      cur >= 30 ? 'text-purple-500' :
      cur >= 14 ? 'text-red-500' :
      cur >= 7 ? 'text-orange-500' :
      'text-amber-500'
    )}>
      🔥 {cur}-day streak!
      {streak.current_streak === streak.longest_streak && streak.current_streak >= 3 && ' (personal best)'}
    </p>
  );
}

function StatTile({ label, children }) {
  return (
    <div className="bg-background border border-border rounded-lg p-2.5 flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="font-bold" style={{ fontFamily: "'VT323', monospace", fontSize: 22, lineHeight: 1 }}>{children}</span>
    </div>
  );
}

function TimeRow({ card, time, label }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 text-xs">
      {card.image_url
        ? <img src={card.image_url} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
        : <div className="w-7 h-7 rounded bg-muted shrink-0" />}
      <span className="truncate font-medium flex-1 min-w-0">{cardLabel(card)}</span>
      <span className={cn('font-semibold shrink-0', label === 'Fastest' ? 'text-success' : 'text-orange-500')}>{fmtMs(time)}</span>
    </div>
  );
}

export default function SessionStatsPanel({
  shuffledCards = [], scores = [], answerTimes = [], firstWrongChoices = [],
  cardStats = [], totalPoints = 0, maxPoints = 0, pct = 0, bestStreak = 0,
  streak, durationMs, deckId, onRestart
}) {
  const timed = answerTimes
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t != null);

  const avgMs = timed.length > 0
    ? timed.reduce((s, x) => s + x.t, 0) / timed.length
    : null;

  const firstTryCorrect = shuffledCards.filter((_, i) =>
    !firstWrongChoices[i] && scores[i] && CORRECT_KEYS.has(scores[i].key)
  ).length;

  let fastest = null, slowest = null;
  if (timed.length >= 2) {
    const sorted = [...timed].sort((a, b) => a.t - b.t);
    fastest = sorted[0];
    slowest = sorted[sorted.length - 1];
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Deck complete! 🎉</h2>
        <p className="text-muted-foreground text-sm">
          Score: <span className="font-semibold text-foreground">{totalPoints.toFixed(2)} / {maxPoints}</span>
          <span className="ml-2 text-xs">({pct}%)</span>
        </p>
        <StreakTier streak={streak} />
      </div>

      {/* Session stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Total time">{fmtMs(durationMs)}</StatTile>
        <StatTile label="Avg / card">{fmtMs(avgMs)}</StatTile>
        <StatTile label="Best streak">{bestStreak}</StatTile>
        <StatTile label="First-try">{firstTryCorrect}/{shuffledCards.length}</StatTile>
      </div>

      {/* Fastest / slowest */}
      {timed.length >= 2 && fastest && slowest && (
        <div className="bg-background border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border bg-muted/40 text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex gap-4">
            <span>Fastest</span><span>Slowest</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <TimeRow card={shuffledCards[fastest.i]} time={fastest.t} label="Fastest" />
            <TimeRow card={shuffledCards[slowest.i]} time={slowest.t} label="Slowest" />
          </div>
        </div>
      )}

      {/* Per-card breakdown */}
      <div className="bg-background border border-border rounded-xl overflow-hidden">
        {shuffledCards.map((card, i) => {
          const result = scores[i];
          const info = result ? SCORE_LABELS[result.key] : { label: 'Skipped', color: 'text-muted-foreground' };
          const stat = cardStats.find((s) => s.card_id === card.id);
          return (
            <div key={card.id} className={cn('flex items-center justify-between px-4 py-2.5 text-sm', i > 0 && 'border-t border-border')}>
              <div className="flex items-center gap-3 min-w-0">
                {card.image_url && <img src={card.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                <span className="truncate font-medium">{cardLabel(card)}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                {stat?.mastered && <span className="text-xs bg-success/10 text-success px-1.5 py-0.5 rounded font-medium">Mastered</span>}
                <span className="text-xs text-muted-foreground w-12 text-right" style={{ fontFamily: "'VT323', monospace", fontSize: 14 }}>{fmtMs(answerTimes[i])}</span>
                <span className={cn('text-xs font-medium', info.color)}>{info.label}</span>
                <span className="text-xs text-muted-foreground w-8 text-right">{result ? result.points.toFixed(2) : '—'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <Link to={`/stats/${deckId}`}>
          <Button variant="outline" className="gap-1.5"><BarChart2 className="w-4 h-4" /> View Full Stats</Button>
        </Link>
        <Button onClick={onRestart} className="gap-1.5"><RotateCcw className="w-4 h-4" /> Study Again</Button>
      </div>
    </div>
  );
}