import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, BarChart2, RefreshCw, ArrowUp, ArrowDown, Minus, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CORRECT_KEYS, masteryLevelLabel } from '@/lib/statsUtils';
import { cn } from '@/lib/utils';

const LEVEL_ORDER = { new: 0, learning: 1, familiar: 2, proficient: 3, mastered: 4 };

const KEY_LABELS = {
  correct: 'Correct',
  correct_after_clue: 'Correct (clue)',
  second_guess: '2nd try',
  second_guess_after_clue: '2nd try (clue)',
  partial: 'Partial',
  wrong: 'Wrong',
  skipped: 'Skipped',
};

const LEVEL_COLORS = {
  new: 'text-muted-foreground',
  learning: 'text-amber-600',
  familiar: 'text-blue-600',
  proficient: 'text-indigo-600',
  mastered: 'text-success',
};

function Tile({ value, label, sub, valueClass }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-background px-1.5 py-2.5 text-center">
      <span className={cn('text-xl font-bold tabular-nums leading-none sm:text-2xl', valueClass)}>{value}</span>
      <span className="mt-1 text-[11px] font-medium leading-tight text-muted-foreground">{label}</span>
      {sub && <span className="text-[10px] leading-tight text-muted-foreground/70">{sub}</span>}
    </div>
  );
}

export default function DeckSessionPanel({ summary, pct, deckId, missedCount, onReviewMissed, onStudyAgain, onStudyUnmastered }) {
  const [showAll, setShowAll] = useState(false);

  const { cardResults = [], scored = false, lastScorePct = null, deckProgress = null } = summary || {};

  // Tile counts
  const firstTry = cardResults.filter((r) => r.key === 'correct' || r.key === 'correct_after_clue').length;
  const secondGuess = cardResults.filter((r) => r.key === 'second_guess' || r.key === 'second_guess_after_clue').length;
  const partial = cardResults.filter((r) => r.key === 'partial').length;
  const missed = cardResults.filter((r) => !CORRECT_KEYS.has(r.key)).length;

  // vs last session
  const diff = lastScorePct != null ? pct - lastScorePct : null;

  // Mastery movement (scored runs only)
  const movement = useMemo(() => {
    if (!scored) return null;
    let promoted = 0, demoted = 0, same = 0;
    for (const r of cardResults) {
      const before = r.mastery_level_before;
      const after = r.mastery_level_after;
      if (!before || !after) { same++; continue; }
      if (LEVEL_ORDER[after] > LEVEL_ORDER[before]) promoted++;
      else if (LEVEL_ORDER[after] < LEVEL_ORDER[before]) demoted++;
      else same++;
    }
    return { promoted, demoted, same };
  }, [cardResults, scored]);

  // Median answer time for shaky detection
  const medianTime = useMemo(() => {
    const times = cardResults.map((r) => r.time_to_answer_ms).filter((t) => t != null).sort((a, b) => a - b);
    if (!times.length) return null;
    const mid = Math.floor(times.length / 2);
    return times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
  }, [cardResults]);

  // Per-card list: mistakes first, then correct, preserving original order
  const sortedResults = useMemo(() => {
    const mistakes = cardResults.filter((r) => !CORRECT_KEYS.has(r.key));
    const correct = cardResults.filter((r) => CORRECT_KEYS.has(r.key));
    return [...mistakes, ...correct];
  }, [cardResults]);

  const visibleResults = showAll ? sortedResults : sortedResults.slice(0, 5);
  const hasMore = sortedResults.length > 5;

  const unmasteredCount = deckProgress ? deckProgress.total - (deckProgress.levelCounts?.mastered ?? 0) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{scored ? 'Session Summary' : 'Review Run'}</h3>
        <span className="text-sm text-muted-foreground">{pct}% · {cardResults.length} cards</span>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        <Tile value={firstTry} label="Right (1st)" valueClass="text-success" />
        <Tile value={secondGuess} label="2nd guess" valueClass="text-orange-500" />
        <Tile value={partial} label="Partial" valueClass="text-amber-500" />
        <Tile value={missed} label="Missed" valueClass="text-destructive" />
        <Tile
          value={diff == null ? '—' : (diff > 0 ? `+${diff}` : `${diff}`)}
          label="vs last"
          sub={diff == null ? 'First session' : undefined}
          valueClass={diff == null ? 'text-muted-foreground' : diff > 0 ? 'text-success' : diff < 0 ? 'text-destructive' : 'text-muted-foreground'}
        />
      </div>

      {/* Mastery movement */}
      {movement && (
        <div className="flex items-center gap-4 text-sm">
          <span className="font-medium">Mastery:</span>
          <span className="flex items-center gap-1 text-success"><ArrowUp className="w-3.5 h-3.5" /> {movement.promoted}</span>
          <span className="flex items-center gap-1 text-destructive"><ArrowDown className="w-3.5 h-3.5" /> {movement.demoted}</span>
          <span className="flex items-center gap-1 text-muted-foreground"><Minus className="w-3.5 h-3.5" /> {movement.same}</span>
        </div>
      )}

      {/* Deck progress */}
      {deckProgress && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">Deck score:</span>
            <span className="tabular-nums">{deckProgress.before}</span>
            <span className="text-muted-foreground">→</span>
            <span className="tabular-nums font-semibold">{deckProgress.after}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {['new', 'learning', 'familiar', 'proficient', 'mastered'].map((level) => (
              <span key={level} className={cn('rounded-full bg-muted px-2 py-0.5', LEVEL_COLORS[level])}>
                {masteryLevelLabel(level)}: {deckProgress.levelCounts[level] ?? 0}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-card list */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Per-card results</span>
          {hasMore && (
            <button onClick={() => setShowAll((s) => !s)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {showAll ? <>Show less <ChevronUp className="w-3 h-3" /></> : <>Show all ({sortedResults.length}) <ChevronDown className="w-3 h-3" /></>}
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {visibleResults.map((r, i) => {
            const isCorrect = CORRECT_KEYS.has(r.key);
            const isShaky = (r.key === 'correct' || r.key === 'correct_after_clue') &&
              r.time_to_answer_ms != null && medianTime != null && r.time_to_answer_ms > 1.5 * medianTime;
            const before = r.mastery_level_before;
            const after = r.mastery_level_after;
            return (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-sm">
                <span className={cn('shrink-0', isCorrect ? 'text-success' : 'text-destructive')}>
                  {isCorrect ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                </span>
                <span className="flex-1 truncate">{r.correct_answer || '—'}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{KEY_LABELS[r.key] || r.key}</span>
                {scored && before && after && (
                  <span className="hidden shrink-0 text-xs sm:inline">
                    <span className={LEVEL_COLORS[before]}>{masteryLevelLabel(before)}</span>
                    <span className="mx-0.5 text-muted-foreground">→</span>
                    <span className={LEVEL_COLORS[after]}>{masteryLevelLabel(after)}</span>
                  </span>
                )}
                {isShaky && (
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Shaky</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {missedCount > 0 && (
          <Button onClick={onReviewMissed} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="w-4 h-4" /> Review {missedCount} {missedCount === 1 ? 'mistake' : 'mistakes'}
          </Button>
        )}
        <Link to={`/stats/${deckId}`}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <BarChart2 className="w-4 h-4" /> Get Nerdy
          </Button>
        </Link>
        <Button onClick={onStudyAgain} variant="outline" size="sm" className="gap-1.5">
          <RotateCcw className="w-4 h-4" /> Study again
        </Button>
        {deckProgress && unmasteredCount > 0 && (
          <Button onClick={onStudyUnmastered} size="sm" className="gap-1.5">
            Study unmastered ({unmasteredCount})
          </Button>
        )}
      </div>
    </div>
  );
}