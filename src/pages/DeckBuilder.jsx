import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, ArrowLeft, Pencil, Trash2, GalleryVerticalEnd, Image as ImageIcon, Cog, X, Upload, RotateCcw, PieChart, Archive, CircleDot, CheckSquare, ToggleRight, Play, Sparkles, Check, FolderOpen, ChevronDown, Loader2, PencilLine } from 'lucide-react';
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
import useDominantColor from '@/hooks/useDominantColor';

const HERO_EXPANDED = 380;   // px — full height at scroll top
const HERO_COLLAPSED = 200;  // px — height once collapsed (toolbar + filter bar)

/** sRGB channel → linear, for luminance math. */
const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** WCAG relative luminance from 0–1 sRGB channels. */
const relLuminance = (r, g, b) =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

/**
 * Build a scrim from an "R, G, B" dominant color.
 * Hue and saturation come from the cover; lightness is clamped dark.
 * Alpha is derived from the cover's luminance so the composite lands
 * dark enough for white text regardless of how light the cover is.
 * Returns { h, s, l, aTop, aMid, aBottom } or null.
 */
const buildScrim = (rgb, lightness = 15) => {
  if (!rgb) return null;
  const [r, g, b] = rgb.split(',').map(c => Number(c.trim()) / 255);

  // ── Hue + saturation ──
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  // ── Alpha needed to bring the composite to a readable luminance ──
  // Solving  TARGET = L(1 - a) + SCRIM_L(a)  for a.
  const TARGET = 0.18;    // composite luminance ≈ 4.5:1 against white
  const SCRIM_L = 0.02;   // the scrim's own luminance at l≈13%
  const L = relLuminance(r, g, b);
  const raw = L <= TARGET ? 0 : (L - TARGET) / Math.max(L - SCRIM_L, 0.01);
  const aBottom = Math.min(0.88, Math.max(0.42, raw));

  return {
    h: Math.round(h),
    s: Math.min(100, Math.round(s * 140)),
    l: lightness,
    aTop: Number((aBottom * 0.28).toFixed(3)),
    aMid: Number((aBottom * 0.72).toFixed(3)),
    aBottom: Number(aBottom.toFixed(3)),
  };
};

/** "#4A7C2F" → "74, 124, 47". Returns null on anything malformed. */
const hexToRgbString = (hex) => {
  if (typeof hex !== 'string') return null;
  const m = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ].join(', ');
};

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

  // Description editing
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState('');
  const [draftingDesc, setDraftingDesc] = useState(false);

  const startEditDesc = () => { setDescValue(deck?.description || ''); setEditingDesc(true); };
  const saveDesc = () => { updateDeckMutation.mutate({ description: descValue }); setEditingDesc(false); };
  const cancelEditDesc = () => setEditingDesc(false);

  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const startEditTitle = () => { setTitleValue(deck?.title || ''); setEditingTitle(true); };
  const saveTitle = () => {
    const trimmed = titleValue.trim();
    if (!trimmed) return;
    updateDeckMutation.mutate({ title: trimmed });
    setEditingTitle(false);
  };
  const cancelEditTitle = () => setEditingTitle(false);

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

  const filterCardRef = useRef(null);
  const [filterCardH, setFilterCardH] = useState(92);

  useLayoutEffect(() => {
    const el = filterCardRef.current;
    if (!el) return;
    const measure = () => setFilterCardH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeCards.length, allTags.length]);

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

  const hasCover = !!deck?.cover_image_url;
  const extractedColor = useDominantColor(deck?.cover_image_url);
  const scrimSourceColor = hexToRgbString(deck?.accent_color) || extractedColor;

  // Scroll-driven collapse: 0 = fully expanded, 1 = fully collapsed
  const [collapseProgress, setCollapseProgress] = useState(0);

  useEffect(() => {
    if (!hasCover) return;
    let raf = null;
    const range = HERO_EXPANDED - HERO_COLLAPSED;
    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        const p = Math.min(1, Math.max(0, window.scrollY / range));
        setCollapseProgress(p);
        raf = null;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [hasCover]);

  const heroHeight = HERO_EXPANDED - (HERO_EXPANDED - HERO_COLLAPSED) * collapseProgress;
  const spacerHeight = HERO_EXPANDED - heroHeight;

  const fp = deck?.cover_focal_point;
  const coverObjectPosition = fp ? `${fp.x}% ${fp.y}%` : '50% 50%';

  const FILTER_BOTTOM_GAP  = 12; // the filter card's mb-3
  const SEARCH_ROW_CENTER  = 28; // card p-3 (12) + half the h-8 search input (16)

  // The image stops at the middle of the search input row, so the filter card
  // straddles the hero's bottom edge. With no filter bar, the image fills the hero.
  const imageHeight = activeCards.length > 0
    ? Math.max(0, heroHeight - filterCardH - FILTER_BOTTOM_GAP + SEARCH_ROW_CENTER)
    : heroHeight;

  // Fade geometry, measured in px up from the bottom of the hero.
  // Both ends tighten as the header collapses so the fade stays clear of the toolbar.
  const scrim = buildScrim(scrimSourceColor);
  const scrimGradient = scrim
    ? `linear-gradient(to bottom,
        hsla(${scrim.h}, ${scrim.s}%, ${scrim.l}%, ${scrim.aTop}) 0%,
        hsla(${scrim.h}, ${scrim.s}%, ${scrim.l}%, ${scrim.aMid}) 40%,
        hsla(${scrim.h}, ${scrim.s}%, ${scrim.l}%, ${scrim.aBottom}) 72%,
        hsla(${scrim.h}, ${scrim.s}%, ${scrim.l}%, ${scrim.aBottom}) 100%)`
    : `linear-gradient(to bottom,
        rgba(0,0,0,0.20) 0%,
        rgba(0,0,0,0.52) 40%,
        rgba(0,0,0,0.72) 72%,
        rgba(0,0,0,0.72) 100%)`;

  // ── Title block: title, description, card count ──
  const titleBlock = (
    <div className="px-4 pb-3">
      {editingTitle ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={titleValue}
            onChange={e => setTitleValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') cancelEditTitle(); }}
            placeholder="Deck title"
            className="text-xl font-bold bg-transparent border-b border-primary focus:outline-none flex-1 min-w-0"
          />
          <button onClick={saveTitle} className="flex items-center gap-1 text-xs text-primary hover:underline font-medium shrink-0">
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button onClick={cancelEditTitle} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Cancel</button>
        </div>
      ) : (
        <h1 className={cn("text-xl font-bold group/title flex items-center gap-1.5 cursor-text", hasCover && "text-white")} onClick={startEditTitle} title="Click to edit title">
          {deck?.title || 'Loading…'}
          <Pencil className={cn("w-3.5 h-3.5 opacity-0 group-hover/title:opacity-100 transition-opacity", hasCover ? "text-white/70" : "text-muted-foreground")} />
        </h1>
      )}
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
            ? <span className={cn("text-sm transition-colors line-clamp-2", hasCover ? "text-white/80 group-hover:text-white" : "text-muted-foreground group-hover:text-foreground")}>{deck.description}</span>
            : <span className={cn("text-sm italic transition-colors", hasCover ? "text-white/50 group-hover:text-white/80" : "text-muted-foreground/50 group-hover:text-muted-foreground")}>Add description…</span>
          }
          <Pencil className={cn("w-3 h-3 shrink-0 mt-0.5 transition-colors", hasCover ? "text-white/40 group-hover:text-white/70" : "text-muted-foreground/40 group-hover:text-muted-foreground")} />
        </button>
      )}
      <p className={cn("text-xs mt-1", hasCover ? "text-white/70" : "text-muted-foreground")}>{activeCards.length} {activeCards.length === 1 ? 'card' : 'cards'}</p>
    </div>
  );

  // ── Toolbar block: action buttons ──
  const toolbarBlock = (
    <div className="px-3 pb-2 flex flex-wrap items-center gap-1">
      <Link to={`/stats/${deckId}`}>
        <Button variant="ghost" size="sm" className={cn("gap-1.5 h-9", hasCover ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground")}>
          <PieChart className="w-4 h-4" /> Stats
        </Button>
      </Link>
      <Link to={`/settings/${deckId}`}>
        <Button variant="ghost" size="sm" className={cn("gap-1.5 h-9", hasCover ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground")}>
          <Cog className="w-4 h-4" /> Settings
        </Button>
      </Link>

      <Button variant="ghost" size="sm" onClick={openAdd} className={cn("gap-1.5 h-9", hasCover && "text-white hover:text-white")}>
        <Plus className="w-4 h-4" /> Add Card
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setShowCsvUpload(true)} className={cn("gap-1.5 h-9", hasCover ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground")}>
        <Upload className="w-4 h-4" /> Import CSV
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setShowCollections(true)} className={cn("gap-1.5 h-9", hasCover ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground")}>
        <FolderOpen className="w-4 h-4" /> Collections
      </Button>
      <Link to={`/study/${deckId}`} className={cn("ml-auto flex items-center gap-1.5 text-sm font-semibold transition-colors", hasCover ? "text-white hover:text-white/80" : "text-primary hover:text-primary/80")}>
        <GalleryVerticalEnd className="w-4 h-4" /> Study
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] -mx-4 -mt-6">
    {/* Main content */}
    <div className="flex-1 px-4 pb-4">

      {hasCover ? (
        <>
          {/* ═══ Sticky collapsing hero ═══ */}
          <div
            className="sticky top-14 z-30 overflow-hidden flex flex-col justify-end"
            style={{
              height: `${heroHeight}px`,
              width: '100vw',
              marginLeft: 'calc(50% - 50vw)',
              marginRight: 'calc(50% - 50vw)',
            }}
          >
            {/* ── Image layer: top-anchored, stops at mid-search-input ── */}
            <div
              className="absolute top-0 left-0 right-0 overflow-hidden"
              style={{ height: `${imageHeight}px` }}
            >
              <img
                src={deck.cover_image_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ objectPosition: coverObjectPosition }}
              />

              {/* Chromatic scrim — hue from the cover, lightness clamped for contrast */}
              <div className="absolute inset-0" style={{ background: scrimGradient }} />
            </div>

            {/* ── Content, pinned to the bottom of the shrinking container ── */}
            <div className="relative z-10 w-full max-w-7xl mx-auto px-4">
              {/* Title fades out and clips away as the header collapses */}
              <div
                style={{
                  opacity: 1 - collapseProgress,
                  pointerEvents: collapseProgress > 0.6 ? 'none' : 'auto',
                }}
              >
                {titleBlock}
              </div>

              {toolbarBlock}

              {activeCards.length > 0 && (
                <div
                  ref={filterCardRef}
                  className="rounded-lg border p-3 mx-4 mb-3 bg-card border-border shadow-md"
                >
                  <CardFilterBar
                    search={search} onSearch={setSearch}
                    sortBy={sortBy} onSort={setSortBy}
                    masteryFilter={masteryFilter} onMasteryFilter={setMasteryFilter}
                    allTags={allTags} tagFilters={tagFilters} onTagFilters={setTagFilters}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ═══ Spacer: grows as the hero shrinks, so cards never jump ═══ */}
          <div aria-hidden style={{ height: `${spacerHeight}px` }} />
        </>
      ) : (
        /* ═══ No cover image: compact sticky header, no hero ═══ */
        <div className="sticky top-14 z-30 pt-4 pb-2 -mx-4 px-4 bg-card border-b border-border/60">
          <div className="relative max-w-7xl mx-auto">
            {titleBlock}
            {toolbarBlock}
            {activeCards.length > 0 && (
              <div className="rounded-lg border p-3 mt-1 mx-4 bg-card border-border">
                <CardFilterBar
                  search={search} onSearch={setSearch}
                  sortBy={sortBy} onSort={setSortBy}
                  masteryFilter={masteryFilter} onMasteryFilter={setMasteryFilter}
                  allTags={allTags} tagFilters={tagFilters} onTagFilters={setTagFilters}
                />
              </div>
            )}
          </div>
        </div>
      )}

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