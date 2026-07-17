import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Link2, Check } from 'lucide-react';
import { toast } from 'sonner';

// Parses a pasted value into either a deck share link or a collection share link.
// Accepts full URLs, bare paths (/shared/abc), or a raw token.
function parseShareInput(input) {
  const v = (input || '').trim();
  if (!v) return null;
  if (!v.includes('/')) return { type: 'deck', token: v };
  try {
    const url = new URL(v);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shared' && parts[1]) return { type: 'deck', token: parts[1] };
    if (parts[0] === 'shared-collection' && parts[1]) return { type: 'collection', token: parts[1] };
  } catch {
    // Not a full URL — treat as a path or token.
    const parts = v.split('/').filter(Boolean);
    if (parts[0] === 'shared' && parts[1]) return { type: 'deck', token: parts[1] };
    if (parts[0] === 'shared-collection' && parts[1]) return { type: 'collection', token: parts[1] };
    return { type: 'deck', token: v };
  }
  return null;
}

export default function AddDeckByLinkDialog({ open, onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null);

  const addMutation = useMutation({
    mutationFn: async () => {
      const parsed = parseShareInput(value);
      if (!parsed) throw new Error('Enter a valid sharing link or token');
      if (parsed.type === 'collection') {
        return { collectionRedirect: parsed.token };
      }
      const res = await base44.functions.invoke('cloneDeck', { token: parsed.token });
      return res.data;
    },
    onSuccess: (data) => {
      if (data.collectionRedirect) {
        handleClose();
        navigate(`/shared-collection/${data.collectionRedirect}`);
        return;
      }
      qc.invalidateQueries(['owned-decks']);
      qc.invalidateQueries(['deck-subscriptions']);
      qc.invalidateQueries(['subscribed-decks']);
      qc.invalidateQueries(['cards-library']);
      setResult(data);
      toast.success('Deck added to your collection');
    },
  });

  const handleClose = () => {
    setValue('');
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a deck via sharing link</DialogTitle>
          <DialogDescription>
            Paste a deck sharing link to add a private copy to your collection.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="py-2 space-y-4">
            <div className="flex items-center gap-2 text-success">
              <Check className="w-5 h-5" />
              <span className="font-medium">Added {result.card_count} cards to your collection.</span>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={handleClose}>Close</Button>
              <Button asChild><Link to={`/deck/${result.deck_id}`} onClick={handleClose}>Open deck</Link></Button>
            </div>
          </div>
        ) : (
          <div className="py-2 space-y-3">
            <div className="flex gap-2">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Paste a sharing link…"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMutation.mutate(); } }}
              />
              <Button onClick={() => addMutation.mutate()} disabled={!value.trim() || addMutation.isPending} className="gap-1.5 shrink-0">
                <Link2 className="w-4 h-4" /> Add
              </Button>
            </div>
            {addMutation.isError && (
              <p className="text-sm text-destructive">{addMutation.error?.message || 'Could not add deck'}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}