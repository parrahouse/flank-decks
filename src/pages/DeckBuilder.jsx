import { useState, useMemo, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, ArrowLeft, Trash2, Image as ImageIcon, X, Upload, RotateCcw, Archive, CircleDot, CheckSquare, ToggleRight, Play, ChevronDown, Loader2, PencilLine } from 'lucide-react';
import AiCardSuggestionsModal from '@/components/cards/AiCardSuggestionsModal';
import CardEditorModal from '@/components/cards/CardEditorModal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import CsvUploadModal from '@/components/cards/CsvUploadModal';
import DeckCollectionsDialog from '@/components/collections/DeckCollectionsDialog';
import CardFilterBar from '@/components/cards/CardFilterBar';
import BinPanel from '@/components/cards/BinPanel';
import CardPreviewModal from '@/components/cards/CardPreviewModal';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import DeckHeroHeader from '@/components/deck/DeckHeroHeader';

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

  // UI state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState('create');
  const [editingCard, setEditingCard] = useState(null);
  const [editorKey, setEditorKey] = useState(0); // bump to remount the modal fresh (add-another)
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [showBin, setShowBin] = useState(false);
  const [showAiSuggest, setShowAiSuggest] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [previewCard, setPreviewCard] = useState(null);

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

  const openAdd = () => {
    setEditingCard(null);
    setEditorMode('create');
    setEditorKey(k => k + 1);
    setEditorOpen(true);
  };
  const openEdit = (card) => {
    setEditingCard(card);
    setEditorMode('edit');
    setEditorKey(k => k + 1);
    setEditorOpen(true);
  };

  // Index of the card currently being edited within the deck's card order.
  const editingCardIndex = editingCard ? activeCards.findIndex(c => c.id === editingCard.id) : -1;
  const hasNextCard = editingCardIndex >= 0 && editingCardIndex < activeCards.length - 1;

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
    <div className="flex min-h-[calc(100vh-3.5rem)] -mx-4 -mt-6">
    {/* Main content */}
    <div className="flex-1 px-4 pb-4">

      <DeckHeroHeader
        deck={deck}
        activePage="deck"
        editable={true}
        cardCount={activeCards.length}
        onUpdateDeck={(data) => updateDeckMutation.mutate(data)}
        onAddCard={openAdd}
        onImportCsv={() => setShowCsvUpload(true)}
        onCollections={() => setShowCollections(true)}
        onDraftDescription={async () => {
          const cardList = activeCards.map(c => c.correct_answers || c.correct_answer).filter(Boolean).slice(0, 60).join(', ');
          const result = await base44.integrations.Core.InvokeLLM({
            prompt: `Write a concise description for a flashcard deck titled "${deck?.title}". The deck contains cards about: ${cardList}. Be specific and informative. No fluff. IMPORTANT: the description must be 150 characters or fewer.`,
          });
          return typeof result === 'string' ? result : result?.text || '';
        }}
        filterBar={
          activeCards.length > 0 ? (
            <div className="rounded-lg border p-3 mx-4 mb-3 bg-card border-border shadow-md">
              <CardFilterBar
                search={search} onSearch={setSearch}
                sortBy={sortBy} onSort={setSortBy}
                masteryFilter={masteryFilter} onMasteryFilter={setMasteryFilter}
                allTags={allTags} tagFilters={tagFilters} onTagFilters={setTagFilters}
              />
            </div>
          ) : null
        }
      />

      {/* Cards grid */}
      <div className="max-w-7xl mx-auto pt-6">
      {isLoading ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
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
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
          {displayedCards.map((card, idx) => (
            <div key={card.id} onClick={() => openEdit(card)} className="group relative bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-all cursor-pointer">
              <div className="bg-muted aspect-[4/3] flex items-center justify-center overflow-hidden relative">
                {card.image_url
                  ? <>
                    <img src={card.image_url} alt="" className="w-full h-full object-cover brightness-50 group-hover:brightness-100 transition-all duration-200" />
                    <div className="absolute inset-0 flex items-center justify-center p-3 group-hover:opacity-0 transition-opacity duration-200">
                      <p className="text-sm font-medium text-white text-center line-clamp-3 leading-snug">{card.clue}</p>
                    </div>
                  </>
                  : card.clue
                    ? <p className="px-3 text-sm font-medium text-foreground line-clamp-4 leading-snug">{card.clue}</p>
                    : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium text-foreground truncate">{card.correct_answers || card.correct_answer}</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground">
                  {card.question_type === 'select_all'
                    ? <CheckSquare className="w-3 h-3 shrink-0" />
                    : card.question_type === 'true_false'
                    ? <ToggleRight className="w-3 h-3 shrink-0" />
                    : card.question_type === 'short_answer'
                    ? <PencilLine className="w-3 h-3 shrink-0" />
                    : <CircleDot className="w-3 h-3 shrink-0" />}
                  <p className="text-xs">
                    {card.question_type === 'true_false' ? 'True/False'
                      : card.question_type === 'short_answer' ? 'Short Answer'
                      : card.question_type === 'select_all' ? 'Select All'
                      : `${card.choices?.length ?? 0} choices`}
                  </p>
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
                <span className="absolute top-2 right-2 text-xs bg-success/15 text-success px-1.5 py-0.5 rounded font-medium opacity-100 group-hover:opacity-0 transition-opacity">Mastered</span>
              )}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(card); }} className="bg-white/90 hover:bg-white rounded-lg p-1.5 shadow-sm">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
              <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs rounded px-1.5 py-0.5">{idx + 1}</span>
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

    <CardEditorModal
      key={editorKey}
      open={editorOpen}
      onClose={() => setEditorOpen(false)}
      mode={editorMode}
      card={editingCard}
      deckId={deckId}
      deck={deck}
      activeCards={activeCards}
      allTags={allTags}
      onSaved={() => {
        invalidateCards();
        toast.success(editorMode === 'edit' ? 'Card updated' : 'Card added');
      }}
      onEditDetails={(card) => {
        setEditingCard(card);
        setEditorMode('edit');
        setEditorKey(k => k + 1);
        setEditorOpen(true);
      }}
      onAddAnother={() => {
        setEditingCard(null);
        setEditorMode('create');
        setEditorKey(k => k + 1);
        setEditorOpen(true);
      }}
      hasNextCard={hasNextCard}
      onSaveAndNext={() => {
        const next = hasNextCard ? activeCards[editingCardIndex + 1] : null;
        if (next) {
          setEditingCard(next);
          setEditorMode('edit');
          setEditorKey(k => k + 1);
          setEditorOpen(true);
        } else {
          setEditorOpen(false);
          toast.info('Last card in deck');
        }
      }}
    />

    <DeckCollectionsDialog
      open={showCollections}
      onClose={() => setShowCollections(false)}
      deckId={deckId}
      deckTitle={deck?.title}
    />

    <AiCardSuggestionsModal
      open={showAiSuggest}
      onClose={() => setShowAiSuggest(false)}
      deck={deck}
      activeCards={activeCards}
      onAddCards={async (cards) => {
        await base44.entities.Card.bulkCreate(
          cards.map((c, i) => ({ ...c, deck_id: deckId, order: activeCards.length + i }))
        );
        qc.invalidateQueries(['cards', deckId]);
        qc.invalidateQueries(['cards-all']);
        toast.success(`${cards.length} card${cards.length !== 1 ? 's' : ''} added`);
      }}
    />
    </div>
  );
}