import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, ArrowLeft, Pencil, Trash2, BookOpen, Image as ImageIcon, Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import CardEditor from '@/components/cards/CardEditor';
import { toast } from 'sonner';

export default function DeckBuilder() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: deck } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => base44.entities.Deck.filter({ id: deckId }).then(r => r[0]),
    enabled: !!deckId,
  });

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => base44.entities.Card.filter({ deck_id: deckId }, 'order'),
    enabled: !!deckId,
  });

  const [showEditor, setShowEditor] = useState(false);
  const [editingCard, setEditingCard] = useState(null);

  const openAdd = () => { setEditingCard(null); setShowEditor(true); };
  const openEdit = (card) => { setEditingCard(card); setShowEditor(true); };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingCard) {
        return base44.entities.Card.update(editingCard.id, data);
      } else {
        return base44.entities.Card.create({ ...data, deck_id: deckId, order: cards.length });
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
    mutationFn: (card) => base44.entities.Card.delete(card.id),
    onSuccess: () => { qc.invalidateQueries(['cards', deckId]); qc.invalidateQueries(['cards-all']); toast.success('Card deleted'); },
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
          <p className="text-muted-foreground text-sm">{cards.length} {cards.length === 1 ? 'card' : 'cards'}</p>
        </div>
        <div className="flex gap-2">
          {cards.length > 0 && (
            <Link to={`/study/${deckId}`}>
              <Button variant="outline" size="sm" className="gap-1.5"><BookOpen className="w-4 h-4" /> Study</Button>
            </Link>
          )}
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
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
            <ImageIcon className="w-7 h-7 text-accent-foreground" />
          </div>
          <h2 className="font-semibold">No cards yet</h2>
          <p className="text-muted-foreground text-sm max-w-xs">Add your first card with an image and word bank choices.</p>
          <Button onClick={openAdd} className="mt-1 gap-1.5"><Plus className="w-4 h-4" /> Add Card</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {cards.map((card, idx) => (
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

    </div>
    </div>

    {/* Side panel on large screens, modal on small */}
    {showEditor && (
      <>
        {/* Mobile: modal overlay */}
        <div className="lg:hidden">
          <Dialog open={showEditor} onOpenChange={setShowEditor}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCard ? 'Edit Card' : 'Add Card'}</DialogTitle>
              </DialogHeader>
              <CardEditor
                card={editingCard}
                onSave={(data) => saveMutation.mutate(data)}
                onCancel={() => setShowEditor(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Desktop: fixed side panel */}
        <div className="hidden lg:flex fixed top-14 right-0 bottom-0 w-[420px] bg-card border-l border-border flex-col z-30 shadow-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <h2 className="font-semibold text-base">{editingCard ? 'Edit Card' : 'Add Card'}</h2>
            <button onClick={() => setShowEditor(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <CardEditor
              card={editingCard}
              onSave={(data) => saveMutation.mutate(data)}
              onCancel={() => setShowEditor(false)}
            />
          </div>
        </div>
      </>
    )}
    </div>
  );
}