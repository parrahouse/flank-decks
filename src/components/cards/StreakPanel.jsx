import { Tally1, Tally2, Tally3, Tally4, Tally5 } from 'lucide-react';

const TALLY_ICONS = [null, Tally1, Tally2, Tally3, Tally4, Tally5];

function TallyDisplay({ streak }) {
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
        return <Icon key={i} className="w-5 h-5 text-primary" />;
      })}
    </div>
  );
}

export default function StreakPanel({ currentStreak, bestStreak, allTimeBest }) {
  return (
    <div className="border border-border rounded-xl bg-card p-4 space-y-4 min-w-[160px]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Current streak</p>
        <TallyDisplay streak={currentStreak} />
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
    </div>
  );
}