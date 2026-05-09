import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, RotateCcw, ChevronLeft, ChevronRight, BarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudyCard from '@/components/cards/StudyCard';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SCORE_LABELS = {
  correct: { label: 'Correct', color: 'text-success' },
  second_guess: { label: '2nd try', color: 'text-orange-500' },
  correct_after_clue: { label: 'Correct (with clue)', color: 'text-amber-500' },
  second_guess_after_clue: { label: '2nd try + clue', color: 'text-orange-400' },
  wrong: { label: 'Incorrect', color: 'text-destructive' },
};

export default function StudySession() {
  const { deckId } = useParams();
  const [cardIndex, setCardIndex] = useState(0);
  const [shuffledCards, setShuffledCards] = useState([]);
  const [done, setDone] = useState(false);
  const [scores, setScores] = useState([]); // [{points, key}] per card

  const { data: deck } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => base44.entities.Deck.filter({ id: deckId }).then(r => r[0]),
    enabled: !!deckId,
  });

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => base44.entities.Card.filter({ deck_id: deckId }, 'order'),
    enabled: !!deckId,
  });

  useEffect(() => {
    if (cards.length) setShuffledCards(shuffle(cards));
  }, [cards.length]);

  const sessionSaved = useRef(false);

  // Save session when done
  useEffect(() => {
    if (!done || sessionSaved.current || !shuffledCards.length) return;
    sessionSaved.current = true;
    const cardResults = shuffledCards.map((card, i) => ({
      card_id: card.id,
      correct_answer: card.correct_answer,
      image_url: card.image_url || '',
      points: scores[i]?.points ?? 0,
      key: scores[i]?.key ?? 'skipped',
    }));
    const total = cardResults.reduce((s, r) => s + r.points, 0);
    const max = shuffledCards.length;
    base44.entities.StudySession.create({
      deck_id: deckId,
      score_pct: max > 0 ? (total / max) * 100 : 0,
      total_points: total,
      max_points: max,
      card_results: cardResults,
    });
  }, [done]);

  const restart = () => { setShuffledCards(shuffle(cards)); setCardIndex(0); setDone(false); setScores([]); sessionSaved.current = false; };

  const handleNext = () => {
    if (cardIndex < shuffledCards.length - 1) setCardIndex(i => i + 1);
    else setDone(true);
  };
  const handlePrev = () => { if (cardIndex > 0) setCardIndex(i => i - 1); };

  const handleScore = (points, key) => {
    setScores(prev => {
      const next = [...prev];
      next[cardIndex] = { points, key };
      return next;
    });
  };

  if (isLoading || !shuffledCards.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const totalPoints = scores.reduce((s, r) => s + (r?.points || 0), 0);
  const maxPoints = shuffledCards.length;
  const pct = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

  const current = shuffledCards[cardIndex];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/deck/${deckId}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-semibold">{deck?.title}</h1>
          <p className="text-xs text-muted-foreground">
            {done ? 'Complete!' : `Card ${cardIndex + 1} of ${shuffledCards.length}`}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={restart} className="gap-1.5 text-muted-foreground">
          <RotateCcw className="w-4 h-4" /> Restart
        </Button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-1.5 mb-6">
        <div
          className="bg-primary h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${((cardIndex + (done ? 1 : 0)) / shuffledCards.length) * 100}%` }}
        />
      </div>

      {done ? (
        <div className="flex flex-col items-center py-10 gap-6">
          <div className="text-5xl">🎉</div>
          <div className="text-center">
            <h2 className="text-xl font-bold">Deck complete!</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Score: <span className="font-semibold text-foreground">{totalPoints.toFixed(2)} / {maxPoints}</span>
              <span className="ml-2 text-xs">({pct}%)</span>
            </p>
          </div>

          {/* Per-card breakdown */}
          <div className="w-full bg-card border border-border rounded-xl overflow-hidden">
            {shuffledCards.map((card, i) => {
              const result = scores[i];
              const info = result ? SCORE_LABELS[result.key] : { label: 'Skipped', color: 'text-muted-foreground' };
              return (
                <div key={card.id} className={cn('flex items-center justify-between px-4 py-2.5 text-sm', i > 0 && 'border-t border-border')}>
                  <div className="flex items-center gap-3 min-w-0">
                    {card.image_url && <img src={card.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                    <span className="truncate font-medium">{card.correct_answer}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className={cn('text-xs font-medium', info.color)}>{info.label}</span>
                    <span className="text-xs text-muted-foreground w-8 text-right">{result ? result.points.toFixed(2) : '—'}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Link to={`/stats/${deckId}`}>
              <Button variant="outline" className="gap-1.5"><BarChart2 className="w-4 h-4" /> View Stats</Button>
            </Link>
            <Button onClick={restart} className="gap-1.5"><RotateCcw className="w-4 h-4" /> Study Again</Button>
          </div>
        </div>
      ) : (
        <>
          <StudyCard
            key={`${current.id}-${cardIndex}`}
            card={current}
            deck={deck}
            onNext={handleNext}
            onPrev={handlePrev}
            isFirst={cardIndex === 0}
            isLast={cardIndex === shuffledCards.length - 1}
            onScore={handleScore}
          />
          {/* Nav arrows */}
          <div className="flex justify-center gap-3 mt-5">
            <Button variant="ghost" size="icon" onClick={handlePrev} disabled={cardIndex === 0}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNext} disabled={cardIndex === shuffledCards.length - 1}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// cn helper inline to avoid missing import
function cn(...classes) { return classes.filter(Boolean).join(' '); }