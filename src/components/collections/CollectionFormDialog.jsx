import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

const ACCENTS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b', '#f97316'];

export default function CollectionFormDialog({ open, onClose, collection = null }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accent, setAccent] = useState(ACCENTS[0]);

  useEffect(() => {
    if (open) {
      setName(collection?.name || '');
      setDescription(collection?.description || '');
      setAccent(collection?.accent_color || ACCENTS[0]);
    }
  }, [open, collection]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), description: description.trim(), accent_color: accent };
      if (collection) return base44.entities.Collection.update(collection.id, payload);
      return base44.entities.Collection.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries(['collections']);
      toast.success(collection ? 'Collection updated' : 'Collection created');
      onClose();
    },
    onError: (e) => toast.error(e.message || 'Could not save collection'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{collection ? 'Edit Collection' : 'New Collection'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spanish vocab" />
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this collection about?" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Accent color</Label>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccent(c)}
                  className="w-7 h-7 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: c,
                    borderColor: accent === c ? 'hsl(var(--foreground))' : 'transparent',
                    transform: accent === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {collection ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}