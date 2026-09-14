import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, GalleryVerticalEnd, Image as ImageIcon, Cog, Upload, PieChart, FolderOpen, Check, Pencil, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import useDominantColor from '@/hooks/useDominantColor';

const HERO_EXPANDED = 380;
const HERO_COLLAPSED = 200;

/** sRGB channel → linear, for luminance math. */
const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** WCAG relative luminance from 0–1 sRGB channels. */
const relLuminance = (r, g, b) =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

/**
 * Build a scrim from an "R, G, B" dominant color.
 * Hue and saturation come from the cover; lightness is clamped dark.
 */
const buildScrim = (rgb, lightness = 15) => {
  if (!rgb) return null;
  const [r, g, b] = rgb.split(',').map(c => Number(c.trim()) / 255);

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

  const TARGET = 0.18;
  const SCRIM_L = 0.02;
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

/**
 * DeckHeroHeader — shared collapsing cover-image hero for the three deck pages.
 *
 * Props:
 *  - deck: deck record
 *  - activePage: 'deck' | 'stats' | 'settings' — which toolbar button is active
 *  - editable: bool — whether title/description are inline-editable (Deck page only)
 *  - cardCount: number of active cards (for the "N cards" line)
 *  - onUpdateDeck: (data) => void — required when editable
 *  - onAddCard, onImportCsv, onCollections: callbacks (Deck page opens modals; Stats/Settings omit → they link to /deck)
 */
export default function DeckHeroHeader({
  deck,
  activePage = 'deck',
  editable = false,
  cardCount = 0,
  onUpdateDeck,
  onAddCard,
  onImportCsv,
  onCollections,
  onDraftDescription,
  filterBar,
}) {
  const hasCover = !!deck?.cover_image_url;
  const extractedColor = useDominantColor(deck?.cover_image_url);
  const scrimSourceColor = hexToRgbString(deck?.accent_color) || extractedColor;

  // ── Scroll-driven collapse ──
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

  const FILTER_BOTTOM_GAP = 12;
  const SEARCH_ROW_CENTER = 28;

  // When a filter bar is present (Deck page), the image stops at mid-search-input.
  // On Stats/Settings there's no filter bar, so the image fills the hero.
  const hasFilterBar = activePage === 'deck' && cardCount > 0;
  const imageHeight = hasFilterBar
    ? Math.max(0, heroHeight - 92 - FILTER_BOTTOM_GAP + SEARCH_ROW_CENTER)
    : heroHeight;

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

  // ── Active-state styling for a toolbar button ──
  const activeClass = (page) => {
    if (activePage !== page) return null;
    return hasCover
      ? 'text-white !bg-white/15'
      : 'text-primary underline decoration-2 underline-offset-4';
  };

  // ── Resting + hover classes for a (non-active) toolbar button ──
  const btnClass = (page) => {
    const active = activeClass(page);
    if (active) return cn('gap-1.5 h-9', active);
    return cn(
      'gap-1.5 h-9',
      hasCover
        ? 'text-white/80 hover:!bg-white/10 hover:!text-white'
        : 'text-muted-foreground hover:text-foreground'
    );
  };

  // ── Title block ──
  const titleBlock = editable ? (
    <EditableTitleBlock deck={deck} cardCount={cardCount} onUpdateDeck={onUpdateDeck} hasCover={hasCover} onDraftDescription={onDraftDescription} />
  ) : (
    <ReadOnlyTitleBlock deck={deck} cardCount={cardCount} hasCover={hasCover} />
  );

  // ── Toolbar ──
  // On the Deck page, Add Card / Import CSV / Collections use callbacks (open modals).
  // On Stats/Settings, they link to /deck/:deckId so the user lands where the modal lives.
  const deckPath = `/deck/${deck?.id}`;
  const toolbarBlock = (
    <div className="px-3 pb-2 flex flex-wrap items-center gap-1">
      <Link to={`/stats/${deck?.id}`}>
        <Button variant="ghost" size="sm" className={btnClass('stats')}>
          <PieChart className="w-4 h-4" /> Stats
        </Button>
      </Link>
      <Link to={`/settings/${deck?.id}`}>
        <Button variant="ghost" size="sm" className={btnClass('settings')}>
          <Cog className="w-4 h-4" /> Settings
        </Button>
      </Link>

      {onAddCard && activePage === 'deck' ? (
        <Button variant="ghost" size="sm" onClick={onAddCard} className={btnClass('deck-add')}>
          <Plus className="w-4 h-4" /> Add Card
        </Button>
      ) : (
        <Link to={deckPath}>
          <Button variant="ghost" size="sm" className={btnClass('deck-add')}>
            <Plus className="w-4 h-4" /> Add Card
          </Button>
        </Link>
      )}

      {onImportCsv && activePage === 'deck' ? (
        <Button variant="ghost" size="sm" onClick={onImportCsv} className={btnClass('deck-import')}>
          <Upload className="w-4 h-4" /> Import CSV
        </Button>
      ) : (
        <Link to={deckPath}>
          <Button variant="ghost" size="sm" className={btnClass('deck-import')}>
            <Upload className="w-4 h-4" /> Import CSV
          </Button>
        </Link>
      )}

      {onCollections && activePage === 'deck' ? (
        <Button variant="ghost" size="sm" onClick={onCollections} className={btnClass('deck-collections')}>
          <FolderOpen className="w-4 h-4" /> Collections
        </Button>
      ) : (
        <Link to={deckPath}>
          <Button variant="ghost" size="sm" className={btnClass('deck-collections')}>
            <FolderOpen className="w-4 h-4" /> Collections
          </Button>
        </Link>
      )}

      <Link to={`/study/${deck?.id}`} className={cn('ml-auto flex items-center gap-1.5 text-sm font-semibold transition-colors', hasCover ? 'text-white hover:text-white/80' : 'text-primary hover:text-primary/80')}>
        <GalleryVerticalEnd className="w-4 h-4" /> Study
      </Link>
    </div>
  );

  return (
    <>
      {hasCover ? (
        <>
          {/* Sticky collapsing hero */}
          <div
            className="sticky top-14 z-30 overflow-hidden flex flex-col justify-end"
            style={{
              height: `${heroHeight}px`,
              width: '100vw',
              marginLeft: 'calc(50% - 50vw)',
              marginRight: 'calc(50% - 50vw)',
            }}
          >
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
              <div className="absolute inset-0" style={{ background: scrimGradient }} />
            </div>

            <div className="relative z-10 w-full max-w-7xl mx-auto px-4">
              <div
                style={{
                  opacity: 1 - collapseProgress,
                  pointerEvents: collapseProgress > 0.6 ? 'none' : 'auto',
                }}
              >
                {titleBlock}
              </div>

              {toolbarBlock}

              {hasFilterBar && filterBar}
            </div>
          </div>

          {/* Spacer grows as the hero shrinks */}
          <div aria-hidden style={{ height: `${spacerHeight}px` }} />
        </>
      ) : (
        /* No cover: compact sticky header */
        <div className="sticky top-14 z-30 pt-4 pb-2 -mx-4 px-4 bg-card border-b border-border/60">
          <div className="relative max-w-7xl mx-auto">
            {titleBlock}
            {toolbarBlock}
          </div>
        </div>
      )}
    </>
  );
}

// ── Read-only title block (Stats / Settings) ──
function ReadOnlyTitleBlock({ deck, cardCount, hasCover }) {
  return (
    <div className="px-4 pb-3">
      <h1 className={cn('text-xl font-bold', hasCover && 'text-white')}>
        {deck?.title || 'Loading…'}
      </h1>
      <div className="mt-0.5">
        {deck?.description ? (
          <p className={cn('text-sm line-clamp-2', hasCover ? 'text-white/80' : 'text-muted-foreground')}>
            {deck.description}
          </p>
        ) : (
          <p className={cn('text-sm italic', hasCover ? 'text-white/50' : 'text-muted-foreground/50')}>
            No description
          </p>
        )}
      </div>
      <p className={cn('text-xs mt-1', hasCover ? 'text-white/70' : 'text-muted-foreground')}>
        {cardCount} {cardCount === 1 ? 'card' : 'cards'}
      </p>
    </div>
  );
}

// ── Editable title block (Deck page) ──
function EditableTitleBlock({ deck, cardCount, onUpdateDeck, hasCover, onDraftDescription }) {
  // Local edit state lives here so the Deck page doesn't have to.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState('');
  const [draftingDesc, setDraftingDesc] = useState(false);

  const startEditTitle = () => { setTitleValue(deck?.title || ''); setEditingTitle(true); };
  const saveTitle = () => {
    const trimmed = titleValue.trim();
    if (!trimmed) return;
    onUpdateDeck?.({ title: trimmed });
    setEditingTitle(false);
  };

  const startEditDesc = () => { setDescValue(deck?.description || ''); setEditingDesc(true); };
  const saveDesc = () => { onUpdateDeck?.({ description: descValue }); setEditingDesc(false); };

  const DESC_MAX = 150;

  return (
    <div className="px-4 pb-3">
      {editingTitle ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={titleValue}
            onChange={e => setTitleValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
            placeholder="Deck title"
            className="text-xl font-bold bg-transparent border-b border-primary focus:outline-none flex-1 min-w-0"
          />
          <button onClick={saveTitle} className="flex items-center gap-1 text-xs text-primary hover:underline font-medium shrink-0">
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button onClick={() => setEditingTitle(false)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Cancel</button>
        </div>
      ) : (
        <h1 className={cn('text-xl font-bold group/title flex items-center gap-1.5 cursor-text', hasCover && 'text-white')} onClick={startEditTitle} title="Click to edit title">
          {deck?.title || 'Loading…'}
          <Pencil className={cn('w-3.5 h-3.5 opacity-0 group-hover/title:opacity-100 transition-opacity', hasCover ? 'text-white/70' : 'text-muted-foreground')} />
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
            <span className={cn('absolute bottom-2 right-2 text-xs tabular-nums', descValue.length >= DESC_MAX ? 'text-destructive font-medium' : 'text-muted-foreground')}>
              {descValue.length}/{DESC_MAX}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={saveDesc} className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
              <Check className="w-3.5 h-3.5" /> Save
            </button>
            <button onClick={() => setEditingDesc(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            {onDraftDescription && cardCount > 0 && (
              <button
                onClick={async () => {
                  setDraftingDesc(true);
                  try {
                    const draft = await onDraftDescription();
                    if (draft) setDescValue(draft.slice(0, 150));
                  } finally {
                    setDraftingDesc(false);
                  }
                }}
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
            ? <span className={cn('text-sm transition-colors line-clamp-2', hasCover ? 'text-white/80 group-hover:text-white' : 'text-muted-foreground group-hover:text-foreground')}>{deck.description}</span>
            : <span className={cn('text-sm italic transition-colors', hasCover ? 'text-white/50 group-hover:text-white/80' : 'text-muted-foreground/50 group-hover:text-muted-foreground')}>Add description…</span>
          }
          <Pencil className={cn('w-3 h-3 shrink-0 mt-0.5 transition-colors', hasCover ? 'text-white/40 group-hover:text-white/70' : 'text-muted-foreground/40 group-hover:text-muted-foreground')} />
        </button>
      )}

      <p className={cn('text-xs mt-1', hasCover ? 'text-white/70' : 'text-muted-foreground')}>
        {cardCount} {cardCount === 1 ? 'card' : 'cards'}
      </p>
    </div>
  );
}