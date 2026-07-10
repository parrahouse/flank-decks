import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatDuration, formatClockMs, formatShortDate, capped } from '@/lib/statsUtils';

export default function SessionLog({ sessions }) {
  const rows = useMemo(() => {
    return sessions.map((s) => {
      const times = (s.card_results || []).map((r) => capped(r.time_to_answer_ms)).filter((t) => t != null);
      const avgTime = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
      return {
        id: s.id,
        date: formatShortDate(s.created_date),
        score: s.score_pct,
        duration: s.duration_ms,
        avgTime,
        bestStreak: s.best_streak,
        filterMode: s.filter_mode,
        cardCount: (s.card_results || []).length,
      };
    });
  }, [sessions]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/40 text-sm font-medium">Session log</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground border-b border-border">
              <th className="text-left font-medium px-3 py-2">Date</th>
              <th className="text-left font-medium px-3 py-2">Score</th>
              <th className="text-left font-medium px-3 py-2">Duration</th>
              <th className="text-left font-medium px-3 py-2">Avg/card</th>
              <th className="text-left font-medium px-3 py-2">Best streak</th>
              <th className="text-left font-medium px-3 py-2">Filter</th>
              <th className="text-left font-medium px-3 py-2">Cards</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-muted-foreground">{r.date}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className={cn('h-1.5 rounded-full', r.score >= 75 ? 'bg-success' : r.score >= 50 ? 'bg-amber-400' : 'bg-destructive')}
                        style={{ width: `${r.score}%` }}
                      />
                    </div>
                    <span className="font-semibold w-10 text-right">{Math.round(r.score)}%</span>
                  </div>
                </td>
                <td className="px-3 py-2">{formatDuration(r.duration)}</td>
                <td className="px-3 py-2">{formatClockMs(r.avgTime)}</td>
                <td className="px-3 py-2">{r.bestStreak ?? '—'}</td>
                <td className="px-3 py-2 capitalize text-muted-foreground">{r.filterMode || '—'}</td>
                <td className="px-3 py-2">{r.cardCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}