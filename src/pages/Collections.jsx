import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FolderOpen, Plus, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import CollectionFormDialog from '@/components/collections/CollectionFormDialog';
import { toast } from 'sonner';

export default function Collections() {
  const qc = useQueryClient();

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: () => base44.entities.Collection.list('sort_order'),
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ['collection-decks-all'],
    queryFn: () => base44.entities.CollectionDeck.list(),
  });

  const counts = useMemo(() => {
    const map = {};
    memberships.forEach((m) => { map[m.collection] = (map[m.collection] || 0) + 1; });
    return map;
  }, [memberships]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const deleteMut = useMutation({
    mutationFn: async (col) => {
      const rows = memberships.filter((m) => m.collection === col.id);
      await Promise.all(rows.map((r) => base44.entities.CollectionDeck.delete(r.id)));
      await base44.entities.Collection.delete(col.id);
    },
    onSuccess: () => {
      qc.invalidateQueries(['collections']);
      qc.invalidateQueries(['collection-decks-all']);
      qc.invalidateQueries(['collection-decks']);
      qc.invalidateQueries(['collection-decks-by-deck']);
      toast.success('Collection deleted');
      setDeleting(null);
    },
    onError: (e) => toast.error(e.message || 'Could not delete collection'),
  });

  const reorder = async (idx, dir) => {
    const swap = idx + dir;
    if (swap < 0 || swap >= collections.length) return;
    const a = collections[idx];
    const b = collections[swap];
    await base44.entities.Collection.bulkUpdate([
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ]);
    qc.invalidateQueries(['collections']);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Collections</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Group your decks into themed collections.</p>
        </div>
        <Button className="gap-1.5 rounded-[20px]" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="w-4 h-4" /> New Collection
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
            <FolderOpen className="w-8 h-8 text-accent-foreground" />
          </div>
          <h2 className="font-semibold text-lg">No collections yet</h2>
          <p className="text-muted-foreground text-sm max-w-xs">Organize your decks into collections like “Spanish vocab” or “Midterm review”.</p>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="mt-2 gap-1.5"><Plus className="w-4 h-4" /> New Collection</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((c, idx) => (
            <div key={c.id} className="group bg-card border border-border rounded-md overflow-hidden flex flex-col hover:shadow-md transition-all">
              <div className="h-1.5" style={{ backgroundColor: c.accent_color || '#64748b' }} />
              <Link to={`/collections/${c.id}`} className="flex flex-col gap-2 p-4 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground truncate flex-1">{c.name}</h3>
                  <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: c.accent_color || '#64748b' }} />
                </div>
                {c.description && <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">{counts[c.id] || 0} {counts[c.id] === 1 ? 'deck' : 'decks'}</p>
              </Link>
              <div className="flex items-center gap-1 px-3 pb-3">
                <div className="flex flex-col">
                  <button onClick={() => reorder(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                  <button onClick={() => reorder(idx, 1)} disabled={idx === collections.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(c); setFormOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(c)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CollectionFormDialog open={formOpen} onClose={() => setFormOpen(false)} collection={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the collection and its deck memberships. Your decks and cards are preserved and remain in the All Decks view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteMut.mutate(deleting)}>
              Delete collection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}