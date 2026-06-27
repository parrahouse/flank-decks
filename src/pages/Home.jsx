import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import DeckCard from '@/components/deck/DeckCard';
import ShareModal from '@/components/deck/ShareModal';
import CoverImagePicker from '@/components/deck/CoverImagePicker';
import { toast } from 'sonner';
function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Home() {
  const qc = useQueryClient();

  const { data: decks = [], isLoading } = useQuery({
    queryKey: ['decks'],
    queryFn: () => base44.entities.Deck.list('-created_date')
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['cards-all'],
    queryFn: () => base44.entities.Card.list()
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['study-sessions-home'],
    queryFn: () => base44.entities.StudySession.list('-created_date', 500)
  });

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me()
  });

  const { data: savedSessions = [] } = useQuery({
    queryKey: ['saved-sessions-home', currentUser?.id],
    queryFn: () => base44.entities.SavedSession.filter({ user_id: currentUser.id }),
    enabled: !!currentUser?.id
  });

  const { data: cardStats = [] } = useQuery({
    queryKey: ['card-stats-home', currentUser?.id],
    queryFn: () => base44.entities.UserCardStats.filter({ user_id: currentUser.id }),
    enabled: !!currentUser?.id
  });

  // Mastery percentage per deck: mastered cards / total active cards
  const deckMasteryPct = (deckId) => {
    const total = cards.filter((c) => c.deck_id === deckId && !c.deleted).length;
    if (!total) return 0;
    const mastered = cardStats.filter((s) => s.deck_id === deckId && s.mastered).length;
    return Math.round((mastered / total) * 100);
  };

  const savedHoursLeft = (deckId) => {
    const s = savedSessions.find((x) => x.deck_id === deckId && new Date(x.expires_at).getTime() > Date.now());
    if (!s) return null;
    return Math.max(0, Math.ceil((new Date(s.expires_at).getTime() - Date.now()) / 3600000));
  };

  // Compute per-deck stats from session history
  const deckStats = (deckId) => {
    const s = sessions.filter((x) => x.deck_id === deckId);
    if (!s.length) return null;
    const finished = s.filter((x) => x.score_pct != null);
    const scores = finished.map((x) => x.score_pct);
    const last = s[0]; // already sorted by -created_date
    return {
      timesStarted: s.length,
      timesFinished: finished.length,
      highScore: scores.length ? Math.round(Math.max(...scores)) : null,
      lowScore: scores.length ? Math.round(Math.min(...scores)) : null,
      lastStudied: last?.created_date || null
    };
  };

  const [showForm, setShowForm] = useState(false);
  const [editingDeck, setEditingDeck] = useState(null);
  const [shareDeck, setShareDeck] = useState(null);
  const [coverDeck, setCoverDeck] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');

  const openCreate = () => {setEditingDeck(null);setFormTitle('');setFormDesc('');setShowForm(true);};
  const openEdit = (deck) => {setEditingDeck(deck);setFormTitle(deck.title);setFormDesc(deck.description || '');setShowForm(true);};

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingDeck) {
        return base44.entities.Deck.update(editingDeck.id, { title: formTitle, description: formDesc });
      } else {
        return base44.entities.Deck.create({ title: formTitle, description: formDesc, is_public: false, share_token: makeToken() });
      }
    },
    onSuccess: () => {qc.invalidateQueries(['decks']);setShowForm(false);toast.success(editingDeck ? 'Deck updated' : 'Deck created');}
  });

  const deleteMutation = useMutation({
    mutationFn: async (deck) => {
      await base44.entities.Deck.delete(deck.id);
      const deckCards = cards.filter((c) => c.deck_id === deck.id);
      await Promise.all(deckCards.map((c) => base44.entities.Card.delete(c.id)));
    },
    onSuccess: () => {qc.invalidateQueries(['decks']);qc.invalidateQueries(['cards-all']);toast.success('Deck deleted');}
  });

  const duplicateMutation = useMutation({
    mutationFn: async (deck) => {
      const newDeck = await base44.entities.Deck.create({ title: deck.title + ' (copy)', description: deck.description, is_public: false, share_token: makeToken() });
      const deckCards = cards.filter((c) => c.deck_id === deck.id);
      await Promise.all(deckCards.map((c) => base44.entities.Card.create({ ...c, id: undefined, deck_id: newDeck.id })));
      return newDeck;
    },
    onSuccess: () => {qc.invalidateQueries(['decks']);qc.invalidateQueries(['cards-all']);toast.success('Deck duplicated');}
  });

  const cardCount = (deckId) => cards.filter((c) => c.deck_id === deckId).length;

  // Default cover = first card image in deck
  const getCoverUrl = (deck) => {
    if (deck.cover_image_url) return deck.cover_image_url;
    const firstCard = cards.find((c) => c.deck_id === deck.id && c.image_url);
    return firstCard?.image_url || null;
  };

  const saveCoverMutation = useMutation({
    mutationFn: ({ deck, url }) => base44.entities.Deck.update(deck.id, { cover_image_url: url }),
    onSuccess: () => {qc.invalidateQueries(['decks']);toast.success('Cover updated');}
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Decks</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Create, study and share image flashcard decks.</p>
        </div>
        <Button onClick={openCreate} className="gap-1.5 rounded-[20px]">
          <Plus className="w-4 h-4" /> New Deck
        </Button>
      </div>

      {isLoading ?
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
        </div> :
      decks.length === 0 ?
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-accent-foreground" />
          </div>
          <h2 className="font-semibold text-lg">No decks yet</h2>
          <p className="text-muted-foreground text-sm max-w-xs">Create your first deck to start building image flashcards.</p>
          <Button onClick={openCreate} className="mt-2 gap-1.5"><Plus className="w-4 h-4" /> New Deck</Button>
        </div> :

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) =>
        <DeckCard
          key={deck.id}
          deck={deck}
          cardCount={cardCount(deck.id)}
          coverUrl={getCoverUrl(deck)}
          stats={deckStats(deck.id)}
          masteryPct={deckMasteryPct(deck.id)}
          savedHoursLeft={savedHoursLeft(deck.id)}
          onEdit={openEdit}
          onDelete={(d) => deleteMutation.mutate(d)}
          onDuplicate={(d) => duplicateMutation.mutate(d)}
          onShare={(d) => setShareDeck(d)}
          onSetCover={(d) => setCoverDeck(d)} />

        )}
        </div>
      }

      {/* Create / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingDeck ? 'Edit Deck' : 'New Deck'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Animals in Spanish" />
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="What is this deck about?" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!formTitle.trim() || saveMutation.isPending}>
              {editingDeck ? 'Save Changes' : 'Create Deck'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareModal deck={shareDeck} open={!!shareDeck} onClose={() => setShareDeck(null)} />

      {coverDeck &&
      <CoverImagePicker
        open={!!coverDeck}
        onClose={() => setCoverDeck(null)}
        cards={cards.filter((c) => c.deck_id === coverDeck.id)}
        currentUrl={coverDeck.cover_image_url || null}
        onSave={(url) => saveCoverMutation.mutate({ deck: coverDeck, url })} />

      }
    </div>);

}