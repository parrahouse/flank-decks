import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function AddDecksToCollectionDialog({ open, onClose, collectionId }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(new Set());

  const { data: decks = [], isLoading } = useQuery({
    queryKey: ['decks'],
    queryFn: () => base44.entities.Deck.list('-created_date'),
    enabled: open,
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ['collection-decks', collectionId],
    queryFn: () => base44.entities.CollectionDeck.filter({ collection: collectionId }, 'sort_order'),
    enabled: open && !!collectionId,
  });

  const { data: collection } = useQuery({
    queryKey: ['collection', collectionId],
    queryFn: () => base44.entities.Collection.filter({ id: collectionId }).then((r) => r[0]),
    enabled: open && !!collectionId,
  });

  const existingDeckIds = useMemo(() => new Set(memberships.map((m) => m.deck)), [memberships]);
  const available = useMemo(() => decks.filter((d) => !existingDeckIds.has(d.id)), [decks, existingDeckIds]);

  const add = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      await base44.functions.invoke('mutateCollectionDecks', {
        action: 'add',
        collection_id: collectionId,
        deck_ids: ids,
      });
      // If the collection is already public, share the newly-added decks so
      // they're studyable from the shared collection link.
      if (collection?.is_public) {
        const makeToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
        const addedDecks = decks.filter((d) => ids.includes(d.id));
        await Promise.all(
          addedDecks.map((d) => base44.entities.Deck.update(d.id, {
            is_public: true,
            share_token: d.share_token || makeToken(),
          }))
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(['collection-decks', collectionId]);
      qc.invalidateQueries(['collections']);
      qc.invalidateQueries(['collection-decks-by-deck']);
      toast.success(`Added ${selected.size} deck${selected.size !== 1 ? 's' : ''}`);
      setSelected(new Set());
      onClose();
    },
    onError: (e) => toast.error(e.message || 'Could not add decks'),
  });

  const toggle = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSelected(new Set()); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add decks to collection</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2 py-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />)}
          </div>
        ) : available.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">All your decks are already in this collection.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {available.map((d) => {
              const on = selected.has(d.id);
              return (
                <button
                  key={d.id}
                  onClick={() => toggle(d.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md border border-border hover:bg-secondary/60 transition-colors text-left"
                >
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${on ? 'bg-primary border-primary' : 'border-border'}`}>
                    {on && <span className="text-primary-foreground text-[10px] leading-none">✓</span>}
                  </span>
                  <span className="flex-1 text-sm font-medium truncate">{d.title}</span>
                </button>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setSelected(new Set()); onClose(); }}>Cancel</Button>
          <Button onClick={() => add.mutate()} disabled={selected.size === 0 || add.isPending}>
            Add {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}