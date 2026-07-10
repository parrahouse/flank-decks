import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cardLabel } from '@/lib/utils';
import { formatClockMs, formatSpan } from '@/lib/statsUtils';

const COLUMNS = [
  { key: 'card', label: 'Card' },
  { key: 'type', label: 'Type' },
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'attempts', label: 'Attempts' },
  { key: 'firstTry', label: 'First-try %' },
  { key: 'avgTime', label: 'Avg time' },
  { key: 'fastest', label: 'Fastest' },
  { key: 'trend', label: 'Trend' },
  { key: 'mastered', label: 'Mastered' },
  { key: 'timeToMaster', label: 'Time to master' },
  { key: 'commonMiss', label: 'Common miss' },
];

function sortValue(row, key) {
  switch (key) {
    case 'card': return cardLabel(row.card).toLowerCase();
    case 'type': return row.card.question_type || '';
    case 'accuracy': return row.accuracy == null ? Infinity : row.accuracy;
    case 'attempts': return row.attempts || 0;
    case 'firstTry': return row.firstTryPct == null ? 0 : row.firstTryPct;
    case 'avgTime': return row.avgTime == null ? Infinity : row.avgTime;
    case 'fastest': return row.fastest == null ? Infinity : row.fastest;
    case 'trend': return row.trend === 'up' ? 0 : row.trend === 'down' ? 1 : 2;
    case 'mastered': return row.mastered ? 1 : 0;
    case 'timeToMaster': return row.timeToMasterMs == null ? Infinity : row.timeToMasterMs;
    case 'commonMiss': return row.commonMiss ? row.commonMiss.count : 0;
    default: return 0;
  }
}

function TrendCell({ trend }) {
  if (trend === 'up') return <span className="text-success">▲</span>;
  if (trend === 'down') return <span className="text-destructive">▼</span>;
  return <span className="text-muted-foreground">–</span>;
}

export default function PerCardTable({ cardRows }) {
  const [sort, setSort] = useState({ key: 'accuracy', dir: 'asc' });

  const sorted = useMemo(() => {
    const rows = [...cardRows];
    const { key, dir } = sort;
    rows.sort((a, b) => {
      const va = sortValue(a, key), vb = sortValue(b, key);
      if (typeof va === 'string' && typeof vb === 'string') {
        return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return dir === 'asc' ? va - vb : vb - va;
    });
    return rows;
  }, [cardRows, sort]);

  const toggle = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/40 text-sm font-medium">Per-card breakdown</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-[11px] text-muted-foreground border-b border-border">
              {COLUMNS.map((col) => (
                <th key={col.key} className="text-left font-medium px-3 py-2 select-none">
                  <button onClick={() => toggle(col.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                    {col.label}
                    {sort.key === col.key && (sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const masteryDetail = r.stat
                ? [
                    `Mastered: ${new Date(r.stat.mastered_at).toLocaleDateString()}`,
                    `Attempts to master: ${r.stat.attempts_to_master ?? '—'}`,
                    `Sessions to master: ${r.stat.sessions_to_master ?? '—'}`,
                    `Study time: ${formatSpan(r.stat.study_time_to_master_ms)}`,
                  ].join('\n')
                : '';
              return (
                <tr key={r.card.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {r.card.image_url && <img src={r.card.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                      <span className="font-medium truncate max-w-[180px]">{cardLabel(r.card)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground capitalize">{(r.card.question_type || 'multiple_choice').replace('_', ' ')}</td>
                  <td className="px-3 py-2">{r.accuracy == null ? '—' : `${Math.round(r.accuracy * 100)}%`}</td>
                  <td className="px-3 py-2">{r.attempts || '—'}</td>
                  <td className="px-3 py-2">{r.firstTryPct == null ? '—' : `${Math.round(r.firstTryPct * 100)}%`}</td>
                  <td className="px-3 py-2">{formatClockMs(r.avgTime)}</td>
                  <td className="px-3 py-2">{formatClockMs(r.fastest)}</td>
                  <td className="px-3 py-2"><TrendCell trend={r.trend} /></td>
                  <td className="px-3 py-2">
                    {r.mastered ? (
                      <span title={masteryDetail} className="inline-flex items-center gap-1 text-success text-xs font-medium cursor-help">
                        <span className="w-2 h-2 rounded-full bg-success" /> Mastered
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{formatSpan(r.timeToMasterMs)}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.commonMiss ? (
                      <span className="truncate inline-block max-w-[140px] align-bottom" title={r.commonMiss.text}>
                        {r.commonMiss.text} ×{r.commonMiss.count}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}