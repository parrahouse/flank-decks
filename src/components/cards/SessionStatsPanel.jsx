import { Link } from 'react-router-dom';
import { BarChart2, RotateCcw, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CORRECT_KEYS = new Set(['correct', 'second_guess', 'correct_after_clue', 'second_guess_after_clue', 'partial']);
const SECOND_GUESS_KEYS = new Set(['second_guess', 'second_guess_after_clue']);
const CLUE_KEYS = new Set(['correct_after_clue', 'second_guess_after_clue']);

// Matches StudyCard's fixed body so the crossfade doesn't resize.
// Keep in sync with StudyCard's clamp(380px, 50vw, 520px).
const CARD_BODY_H = 'clamp(380px, 50vw, 520px)';

const fmtMs = (ms) => ms == null ? '—' : ms >= 60000
  ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`
  : `${(ms / 1000).toFixed(1)}s`;

function StatTile({ label, children }) {
  return (
    <div className="bg-background border border-border rounded-lg p-2.5 flex flex-col justify-center gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="font-bold" style={{ fontFamily: "'VT323', monospace", fontSize: 22, lineHeight: 1 }}>{children}</span>
    </div>
  );
}

export default function SessionStatsPanel({
  shuffledCards = [], scores = [], pct = 0, totalPoints = 0, maxPoints = 0,
  bestStreak = 0, durationMs, deckId, onRestart, onReviewMissed
}) {
  const total = shuffledCards.length;

  let right = 0, wrong = 0, skips = 0;
  for (let i = 0; i < total; i++) {
    const k = scores[i]?.key;
    if (k && CORRECT_KEYS.has(k)) right++;
    else if (k === 'wrong') wrong++;
    else skips++;                         // unanswered / skipped
  }
  const missed = wrong + skips;           // review pass covers wrong AND skipped

  const secondGuesses = scores.filter((s) => s && SECOND_GUESS_KEYS.has(s.key)).length;
  const hints = scores.filter((s) => s && CLUE_KEYS.has(s.key)).length;

  // Streaks completed = strict 5-in-a-row milestones (matches the egg system).
  let run = 0, streaksCompleted = 0;
  for (let i = 0; i < total; i++) {
    if (scores[i]?.key === 'correct') { run++; if (run % 5 === 0) streaksCompleted++; }
    else run = 0;
  }

  return (
    // Mirror StudyCard's root skeleton so body + footer sum to the same height.
    <div className="mx-auto flex flex-col gap-3 w-full max-w-[700px]">
      <div style={{ height: CARD_BODY_H }} className="flex flex-col justify-between overflow-hidden">

        {/* Header — score as a percentage */}
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Deck complete! 🎉</h2>
          <div className="text-right leading-none">
            <span className="font-bold" style={{ fontFamily: "'VT323', monospace", fontSize: 34, lineHeight: 1 }}>{pct}%</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">{totalPoints.toFixed(2)} / {maxPoints} pts</span>
          </div>
        </div>

        {/* Stat tiles — 8 metrics filling the fixed body */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1 content-center">
          <StatTile label="Right"><span className="text-success">{right}</span></StatTile>
          <StatTile label="Wrong"><span className="text-destructive">{wrong}</span></StatTile>
          <StatTile label="Skips"><span className="text-muted-foreground">{skips}</span></StatTile>
          <StatTile label="Time">{fmtMs(durationMs)}</StatTile>
          <StatTile label="Longest streak">{bestStreak}</StatTile>
          <StatTile label="Streaks">{streaksCompleted}</StatTile>
          <StatTile label="2nd guesses">{secondGuesses}</StatTile>
          <StatTile label="Hints">{hints}</StatTile>
        </div>
      </div>

      {/* Footer actions — mirrors the card's nav row */}
      <div className="flex flex-wrap gap-2">
        {missed > 0 && (
          <Button onClick={onReviewMissed} className="gap-1.5">
            <Target className="w-4 h-4" /> Review missed ({missed})
          </Button>
        )}
        <Link to={`/stats/${deckId}`}>
          <Button variant="outline" className="gap-1.5"><BarChart2 className="w-4 h-4" /> Full stats</Button>
        </Link>
        <Button variant="outline" onClick={onRestart} className="gap-1.5"><RotateCcw className="w-4 h-4" /> Study again</Button>
      </div>
    </div>
  );
}