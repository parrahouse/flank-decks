import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  const qc = useQueryClient();
  const { token } = useParams();
  const [cardIndex, setCardIndex] = useState(0);
  const [shuffledCards, setShuffledCards] = useState([]);
  const [done, setDone] = useState(false);

  const { data, isLoading: loadingDeck, isError: deckError } = useQuery({
    queryKey: ['shared-deck', token],
    queryFn: () => base44.functions.invoke('getSharedDeck', { token }),
  });

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  const deck = data?.data?.deck;
  const cards = data?.data?.cards ?? [];
  const sharedNotes = data?.data?.notes ?? [];
  const sharedNotesByCardId = Object.fromEntries(sharedNotes.map(n => [n.card_id, n.note]));
  const isOwner = !!me && !!deck && deck.created_by === me.email;

  useEffect(() => {
    if (cards.length) setShuffledCards(shuffle(cards));
  }, [cards.length]);

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('subscribeToDeck', { token });
      return res.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries(['deck-subscriptions']);
      qc.invalidateQueries(['subscribed-decks']);
      qc.invalidateQueries(['cards-library']);
      if (data?.already_subscribed) toast.message('Already in your library');
      else toast.success('Added to your library');
    },
  });

  const restart = () => { setShuffledCards(shuffle(cards)); setCardIndex(0); setDone(false); };
  const handleNext = () => { if (cardIndex < shuffledCards.length - 1) setCardIndex(i => i + 1); else setDone(true); };
  const handlePrev = () => { if (cardIndex > 0) setCardIndex(i => i - 1); };

  if (loadingDeck) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (deckError || !deck) {
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
        {!isOwner && (
          <Button variant="outline" size="sm" onClick={() => subscribeMutation.mutate()} disabled={subscribeMutation.isPending} className="gap-1.5">
            <BookOpen className="w-4 h-4" /> {subscribeMutation.isPending ? 'Adding…' : 'Add to Library'}
          </Button>
        )}
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
          note={sharedNotesByCardId[shuffledCards[cardIndex].id] || null}
        />
      ) : (
        <div className="text-center py-16 text-muted-foreground">This deck has no cards.</div>
      )}
    </div>
  );
}