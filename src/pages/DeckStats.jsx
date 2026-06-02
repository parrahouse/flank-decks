import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, BarChart2, Trophy, TrendingDown, TrendingUp, Target, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

  const stats = useMemo(() => {
    if (!sessions.length) return null;

    const scores = sessions.map(s => s.score_pct);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const best = Math.max(...scores);
    const worst = Math.min(...scores);

    // Per-card average score across all sessions
    const cardScores = {}; // card_id -> {total, count, correct_answer}
    sessions.forEach(s => {
      (s.card_results || []).forEach(r => {
        if (!cardScores[r.card_id]) cardScores[r.card_id] = { total: 0, count: 0, correct_answer: r.correct_answer, image_url: r.image_url };
        cardScores[r.card_id].total += r.points;
        cardScores[r.card_id].count += 1;
      });
    });

    const cardAvgs = Object.entries(cardScores)
      .map(([id, v]) => ({ card_id: id, avg: v.total / v.count, correct_answer: v.correct_answer, image_url: v.image_url }))
      .filter(c => c.correct_answer);

    cardAvgs.sort((a, b) => a.avg - b.avg);
    const weakest = cardAvgs.slice(0, 3);
    const strongest = cardAvgs.slice(-3).reverse();

    return { avg, best, worst, weakest, strongest, count: sessions.length };
  }, [sessions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
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

      {!stats ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
            <BarChart2 className="w-7 h-7 text-accent-foreground" />
          </div>
          <h2 className="font-semibold">No study sessions yet</h2>
          <p className="text-muted-foreground text-sm max-w-xs">Complete a study session to see your stats here.</p>
          <Link to={`/study/${deckId}`}><Button className="mt-1 gap-1.5"><BookOpen className="w-4 h-4" /> Start Studying</Button></Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Readiness */}
          <div className="bg-card border border-border rounded-xl p-5">
            <ReadinessBar pct={stats.avg} />
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<BarChart2 className="w-4 h-4" />} label="Sessions" value={stats.count} />
            <StatCard icon={<Target className="w-4 h-4" />} label="Avg Score" value={`${Math.round(stats.avg)}%`} />
            <StatCard icon={<Trophy className="w-4 h-4" />} label="Best" value={`${Math.round(stats.best)}%`} valueClass="text-success" />
            <StatCard icon={<TrendingDown className="w-4 h-4" />} label="Worst" value={`${Math.round(stats.worst)}%`} valueClass="text-destructive" />
          </div>

          {/* Recent sessions */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/40 text-sm font-medium text-muted-foreground">
              Recent Sessions
            </div>
            {sessions.slice(0, 8).map((s, i) => (
              <div key={s.id} className={cn('flex items-center justify-between px-4 py-2.5 text-sm', i > 0 && 'border-t border-border')}>
                <span className="text-muted-foreground text-xs">
                  {new Date(s.created_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className={cn('h-1.5 rounded-full', s.score_pct >= 75 ? 'bg-success' : s.score_pct >= 50 ? 'bg-amber-400' : 'bg-destructive')}
                      style={{ width: `${s.score_pct}%` }}
                    />
                  </div>
                  <span className="font-semibold w-10 text-right">{Math.round(s.score_pct)}%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Mastery overview */}
          {cardStats.length > 0 && (() => {
            const minSessions = deck?.mastery_min_sessions ?? 3;
            const masteryPct = deck?.mastery_pct ?? 90;
            const activeCardIds = new Set(cards.map(c => c.id));
            const masteredCount = cardStats.filter(s => s.mastered && activeCardIds.has(s.card_id)).length;
            const totalCards = cards.length;
            const eligible = cardStats.filter(s => (s.sessions_completed ?? 0) >= minSessions);
            return (
              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-1.5"><Trophy className="w-4 h-4 text-amber-500" /> Mastery</span>
                  <span className="text-xs text-muted-foreground">Requires {minSessions} session{minSessions !== 1 ? 's' : ''} · ≥{masteryPct}% correct</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-success h-2 rounded-full transition-all duration-700" style={{ width: `${totalCards > 0 ? (masteredCount / totalCards) * 100 : 0}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{masteredCount} of {totalCards} cards mastered</span>
                  <span>{eligible.length} card{eligible.length !== 1 ? 's' : ''} eligible for mastery</span>
                </div>
              </div>
            );
          })()}

          {/* Weakest & Strongest cards */}
          {stats.weakest.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              <CardList title="Weakest Cards" icon={<TrendingDown className="w-4 h-4 text-destructive" />} cards={stats.weakest} colorClass="text-destructive" />
              <CardList title="Strongest Cards" icon={<TrendingUp className="w-4 h-4 text-success" />} cards={stats.strongest} colorClass="text-success" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, valueClass }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1.5">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">{icon}{label}</div>
      <div className={cn('text-2xl font-bold', valueClass)}>{value}</div>
    </div>
  );
}

function CardList({ title, icon, cards, colorClass }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/40 text-sm font-medium flex items-center gap-1.5">
        {icon} {title}
      </div>
      {cards.map((c, i) => (
        <div key={c.card_id} className={cn('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-border')}>
          {c.image_url && <img src={c.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
          <span className="flex-1 text-sm font-medium truncate">{c.correct_answer}</span>
          <span className={cn('text-xs font-semibold shrink-0', colorClass)}>{Math.round(c.avg * 100)}%</span>
        </div>
      ))}
    </div>
  );
}