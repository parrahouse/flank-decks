import { BarChart2, Target, Trophy, TrendingDown, Clock, Timer, CheckCircle2, GraduationCap, Flame, Zap } from 'lucide-react';
import StatTile from './StatTile';
import { formatDuration, formatClockMs, formatSpan, pct, pct100 } from '@/lib/statsUtils';

export default function OverviewTiles({ overview }) {
  const {
    count, totalStudy, avgSession, durationsCount,
    avgScore, best, worst,
    avgTimePerCard, timeBasisCount,
    masteredCount, totalCards,
    medianTtm, ttmCount,
    avgAttemptsMaster, atmCount,
    longestStreak,
    firstTryAcc, ftTotal,
  } = overview;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <StatTile icon={<BarChart2 className="w-4 h-4" />} label="Sessions" value={count} />
      <StatTile icon={<Clock className="w-4 h-4" />} label="Total study time" value={formatDuration(totalStudy)} />
      <StatTile
        icon={<Timer className="w-4 h-4" />}
        label="Avg session length"
        value={formatDuration(avgSession)}
        sub={durationsCount < count ? `across ${durationsCount} of ${count} sessions` : null}
      />
      <StatTile icon={<Target className="w-4 h-4" />} label="Avg score" value={pct100(avgScore)} />
      <StatTile icon={<Trophy className="w-4 h-4" />} label="Best" value={pct100(best)} valueClass="text-success" />
      <StatTile icon={<TrendingDown className="w-4 h-4" />} label="Worst" value={pct100(worst)} valueClass="text-destructive" />
      <StatTile
        icon={<Timer className="w-4 h-4" />}
        label="Avg time per card"
        value={formatClockMs(avgTimePerCard)}
        sub={timeBasisCount ? `across ${timeBasisCount} timed answers` : null}
      />
      <StatTile
        icon={<CheckCircle2 className="w-4 h-4" />}
        label="Cards mastered"
        value={`${masteredCount}/${totalCards}`}
        valueClass={masteredCount === totalCards && totalCards > 0 ? 'text-success' : null}
      />
      <StatTile
        icon={<GraduationCap className="w-4 h-4" />}
        label="Median time to master"
        value={formatSpan(medianTtm)}
        sub={ttmCount ? `across ${ttmCount} mastered cards` : null}
      />
      <StatTile
        icon={<GraduationCap className="w-4 h-4" />}
        label="Avg attempts to master"
        value={avgAttemptsMaster != null ? avgAttemptsMaster.toFixed(1) : '—'}
        sub={atmCount ? `across ${atmCount} mastered cards` : null}
      />
      <StatTile icon={<Flame className="w-4 h-4" />} label="Longest answer streak" value={longestStreak ?? '—'} valueClass="text-amber-500" />
      <StatTile
        icon={<Zap className="w-4 h-4" />}
        label="First-try accuracy"
        value={pct(firstTryAcc)}
        sub={ftTotal ? `across ${ftTotal} card results` : null}
      />
    </div>
  );
}