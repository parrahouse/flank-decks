import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, ArrowLeft, Pencil, Trash2, BookOpen, Image as ImageIcon, Settings2, X, Upload, RotateCcw, BarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import CardEditor from '@/components/cards/CardEditor';
import CsvUploadModal from '@/components/cards/CsvUploadModal';
import { toast } from 'sonner';

export default function DeckBuilder() {
  const { deckId } = useParams();
  const qc = useQueryClient();

  const { data: deck } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => base44.entities.Deck.filter({ id: deckId }).then(r => r[0]),
    enabled: !!deckId,
  });

  const { data: allCards = [], isLoading } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => base44.entities.Card.filter({ deck_id: deckId }, 'order'),
    enabled: !!deckId,
  });

  const activeCards = allCards.filter(c => !c.deleted);
  const deletedCards = allCards.filter(c => c.deleted);

  const [showEditor, setShowEditor] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showTrash, setShowTrash] = useState(false);

  const openAdd = () => { setEditingCard(null); setEditorDirty(false); setShowEditor(true); };
  const openEdit = (card) => { setEditingCard(card); setEditorDirty(false); setShowEditor(true); };

  const requestCloseEditor = () => {
    if (editorDirty) setShowDiscardDialog(true);
    else closeEditor();
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditorDirty(false);
    setShowDiscardDialog(false);
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingCard) {
        return base44.entities.Card.update(editingCard.id, data);
      } else {
        return base44.entities.Card.create({ ...data, deck_id: deckId, order: activeCards.length });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(['cards', deckId]);
      qc.invalidateQueries(['cards-all']);
      setShowEditor(false);
      toast.success(editingCard ? 'Card updated' : 'Card added');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (card) => base44.entities.Card.update(card.id, { deleted: true }),
    onSuccess: (_, card) => {
      qc.invalidateQueries(['cards', deckId]);
      qc.invalidateQueries(['cards-all']);
      toast.success('Card moved to trash', {
        action: { label: 'Undo', onClick: () => restoreMutation.mutate(card) },
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (card) => base44.entities.Card.update(card.id, { deleted: false }),
    onSuccess: () => {
      qc.invalidateQueries(['cards', deckId]);
      qc.invalidateQueries(['cards-all']);
      toast.success('Card restored');
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (card) => base44.entities.Card.delete(card.id),
    onSuccess: () => {
      qc.invalidateQueries(['cards', deckId]);
      qc.invalidateQueries(['cards-all']);
      toast.success('Card permanently deleted');
    },
  });

  const updateDeckMutation = useMutation({
    mutationFn: (data) => base44.entities.Deck.update(deckId, data),
    onSuccess: () => { qc.invalidateQueries(['deck', deckId]); toast.success('Deck settings saved'); },
  });

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
    {/* Main content */}
    <div className={`flex-1 px-4 py-8 transition-all duration-300 ${showEditor ? 'lg:mr-[420px]' : ''}`}>
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{deck?.title || 'Loading…'}</h1>
          <p className="text-muted-foreground text-sm">{activeCards.length} {activeCards.length === 1 ? 'card' : 'cards'}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {activeCards.length > 0 && (
            <>
              <Link to={`/study/${deckId}`}>
                <Button variant="outline" size="sm" className="gap-1.5"><BookOpen className="w-4 h-4" /> Study</Button>
              </Link>
              <Link to={`/stats/${deckId}`}>
                <Button variant="outline" size="sm" className="gap-1.5"><BarChart2 className="w-4 h-4" /> Stats</Button>
              </Link>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowTrash(v => !v)} className="gap-1.5">
            <Trash2 className="w-4 h-4" /> Bin {deletedCards.length > 0 && `(${deletedCards.length})`}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCsvUpload(true)} className="gap-1.5"><Upload className="w-4 h-4" /> Import CSV</Button>
          <Button onClick={openAdd} size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Add Card</Button>
        </div>
      </div>

      {/* Deck settings */}
      {deck && (
        <div className="mb-6 bg-card border border-border rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Settings2 className="w-3.5 h-3.5" /> Deck Settings
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Clue / Eliminate feature</Label>
            <Select
              value={deck.clue_mode || 'allowed'}
              onValueChange={(val) => updateDeckMutation.mutate({ clue_mode: val })}
            >
              <SelectTrigger className="h-7 text-xs w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allowed">Allowed</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Show clue by default</Label>
            <Select
              value={deck.clue_default_revealed ? 'yes' : 'no'}
              onValueChange={(val) => updateDeckMutation.mutate({ clue_default_revealed: val === 'yes' })}
            >
              <SelectTrigger className="h-7 text-xs w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">Hidden</SelectItem>
                <SelectItem value="yes">Shown</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : activeCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
            <ImageIcon className="w-7 h-7 text-accent-foreground" />
          </div>
          <h2 className="font-semibold">No cards yet</h2>
          <p className="text-muted-foreground text-sm max-w-xs">Add your first card with an image and word bank choices.</p>
          <div className="flex gap-2 mt-1">
            <Button onClick={openAdd} className="gap-1.5"><Plus className="w-4 h-4" /> Add Card</Button>
            <Button variant="outline" onClick={() => setShowCsvUpload(true)} className="gap-1.5"><Upload className="w-4 h-4" /> Import CSV</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {activeCards.map((card, idx) => (
            <div key={card.id} className="group relative bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-all">
              <div className="bg-muted h-28 flex items-center justify-center">
                {card.image_url
                  ? <img src={card.image_url} alt="" className="w-full h-full object-cover" />
                  : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium text-foreground truncate">{card.correct_answer}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{card.choices.length} choices</p>
              </div>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(card)} className="bg-white/90 hover:bg-white rounded-lg p-1.5 shadow-sm">
                  <Pencil className="w-3.5 h-3.5 text-foreground" />
                </button>
                <button onClick={() => deleteMutation.mutate(card)} className="bg-white/90 hover:bg-white rounded-lg p-1.5 shadow-sm">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
              <span className="absolute top-2 left-2 bg-black/50 text-white text-xs rounded px-1.5 py-0.5">{idx + 1}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bin Panel */}
      {showTrash && (
        <div className="mt-8 border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
            <span className="text-sm font-medium flex items-center gap-1.5">
              <Trash2 className="w-4 h-4 text-muted-foreground" /> Bin {deletedCards.length > 0 && `(${deletedCards.length})`}
            </span>
            <button onClick={() => setShowTrash(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          {deletedCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center text-muted-foreground">
              <Trash2 className="w-8 h-8 opacity-30" />
              <p className="text-sm font-medium">The bin is empty</p>
              <p className="text-xs">Deleted cards will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4">
              {deletedCards.map((card) => (
                <div key={card.id} className="relative bg-card border border-border rounded-xl overflow-hidden opacity-70 hover:opacity-100 transition-opacity">
                  <div className="bg-muted h-28 flex items-center justify-center">
                    {card.image_url
                      ? <img src={card.image_url} alt="" className="w-full h-full object-cover" />
                      : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-foreground truncate">{card.correct_answer}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{card.choices.length} choices</p>
                  </div>
                  <div className="flex gap-1 px-3 pb-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs gap-1 text-success border-success/40 hover:bg-success/10"
                      onClick={() => restoreMutation.mutate(card)}
                    >
                      <RotateCcw className="w-3 h-3" /> Restore
                    </Button>
                    <button
                      onClick={() => permanentDeleteMutation.mutate(card)}
                      className="bg-transparent hover:bg-destructive/10 rounded-lg p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
    </div>

    {/* Side panel on large screens, modal on small */}
    {showEditor && (
      <>
        {/* Mobile: modal overlay */}
        <div className="lg:hidden">
          <Dialog open={showEditor} onOpenChange={(open) => { if (!open) requestCloseEditor(); }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCard ? 'Edit Card' : 'Add Card'}</DialogTitle>
              </DialogHeader>
              <CardEditor
                card={editingCard}
                onSave={(data) => saveMutation.mutate(data)}
                onCancel={requestCloseEditor}
                onDirtyChange={setEditorDirty}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Desktop: fixed side panel */}
        <div className="hidden lg:flex fixed top-14 right-0 bottom-0 w-[420px] bg-card border-l border-border flex-col z-30 shadow-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <h2 className="font-semibold text-base">{editingCard ? 'Edit Card' : 'Add Card'}</h2>
            <button onClick={requestCloseEditor} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <CardEditor
              card={editingCard}
              onSave={(data) => saveMutation.mutate(data)}
              onCancel={requestCloseEditor}
              onDirtyChange={setEditorDirty}
            />
          </div>
        </div>
      </>
    )}
    <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. If you close now they will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setShowDiscardDialog(false)}>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={closeEditor} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <CsvUploadModal
      open={showCsvUpload}
      onClose={() => setShowCsvUpload(false)}
      deckId={deckId}
      existingCount={activeCards.length}
      onImported={() => { qc.invalidateQueries(['cards', deckId]); qc.invalidateQueries(['cards-all']); }}
    />
    </div>
  );
}