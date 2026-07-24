import { useState, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import {
  ArrowLeft, Plus, Pencil, Trash2, BookOpen, BarChart2, Settings as SettingsIcon,
  Share2, Upload, Sparkles, Trash, GripVertical, Image as ImageIcon, Loader2, Check, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import CardThumbnail from '@/components/cards/CardThumbnail';
import CardEditor from '@/components/cards/CardEditor';
import CardPreviewModal from '@/components/cards/CardPreviewModal';
import CardFilterBar from '@/components/cards/CardFilterBar';
import BinPanel from '@/components/cards/BinPanel';
import QuickAddCardModal from '@/components/cards/QuickAddCardModal';
import CsvUploadModal from '@/components/cards/CsvUploadModal';
import AiCardSuggestionsModal from '@/components/cards/AiCardSuggestionsModal';
import CoverImagePicker from '@/components/deck/CoverImagePicker';
import ShareModal from '@/components/deck/ShareModal';

export default function DeckBuilder() {
  const { deckId } = useParams();
  const qc = useQueryClient();

  const { data: deck, isLoading: deckLoading } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => base44.entities.Deck.filter({ id: deckId }).then((r) => r[0]),
    enabled: !!deckId,
  });

  const { data: allCards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => base44.entities.Card.filter({ deck_id: deckId }, 'order'),
    enabled: !!deckId,
  });

  const { data: cardStats = [] } = useQuery({
    queryKey: ['card-stats', deckId],
    queryFn: () => base44.entities.UserCardStats.filter({ deck_id: deckId }),
    enabled: !!deckId,
  });

  const activeCards = useMemo(() => allCards.filter((c) => !c.deleted), [allCards]);
  const deletedCards = useMemo(() => allCards.filter((c) => c.deleted), [allCards]);
  const masteredIds = useMemo(() => new Set(cardStats.filter((s) => s.mastered).map((s) => s.card_id)), [cardStats]);

  const isLoading = deckLoading || cardsLoading;

  // Inline title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const startEditTitle = () => { setTitleDraft(deck?.title || ''); setEditingTitle(true); };
  const saveTitle = async () => {
    if (!titleDraft.trim()) { toast.error('Title is required'); return; }
    setSavingTitle(true);
    try {
      await base44.entities.Deck.update(deckId, { title: titleDraft.trim() });
      qc.invalidateQueries(['deck', deckId]);
      qc.invalidateQueries(['owned-decks']);
      setEditingTitle(false);
    } catch (e) { toast.error(e.message || 'Could not save title'); }
    setSavingTitle(false);
  };

  // Description editing (inline, on blur)
  const [descDraft, setDescDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const saveDesc = async () => {
    setEditingDesc(false);
    if (descDraft === (deck?.description || '')) return;
    try {
      await base44.entities.Deck.update(deckId, { description: descDraft });
      qc.invalidateQueries(['deck', deckId]);
    } catch (e) { toast.error(e.message || 'Could not save description'); }
  };

  // Filtering / sorting
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('order');
  const [masteryFilter, setMasteryFilter] = useState('all');
  const [tagFilters, setTagFilters] = useState([]);

  const allTags = useMemo(() => {
    const set = new Set();
    activeCards.forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
    return [...set].sort();
  }, [activeCards]);

  const filteredCards = useMemo(() => {
    let list = activeCards;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        (c.clue || '').toLowerCase().includes(q) ||
        (c.correct_answers || c.correct_answer || '').toLowerCase().includes(q) ||
        (c.choices || []).some((ch) => ch.toLowerCase().includes(q))
      );
    }
    if (masteryFilter === 'mastered') list = list.filter((c) => masteredIds.has(c.id));
    else if (masteryFilter === 'unmastered') list = list.filter((c) => !masteredIds.has(c.id));
    if (tagFilters.length) list = list.filter((c) => tagFilters.every((t) => (c.tags || []).includes(t)));

    const sorted = [...list];
    if (sortBy === 'order') sorted.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    else if (sortBy === 'created_date') sorted.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    else if (sortBy === 'updated_date') sorted.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
    return sorted;
  }, [activeCards, search, masteryFilter, tagFilters, sortBy, masteredIds]);

  // Modals
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [binOpen, setBinOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewCard, setPreviewCard] = useState(null);

  // Card editor dialog
  const [editingCard, setEditingCard] = useState(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [closingEditor, setClosingEditor] = useState(false);
  const editorSaveRef = useRef(null);

  const openEditor = (card) => { setEditorDirty(false); setEditingCard(card); };
  const closeEditor = () => {
    if (editorDirty) { setClosingEditor(true); return; }
    setEditingCard(null);
  };
  const confirmCloseEditor = () => { setClosingEditor(false); setEditingCard(null); };

  const handleSaveCard = async (data) => {
    try {
      await base44.entities.Card.update(editingCard.id, data);
      qc.invalidateQueries(['cards', deckId]);
      toast.success('Card saved');
      setEditingCard(null);
    } catch (e) { toast.error(e.message || 'Could not save card'); }
  };

  const handleDeleteCard = async (card) => {
    try {
      await base44.entities.Card.update(card.id, { deleted: true });
      qc.invalidateQueries(['cards', deckId]);
      toast.success('Card moved to bin');
    } catch (e) { toast.error(e.message || 'Could not delete card'); }
  };

  const handleRestore = async (card) => {
    try {
      await base44.entities.Card.update(card.id, { deleted: false });
      qc.invalidateQueries(['cards', deckId]);
      toast.success('Card restored');
    } catch (e) { toast.error(e.message || 'Could not restore'); }
  };

  const handlePermanentDelete = async (card) => {
    try {
      await base44.entities.Card.delete(card.id);
      qc.invalidateQueries(['cards', deckId]);
      toast.success('Card deleted permanently');
    } catch (e) { toast.error(e.message || 'Could not delete'); }
  };

  // Drag-and-drop reorder
  const onDragEnd = async (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const ordered = [...filteredCards];
    const [moved] = ordered.splice(result.source.index, 1);
    ordered.splice(result.destination.index, 0, moved);
    // Persist new order values
    const updates = ordered.map((c, i) => ({ id: c.id, order: i }));
    try {
      await base44.entities.Card.bulkUpdate(updates);
      qc.invalidateQueries(['cards', deckId]);
    } catch (e) { toast.error(e.message || 'Could not reorder'); }
  };

  const handleCoverSave = async (url, focalPoint, originalUrl) => {
    try {
      await base44.entities.Deck.update(deckId, {
        cover_image_url: url,
        cover_focal_point: focalPoint,
        cover_image_original_url: originalUrl || null,
      });
      qc.invalidateQueries(['deck', deckId]);
      toast.success('Cover updated');
    } catch (e) { toast.error(e.message || 'Could not save cover'); }
  };

  const handleAddAiCards = async (cards) => {
    const toCreate = cards.map((c, i) => ({
      deck_id: deckId,
      order: activeCards.length + i,
      correct_answers: c.correct_answers,
      correct_answer: c.correct_answer,
      question_type: c.question_type || 'multiple_choice',
      choices: c.choices || [],
      clue: c.clue || '',
      point_value: c.point_value ?? 20,
    }));
    await base44.entities.Card.bulkCreate(toCreate);
    qc.invalidateQueries(['cards', deckId]);
    toast.success(`${toCreate.length} card${toCreate.length !== 1 ? 's' : ''} added`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">This deck doesn't exist or isn't visible to your account.</p>
        <Link to="/"><Button variant="outline" size="sm" className="mt-4">Back home</Button></Link>
      </div>
    );
  }

  const masteredCount = activeCards.filter((c) => masteredIds.has(c.id)).length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                autoFocus
                className="h-8 text-xl font-bold"
              />
              <Button size="icon" className="h-8 w-8" onClick={saveTitle} disabled={savingTitle}>
                {savingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingTitle(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold truncate">{deck.title}</h1>
              <button onClick={startEditTitle} className="text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Edit title">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeCards.length} card{activeCards.length !== 1 ? 's' : ''}
            {masteredCount > 0 && <span className="ml-2 text-success">{masteredCount} mastered</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Link to={`/stats/${deckId}`}><Button variant="ghost" size="sm" className="gap-1.5"><BarChart2 className="w-4 h-4" /> Stats</Button></Link>
          <Link to={`/settings/${deckId}`}><Button variant="ghost" size="sm" className="gap-1.5"><SettingsIcon className="w-4 h-4" /> Settings</Button></Link>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setShareOpen(true)}><Share2 className="w-4 h-4" /> Share</Button>
          <Link to={`/study/${deckId}`}><Button size="sm" className="gap-1.5"><BookOpen className="w-4 h-4" /> Study</Button></Link>
        </div>
      </div>

      {/* Cover + description */}
      <div className="flex flex-col md:flex-row gap-5 mb-6">
        <button
          onClick={() => setCoverOpen(true)}
          className="relative md:w-64 w-full h-32 rounded-xl overflow-hidden border border-border bg-muted shrink-0 group"
        >
          {deck.cover_image_url ? (
            <img
              src={deck.cover_image_url}
              alt="cover"
              className="w-full h-full object-cover"
              style={{ objectPosition: deck.cover_focal_point ? `${deck.cover_focal_point.x}% ${deck.cover_focal_point.y}%` : 'center' }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
              <ImageIcon className="w-6 h-6" />
              <span className="text-xs">Add cover image</span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Edit
            </span>
          </div>
        </button>

        <div className="flex-1 min-w-0">
          {editingDesc ? (
            <Textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={saveDesc}
              autoFocus
              rows={3}
              placeholder="Add a description…"
              className="resize-none text-sm"
            />
          ) : (
            <button onClick={() => { setDescDraft(deck.description || ''); setEditingDesc(true); }} className="text-left w-full">
              {deck.description ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{deck.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Add a description…</p>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Button size="sm" className="gap-1.5" onClick={() => setQuickAddOpen(true)}>
          <Plus className="w-4 h-4" /> Add Card
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCsvOpen(true)}>
          <Upload className="w-4 h-4" /> Import CSV
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAiOpen(true)}>
          <Sparkles className="w-4 h-4" /> AI Suggest
        </Button>
        {deletedCards.length > 0 && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setBinOpen(true)}>
            <Trash className="w-4 h-4" /> Bin ({deletedCards.length})
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <CardFilterBar
        search={search}
        onSearch={setSearch}
        sortBy={sortBy}
        onSort={setSortBy}
        masteryFilter={masteryFilter}
        onMasteryFilter={setMasteryFilter}
        allTags={allTags}
        tagFilters={tagFilters}
        onTagFilters={setTagFilters}
      />

      {/* Card grid */}
      {filteredCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
            <Plus className="w-7 h-7 text-accent-foreground" />
          </div>
          <h2 className="font-semibold">{activeCards.length === 0 ? 'No cards yet' : 'No cards match your filters'}</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            {activeCards.length === 0 ? 'Add your first card to get this deck ready for study.' : 'Try clearing the search or filters.'}
          </p>
          {activeCards.length === 0 && (
            <Button className="mt-1 gap-1.5" onClick={() => setQuickAddOpen(true)}><Plus className="w-4 h-4" /> Add Card</Button>
          )}
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="cards" direction="horizontal" isDropDisabled={sortBy !== 'order' || search.trim() || masteryFilter !== 'all' || tagFilters.length > 0}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredCards.map((card, index) => (
                  <Draggable key={card.id} draggableId={card.id} index={index}>
                    {(p) => (
                      <div
                        ref={p.innerRef}
                        {...p.draggableProps}
                        className="group relative bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors"
                      >
                        <div {...p.dragHandleProps} className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 text-muted-foreground cursor-grab active:cursor-grabbing z-10">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className="flex justify-end gap-1 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEditor(card)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setPreviewCard(card)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Preview">
                            <BookOpen className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteCard(card)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Move to bin">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="min-h-[60px]">
                          <CardThumbnail card={card} />
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Modals */}
      <QuickAddCardModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        deckId={deckId}
        deck={deck}
        activeCards={activeCards}
        onSaved={() => qc.invalidateQueries(['cards', deckId])}
        onEditDetails={(card) => { setQuickAddOpen(false); openEditor(card); }}
      />
      <CsvUploadModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        deckId={deckId}
        existingCount={activeCards.length}
        onImported={() => qc.invalidateQueries(['cards', deckId])}
      />
      <AiCardSuggestionsModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        deck={deck}
        activeCards={activeCards}
        onAddCards={handleAddAiCards}
      />
      <BinPanel
        open={binOpen}
        onClose={() => setBinOpen(false)}
        deletedCards={deletedCards}
        onRestore={handleRestore}
        onPermanentDelete={handlePermanentDelete}
      />
      <CoverImagePicker
        open={coverOpen}
        onClose={() => setCoverOpen(false)}
        cards={activeCards}
        currentUrl={deck.cover_image_url}
        currentFocalPoint={deck.cover_focal_point}
        currentOriginalUrl={deck.cover_image_original_url}
        onSave={handleCoverSave}
        deckTitle={deck.title}
        deckDescription={deck.description}
      />
      <ShareModal deck={deck} open={shareOpen} onClose={() => setShareOpen(false)} />
      <CardPreviewModal card={previewCard} deck={deck} open={!!previewCard} onClose={() => setPreviewCard(null)} />

      {/* Card editor dialog */}
      <Dialog open={!!editingCard} onOpenChange={(v) => { if (!v) closeEditor(); }}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Card</DialogTitle>
          </DialogHeader>
          {editingCard && (
            <CardEditor
              card={editingCard}
              onSave={handleSaveCard}
              onCancel={closeEditor}
              onDirtyChange={setEditorDirty}
              allTags={allTags}
              saveRef={editorSaveRef}
            />
          )}
          <DialogFooter className="sticky bottom-0 bg-card pt-3 border-t border-border">
            <Button variant="ghost" onClick={closeEditor}>{editorDirty ? 'Cancel' : 'Close'}</Button>
            <Button onClick={() => editorSaveRef.current?.()} className="gap-1.5">
              <Check className="w-4 h-4" /> Save Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved-changes confirm */}
      <Dialog open={closingEditor} onOpenChange={(v) => { if (!v) setClosingEditor(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">You have unsaved edits that will be lost.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClosingEditor(false)}>Keep editing</Button>
            <Button variant="destructive" onClick={confirmCloseEditor}>Discard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}