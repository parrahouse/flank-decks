import { useMemo } from 'react';
import { mean } from '@/lib/statsUtils';

export default function QuestionTypeBreakdown({ cardRows }) {
  const rows = useMemo(() => {
    const groups = {};
    cardRows.forEach((r) => {
      const t = r.card.question_type || 'multiple_choice';
      (groups[t] ||= []).push(r);
    });
    return Object.entries(groups).map(([type, list]) => {
      const acc = list.map((r) => r.accuracy).filter((x) => x != null);
      const avgT = list.map((r) => r.avgTime).filter((x) => x != null);
      const ft = list.map((r) => r.firstTryPct).filter((x) => x != null);
      return {
        type,
        count: list.length,
        accuracy: acc.length ? mean(acc) : null,
        avgTime: avgT.length ? mean(avgT) : null,
        firstTry: ft.length ? mean(ft) : null,
      };
    });
  }, [cardRows]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/40 text-sm font-medium">Question-type breakdown</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground border-b border-border">
              <th className="text-left font-medium px-3 py-2">Type</th>
              <th className="text-left font-medium px-3 py-2">Cards</th>
              <th className="text-left font-medium px-3 py-2">Accuracy</th>
              <th className="text-left font-medium px-3 py-2">Avg time</th>
              <th className="text-left font-medium px-3 py-2">First-try %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.type} className="border-b border-border last:border-0">
                <td className="px-3 py-2 capitalize">{r.type.replace('_', ' ')}</td>
                <td className="px-3 py-2">{r.count}</td>
                <td className="px-3 py-2">{r.accuracy == null ? '—' : `${Math.round(r.accuracy * 100)}%`}</td>
                <td className="px-3 py-2">{r.avgTime == null ? '—' : `${(r.avgTime / 1000).toFixed(1)}s`}</td>
                <td className="px-3 py-2">{r.firstTry == null ? '—' : `${Math.round(r.firstTry * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}