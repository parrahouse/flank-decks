import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { mean } from '@/lib/statsUtils';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function HabitsSection({ sessions }) {
  const heatmap = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    let stamped = 0;
    sessions.forEach((s) => {
      const ts = s.started_at || s.created_date;
      if (!ts) return;
      const d = new Date(ts);
      if (isNaN(d)) return;
      stamped += 1;
      grid[d.getDay()][d.getHours()] += 1;
    });
    let max = 0;
    grid.forEach((row) => row.forEach((c) => { if (c > max) max = c; }));
    return { grid, max, stamped };
  }, [sessions]);

  const filterModes = useMemo(() => {
    const groups = {};
    sessions.forEach((s) => {
      const m = s.filter_mode || 'all';
      (groups[m] ||= []).push(s.score_pct || 0);
    });
    return Object.entries(groups)
      .map(([mode, scores]) => ({ mode, avg: mean(scores), count: scores.length }))
      .sort((a, b) => (b.avg || 0) - (a.avg || 0));
  }, [sessions]);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="text-sm font-medium mb-1">When you study</div>
        <div className="text-[10px] text-muted-foreground mb-3">session starts by day & hour</div>
        {heatmap.stamped < 5 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">Not enough data — study at least 5 sessions to see your habits.</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="flex">
                <div className="w-7 shrink-0" />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="w-5 text-[9px] text-muted-foreground text-center">{h % 3 === 0 ? h : ''}</div>
                ))}
              </div>
              {heatmap.grid.map((row, d) => (
                <div key={d} className="flex items-center">
                  <div className="w-7 text-[10px] text-muted-foreground shrink-0">{DAYS[d]}</div>
                  {row.map((c, h) => {
                    const op = c === 0 ? 0 : 0.15 + 0.85 * (c / heatmap.max);
                    return (
                      <div
                        key={h}
                        title={`${DAYS[d]} ${h}:00 — ${c} session${c !== 1 ? 's' : ''}`}
                        className={cn('w-5 h-5 m-[1px] rounded-sm', c === 0 ? 'bg-muted' : 'bg-primary')}
                        style={c > 0 ? { opacity: op } : undefined}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <div className="text-sm font-medium mb-2">Best filter mode</div>
        <div className="flex flex-wrap gap-3">
          {filterModes.map((f) => (
            <div key={f.mode} className="border border-border rounded-lg px-3 py-2">
              <div className="text-xs text-muted-foreground capitalize">{f.mode} · {f.count} session{f.count !== 1 ? 's' : ''}</div>
              <div className="text-lg font-bold">{f.avg == null ? '—' : `${Math.round(f.avg)}%`}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}