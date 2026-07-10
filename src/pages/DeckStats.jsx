import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, BarChart2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CORRECT_KEYS, capped, mean, median } from '@/lib/statsUtils';
import OverviewTiles from '@/components/stats/OverviewTiles';
import TrendCharts from '@/components/stats/TrendCharts';
import MasteryTimelineSection from '@/components/stats/MasteryTimelineSection';
import PerCardTable from '@/components/stats/PerCardTable';
import QuestionTypeBreakdown from '@/components/stats/QuestionTypeBreakdown';
import HabitsSection from '@/components/stats/HabitsSection';
import SessionLog from '@/components/stats/SessionLog';

function ReadinessBar({ pct }) {
  const level =
    pct >= 90 ? { label: 'Test Ready', color: 'bg-success', text: 'text-success' } :
    pct >= 75 ? { label: 'Almost There', color: 'bg-amber-400', text: 'text-amber-600' } :
    pct >= 50 ? { label: 'Getting There', color: 'bg-orange-400', text: 'text-orange-600' } :
               { label: 'Needs Practice', color: 'bg-destructive', text: 'text-destructive' };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Test Readiness</span>
        <span className={cn('font-semibold', level.text)}>{level.label}</span>
      </div>
      <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
        <div
          className={cn('h-3 rounded-full transition-all duration-700', level.color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">{Math.round(pct)}% average score</p>
    </div>
  );
}

function SectionHeading({ children }) {
  return <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{children}</h2>;
}

export default function DeckStats() {
  const { deckId } = useParams();

  const { data: deck } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => base44.entities.Deck.filter({ id: deckId }).then(r => r[0]),
    enabled: !!deckId,
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['study-sessions', deckId],
    queryFn: () => base44.entities.StudySession.filter({ deck_id: deckId }, '-created_date'),
    enabled: !!deckId,
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => base44.entities.Card.filter({ deck_id: deckId }, 'order').then(r => r.filter(c => !c.deleted)),
    enabled: !!deckId,
  });

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  const { data: cardStats = [] } = useQuery({
    queryKey: ['card-stats', deckId, currentUser?.id],
    queryFn: () => base44.entities.UserCardStats.filter({ deck_id: deckId, user_id: currentUser.id }),
    enabled: !!deckId && !!currentUser?.id,
  });

  const sessionsAsc = useMemo(
    () => [...sessions].sort((a, b) => new Date(a.created_date) - new Date(b.created_date)),
    [sessions]
  );

  const perCard = useMemo(() => {
    const acc = {};
    sessions.forEach((s) => {
      (s.card_results || []).forEach((r) => {
        if (!r.card_id) return;
        (acc[r.card_id] ||= { results: [] }).results.push({
          key: r.key,
          points: r.points,
          first_wrong: r.first_wrong,
          time_to_answer_ms: r.time_to_answer_ms,
          session_created: s.created_date,
        });
      });
    });
    return acc;
  }, [sessions]);

  const cardRows = useMemo(() => {
    const statByCard = Object.fromEntries(cardStats.map((s) => [s.card_id, s]));
    return cards.map((c) => {
      const stat = statByCard[c.id];
      const results = perCard[c.id]?.results || [];
      const correctResults = results.filter((r) => CORRECT_KEYS.has(r.key));
      const firstTryCorrect = results.filter((r) => CORRECT_KEYS.has(r.key) && r.first_wrong == null);
      const firstTryPct = results.length ? firstTryCorrect.length / results.length : null;
      const timesCapped = results.map((r) => capped(r.time_to_answer_ms)).filter((t) => t != null);
      const avgTime = timesCapped.length ? mean(timesCapped) : null;
      const accuracy = stat && stat.total_attempts > 0 ? stat.correct_attempts / stat.total_attempts : null;
      const attempts = stat?.total_attempts ?? 0;
      const fastest = stat?.fastest_answer_ms ?? null;

      const ordered = [...results].sort((a, b) => new Date(a.session_created) - new Date(b.session_created));
      const last5 = ordered.slice(-5);
      const last5Acc = last5.length ? last5.filter((r) => CORRECT_KEYS.has(r.key)).length / last5.length : null;
      const overallAcc = results.length ? correctResults.length / results.length : null;
      let trend = 'flat';
      if (last5Acc != null && overallAcc != null) {
        if (last5Acc > overallAcc + 0.1) trend = 'up';
        else if (last5Acc < overallAcc - 0.1) trend = 'down';
      }

      const mastered = !!stat?.mastered;
      const timeToMasterMs = (stat?.mastered_at && stat?.first_studied_date)
        ? new Date(stat.mastered_at) - new Date(stat.first_studied_date)
        : null;

      const missCounts = {};
      results.forEach((r) => { if (r.first_wrong) missCounts[r.first_wrong] = (missCounts[r.first_wrong] || 0) + 1; });
      let commonMiss = null;
      Object.entries(missCounts).forEach(([t, n]) => { if (!commonMiss || n > commonMiss.count) commonMiss = { text: t, count: n }; });

      return { card: c, stat, results, accuracy, attempts, firstTryPct, avgTime, fastest, trend, mastered, timeToMasterMs, commonMiss };
    });
  }, [cards, cardStats, perCard]);

  const overview = useMemo(() => {
    const count = sessions.length;
    const durations = sessions.map((s) => s.duration_ms).filter((d) => d != null);
    const totalStudy = durations.reduce((a, b) => a + b, 0);
    const avgSession = durations.length ? totalStudy / durations.length : null;
    const scores = sessions.map((s) => s.score_pct);
    const avgScore = scores.length ? mean(scores) : null;
    const best = scores.length ? Math.max(...scores) : null;
    const worst = scores.length ? Math.min(...scores) : null;

    const allTimes = [];
    sessions.forEach((s) => {
      (s.card_results || []).forEach((r) => { if (r.time_to_answer_ms != null) allTimes.push(capped(r.time_to_answer_ms)); });
    });
    const avgTimePerCard = allTimes.length ? mean(allTimes) : null;

    const activeIds = new Set(cards.map((c) => c.id));
    const masteredActive = cardStats.filter((s) => s.mastered && activeIds.has(s.card_id));
    const ttm = masteredActive
      .map((s) => (s.mastered_at && s.first_studied_date) ? new Date(s.mastered_at) - new Date(s.first_studied_date) : null)
      .filter((x) => x != null && isFinite(x));
    const medianTtm = ttm.length ? median(ttm) : null;
    const atm = cardStats.map((s) => s.attempts_to_master).filter((x) => x != null);
    const avgAttemptsMaster = atm.length ? mean(atm) : null;
    const streaks = sessions.map((s) => s.best_streak).filter((x) => x != null);
    const longestStreak = streaks.length ? Math.max(...streaks) : null;

    let ftTotal = 0, ftFirst = 0;
    sessions.forEach((s) => {
      (s.card_results || []).forEach((r) => {
        ftTotal++;
        if (CORRECT_KEYS.has(r.key) && r.first_wrong == null) ftFirst++;
      });
    });
    const firstTryAcc = ftTotal ? ftFirst / ftTotal : null;

    return {
      count, totalStudy, avgSession, durationsCount: durations.length,
      avgScore, best, worst,
      avgTimePerCard, timeBasisCount: allTimes.length,
      masteredCount: masteredActive.length, totalCards: cards.length,
      medianTtm, ttmCount: ttm.length,
      avgAttemptsMaster, atmCount: atm.length,
      longestStreak,
      firstTryAcc, ftTotal,
    };
  }, [sessions, cardStats, cards]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link to={`/deck/${deckId}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{deck?.title}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" /> Progress & Stats
          </p>
        </div>
        <Link to={`/study/${deckId}`}>
          <Button size="sm" className="gap-1.5"><BookOpen className="w-4 h-4" /> Study Now</Button>
        </Link>
      </div>

      {!sessions.length ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
            <BarChart2 className="w-7 h-7 text-accent-foreground" />
          </div>
          <h2 className="font-semibold">No study sessions yet</h2>
          <p className="text-muted-foreground text-sm max-w-xs">Complete a study session to see your stats here.</p>
          <Link to={`/study/${deckId}`}><Button className="mt-1 gap-1.5"><BookOpen className="w-4 h-4" /> Start Studying</Button></Link>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Readiness */}
          <div className="bg-card border border-border rounded-xl p-5">
            <ReadinessBar pct={overview.avgScore ?? 0} />
          </div>

          {/* 1. Overview tiles */}
          <section className="space-y-3">
            <SectionHeading>Overview</SectionHeading>
            <OverviewTiles overview={overview} />
          </section>

          {/* 2. Score & pace over time */}
          <section className="space-y-3">
            <SectionHeading>Score & pace over time</SectionHeading>
            <TrendCharts sessionsAsc={sessionsAsc} />
          </section>

          {/* 3. Mastery timeline */}
          <section className="space-y-3">
            <SectionHeading>Mastery timeline</SectionHeading>
            <MasteryTimelineSection cardStats={cardStats} cards={cards} />
          </section>

          {/* 4. Per-card table */}
          <section className="space-y-3">
            <SectionHeading>Per-card breakdown</SectionHeading>
            <PerCardTable cardRows={cardRows} />
          </section>

          {/* 5. Question-type breakdown */}
          <section className="space-y-3">
            <SectionHeading>Question types</SectionHeading>
            <QuestionTypeBreakdown cardRows={cardRows} />
          </section>

          {/* 6. Habits */}
          <section className="space-y-3">
            <SectionHeading>Habits</SectionHeading>
            <HabitsSection sessions={sessions} />
          </section>

          {/* 7. Session log */}
          <section className="space-y-3">
            <SectionHeading>Session log</SectionHeading>
            <SessionLog sessions={sessions} />
          </section>
        </div>
      )}
    </div>
  );
}