import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Plus, X, ChevronUp, ChevronDown, GalleryVerticalEnd, Image as ImageIcon, SquarePen, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AddDecksToCollectionDialog from '@/components/collections/AddDecksToCollectionDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

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

  const [addOpen, setAddOpen] = useState(false);
  const [newDeckOpen, setNewDeckOpen] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [creatingDeck, setCreatingDeck] = useState(false);

  const removeMut = useMutation({
    mutationFn: (membershipId) => base44.entities.CollectionDeck.delete(membershipId),
    onSuccess: () => {
      qc.invalidateQueries(['collection-decks', collectionId]);
      qc.invalidateQueries(['collection-decks-all']);
      qc.invalidateQueries(['collection-decks-by-deck']);
      toast.success('Removed from collection');
    },
  });

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

  const cardCount = (deckId) => cards.filter((c) => c.deck_id === deckId && !c.deleted).length;
  const coverUrl = (deckId) => {
    const deck = deckMap[deckId];
    if (deck?.cover_image_url) return deck.cover_image_url;
    const first = cards.find((c) => c.deck_id === deckId && c.image_url);
    return first?.image_url || null;
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
          {orderedDecks.map((m, idx) => {
            const deck = m.deck;
            const url = coverUrl(deck.id);
            return (
              <div key={m.id} className="group relative bg-card border border-border rounded-md overflow-hidden flex flex-col hover:shadow-md transition-all">
                <Link to={`/deck/${deck.id}`} className="block">
                  <div className="h-32 bg-muted flex items-center justify-center overflow-hidden">
                    {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-muted-foreground/40" />}
                  </div>
                </Link>
                <div className="p-3 flex flex-col gap-1.5">
                  <Link to={`/deck/${deck.id}`} className="font-semibold text-sm text-foreground truncate hover:underline">{deck.title}</Link>
                  <p className="text-xs text-muted-foreground">{cardCount(deck.id)} cards</p>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex flex-col">
                      <button onClick={() => reorder(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => reorder(idx, 1)} disabled={idx === orderedDecks.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                    </div>
                    <Link to={`/study/${deck.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80">
                      <GalleryVerticalEnd className="w-4 h-4" /> Study
                    </Link>
                    <button onClick={() => removeMut.mutate(m.id)} className="text-muted-foreground hover:text-destructive" title="Remove from collection">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddDecksToCollectionDialog open={addOpen} onClose={() => setAddOpen(false)} collectionId={collectionId} />

      <Dialog open={newDeckOpen} onOpenChange={(o) => { if (!o) setNewDeckOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New deck</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Deck title"
            value={newDeckTitle}
            onChange={(e) => setNewDeckTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createDeck()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewDeckOpen(false)}>Cancel</Button>
            <Button onClick={createDeck} disabled={!newDeckTitle.trim() || creatingDeck}>
              {creatingDeck ? 'Creating…' : 'Create & open'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}