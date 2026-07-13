import { Link } from 'react-router-dom';
import { BarChart2, RotateCcw, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { STUDY_CARD_H } from '@/lib/studyLayout';

const CORRECT_KEYS = new Set(['correct', 'second_guess', 'correct_after_clue', 'second_guess_after_clue', 'partial']);
const SECOND_GUESS_KEYS = new Set(['second_guess', 'second_guess_after_clue']);
const CLUE_KEYS = new Set(['correct_after_clue', 'second_guess_after_clue']);

const fmtMs = (ms) => ms == null ? '—' : ms >= 60000
  ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`
  : `${(ms / 1000).toFixed(1)}s`;

function StatTile({ label, children }) {
  return (
    <div className="bg-background border border-border rounded-lg p-4 flex flex-col items-center justify-center gap-1 text-center">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="font-bold text-xl text-foreground">{children}</span>
    </div>
  );
}

export default function SessionStatsPanel({
  shuffledCards = [], scores = [], pct = 0, totalPoints = 0, maxPoints = 0,
  bestStreak = 0, durationMs, deckId, onRestart, onReviewMissed, useHorizontal = false, skipsUsed = 0
}) {
  const total = shuffledCards.length;

  let right = 0, wrong = 0, unanswered = 0;
  for (let i = 0; i < total; i++) {
    const k = scores[i]?.key;
    if (k && CORRECT_KEYS.has(k)) right++;
    else if (k === 'wrong') wrong++;
    else unanswered++;                    // never answered (contact-sheet jumps only)
  }
  const missed = wrong + unanswered;      // review pass covers wrong AND unanswered

  const secondGuesses = scores.filter((s) => s && SECOND_GUESS_KEYS.has(s.key)).length;
  const hints = scores.filter((s) => s && CLUE_KEYS.has(s.key)).length;

  // Streaks completed = strict 5-in-a-row milestones (matches the egg system).
  let run = 0, streaksCompleted = 0;
  for (let i = 0; i < total; i++) {
    if (scores[i]?.key === 'correct') { run++; if (run % 5 === 0) streaksCompleted++; }
    else run = 0;
  }

  const header = (
    <div className="flex flex-col items-center text-center gap-2">
      <h2 className="text-xl font-semibold text-muted-foreground uppercase tracking-wide">Deck Complete</h2>
      <div className="leading-none">
        <span className="font-bold text-foreground" style={{ fontSize: 72 }}>{pct}</span>
        <span className="font-bold text-muted-foreground" style={{ fontSize: 36 }}>%</span>
      </div>
      <span className="text-sm text-muted-foreground">{totalPoints.toFixed(2)} / {maxPoints} pts</span>
    </div>
  );

  const tiles = (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1 auto-rows-fr">
      <StatTile label="Right"><span className="text-success">{right}</span></StatTile>
      <StatTile label="Wrong"><span className="text-destructive">{wrong}</span></StatTile>
      <StatTile label="Defers"><span className="text-muted-foreground">{skipsUsed}</span></StatTile>
      <StatTile label="Time">{fmtMs(durationMs)}</StatTile>
      <StatTile label="Longest streak">{bestStreak}</StatTile>
      <StatTile label="Streaks">{streaksCompleted}</StatTile>
      <StatTile label="2nd guesses">{secondGuesses}</StatTile>
      <StatTile label="Hints">{hints}</StatTile>
    </div>
  );

  const actions = (
    <div className="flex flex-wrap justify-center gap-3">
      {missed > 0 && (
        <Button onClick={onReviewMissed} size="lg" className="gap-2">
          <Target className="w-5 h-5" /> Review missed ({missed})
        </Button>
      )}
      <Link to={`/stats/${deckId}`}>
        <Button variant="outline" size="lg" className="gap-2"><BarChart2 className="w-5 h-5" /> Full stats</Button>
      </Link>
      <Button variant="outline" size="lg" onClick={onRestart} className="gap-2"><RotateCcw className="w-5 h-5" /> Study again</Button>
    </div>
  );

  // Horizontal card = one fixed box with its nav row inside → mirror exactly:
  // a single fixed-height box, actions pinned at the bottom.
  if (useHorizontal) {
    return (
      <div style={{ height: STUDY_CARD_H.horizontal }} className="w-full flex flex-col justify-between gap-6 px-6 py-6 overflow-hidden">
        {header}
        {tiles}
        {actions}
      </div>
    );
  }

  // Vertical card = fixed body + external nav row → mirror that skeleton.
  return (
    <div className="mx-auto flex flex-col items-center gap-6 w-full max-w-[700px]">
      <div style={{ height: STUDY_CARD_H.vertical }} className="w-full flex flex-col justify-center gap-8 px-4 py-6 overflow-hidden">
        {header}
        {tiles}
      </div>
      {actions}
    </div>
  );
}