import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, RotateCcw, Copy, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudyCard from '@/components/cards/StudyCard';
import { toast } from 'sonner';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeToken() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

export default function SharedDeck() {
  const { token } = useParams();
  const [cardIndex, setCardIndex] = useState(0);
  const [shuffledCards, setShuffledCards] = useState([]);
  const [done, setDone] = useState(false);

  const { data: decks = [], isLoading: loadingDeck } = useQuery({
    queryKey: ['shared-deck', token],
    queryFn: () => base44.entities.Deck.filter({ share_token: token }),
  });

  const deck = decks[0];

  const { data: cards = [], isLoading: loadingCards } = useQuery({
    queryKey: ['shared-cards', deck?.id],
    queryFn: () => base44.entities.Card.filter({ deck_id: deck.id }, 'order'),
    enabled: !!deck?.id,
  });

  useEffect(() => {
    if (cards.length) setShuffledCards(shuffle(cards));
  }, [cards.length]);

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const newDeck = await base44.entities.Deck.create({ title: deck.title + ' (copy)', description: deck.description, is_public: false, share_token: makeToken() });
      await Promise.all(cards.map(c => base44.entities.Card.create({ ...c, id: undefined, deck_id: newDeck.id })));
      return newDeck;
    },
    onSuccess: () => toast.success('Deck added to your collection'),
  });

  const restart = () => { setShuffledCards(shuffle(cards)); setCardIndex(0); setDone(false); };
  const handleNext = () => { if (cardIndex < shuffledCards.length - 1) setCardIndex(i => i + 1); else setDone(true); };
  const handlePrev = () => { if (cardIndex > 0) setCardIndex(i => i - 1); };

  if (loadingDeck || loadingCards) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-muted-foreground">Deck not found or no longer shared.</p>
        <Link to="/"><Button variant="outline">Go Home</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-semibold">{deck.title}</h1>
            <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">Shared</span>
          </div>
          <p className="text-xs text-muted-foreground">{done ? 'Complete!' : `Card ${cardIndex + 1} of ${shuffledCards.length}`}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending} className="gap-1.5">
          <Copy className="w-4 h-4" /> Duplicate
        </Button>
      </div>

      <div className="w-full bg-muted rounded-full h-1.5 mb-6">
        <div className="bg-primary h-1.5 rounded-full transition-all duration-300" style={{ width: `${((cardIndex + (done ? 1 : 0)) / (shuffledCards.length || 1)) * 100}%` }} />
      </div>

      {done ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="text-5xl">🎉</div>
          <h2 className="text-xl font-bold">Deck complete!</h2>
          <Button onClick={restart} className="mt-2 gap-1.5"><RotateCcw className="w-4 h-4" /> Study Again</Button>
        </div>
      ) : shuffledCards.length > 0 ? (
        <StudyCard
          key={`${shuffledCards[cardIndex].id}-${cardIndex}`}
          card={shuffledCards[cardIndex]}
          onNext={handleNext}
          onPrev={handlePrev}
          isFirst={cardIndex === 0}
          isLast={cardIndex === shuffledCards.length - 1}
        />
      ) : (
        <div className="text-center py-16 text-muted-foreground">This deck has no cards.</div>
      )}
    </div>
  );
}