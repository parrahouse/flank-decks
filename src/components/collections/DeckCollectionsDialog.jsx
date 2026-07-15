import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function DeckCollectionsDialog({ open, onClose, deckId, deckTitle }) {
  const qc = useQueryClient();
  const [toggling, setToggling] = useState({});

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: () => base44.entities.Collection.list('sort_order'),
    enabled: open,
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ['collection-decks-by-deck', deckId],
    queryFn: () => base44.entities.CollectionDeck.filter({ deck: deckId }),
    enabled: open && !!deckId,
  });

  const memberCollectionIds = new Set(memberships.map((m) => m.collection));

  const toggle = async (collectionId, isMember) => {
    setToggling((s) => ({ ...s, [collectionId]: true }));
    try {
      if (isMember) {
        const row = memberships.find((m) => m.collection === collectionId);
        if (row) await base44.functions.invoke('mutateCollectionDecks', { action: 'remove', row_ids: [row.id] });
      } else {
        await base44.functions.invoke('mutateCollectionDecks', {
          action: 'add',
          collection_id: collectionId,
          deck_ids: [deckId],
        });
      }
      qc.invalidateQueries(['collection-decks-by-deck', deckId]);
      qc.invalidateQueries(['collection-decks']);
      toast.success(isMember ? 'Removed from collection' : 'Added to collection');
    } catch (e) {
      toast.error(e.message || 'Could not update membership');
    } finally {
      setToggling((s) => ({ ...s, [collectionId]: false }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Collections</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Manage which collections <span className="font-medium text-foreground">{deckTitle}</span> belongs to.
        </p>
        {isLoading ? (
          <div className="space-y-2 py-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />)}
          </div>
        ) : collections.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No collections yet. Create one first.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {collections.map((c) => {
              const isMember = memberCollectionIds.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id, isMember)}
                  disabled={toggling[c.id]}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md border border-border hover:bg-secondary/60 transition-colors text-left disabled:opacity-50"
                >
                  <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: c.accent_color || '#64748b' }} />
                  <span className="flex-1 text-sm font-medium truncate">{c.name}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isMember ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {isMember ? 'In' : 'Add'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}