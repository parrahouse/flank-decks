import { useState } from 'react';
import { Check, Copy, ExternalLink, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function ShareCollectionModal({ collection, open, onClose }) {
  const [copied, setCopied] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const qc = useQueryClient();

  if (!collection) return null;

  const shareUrl = collection.share_token
    ? `${window.location.origin}/shared-collection/${collection.share_token}`
    : null;

  const handleEnable = async () => {
    setEnabling(true);
    try {
      await base44.entities.Collection.update(collection.id, {
        share_token: makeToken(),
        is_public: true,
      });
      // Share every member deck so each is individually studyable from the
      // shared collection link. Mark all decks public and ensure each has a
      // share token, preserving any existing token (keeps individually-shared
      // links stable). Decks created/duplicated get a token with is_public
      // false, so we must flip is_public on every deck, not just tokenless ones.
      const memberships = await base44.entities.CollectionDeck.filter({ collection: collection.id });
      const deckIds = (memberships || []).map((m) => m.deck).filter(Boolean);
      const decks = (await Promise.all(
        deckIds.map((id) =>
          base44.entities.Deck.filter({ id }).then((r) => (r && r[0]) || null).catch(() => null)
        )
      )).filter(Boolean);
      await Promise.all(
        decks.map((d) => base44.entities.Deck.update(d.id, {
          is_public: true,
          share_token: d.share_token || makeToken(),
        }))
      );
      // Mirror visibility onto each member deck's cards so subscribers can study them.
      await Promise.all(
        decks.map((d) => base44.entities.Card.updateMany({ deck_id: d.id }, { $set: { is_public: true } }))
      );
      qc.invalidateQueries(['collections']);
      qc.invalidateQueries(['cards-library']);
      qc.invalidateQueries(['collection', collection.id]);
      qc.invalidateQueries(['decks']);
    } catch (e) {
      toast.error(e.message || 'Could not enable sharing');
    } finally {
      setEnabling(false);
    }
  };

  const handleDisable = async () => {
    try {
      await base44.entities.Collection.update(collection.id, {
        share_token: null,
        is_public: false,
      });
      qc.invalidateQueries(['collections']);
      qc.invalidateQueries(['collection', collection.id]);
      toast.success('Sharing disabled');
    } catch (e) {
      toast.error(e.message || 'Could not disable sharing');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share "{collection.name}"</DialogTitle>
          <DialogDescription>
            {shareUrl
              ? 'Anyone with this link can view and study all decks in this collection.'
              : 'Enable sharing to get a link anyone can use to view this collection.'}
          </DialogDescription>
        </DialogHeader>

        {shareUrl ? (
          <div className="space-y-4 mt-2">
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="text-sm font-mono" />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDisable}>
              Disable sharing
            </Button>
          </div>
        ) : (
          <Button className="mt-2 gap-1.5" onClick={handleEnable} disabled={enabling}>
            <Share2 className="w-4 h-4" />
            {enabling ? 'Enabling…' : 'Enable sharing'}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}