import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, ArrowLeft, Pencil, Trash2, BookOpen, Image as ImageIcon, Settings2, X, Upload, RotateCcw, BarChart2, Archive, Volume2, VolumeX, Download, CircleDot, CheckSquare, ToggleRight, Play, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import CardEditor from '@/components/cards/CardEditor';
import CsvUploadModal from '@/components/cards/CsvUploadModal';
import CardFilterBar from '@/components/cards/CardFilterBar';
import BinPanel from '@/components/cards/BinPanel';
import CardPreviewModal from '@/components/cards/CardPreviewModal';
import { toast } from 'sonner';

export default function DeckBuilder() {
  const { deckId } = useParams();
  const qc = useQueryClient();

  const { data: deck } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => base44.entities.Deck.filter({ id: deckId }).then(r => r[0]),
    enabled: !!deckId,
  });

  const { data: allDeckCards = [], isLoading } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => base44.entities.Card.filter({ deck_id: deckId }, 'order'),
    enabled: !!deckId,
  });

  const activeCards = allDeckCards.filter(c => !c.deleted);
  const deletedCards = allDeckCards.filter(c => c.deleted === true);

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  const { data: cardStats = [] } = useQuery({
    queryKey: ['card-stats', deckId, currentUser?.id],
    queryFn: () => base44.entities.UserCardStats.filter({ deck_id: deckId, user_id: currentUser.id }),
    enabled: !!deckId && !!currentUser?.id,
  });

  const masteredCardIds = useMemo(() => new Set(cardStats.filter(s => s.mastered).map(s => s.card_id)), [cardStats]);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Sound preference
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('flashdeck_sound') !== '0');

  // UI state
  const [showEditor, setShowEditor] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showBin, setShowBin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [previewCard, setPreviewCard] = useState(null);
  const editorSaveRef = useRef(null);

  // Description editing
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState('');
  const [draftingDesc, setDraftingDesc] = useState(false);

  const startEditDesc = () => { setDescValue(deck?.description || ''); setEditingDesc(true); };
  const saveDesc = () => { updateDeckMutation.mutate({ description: descValue }); setEditingDesc(false); };
  const cancelEditDesc = () => setEditingDesc(false);

  const DESC_MAX = 150;

  const draftDescription = async () => {
    setDraftingDesc(true);
    const cardList = activeCards.map(c => c.correct_answers || c.correct_answer).filter(Boolean).slice(0, 60).join(', ');
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Write a concise description for a flashcard deck titled "${deck?.title}". The deck contains cards about: ${cardList}. Be specific and informative. No fluff. IMPORTANT: the description must be 150 characters or fewer.`,
    });
    const draft = typeof result === 'string' ? result : result?.text || '';
    setDescValue(draft.slice(0, DESC_MAX));
    setDraftingDesc(false);
  };

  // Filter / sort state
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('order');
  const [masteryFilter, setMasteryFilter] = useState('all');
  const [tagFilters, setTagFilters] = useState([]);

  const allTags = useMemo(() => {
    const set = new Set();
    activeCards.forEach(c => (c.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [activeCards]);

  const displayedCards = useMemo(() => {
    let cards = [...activeCards];

    // Mastery filter
    if (masteryFilter === 'mastered') cards = cards.filter(c => masteredCardIds.has(c.id));
    else if (masteryFilter === 'unmastered') cards = cards.filter(c => !masteredCardIds.has(c.id));

    // Tag filter (multi)
    if (tagFilters.length > 0) cards = cards.filter(c => tagFilters.some(t => (c.tags || []).includes(t)));

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      cards = cards.filter(c =>
        c.correct_answer?.toLowerCase().includes(q) ||
        (c.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    // Sort
    if (sortBy === 'created_date') cards.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    else if (sortBy === 'updated_date') cards.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));

    return cards;
  }, [activeCards, search, sortBy, masteryFilter, tagFilters, masteredCardIds]);

  const exportCsv = () => {
    const rows = [
      ['correct_answers', 'question_type', 'choice_2', 'choice_3', 'choice_4', 'choice_5', 'choice_6', 'clue', 'explanation', 'image_url', 'tags'],
      ...activeCards.map(c => {
        const correct = (c.correct_answers || c.correct_answer || '').split('|')[0].trim();
        const decoys = (c.choices || []).filter(ch => ch !== correct);
        const choiceCols = [decoys[0] || '', decoys[1] || '', decoys[2] || '', decoys[3] || '', decoys[4] || ''];
        return [
          c.correct_answers || c.correct_answer || '',
          c.question_type || 'multiple_choice',
          ...choiceCols,
          c.clue || '',
          c.explanation || '',
          c.image_url || '',
          (c.tags || []).join(';'),
        ];
      }),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck?.title || 'deck'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const invalidateCards = () => {
    qc.invalidateQueries(['cards', deckId]);
    qc.invalidateQueries(['cards-all']);
  };

  const deleteMutation = useMutation({
    mutationFn: (card) => base44.entities.Card.update(card.id, { deleted: true }),
    onSuccess: (_, card) => {
      invalidateCards();
      toast.success('Card moved to bin', {
        action: { label: 'Undo', onClick: () => restoreMutation.mutate(card) },
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (card) => base44.entities.Card.update(card.id, { deleted: false }),
    onSuccess: () => {
      invalidateCards();
      toast.success('Card restored');
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (card) => base44.entities.Card.delete(card.id),
    onSuccess: () => {
      invalidateCards();
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
    <div className={`flex-1 px-4 py-8 transition-all duration-300 ${showEditor ? 'md:mr-[640px]' : ''}`}>
    <div className="max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">{deck?.title || 'Loading…'}</h1>
          {/* Description */}
          {editingDesc ? (
            <div className="mt-1.5 flex flex-col gap-1.5">
              <div className="relative">
                <textarea
                  autoFocus
                  value={descValue}
                  onChange={e => setDescValue(e.target.value.slice(0, DESC_MAX))}
                  placeholder="Add a description…"
                  rows={2}
                  maxLength={DESC_MAX}
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-background text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring pr-14"
                />
                <span className={`absolute bottom-2 right-2 text-xs tabular-nums ${descValue.length >= DESC_MAX ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                  {descValue.length}/{DESC_MAX}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={saveDesc} className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                  <Check className="w-3.5 h-3.5" /> Save
                </button>
                <button onClick={cancelEditDesc} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                {activeCards.length > 0 && (
                  <button
                    onClick={draftDescription}
                    disabled={draftingDesc}
                    className="ml-auto flex items-center gap-1 text-xs text-accent-foreground bg-accent hover:bg-accent/80 px-2 py-0.5 rounded-md disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3" />
                    {draftingDesc ? 'Drafting…' : 'AI draft'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button onClick={startEditDesc} className="group flex items-start gap-1 text-left mt-0.5">
              {deck?.description
                ? <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors line-clamp-2">{deck.description}</span>
                : <span className="text-sm text-muted-foreground/50 italic group-hover:text-muted-foreground transition-colors">Add description…</span>
              }
              <Pencil className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 mt-0.5 transition-colors" />
            </button>
          )}
          <p className="text-muted-foreground text-xs mt-1">{activeCards.length} {activeCards.length === 1 ? 'card' : 'cards'}</p>
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
          <Button variant="outline" size="sm" onClick={() => setShowSettings(v => !v)} className={`gap-1.5 ${showSettings ? 'bg-accent' : ''}`}>
            <Settings2 className="w-4 h-4" /> Settings
          </Button>

          <Button variant="outline" size="sm" onClick={() => setShowCsvUpload(true)} className="gap-1.5"><Upload className="w-4 h-4" /> Import CSV</Button>
          {activeCards.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5"><Download className="w-4 h-4" /> Export CSV</Button>
          )}
          <Button onClick={openAdd} size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Add Card</Button>
        </div>
      </div>

      {/* Deck settings */}
      {deck && showSettings && (
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
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Min sessions for mastery</Label>
            <Select
              value={String(deck.mastery_min_sessions ?? 3)}
              onValueChange={(val) => updateDeckMutation.mutate({ mastery_min_sessions: Number(val) })}
            >
              <SelectTrigger className="h-7 text-xs w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 5, 7, 10].map(n => (
                  <SelectItem key={n} value={String(n)}>{n} session{n !== 1 ? 's' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Mastery % required</Label>
            <Select
              value={String(deck.mastery_pct ?? 90)}
              onValueChange={(val) => updateDeckMutation.mutate({ mastery_pct: Number(val) })}
            >
              <SelectTrigger className="h-7 text-xs w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[70, 75, 80, 85, 90, 95, 100].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Answer sounds</Label>
            <button
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                localStorage.setItem('flashdeck_sound', next ? '1' : '0');
              }}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors ${soundEnabled ? 'border-primary text-primary bg-accent' : 'border-border text-muted-foreground'}`}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {soundEnabled ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      {activeCards.length > 0 && (
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
      )}

      {/* Cards grid */}
      {isLoading ? (
        <div className={`grid gap-4 ${showEditor ? 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
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
      ) : displayedCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center text-muted-foreground">
          <p className="text-sm font-medium">No cards match your filters</p>
          <button onClick={() => { setSearch(''); setSortBy('order'); setMasteryFilter('all'); setTagFilters([]); }} className="text-xs text-primary hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className={`grid gap-4 ${showEditor ? 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
          {displayedCards.map((card, idx) => (
            <div key={card.id} onClick={() => openEdit(card)} className="group relative bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-all cursor-pointer">
              <div className="bg-muted h-28 flex items-center justify-center">
                {card.image_url
                  ? <img src={card.image_url} alt="" className="w-full h-full object-cover" />
                  : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium text-foreground truncate">{card.correct_answers || card.correct_answer}</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground">
                  {card.question_type === 'select_all'
                    ? <CheckSquare className="w-3 h-3 shrink-0" />
                    : card.question_type === 'true_false'
                    ? <ToggleRight className="w-3 h-3 shrink-0" />
                    : <CircleDot className="w-3 h-3 shrink-0" />}
                  <p className="text-xs">{card.choices?.length ?? 0} choices</p>
                </div>
                {card.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {card.tags.map(tag => (
                      <span key={tag} className="text-xs bg-accent text-accent-foreground px-1.5 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              {masteredCardIds.has(card.id) && (
                <span className="absolute top-2 right-2 text-xs bg-success/15 text-success px-1.5 py-0.5 rounded font-medium opacity-0 group-hover:opacity-0">Mastered</span>
              )}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(card); }} className="bg-white/90 hover:bg-white rounded-lg p-1.5 shadow-sm">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
              <span className="absolute top-2 left-2 bg-black/50 text-white text-xs rounded px-1.5 py-0.5">{idx + 1}</span>
            </div>
          ))}

          {/* Bin card */}
          <button
            onClick={() => setShowBin(true)}
            className="group relative bg-card border-2 border-dashed border-border rounded-xl overflow-hidden hover:border-destructive/50 hover:bg-destructive/5 transition-all flex flex-col items-center justify-center gap-2 min-h-[10rem] text-muted-foreground hover:text-destructive"
          >
            <Archive className="w-6 h-6" />
            <span className="text-xs font-medium">Bin</span>
            {deletedCards.length > 0 && (
              <span className="absolute top-2 right-2 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                {deletedCards.length}
              </span>
            )}
          </button>
        </div>
      )}

    </div>
    </div>

    {/* Side panel on large screens, modal on small */}
    {showEditor && (
      <>
        {/* Mobile: modal overlay — only rendered on small screens */}
        {isMobile && (
          <Dialog open={showEditor} onOpenChange={(open) => { if (!open) requestCloseEditor(); }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCard ? 'Edit Card' : 'Add Card'}</DialogTitle>
              </DialogHeader>
              <CardEditor
                key={editingCard?.id ?? 'new'}
                card={editingCard}
                onSave={(data) => saveMutation.mutate(data)}
                onCancel={requestCloseEditor}
                onDirtyChange={setEditorDirty}
                allTags={allTags}
                saveRef={editorSaveRef}
              />
            </DialogContent>
          </Dialog>
        )}

        {/* Desktop: fixed side panel */}
        {!isMobile && (
          <div className="flex fixed top-14 right-0 bottom-0 w-[640px] bg-card border-l border-border flex-col z-30 shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h2 className="font-semibold text-base">Card Details</h2>
              <button onClick={requestCloseEditor} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4">
              <CardEditor
                key={editingCard?.id ?? 'new'}
                card={editingCard}
                onSave={(data) => saveMutation.mutate(data)}
                onCancel={requestCloseEditor}
                onDirtyChange={setEditorDirty}
                allTags={allTags}
                saveRef={editorSaveRef}
              />
            </div>
          </div>
        )}
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
          <AlertDialogAction onClick={() => { setShowDiscardDialog(false); editorSaveRef.current?.(); }}>
            Save Card
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <BinPanel
      open={showBin}
      onClose={() => setShowBin(false)}
      deletedCards={deletedCards}
      onRestore={(card) => restoreMutation.mutate(card)}
      onPermanentDelete={(card) => permanentDeleteMutation.mutate(card)}
    />

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