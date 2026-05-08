import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
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

export default function StudySession() {
  const { deckId } = useParams();
  const [cardIndex, setCardIndex] = useState(0);
  const [shuffledCards, setShuffledCards] = useState([]);
  const [done, setDone] = useState(false);

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

  const restart = () => { setShuffledCards(shuffle(cards)); setCardIndex(0); setDone(false); };

  const handleNext = () => {
    if (cardIndex < shuffledCards.length - 1) setCardIndex(i => i + 1);
    else setDone(true);
  };
  const handlePrev = () => { if (cardIndex > 0) setCardIndex(i => i - 1); };

  if (isLoading || !shuffledCards.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

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
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="text-5xl">🎉</div>
          <h2 className="text-xl font-bold">Deck complete!</h2>
          <p className="text-muted-foreground text-sm">You've gone through all {shuffledCards.length} cards.</p>
          <Button onClick={restart} className="mt-2 gap-1.5"><RotateCcw className="w-4 h-4" /> Study Again</Button>
        </div>
      ) : (
        <>
          <StudyCard
            key={`${current.id}-${cardIndex}`}
            card={current}
            onNext={handleNext}
            onPrev={handlePrev}
            isFirst={cardIndex === 0}
            isLast={cardIndex === shuffledCards.length - 1}
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