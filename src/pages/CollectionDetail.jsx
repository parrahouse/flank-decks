import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Plus, GalleryVerticalEnd, SquarePen, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AddDecksToCollectionDialog from '@/components/collections/AddDecksToCollectionDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import DeckCard from '@/components/deck/DeckCard';
import ShareModal from '@/components/deck/ShareModal';
import CoverImagePicker from '@/components/deck/CoverImagePicker';

function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function CollectionDetail() {
  const { collectionId } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: collection } = useQuery({
    queryKey: ['collection', collectionId],
    queryFn: () => base44.entities.Collection.filter({ id: collectionId }).then((r) => r[0]),
    enabled: !!collectionId,
  });

  const { data: memberships = [], isLoading: membersLoading } = useQuery({
    queryKey: ['collection-decks', collectionId],
    queryFn: () => base44.entities.CollectionDeck.filter({ collection: collectionId }, 'sort_order'),
    enabled: !!collectionId,
  });

  const { data: decks = [] } = useQuery({
    queryKey: ['decks'],
    queryFn: () => base44.entities.Deck.list('-created_date'),
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['cards-all'],
    queryFn: () => base44.entities.Card.list(),
  });

  const deckMap = useMemo(() => {
    const m = {};
    decks.forEach((d) => { m[d.id] = d; });
    return m;
  }, [decks]);

  const orderedDecks = useMemo(
    () => memberships.map((m) => ({ ...m, deck: deckMap[m.deck] })).filter((x) => x.deck),
    [memberships, deckMap]
  );

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['study-sessions-home'],
    queryFn: () => base44.entities.StudySession.list('-created_date', 500),
  });

  const { data: savedSessions = [] } = useQuery({
    queryKey: ['saved-sessions-home', currentUser?.id],
    queryFn: () => base44.entities.SavedSession.filter({ user_id: currentUser.id }),
    enabled: !!currentUser?.id,
  });

  const { data: cardStats = [] } = useQuery({
    queryKey: ['card-stats-home', currentUser?.id],
    queryFn: () => base44.entities.UserCardStats.filter({ user_id: currentUser.id }),
    enabled: !!currentUser?.id,
  });

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

  const deckStats = (deckId) => {
    const s = sessions.filter((x) => x.deck_id === deckId);
    if (!s.length) return null;
    const finished = s.filter((x) => x.score_pct != null);
    const scores = finished.map((x) => x.score_pct);
    const last = s[0];
    return {
      timesStarted: s.length,
      timesFinished: finished.length,
      highScore: scores.length ? Math.round(Math.max(...scores)) : null,
      lowScore: scores.length ? Math.round(Math.min(...scores)) : null,
      lastStudied: last?.created_date || null,
    };
  };

  const getCoverUrl = (deck) => {
    if (deck.cover_image_url) return deck.cover_image_url;
    const firstCard = cards.find((c) => c.deck_id === deck.id && c.image_url);
    return firstCard?.image_url || null;
  };

  const [addOpen, setAddOpen] = useState(false);
  const [newDeckOpen, setNewDeckOpen] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [shareDeck, setShareDeck] = useState(null);
  const [coverDeck, setCoverDeck] = useState(null);
  const [editingDeck, setEditingDeck] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [showEditForm, setShowEditForm] = useState(false);

  const removeMut = useMutation({
    mutationFn: (membershipId) => base44.entities.CollectionDeck.delete(membershipId),
    onSuccess: () => {
      qc.invalidateQueries(['collection-decks', collectionId]);
      qc.invalidateQueries(['collection-decks-all']);
      qc.invalidateQueries(['collection-decks-by-deck']);
      toast.success('Removed from collection');
    },
  });

  const saveCoverMutation = useMutation({
    mutationFn: ({ deck, url, focalPoint }) => base44.entities.Deck.update(deck.id, { cover_image_url: url, cover_focal_point: focalPoint }),
    onSuccess: () => { qc.invalidateQueries(['decks']); toast.success('Cover updated'); },
  });

  const editDeckMutation = useMutation({
    mutationFn: () => base44.entities.Deck.update(editingDeck.id, { title: formTitle, description: formDesc }),
    onSuccess: () => { qc.invalidateQueries(['decks']); setShowEditForm(false); toast.success('Deck updated'); },
  });

  const deleteDeckMutation = useMutation({
    mutationFn: async (deck) => {
      await base44.entities.Deck.delete(deck.id);
      const deckCards = cards.filter((c) => c.deck_id === deck.id);
      await Promise.all(deckCards.map((c) => base44.entities.Card.delete(c.id)));
    },
    onSuccess: () => { qc.invalidateQueries(['decks']); qc.invalidateQueries(['cards-all']); toast.success('Deck deleted'); },
  });

  const duplicateDeckMutation = useMutation({
    mutationFn: async (deck) => {
      const newDeck = await base44.entities.Deck.create({ title: deck.title + ' (copy)', description: deck.description, is_public: false, share_token: makeToken() });
      const deckCards = cards.filter((c) => c.deck_id === deck.id);
      await Promise.all(deckCards.map((c) => base44.entities.Card.create({ ...c, id: undefined, deck_id: newDeck.id })));
      return newDeck;
    },
    onSuccess: () => { qc.invalidateQueries(['decks']); qc.invalidateQueries(['cards-all']); toast.success('Deck duplicated'); },
  });

  const openEdit = (deck) => { setEditingDeck(deck); setFormTitle(deck.title); setFormDesc(deck.description || ''); setShowEditForm(true); };

  const createDeck = async () => {
    if (!newDeckTitle.trim()) return;
    setCreatingDeck(true);
    try {
      const deck = await base44.entities.Deck.create({ title: newDeckTitle.trim() });
      const baseOrder = memberships.reduce((mx, m) => Math.max(mx, m.sort_order || 0), -1);
      await base44.entities.CollectionDeck.create({ collection: collectionId, deck: deck.id, sort_order: baseOrder + 1 });
      qc.invalidateQueries(['collection-decks', collectionId]);
      qc.invalidateQueries(['collection-decks-all']);
      qc.invalidateQueries(['decks']);
      setNewDeckOpen(false);
      setNewDeckTitle('');
      navigate(`/deck/${deck.id}`);
    } catch (e) {
      toast.error(e.message || 'Could not create deck');
    } finally {
      setCreatingDeck(false);
    }
  };

  const reorder = async (idx, dir) => {
    const swap = idx + dir;
    if (swap < 0 || swap >= memberships.length) return;
    const a = memberships[idx];
    const b = memberships[swap];
    await base44.entities.CollectionDeck.bulkUpdate([
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ]);
    qc.invalidateQueries(['collection-decks', collectionId]);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <Link to="/collections" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> All collections
      </Link>

      <div className="flex items-start justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 rounded-full mt-1 shrink-0" style={{ backgroundColor: collection?.accent_color || '#64748b' }} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{collection?.name || 'Loading…'}</h1>
            {collection?.description && <p className="text-muted-foreground text-sm mt-0.5">{collection.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => { setNewDeckTitle(''); setNewDeckOpen(true); }}><SquarePen className="w-4 h-4" /> New deck</Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4" /> Add decks</Button>
          {orderedDecks.length > 0 && (
            <Link to={`/collections/${collectionId}/study`}>
              <Button className="gap-1.5"><Play className="w-4 h-4" /> Study collection</Button>
            </Link>
          )}
        </div>
      </div>

      {membersLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : orderedDecks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
            <GalleryVerticalEnd className="w-8 h-8 text-accent-foreground" />
          </div>
          <h2 className="font-semibold text-lg">No decks in this collection</h2>
          <p className="text-muted-foreground text-sm max-w-xs">Add decks to start studying them as a group.</p>
          <Button onClick={() => setAddOpen(true)} className="mt-2 gap-1.5"><Plus className="w-4 h-4" /> Add decks</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orderedDecks.map((m) => {
            const deck = m.deck;
            return (
              <DeckCard
                key={m.id}
                deck={deck}
                cardCount={cards.filter((c) => c.deck_id === deck.id && !c.deleted).length}
                coverUrl={getCoverUrl(deck)}
                stats={deckStats(deck.id)}
                masteryPct={deckMasteryPct(deck.id)}
                savedHoursLeft={savedHoursLeft(deck.id)}
                onEdit={openEdit}
                onDelete={(d) => deleteDeckMutation.mutate(d)}
                onDuplicate={(d) => duplicateDeckMutation.mutate(d)}
                onShare={(d) => setShareDeck(d)}
                onSetCover={(d) => setCoverDeck(d)}
              />
            );
          })}
        </div>
      )}

      <AddDecksToCollectionDialog open={addOpen} onClose={() => setAddOpen(false)} collectionId={collectionId} />

      {/* New deck dialog */}
      <Dialog open={newDeckOpen} onOpenChange={(o) => { if (!o) setNewDeckOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New deck</DialogTitle></DialogHeader>
          <Input autoFocus placeholder="Deck title" value={newDeckTitle} onChange={(e) => setNewDeckTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createDeck()} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewDeckOpen(false)}>Cancel</Button>
            <Button onClick={createDeck} disabled={!newDeckTitle.trim() || creatingDeck}>{creatingDeck ? 'Creating…' : 'Create & open'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit deck dialog */}
      <Dialog open={showEditForm} onOpenChange={(o) => { if (!o) setShowEditForm(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Deck</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Input placeholder="Title" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
            <Input placeholder="Description (optional)" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEditForm(false)}>Cancel</Button>
            <Button onClick={() => editDeckMutation.mutate()} disabled={!formTitle.trim() || editDeckMutation.isPending}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareModal deck={shareDeck} open={!!shareDeck} onClose={() => setShareDeck(null)} />

      {coverDeck && (
        <CoverImagePicker
          open={!!coverDeck}
          onClose={() => setCoverDeck(null)}
          cards={cards.filter((c) => c.deck_id === coverDeck.id)}
          currentUrl={coverDeck.cover_image_url || null}
          currentFocalPoint={coverDeck.cover_focal_point || null}
          onSave={(url, focalPoint) => saveCoverMutation.mutate({ deck: coverDeck, url, focalPoint })}
        />
      )}
    </div>
  );
}