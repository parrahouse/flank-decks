import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

export default function AssignDeckDialog({ open, onClose, groupId, assignedDeckIds = [] }) {
  const qc = useQueryClient();
  const [me, setMe] = useState(null);

  const { data: decks = [], isLoading } = useQuery({
    queryKey: ['owned-decks-for-assign', groupId],
    queryFn: async () => {
      const user = await base44.auth.me();
      setMe(user);
      return base44.entities.Deck.filter({ created_by: user.email }, '-created_date');
    },
    enabled: open,
  });

  const assignMut = useMutation({
    mutationFn: (deck_id) =>
      base44.functions.invoke('assignDeckToGroup', { group_id: groupId, deck_id }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['group', groupId]);
      qc.invalidateQueries(['deck-subscriptions']);
      qc.invalidateQueries(['subscribed-decks']);
      qc.invalidateQueries(['cards-library']);
      toast.success('Deck shared with group');
    },
    onError: (e) => toast.error(e?.response?.data?.error || e.message || 'Could not assign deck'),
  });

  const assignedSet = new Set(assignedDeckIds);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share a deck with the group</DialogTitle>
          <DialogDescription>
            Pick one of your decks. Members will get it added to their library automatically so they can study it.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 max-h-80 overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
            </div>
          ) : decks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">You don't have any decks yet.</p>
          ) : (
            <div className="space-y-1">
              {decks.map((d) => {
                const isAssigned = assignedSet.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={isAssigned || assignMut.isPending}
                    onClick={() => assignMut.mutate(d.id)}
                    className="w-full flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2.5 text-left hover:bg-accent/50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground truncate">{d.title}</span>
                      {d.description && <span className="block text-xs text-muted-foreground truncate">{d.description}</span>}
                    </span>
                    {isAssigned ? (
                      <span className="text-xs text-success flex items-center gap-1 shrink-0"><Check className="w-3.5 h-3.5" /> Shared</span>
                    ) : (
                      <span className="text-xs font-medium text-primary shrink-0">Share</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end mt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}