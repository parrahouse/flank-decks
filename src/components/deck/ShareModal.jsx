import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Check, Copy, ExternalLink, Share2, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function ShareModal({ deck, open, onClose }) {
  const [copied, setCopied] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [useDeckLink, setUseDeckLink] = useState(false);
  const qc = useQueryClient();

  // Find collections this deck belongs to that are already publicly shared.
  const { data: sharedCollections = [] } = useQuery({
    queryKey: ['shared-collections-for-deck', deck?.id],
    queryFn: async () => {
      const memberships = await base44.entities.CollectionDeck.filter({ deck: deck.id });
      const collectionIds = (memberships || []).map((m) => m.collection).filter(Boolean);
      const cols = await Promise.all(
        collectionIds.map((cid) =>
          base44.entities.Collection.filter({ id: cid }).then((r) => (r && r[0]) || null).catch(() => null)
        )
      );
      return cols.filter((c) => c && c.is_public && c.share_token);
    },
    enabled: open && !!deck?.id,
  });

  if (!deck) return null;

  const isPublic = !!deck.is_public && !!deck.share_token;
  const shareUrl = deck.share_token ? `${window.location.origin}/shared/${deck.share_token}` : null;
  const collectionShare = sharedCollections[0];
  const collectionUrl = collectionShare
    ? `${window.location.origin}/shared-collection/${collectionShare.share_token}`
    : null;

  const handleEnable = async () => {
    setEnabling(true);
    try {
      await base44.entities.Deck.update(deck.id, {
        is_public: true,
        share_token: deck.share_token || makeToken(),
      });
      qc.invalidateQueries(['decks']);
      qc.invalidateQueries(['deck', deck.id]);
      qc.invalidateQueries(['shared-collections-for-deck', deck.id]);
    } catch (e) {
      toast.error(e.message || 'Could not enable sharing');
    } finally {
      setEnabling(false);
    }
  };

  const handleDisable = async () => {
    setDisabling(true);
    try {
      await base44.entities.Deck.update(deck.id, {
        is_public: false,
        share_token: null,
      });
      qc.invalidateQueries(['decks']);
      qc.invalidateQueries(['deck', deck.id]);
      toast.success('Sharing disabled');
    } catch (e) {
      toast.error(e.message || 'Could not disable sharing');
    } finally {
      setDisabling(false);
    }
  };

  const handleCopy = (url) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share "{deck.title}"</DialogTitle>
          <DialogDescription>
            {isPublic
              ? 'Anyone with this link can view and study this deck.'
              : 'Enable sharing to get a link anyone can use to view this deck.'}
          </DialogDescription>
        </DialogHeader>

        {collectionShare && !useDeckLink && (
          <div className="mt-2 rounded-md border border-accent bg-accent/50 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Folder className="w-4 h-4 text-accent-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-accent-foreground">
                This deck belongs to "{collectionShare.name}", which is already shared. You can use the collection
                link to share all its decks at once.
              </p>
            </div>
            <div className="flex gap-2">
              <Input value={collectionUrl} readOnly className="text-xs font-mono bg-background" />
              <Button variant="outline" size="icon" onClick={() => handleCopy(collectionUrl)}>
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={collectionUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>
            <button
              onClick={() => setUseDeckLink(true)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Share just this deck instead
            </button>
          </div>
        )}

        {(isPublic || useDeckLink) && shareUrl ? (
          <div className="space-y-4 mt-2">
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="text-sm font-mono" />
              <Button variant="outline" size="icon" onClick={() => handleCopy(shareUrl)}>
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDisable}
              disabled={disabling}
            >
              {disabling ? 'Disabling…' : 'Disable sharing'}
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