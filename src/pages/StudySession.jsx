import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, RotateCcw, ChevronLeft, ChevronRight, BarChart2, Volume2, VolumeX, Info, Trophy, PlayCircle, RefreshCw, Clock, AlertTriangle, Settings, SlidersVertical, LogOut, Search, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import LayoutGlyph from '@/components/cards/LayoutIcons';
import { cardLabel } from '@/lib/utils';
import StudyCard from '@/components/cards/StudyCard';
import StudyCardHorizontal from '@/components/cards/StudyCardHorizontal';
import { CARD_MIN_W, STUDY_MIN_VH } from '@/lib/studyLayout';
import ContactSheet from '@/components/cards/ContactSheet';
import ProgressGameBand from '@/components/cards/ProgressGameBand';
import SwabbieSpeechBubble from '@/components/cards/SwabbieSpeechBubble';
import SessionSummaryBubble from '@/components/cards/SessionSummaryBubble';
import LeaveSessionDialog from '@/components/cards/LeaveSessionDialog';
import DeckInfoTooltip from '@/components/cards/DeckInfoTooltip';
import HeartsHud from '@/components/cards/HeartsHud';
import { getSkin, DEFAULT_SKIN_ID, canZombify } from '@/components/cards/skins';
import StreakCounter from '@/components/cards/StreakCounter';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useSavedSession } from '@/hooks/useSavedSession';
import useDominantColor from '@/hooks/useDominantColor';
import { useSound } from '@/hooks/useSound';

const INTRO_REVEAL_MS = 700;
const INTRO_STAGGER_MS = 0.18; // seconds, for framer-motion staggerChildren
const AVATAR_ENTRY_DELAY_MS = 300; // wait for band container to appear before walking in

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SCORE_LABELS = {
  correct: { label: 'Correct', color: 'text-success' },
  second_guess: { label: '2nd try', color: 'text-orange-500' },
  correct_after_clue: { label: 'Correct (with clue)', color: 'text-amber-500' },
  second_guess_after_clue: { label: '2nd try + clue', color: 'text-orange-400' },
  partial: { label: 'Partial', color: 'text-amber-500' },
  wrong: { label: 'Incorrect', color: 'text-destructive' }
};

const CORRECT_KEYS = new Set(['correct', 'second_guess', 'correct_after_clue', 'second_guess_after_clue', 'partial']);

// Tuned to the 384px settings column — roughly three lines of pills at typical tag lengths.
const MAX_VISIBLE_TAGS = 12;

// ── Cover wash ───────────────────────────────────────────────────────────────
// Hue and saturation come from the cover; lightness is pinned at --wash-l, then raised
// until the header text clears 4.5:1 against it. Equal HSL lightness is not equal
// luminance, so a navy cover needs a lighter wash than a yellow one to stay readable.
const WASH_FALLBACK = { h: 44, s: 92 };
const WASH_MIN_LUM = 0.34; // ≈4.6:1 against hsl(208 42% 18%), the light-mode foreground
const WASH_MAX_L = 88;

const srgbToLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

const hslToLuminance = (h, s, l) => {
  s /= 100;l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return 0.2126 * srgbToLinear(f(0)) + 0.7152 * srgbToLinear(f(8)) + 0.0722 * srgbToLinear(f(4));
};

/** "R, G, B" (or null) → { h, s, l }. Falls back to the fixed yellow. */
const resolveWash = (rgb, baseL) => {
  let h = WASH_FALLBACK.h;
  let s = WASH_FALLBACK.s;

  if (rgb) {
    const [r, g, b] = rgb.split(',').map((c) => Number(c.trim()) / 255);
    if ([r, g, b].every((v) => Number.isFinite(v))) {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const d = max - min;
      if (d !== 0) {
        let hh = max === r ? (g - b) / d % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        hh = (hh * 60 + 360) % 360;
        h = Math.round(hh);
        s = Math.min(100, Math.round(d / (1 - Math.abs(2 * l - 1)) * 130));
      }
    }
  }

  // Raise lightness until the wash is bright enough to carry the dark header text.
  let l = baseL;
  while (l < WASH_MAX_L && hslToLuminance(h, s, l) < WASH_MIN_LUM) l += 2;
  return { h, s, l: Math.min(l, WASH_MAX_L) };
};

const LAYOUT_CHOICES = [
{ value: 'landscape-l', label: 'Landscape-L' },
{ value: 'portrait', label: 'Portrait' },
{ value: 'landscape-r', label: 'Landscape-R' }];

const QUESTION_TYPE_ORDER = ['multiple_choice', 'select_all', 'true_false', 'short_answer'];
const QUESTION_TYPE_LABELS = {
  multiple_choice: 'Multiple Choice',
  select_all: 'Select All',
  true_false: 'True/False',
  short_answer: 'Short Answer'
};

function MasteryTooltip({ minSessions, masteryPct }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {e.stopPropagation();setOpen((v) => !v);}}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="p-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        
        <Info className="w-3.5 h-3.5 text-muted-foreground/60" />
      </button>
      {open &&
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 rounded-lg bg-foreground text-background text-xs px-2.5 py-1.5 z-10 text-center shadow-lg pointer-events-none">
          Requires {minSessions}+ sessions at ≥{masteryPct}% correct
        </span>
      }
    </span>);

}

// Terminal states for the session loader.
// A zero-card result is a real outcome, not a pending one — it gets a message, never a spinner.
function SessionNotice({ title, body, deckId, onRetry }) {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-muted-foreground/60" />
      <h1 className="font-semibold mb-2">{title}</h1>
      <p className="text-sm text-muted-foreground mb-6">{body}</p>
      <div className="flex items-center justify-center gap-2">
        {onRetry &&
        <Button size="sm" className="gap-1.5" onClick={onRetry}>
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </Button>
        }
        {deckId &&
        <Link to={`/deck/${deckId}`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to deck
            </Button>
          </Link>
        }
      </div>
    </div>);

}

const SettingRow = ({ label, hint, htmlFor, children }) =>
<div className="flex items-start justify-between gap-4 py-2.5">
    <div className="min-w-0">
      <Label htmlFor={htmlFor} className="text-sm font-medium leading-none cursor-pointer">{label}</Label>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
    <div className="shrink-0 pt-0.5">{children}</div>
  </div>;


// Multi-select pill row. Empty selection means the group is inactive.
const FilterPillGroup = ({ title, options, selected, onChange, maxVisible, onMore }) => {
  if (!options.length) return null;
  const toggle = (v) =>
  onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  // Top-N by frequency, then any selected tag that fell outside it, appended so the
  // frequency order of the head never shifts under the pointer.
  const head = maxVisible ? options.slice(0, maxVisible) : options;
  const headSet = new Set(head.map((o) => o.value));
  const visible = maxVisible ?
  [...head, ...options.filter((o) => selected.includes(o.value) && !headSet.has(o.value))] :
  options;
  const hiddenCount = options.length - visible.length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {selected.length > 0 &&
        <button
          onClick={() => onChange([])}
          className="text-xs text-muted-foreground hover:text-foreground underline">
          
            Clear
          </button>
        }
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((o) =>
        <button
          key={o.value}
          onClick={() => toggle(o.value)}
          className={cn(
            'text-xs px-2.5 py-1 rounded-full border transition-colors',
            selected.includes(o.value) ?
            'bg-primary text-primary-foreground border-primary' :
            'bg-transparent text-muted-foreground border-border hover:border-primary hover:text-foreground'
          )}>
          
            {o.label}
          </button>
        )}
        {hiddenCount > 0 &&
        <button
          onClick={onMore}
          title={`${hiddenCount} more tag${hiddenCount !== 1 ? 's' : ''}`}
          aria-label={`Show ${hiddenCount} more tags`}
          className="text-xs px-2.5 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground transition-colors leading-none tracking-widest">
          
            ···
          </button>
        }
      </div>
    </div>);

};

// Searchable full-tag picker. Selections apply immediately — this is a second view of the
// same array the pills render, not a staged edit.
const TagPickerDialog = ({ open, onOpenChange, options, selected, onChange }) => {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const shown = query ? options.filter((o) => o.value.toLowerCase().includes(query)) : options;
  const toggle = (v) =>
  onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <Dialog open={open} onOpenChange={(v) => {if (!v) setQ('');onOpenChange(v);}}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Filter by tags</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tags…"
            className="pl-8 h-8 text-sm" />
          
        </div>
        <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
          {shown.length === 0 ?
          <p className="py-6 text-center text-xs text-muted-foreground">No tags match that search.</p> :
          shown.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                className={cn(
                  'w-full flex items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-sm transition-colors',
                  on ? 'bg-accent/60' : 'hover:bg-muted'
                )}>
                
                  <span className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                )}>
                    {on && <Check className="w-3 h-3" />}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{o.count}</span>
                </button>);

          })
          }
        </div>
        <DialogFooter className="sm:justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => onChange([])}
            disabled={selected.length === 0}>
            
            Clear all
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);

};

export default function StudySession() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('flashdeck_sound') !== '0');
  const [autoAdvance, setAutoAdvance] = useState(() => localStorage.getItem('flashdeck_autoadvance') === '1');
  const [hintsAllowed, setHintsAllowed] = useState(() => localStorage.getItem('flashdeck_hints') !== '0');
  const [eliminateAllowed, setEliminateAllowed] = useState(() => localStorage.getItem('flashdeck_eliminate') !== '0');
  const [secondGuessAllowed, setSecondGuessAllowed] = useState(() => localStorage.getItem('flashdeck_secondguess') !== '0');
  const [learningModeOverride, setLearningModeOverride] = useState(null); // null = auto, true/false = manual
  const [cardIndex, setCardIndex] = useState(0);
  const [shuffledCards, setShuffledCards] = useState([]);

  // Session-level choice-slot count, so bar height is identical on every card.
  const maxChoices = useMemo(
    () => Math.max(2, ...shuffledCards.map((c) => (c.choices || []).length)),
    [shuffledCards]
  );
  const [done, setDone] = useState(false);
  const [scores, setScores] = useState([]);
  const [firstWrongChoices, setFirstWrongChoices] = useState([]);
  const [answerTimes, setAnswerTimes] = useState([]); // ms per card, parallel to scores
  const [correctStreak, setCorrectStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  // 'all' | 'unmastered'
  const [filterMode, setFilterMode] = useState('all');
  const [filterChosen, setFilterChosen] = useState(false);
  const [selectedPool, setSelectedPool] = useState('all'); // 'all' | 'unmastered' | 'bookmarked' | 'quick'
  const [tagFilters, setTagFilters] = useState([]);
  const [typeFilters, setTypeFilters] = useState([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  // Clear filters when switching decks so a previous deck's selection can't
  // narrow the new one (especially when the new deck hides the filter block).
  useEffect(() => {
    setTagFilters([]);
    setTypeFilters([]);
  }, [deckId]);
  // Quick-session size. Held loosely (may be '' while typing); clamped on blur and at use.
  const [quickCount, setQuickCount] = useState(() => {
    const v = parseInt(localStorage.getItem('flashdeck_quickcount'), 10);
    return Number.isFinite(v) && v >= 5 ? v : 10;
  });
  const [gameModeWanted, setGameModeWanted] = useState(() => localStorage.getItem('flashdeck_gamemode') === '1');
  const [gameMode, setGameMode] = useState(false); // engaged for the running session only
  const [skipsUsed, setSkipsUsed] = useState(0); // deferrals used this session (display only)
  const [hearts, setHearts] = useState(3); // Game Mode hearts remaining (0..MAX_HEARTS)
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  // Layout defaults: seeded from user profile, then overrideable per-session
  // 'auto' is retired. Legacy values normalize to landscape; the viewport gate below
  // reproduces what 'auto' used to do.
  const [layoutMode, setLayoutMode] = useState(() => {
    const v = localStorage.getItem('flashdeck_layout');
    return !v || v === 'auto' ? 'horizontal' : v;
  });
  const [handedness, setHandedness] = useState(() => localStorage.getItem('flashdeck_handedness') || 'left');
  const [isWide, setIsWide] = useState(
    () => window.innerWidth >= CARD_MIN_W && window.innerHeight >= STUDY_MIN_VH
  );
  const SCENE_FLOOR_H = 150; // px of sky+ground the scene gets BELOW the header line
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [introPhase, setIntroPhase] = useState('intro'); // 'intro' | 'ready'
  const [wrongTick, setWrongTick] = useState(0); // increments each time a wrong answer is picked
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [learnMore, setLearnMore] = useState(null); // { explanation, title } | null
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const [characterAnchor, setCharacterAnchor] = useState({ x: 0, bottom: 0 });
  const [characterIdle, setCharacterIdle] = useState(true);
  const speaking = learnMore != null;
  const handleCharacterAnchor = useCallback((anchor) => {
    setCharacterAnchor((prev) => prev.x === anchor.x && prev.bottom === anchor.bottom && prev.width === anchor.width ? prev : anchor);
  }, []);
  const handleShowLearnMore = useCallback((explanation, title) => {
    setLearnMore({ explanation, title });
  }, []);
  const pendingExitRef = useRef(null); // stores the path to navigate to after exit decision
  const { playLevelStart } = useSound(soundEnabled);
  const [questionReady, setQuestionReady] = useState(false);
  const levelStartTimerRef = useRef(null);
  // Timing capture — per-card answer time + session origin (preserved across resume)
  const cardShownAtRef = useRef(null); // when the current card became interactive
  const sessionStartedAtRef = useRef(null); // ISO string of the original session start
  // Play the level-start fanfare and hold the first question inactive for 3s so the track can finish
  const beginIntro = () => {
    setQuestionReady(false);
    playLevelStart();
    clearTimeout(levelStartTimerRef.current);
    levelStartTimerRef.current = setTimeout(() => setQuestionReady(true), 3000);
  };

  useEffect(() => {
    const onResize = () => setIsWide(
      window.innerWidth >= CARD_MIN_W && window.innerHeight >= STUDY_MIN_VH
    );
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => () => clearTimeout(levelStartTimerRef.current), []);

  // Close any open Learn More bubble when the card changes or the session ends.
  useEffect(() => {setLearnMore(null);}, [cardIndex, done]);

  // Re-arm the summary bubble for the next session whenever a new one starts.
  useEffect(() => {if (!done) setSummaryDismissed(false);}, [done]);

  // Timing origin: the moment the current question becomes answerable.
  // shuffledCards is a dep because a DEFER swaps the card at the same index.
  useEffect(() => {
    if (filterChosen && questionReady && !done) {
      cardShownAtRef.current = Date.now();
    }
  }, [cardIndex, questionReady, filterChosen, done, shuffledCards]);

  const { data: deck, isLoading: deckLoading, error: deckError } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => base44.entities.Deck.filter({ id: deckId }).then((r) => r[0]),
    enabled: !!deckId
  });

  // Cover wash — hue/saturation from the deck's cover art (null → fixed yellow).
  // Must run before the early returns below to satisfy the Rules of Hooks.
  const coverColor = useDominantColor(deck?.cover_image_url);
  const wash = useMemo(() => resolveWash(coverColor, 64), [coverColor]);

  const { data: allCards = [], isLoading, error: cardsError, refetch: refetchCards } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => base44.entities.Card.filter({ deck_id: deckId }, 'order'),
    enabled: !!deckId
  });

  const activeCards = allCards.filter((c) => !c.deleted);

  const { data: currentUser, isLoading: meLoading, refetch: refetchMe } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me()
  });

  const { savedSession, hoursLeft, saveSession, clearSession } = useSavedSession(deckId, currentUser?.id);

  // Seed layout prefs from user profile on first load
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.default_layout_mode) {
      setLayoutMode(currentUser.default_layout_mode === 'auto' ? 'horizontal' : currentUser.default_layout_mode);
    }
    if (currentUser.default_handedness) setHandedness(currentUser.default_handedness);
  }, [currentUser?.id]);

  const { data: streakData = [], refetch: refetchStreak } = useQuery({
    queryKey: ['streak', currentUser?.id],
    queryFn: () => base44.entities.Streak.filter({ user_id: currentUser.id }),
    enabled: !!currentUser?.id
  });
  const streak = streakData[0] || null;

  const { data: cardStats = [], refetch: refetchStats } = useQuery({
    queryKey: ['card-stats', deckId, currentUser?.id],
    queryFn: () => base44.entities.UserCardStats.filter({ deck_id: deckId, user_id: currentUser.id }),
    enabled: !!deckId && !!currentUser?.id
  });

  const { data: pastSessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ['study-sessions', deckId],
    queryFn: () => base44.entities.StudySession.filter({ deck_id: deckId }),
    enabled: !!deckId
  });

  const { data: cardNotes = [] } = useQuery({
    queryKey: ['card-notes-session', deckId, currentUser?.email],
    queryFn: () => base44.entities.CardNote.filter({ created_by: currentUser.email }),
    enabled: !!deckId && !!currentUser?.email
  });

  const notesByCardId = Object.fromEntries(cardNotes.map((n) => [n.card_id, n.note]));

  // Learning mode: auto-enabled until the deck has been completed fully (no skips) at least once
  const hasCompletedFullSession = pastSessions.some((s) =>
  (s.card_results || []).length > 0 &&
  (s.card_results || []).every((r) => r.key && r.key !== 'skipped')
  );
  const learningMode = learningModeOverride !== null ? learningModeOverride : !hasCompletedFullSession;

  // Compute all-time best consecutive correct streak across all past sessions
  const allTimeBest = pastSessions.reduce((best, session) => {
    const results = session.card_results || [];
    let cur = 0;
    let sessionBest = 0;
    for (const r of results) {
      if (r.key === 'correct') {cur++;sessionBest = Math.max(sessionBest, cur);} else
      cur = 0;
    }
    return Math.max(best, sessionBest);
  }, 0);

  const masteredCardIds = new Set(cardStats.filter((s) => s.mastered).map((s) => s.card_id));
  const unmasteredCards = activeCards.filter((c) => !masteredCardIds.has(c.id));
  const bookmarkedCards = activeCards.filter((c) => c.bookmarked);

  // Tag pills, ordered by how often each tag appears across the UNFILTERED deck, so the
  // order stays put while the user is selecting.
  const tagOptions = useMemo(() => {
    const counts = new Map();
    activeCards.forEach((c) => (c.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return Array.from(counts.entries()).
    sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).
    map(([value, count]) => ({ value, label: value, count }));
  }, [activeCards]);

  // Only offer types the deck actually contains. Legacy rows without the field are MC.
  const typeOptions = useMemo(() => {
    const present = new Set(activeCards.map((c) => c.question_type || 'multiple_choice'));
    return QUESTION_TYPE_ORDER.filter((t) => present.has(t)).
    map((value) => ({ value, label: QUESTION_TYPE_LABELS[value] }));
  }, [activeCards]);

  // OR within each group, AND between groups. Empty group = inactive.
  const applyFilters = (cards) => {
    let out = cards;
    if (typeFilters.length) out = out.filter((c) => typeFilters.includes(c.question_type || 'multiple_choice'));
    if (tagFilters.length) out = out.filter((c) => tagFilters.some((t) => (c.tags || []).includes(t)));
    return out;
  };

  // Game Mode gate — evaluated against the EFFECTIVE session size, engaged at start time.
  const GAME_MODE_MIN_CARDS = 20;
  const QUICK_MIN_CARDS = 5;
  const MAX_HEARTS = 3;
  // 'quick' draws from the whole active deck, so it falls through to the default branch.
  // Filters are applied last, so every scope, count and gate downstream sees them.
  const poolFor = (mode) =>
  applyFilters(mode === 'unmastered' ? unmasteredCards : mode === 'bookmarked' ? bookmarkedCards : activeCards);
  // How many cards the session will actually contain. Only 'quick' differs from its pool size.
  const sizeFor = (mode) => {
    const n = poolFor(mode).length;
    if (mode !== 'quick') return n;
    return Math.min(Math.max(Number(quickCount) || 0, QUICK_MIN_CARDS), n);
  };
  const gameEligible = selectedPool != null && sizeFor(selectedPool) >= GAME_MODE_MIN_CARDS;

  const handleToggleBookmark = async (cardId, newVal) => {
    // Bookmarking writes to the card record, which only the deck owner may do.
    // For shared (non-owned) decks, no-op rather than throw an RLS error.
    if (deck && currentUser && deck.created_by !== currentUser.email) return;
    await base44.entities.Card.update(cardId, { bookmarked: newVal });
    refetchCards();
  };

  const startSession = (mode) => {
    clearSession(); // discard any saved session on fresh start
    beginIntro();
    // Shuffle first, then slice — the quick subset is a fresh random draw each session.
    const drawn = shuffle(poolFor(mode));
    const pool = mode === 'quick' ? drawn.slice(0, sizeFor(mode)) : drawn;
    setGameMode(gameModeWanted && pool.length >= GAME_MODE_MIN_CARDS && canZombify(getSkin(DEFAULT_SKIN_ID)));
    setShuffledCards(pool);
    setCardIndex(0);
    setDone(false);
    setScores([]);
    setFirstWrongChoices([]);
    setAnswerTimes([]);
    setFilterMode(mode);
    setSkipsUsed(0);
    setHearts(MAX_HEARTS);
    setFilterChosen(true);
    setCorrectStreak(0);
    setBestStreak(0);
    setSessionStartTime(new Date());
    sessionStartedAtRef.current = new Date().toISOString();
    sessionSaved.current = false;
    setIntroPhase('intro');
  };

  const reviewMissed = () => {
    const missed = shuffledCards.filter((c, i) => !(scores[i] && CORRECT_KEYS.has(scores[i].key)));
    if (!missed.length) return;
    clearSession();
    beginIntro();
    setShuffledCards(shuffle(missed));
    setCardIndex(0);
    setDone(false);
    setScores([]);
    setFirstWrongChoices([]);
    setAnswerTimes([]);
    setFilterMode('missed');
    setGameMode(false); // review runs are Progress mode
    setSkipsUsed(0);
    setHearts(MAX_HEARTS);
    setFilterChosen(true);
    setCorrectStreak(0);
    setBestStreak(0);
    setSessionStartTime(new Date());
    sessionStartedAtRef.current = new Date().toISOString();
    sessionSaved.current = false;
    setIntroPhase('intro');
  };

  const resumeSession = () => {
    if (!savedSession || !activeCards.length) return;
    // Reconstruct card order from saved card_ids
    const cardMap = Object.fromEntries(activeCards.map((c) => [c.id, c]));
    const ordered = savedSession.card_ids.map((id) => cardMap[id]).filter(Boolean);
    if (!ordered.length) return;
    beginIntro();
    setShuffledCards(ordered);
    setCardIndex(savedSession.card_index || 0);
    setScores(savedSession.scores || []);
    setFirstWrongChoices(savedSession.first_wrong_choices || []);
    setAnswerTimes(savedSession.answer_times || []);
    setFilterMode(savedSession.filter_mode || 'all');
    setGameMode(false); // saved sessions don't carry game-mode state yet (later stage)
    setSkipsUsed(0); // defer count isn't persisted yet (later stage)
    setHearts(MAX_HEARTS);
    setFilterChosen(true);
    setCorrectStreak(0);
    setBestStreak(0);
    // Reconstruct the timing origin: back-date so (now - sessionStartTime)
    // equals previously accumulated active time. started_at is preserved separately.
    setSessionStartTime(new Date(Date.now() - (savedSession.elapsed_ms || 0)));
    sessionStartedAtRef.current = savedSession.started_at || new Date().toISOString();
    sessionSaved.current = false;
    setIntroPhase('intro');
  };

  const sessionSaved = useRef(false);

  // Update UserCardStats when session completes
  useEffect(() => {
    if (!done || sessionSaved.current || !shuffledCards.length || !currentUser?.id) return;
    sessionSaved.current = true;

    const minSessions = deck?.mastery_min_sessions ?? 3;
    const masteryPct = deck?.mastery_pct ?? 90;

    const saveStats = async () => {
      const cardResults = shuffledCards.map((card, i) => ({
        card_id: card.id,
        correct_answer: cardLabel(card),
        image_url: card.image_url || '',
        points: scores[i]?.points ?? 0,
        key: scores[i]?.key ?? 'skipped',
        first_wrong: firstWrongChoices[i] ?? null,
        time_to_answer_ms: answerTimes[i] ?? null,
        question_type: card.question_type || 'multiple_choice',
        max_points: card.point_value ?? 20
      }));

      const total = cardResults.reduce((s, r) => s + r.points, 0);
      const max = shuffledCards.reduce((s, c) => s + (c.point_value ?? 20), 0);

      // Save study session
      const endedAt = new Date();
      const durationMs = sessionStartTime ? endedAt.getTime() - sessionStartTime.getTime() : null;

      await base44.entities.StudySession.create({
        deck_id: deckId,
        score_pct: max > 0 ? total / max * 100 : 0,
        total_points: total,
        max_points: max,
        card_results: cardResults,
        started_at: sessionStartedAtRef.current,
        ended_at: endedAt.toISOString(),
        duration_ms: durationMs,
        filter_mode: filterMode,
        card_count: shuffledCards.length,
        best_streak: bestStreak,
        game_mode: gameMode,
        hearts_remaining: gameMode ? hearts : null
      });

      // Fire-and-forget: log this session to any groups the deck is assigned to
      // so the group activity feed reflects member study. Never blocks completion.
      base44.functions.invoke('logGroupStudy', {
        deck_id: deckId,
        score_pct: max > 0 ? total / max * 100 : 0,
        total_points: total,
        max_points: max,
        card_count: shuffledCards.length,
        duration_ms: durationMs
      }).catch(() => {});

      // Update streak
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      let newStreak = 1;
      if (streak) {
        const last = streak.last_study_date;
        newStreak = streak.current_streak;
        if (last === today) {















          // already studied today, no change
        } else if (last === yesterday) {newStreak = streak.current_streak + 1;} else {newStreak = 1;}const newLongest = Math.max(streak.longest_streak || 0, newStreak);const newMilestone = [3, 7, 14, 30, 60, 100].filter((m) => newStreak >= m).pop() || 0;await base44.entities.Streak.update(streak.id, { current_streak: newStreak, longest_streak: newLongest, last_study_date: today, milestone_reached: Math.max(streak.milestone_reached || 0, newMilestone) });} else if (currentUser?.id) {await base44.entities.Streak.create({ user_id: currentUser.id,
            current_streak: 1,
            longest_streak: 1,
            last_study_date: today,
            milestone_reached: 0
          });
      }
      refetchStreak();

      // Milestone toast
      const newMilestoneVal = [3, 7, 14, 30, 60, 100].filter((m) => newStreak >= m).pop() || 0;
      const prevMilestone = streak?.milestone_reached || 0;
      if (newMilestoneVal > prevMilestone) {
        const { toast: sonnerToast } = await import('sonner');
        sonnerToast(`🏆 ${newMilestoneVal}-day milestone reached!`, {
          description: `You've studied ${newMilestoneVal} days in a row. Keep it up!`,
          duration: 5000
        });
      }

      // Update UserCardStats for every card in this session
      for (const result of cardResults) {
        const wasCorrect = CORRECT_KEYS.has(result.key);
        const existing = cardStats.find((s) => s.card_id === result.card_id);

        const newCorrect = (existing?.correct_attempts ?? 0) + (wasCorrect ? 1 : 0);
        const newTotal = (existing?.total_attempts ?? 0) + 1;
        const newSessions = (existing?.sessions_completed ?? 0) + 1;

        // Mastery only evaluated once min sessions reached; requires >= masteryPct% correct
        const nowMastered = newSessions >= minSessions && newCorrect / newSessions * 100 >= masteryPct;

        const answerMs = result.time_to_answer_ms;
        const newTotalTime = (existing?.total_time_ms ?? 0) + (answerMs ?? 0);
        const newFastest = answerMs != null ?
        Math.min(existing?.fastest_answer_ms ?? Infinity, answerMs) :
        existing?.fastest_answer_ms ?? null;
        const nowIso = new Date().toISOString();

        // Mastery-moment snapshot: only on the FIRST flip to true, never overwritten.
        const firstMastery = nowMastered && !existing?.mastered_at && !existing?.mastered;
        const masteryFields = firstMastery ? {
          mastered_at: nowIso,
          attempts_to_master: newTotal,
          sessions_to_master: newSessions,
          study_time_to_master_ms: newTotalTime
        } : {};

        if (existing) {
          await base44.entities.UserCardStats.update(existing.id, {
            correct_attempts: newCorrect,
            total_attempts: newTotal,
            sessions_completed: newSessions,
            mastered: nowMastered,
            last_studied_date: nowIso,
            total_time_ms: newTotalTime,
            ...(newFastest != null && { fastest_answer_ms: newFastest }),
            ...masteryFields
          });
        } else {
          await base44.entities.UserCardStats.create({
            user_id: currentUser.id,
            deck_id: deckId,
            card_id: result.card_id,
            correct_attempts: newCorrect,
            total_attempts: newTotal,
            sessions_completed: newSessions,
            mastered: nowMastered,
            last_studied_date: nowIso,
            first_studied_date: nowIso,
            total_time_ms: newTotalTime,
            ...(newFastest != null && { fastest_answer_ms: newFastest }),
            ...masteryFields
          });
        }
      }

      refetchStats();
      refetchSessions();
    };

    saveStats();
  }, [done]);

  const [showRestartWarning, setShowRestartWarning] = useState(false);

  const restart = () => {
    const progress = scores.filter(Boolean).length;
    const isIncomplete = filterChosen && !done && progress > 0;
    if (isIncomplete) {
      setShowRestartWarning(true);
    } else {
      doRestart();
    }
  };

  const doRestart = () => {
    setShowRestartWarning(false);
    clearSession();
    setFilterChosen(false);
    setDone(false);
    setShuffledCards([]);
    setScores([]);
    setFirstWrongChoices([]);
    setAnswerTimes([]);
    sessionSaved.current = false;
    setIntroPhase('intro');
  };

  // Called when user tries to exit mid-session
  const requestExit = (path) => {
    const progress = scores.filter(Boolean).length;
    const isIncomplete = filterChosen && !done && progress > 0 && progress < shuffledCards.length;
    if (isIncomplete) {
      pendingExitRef.current = path;
      setShowExitWarning(true);
    } else {
      navigate(path);
    }
  };

  const handleExitSave = async () => {
    await saveSession({
      cardIds: shuffledCards.map((c) => c.id),
      cardIndex,
      scores,
      firstWrongChoices,
      filterMode,
      answerTimes,
      elapsedMs: sessionStartTime ? Date.now() - sessionStartTime.getTime() : 0,
      startedAt: sessionStartedAtRef.current
    });
    setShowExitWarning(false);
    navigate(pendingExitRef.current || `/deck/${deckId}`);
  };

  const handleExitDiscard = () => {
    clearSession();
    setShowExitWarning(false);
    navigate(pendingExitRef.current || `/deck/${deckId}`);
  };

  const handleNext = () => {
    if (cardIndex < shuffledCards.length - 1) setCardIndex((i) => i + 1);else
    setDone(true);
  };
  const handlePrev = () => {if (cardIndex > 0) setCardIndex((i) => i - 1);};

  // Skip = DEFER: the current card moves to the end of the queue. Nothing is
  // scored, the streak is untouched, and cardIndex does not move — the next
  // card slides into this position. Disallowed on answered cards and on the
  // last queue position (there is nothing to defer behind).
  const canSkip = scores[cardIndex] == null && cardIndex < shuffledCards.length - 1;
  const handleSkip = () => {
    if (!canSkip) return;
    setSkipsUsed((n) => n + 1);
    setShuffledCards((prev) => {
      const next = [...prev];
      const [deferred] = next.splice(cardIndex, 1);
      next.push(deferred);
      return next;
    });
  };

  const handleFirstWrong = (choice, meta) => {
    setFirstWrongChoices((prev) => {
      const next = [...prev];
      next[cardIndex] = choice;
      return next;
    });
    setWrongTick((n) => n + 1);
  };

  const handleScore = (points, key) => {
    // First commit of this card? scores[cardIndex] is only set once answered,
    // so a revisit/re-answer reads as already-committed and won't move the streak.
    const firstCommit = scores[cardIndex] == null;

    // Time-to-answer: recorded once per card, on the first commit. Revisits
    // (navigating back and re-answering) do not overwrite the original timing.
    setAnswerTimes((prev) => {
      if (prev[cardIndex] != null) return prev;
      const next = [...prev];
      next[cardIndex] = cardShownAtRef.current ? Date.now() - cardShownAtRef.current : null;
      return next;
    });
    setScores((prev) => {
      const next = [...prev];
      next[cardIndex] = { points, key };
      return next;
    });

    // Streak = consecutive STRICTLY-correct first answers. No helpers: a clue,
    // a second guess, or a partial does NOT build it, and anything but a clean
    // 'correct' resets it to 0. Only the first commit of a card counts.
    if (firstCommit) {
      const streakWorthy = key === 'correct';
      setCorrectStreak((prev) => {
        const next = streakWorthy ? prev + 1 : 0;
        if (streakWorthy) setBestStreak((b) => Math.max(b, next));
        return next;
      });

      // Game Mode hearts — first commits only, mirroring the streak rule.
      // Drain: a clean 'wrong' costs a heart (assisted outcomes never drain —
      // they already pay by not building the streak). Recovery: every 5-streak
      // milestone restores one, cap MAX_HEARTS. `correctStreak` here is the
      // committed render value, so `correctStreak + 1` equals the updater's
      // `next` — a re-render always lands between first commits.
      if (gameMode) {
        if (key === 'wrong') {
          setHearts((h) => Math.max(0, h - 1));
        } else if (key === 'correct' && (correctStreak + 1) % 5 === 0) {
          setHearts((h) => h > 0 ? Math.min(MAX_HEARTS, h + 1) : h); // death is permanent
        }
      }
    }
  };

  // Duration is frozen at the moment `done` flips so the panel doesn't tick on re-render.
  const completionDurationMs = useMemo(() => {
    if (!done || !sessionStartTime) return null;
    return Date.now() - sessionStartTime.getTime();
  }, [done, sessionStartTime]);

  // Loading is loading. Everything below it is a resolved outcome with its own message.
  if (isLoading || deckLoading || meLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>);

  }

  if (deckError || cardsError) {
    return (
      <SessionNotice
        title="Couldn't load this deck"
        body="Something went wrong fetching this deck. Try again, or head back and pick another."
        deckId={deckId}
        onRetry={() => refetchCards()} />);

  }

  if (!deck) {
    return (
      <SessionNotice
        title="Deck not found"
        body="This deck doesn't exist, or it isn't visible to your account." />);

  }

  if (!activeCards.length) {
    // Admins bypass the Card read rule, so for them an empty result means the deck
    // really is empty — never "you might not have access".
    const isOwner = !!currentUser?.email && deck.created_by === currentUser.email;
    const canSeeAll = isOwner || currentUser?.role === 'admin';
    return (
      <SessionNotice
        title={canSeeAll ? 'This deck has no cards yet' : 'No cards available'}
        body={canSeeAll ?
        "Add some cards to this deck and it'll be ready to study." :
        "This deck has no cards you can view. If you expected to see cards here, your account may not have access to them."}
        deckId={deckId} />);

  }

  const totalPoints = scores.reduce((s, r) => s + (r?.points || 0), 0);
  const maxPoints = shuffledCards.reduce((s, c) => s + (c.point_value ?? 20), 0);
  const pct = maxPoints > 0 ? Math.round(totalPoints / maxPoints * 100) : 0;
  const missedCount = shuffledCards.filter((c, i) => !(scores[i] && CORRECT_KEYS.has(scores[i].key))).length;
  const correctCount = scores.filter((s) => s && CORRECT_KEYS.has(s.key)).length;
  const longestWrongStreak = (() => {
    let max = 0,cur = 0;
    for (const s of scores) {
      if (s && !CORRECT_KEYS.has(s.key)) {cur++;max = Math.max(max, cur);} else {cur = 0;}
    }
    return max;
  })();
  const avgAnswerMs = (() => {
    const times = answerTimes.filter((t) => t != null);
    return times.length ? times.reduce((s, t) => s + t, 0) / times.length : null;
  })();
  const highScore = pastSessions.length > 0 ?
  Math.max(...pastSessions.map((s) => s.total_points || 0)) :
  0;

  const current = shuffledCards[cardIndex];

  // The three-way control is a view over (layoutMode, handedness). Portrait deliberately
  // leaves handedness untouched so returning to a landscape restores the same side.
  const layoutChoice =
  layoutMode === 'vertical' ? 'portrait' : handedness === 'right' ? 'landscape-r' : 'landscape-l';

  const setLayoutChoice = (choice) => {
    const nextMode = choice === 'portrait' ? 'vertical' : 'horizontal';
    setLayoutMode(nextMode);
    localStorage.setItem('flashdeck_layout', nextMode);
    if (choice !== 'portrait') {
      const nextHand = choice === 'landscape-r' ? 'right' : 'left';
      setHandedness(nextHand);
      localStorage.setItem('flashdeck_handedness', nextHand);
    }
  };

  const saveDefaults = async () => {
    setSavingDefaults(true);
    await base44.auth.updateMe({ default_layout_mode: layoutMode, default_handedness: handedness });
    refetchMe();
    setSavingDefaults(false);
  };

  // Filter selection screen
  if (!filterChosen) {
    const allPool = poolFor('all');
    const unmasteredPool = poolFor('unmastered');
    const bookmarkedPool = poolFor('bookmarked');
    const filtersActive = tagFilters.length > 0 || typeFilters.length > 0;
    const allMastered = unmasteredPool.length === 0 && allPool.length > 0;
    const canStart = !!selectedPool && sizeFor(selectedPool) > 0;

    const scopeOptions = [
    {
      value: 'all',
      label: filtersActive ? 'Everything that matches' : 'The whole deck',
      sub: `${allPool.length} card${allPool.length !== 1 ? 's' : ''}`,
      disabled: allPool.length === 0,
      badge: null,
      tooltip: null
    },
    {
      value: 'unmastered',
      label: 'Unmastered only',
      sub: unmasteredPool.length === allPool.length ?
      'Same as the whole deck' :
      allMastered ? '🎉 All cards mastered!' : `${unmasteredPool.length} card${unmasteredPool.length !== 1 ? 's' : ''} not yet mastered`,
      disabled: allMastered || unmasteredPool.length === allPool.length,
      badge: unmasteredPool.length < allPool.length ?
      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
            {unmasteredPool.length} remaining
          </span> :
      null,
      tooltip: null
    },
    {
      value: 'bookmarked',
      label: 'Bookmarked only',
      sub: bookmarkedPool.length === 0 ?
      filtersActive ? 'No bookmarked cards match these filters' : 'No bookmarked cards yet' :
      bookmarkedPool.length < 10 ?
      filtersActive ? `Only ${bookmarkedPool.length} of your bookmarks match` : `Need 10 bookmarked cards (${bookmarkedPool.length} so far)` :
      'Study only your bookmarked cards',
      disabled: bookmarkedPool.length < 10,
      badge: bookmarkedPool.length >= 10 ?
      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
            {bookmarkedPool.length} card{bookmarkedPool.length !== 1 ? 's' : ''}
          </span> :
      null,
      tooltip: null
    },
    {
      value: 'quick',
      label: 'Quick session',
      labelNode:
      <span className="flex items-center gap-1.5">
            Quick session: study
            <input
          type="number"
          min={QUICK_MIN_CARDS}
          max={allPool.length}
          step={1}
          value={quickCount}
          disabled={allPool.length < QUICK_MIN_CARDS}
          onFocus={() => setSelectedPool('quick')}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setQuickCount(e.target.value === '' ? '' : Number(e.target.value))}
          onBlur={() => {
            const next = Math.min(
              Math.max(Number(quickCount) || 0, QUICK_MIN_CARDS),
              Math.max(allPool.length, QUICK_MIN_CARDS)
            );
            setQuickCount(next);
            localStorage.setItem('flashdeck_quickcount', String(next));
          }}
          className="w-16 rounded-[4px] border border-input bg-background px-1.5 py-0.5 text-base font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring" />
        
            cards
          </span>,

      sub: allPool.length < QUICK_MIN_CARDS ?
      filtersActive ? `Needs at least ${QUICK_MIN_CARDS} matching cards` : `Needs at least ${QUICK_MIN_CARDS} cards in the deck` :
      `Drawn at random from ${allPool.length} card${allPool.length !== 1 ? 's' : ''}`,
      disabled: allPool.length < QUICK_MIN_CARDS,
      badge: null,
      tooltip: null
    }];


    return (
      <div className="relative isolate max-w-5xl mx-auto px-4 py-8">
        {/* Cover wash — full-bleed past the Layout's max-w-7xl px-4 gutter */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -z-10 overflow-hidden isolate"
          style={{
            width: '100vw',
            marginLeft: 'calc(50% - 50vw)',
            left: 0,
            top: '-1.5rem',
            bottom: 'auto',
            height: 'calc(100% + 1.5rem)',
            background: `linear-gradient(180deg,
              hsl(${wash.h} ${wash.s}% var(--wash-l, ${wash.l}%)) 0%,
              hsl(${wash.h} ${wash.s}% ${Math.min(97, wash.l + 18)}%) 49%,
              hsl(var(--background)) 96%)`
          }}>
          
          {deck?.cover_image_url &&
          <img
            src={deck.cover_image_url}
            alt=""
            className="absolute top-1/2 left-0 w-auto"
            style={{
              height: '118%',
              maxWidth: 'none',
              transform: 'translate(-14%, -50%)',
              filter: 'grayscale(100%)',
              opacity: 0.55,
              mixBlendMode: 'soft-light'
            }} />

          }
        </div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(`/deck/${deckId}`)}
            aria-label="Back to deck"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-sm transition-colors hover:bg-muted">
            
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold font-fraunces truncate">{deck?.title}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <SlidersVertical className="w-3.5 h-3.5" />
              Study Settings
            </p>
          </div>
        </div>

        {/* Resume banner */}
        {savedSession &&
        <div className="mb-6 border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">You have a saved session</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {savedSession.card_index} of {savedSession.card_ids?.length} cards done · expires in {hoursLeft}h
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={resumeSession} className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white border-0">
                <PlayCircle className="w-3.5 h-3.5" /> Resume
              </Button>
            </div>
          </div>
        }

        <div className="mx-auto grid w-full max-w-sm gap-6 rounded-[8px] border border-border bg-card p-5 shadow-sm lg:max-w-none lg:grid-cols-[minmax(0,384px)_minmax(0,1fr)] lg:gap-8 lg:p-6">
          {/* Left: study mode selection */}
          <div className="flex flex-col gap-4">
          <div>
            <h2 className="tracking-tight text-lg font-inter font-semibold">What are we studying today?</h2>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-sm">
            <RadioGroup value={selectedPool} onValueChange={setSelectedPool} className="gap-3">
              {scopeOptions.flatMap((o) => {
                  const els = [];
                  if (o.value === 'unmastered') {
                    els.push(
                      <div key="scope-heading-targeted" className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Targeted Sessions
                    </div>
                    );
                  }
                  els.push(
                    <div key={o.value} className="flex items-start gap-2">
                    <Label
                        htmlFor={`scope-${o.value}`}
                        className="flex-1 flex cursor-pointer items-start gap-3 rounded-[4px] border-2 border-border p-4 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                        
                      <RadioGroupItem id={`scope-${o.value}`} value={o.value} disabled={o.disabled} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold flex items-center gap-2" style={{ fontSize: '18px' }}>
                          {o.labelNode || o.label}
                          {o.badge}
                        </span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          {o.sub}
                        </span>
                      </span>
                    </Label>
                    {o.tooltip}
                  </div>
                  );
                  return els;
                })}
            </RadioGroup>

            {/* Additional filters — narrow every scope above */}
            {(tagOptions.length > 0 || typeOptions.length > 1) &&
              <div className="flex flex-col gap-4 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Additional Filters
                </p>
                <FilterPillGroup
                  title="Filter by Tags"
                  options={tagOptions}
                  selected={tagFilters}
                  onChange={setTagFilters}
                  maxVisible={MAX_VISIBLE_TAGS}
                  onMore={() => setTagPickerOpen(true)} />
                
                {typeOptions.length > 1 &&
                <FilterPillGroup
                  title="Filter by Question Type"
                  options={typeOptions}
                  selected={typeFilters}
                  onChange={setTypeFilters} />

                }
                {filtersActive && allPool.length === 0 &&
                <p className="text-xs text-destructive">No cards match these filters.</p>
                }
              </div>
              }

            <TagPickerDialog
                open={tagPickerOpen}
                onOpenChange={setTagPickerOpen}
                options={tagOptions}
                selected={tagFilters}
                onChange={setTagFilters} />
              
          </div>
          </div>

          {/* Right: brain boosters, study buddy modes, layout, start */}
          <div className="flex w-full flex-col gap-4">
            <Card className="rounded-[6px] shadow-none">
              <CardHeader className="space-y-0 p-5 pb-2">
                <CardTitle className="text-lg font-inter font-semibold">
                  Can we interest you in a little cheating?
                </CardTitle>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                  Just kidding! We actually call these options “Brain Boosters” and there’s nothing
                  wrong with using them… as long as you don’t mind being a cheater.
                </p>
              </CardHeader>
              <CardContent className="divide-y divide-border px-5 pb-3 pt-0">
                <SettingRow htmlFor="allow-2nd-guesses" label="Allow 2nd guesses" hint="Let a wrong first pick be retried once">
                  <Switch
                    id="allow-2nd-guesses"
                    checked={secondGuessAllowed}
                    onCheckedChange={(next) => {
                      setSecondGuessAllowed(next);
                      localStorage.setItem('flashdeck_secondguess', next ? '1' : '0');
                    }} />
                  
                </SettingRow>
                <SettingRow htmlFor="allow-notes" label="Allow notes" hint="Show the notes toggle on each card">
                  <Switch
                    id="allow-notes"
                    checked={hintsAllowed}
                    onCheckedChange={(next) => {
                      setHintsAllowed(next);
                      localStorage.setItem('flashdeck_hints', next ? '1' : '0');
                    }} />
                  
                </SettingRow>
                <SettingRow htmlFor="allow-eliminate" label="Allow eliminate one" hint="Let the sparkle button remove a wrong answer choice">
                  <Switch
                    id="allow-eliminate"
                    checked={eliminateAllowed}
                    onCheckedChange={(next) => {
                      setEliminateAllowed(next);
                      localStorage.setItem('flashdeck_eliminate', next ? '1' : '0');
                    }} />
                  
                </SettingRow>
              </CardContent>
            </Card>

            <Card className="rounded-[6px] shadow-none">
              <CardHeader className="space-y-0 p-5 pb-2">
                <CardTitle className="text-lg font-fraunces font-bold">
                  The <s className="opacity-50">many</s> two modes of Study Buddy
                </CardTitle>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                  Your study buddy can do more than just keep track of your progress. Before you get
                  too excited, no — it doesn’t include saving you from AI.
                </p>
              </CardHeader>
              <CardContent className="divide-y divide-border px-5 pb-3 pt-0">
                <SettingRow
                  htmlFor="learning-mode"
                  label="Learning Mode"
                  hint={
                  <>
                      Study buddy drops some extra knowledge when you answer incorrectly. Only works
                      if the card has an explanation. If not, you’re on your own.
                      {!hasCompletedFullSession &&
                    <span className="mt-1 block font-medium text-amber-600">
                          On by default until your first full session
                        </span>
                    }
                    </>
                  }>
                  
                  <Switch
                    id="learning-mode"
                    checked={learningMode}
                    onCheckedChange={(next) => setLearningModeOverride(next)} />
                  
                </SettingRow>
                <SettingRow
                  htmlFor="game-mode"
                  label="Game Mode"
                  hint={
                  <>
                      Your study buddy will lose a heart when you blow it. So try not to. Replenish
                      them with streaks. What happens if you run out?
                      {!gameEligible &&
                    <span className="mt-1 block font-medium text-amber-600">
                          Needs {GAME_MODE_MIN_CARDS}+ cards in the selected set
                        </span>
                    }
                    </>
                  }>
                  
                  <Switch
                    id="game-mode"
                    checked={gameModeWanted && gameEligible}
                    disabled={!gameEligible}
                    onCheckedChange={(next) => {
                      setGameModeWanted(next);
                      localStorage.setItem('flashdeck_gamemode', next ? '1' : '0');
                    }} />
                  
                </SettingRow>
              </CardContent>
            </Card>

            <div>
              <SettingRow label="Card Layout?" hint="You’d be surprised how many people get this one wrong.">
                <div className="flex gap-2" role="radiogroup" aria-label="Card layout">
                  {LAYOUT_CHOICES.map((c) => {
                    const active = layoutChoice === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setLayoutChoice(c.value)}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-[4px] border-2 px-2 py-1.5 transition-colors',
                          active ?
                          'border-primary text-primary bg-accent/40' :
                          'border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground'
                        )}>
                        
                        <LayoutGlyph variant={c.value} className="w-11 h-8" />
                        <span className="text-[10px] font-medium leading-none">{c.label}</span>
                      </button>);

                  })}
                </div>
              </SettingRow>
              <div className="flex justify-end">
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={saveDefaults} disabled={savingDefaults}>
                  {savingDefaults ? 'Saving…' : 'Save display as my default'}
                </Button>
              </div>
            </div>

            <button
              onClick={() => canStart && startSession(selectedPool)}
              disabled={!canStart}
              className={cn(
                'mt-auto w-full rounded-[4px] border-2 p-3 text-center text-lg font-semibold transition-all',
                canStart ?
                'border-primary bg-primary text-primary-foreground hover:opacity-90' :
                'border-border text-muted-foreground opacity-50 cursor-not-allowed'
              )}>
              Start Session
            </button>
          </div>
        </div>
      </div>);

  }

  // ── Restart warning — inline overlay inside the game pane ────────────────
  const RestartWarningOverlay = showRestartWarning ?
  <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
      <div className="flex flex-col items-center gap-4 px-6 py-7 text-center max-w-xs">
        <img
        src="https://media.base44.com/images/public/69fd6153088222f7245f34d6/19a696596_Reset-Up.png"
        alt="Reset"
        style={{ width: 32, height: 32, imageRendering: 'pixelated' }} />
      
        <p className="pixel-ui text-foreground leading-snug" style={{ fontSize: 11 }}>
          RESTART SESSION?
        </p>
        <p className="pixel-ui text-muted-foreground" style={{ fontSize: 9 }}>
          {scores.filter(Boolean).length} / {shuffledCards.length} CARDS DONE.{'\n'}PROGRESS WILL BE LOST.
        </p>
        <div className="flex gap-3 mt-1">
          <button
          onClick={doRestart}
          className="pixel-ui px-4 py-2 bg-destructive text-destructive-foreground border-2 border-destructive hover:opacity-90 transition-opacity"
          style={{ fontSize: 9 }}>
          
            RESTART
          </button>
          <button
          onClick={() => setShowRestartWarning(false)}
          className="pixel-ui px-4 py-2 border-2 border-border text-foreground hover:bg-muted transition-colors"
          style={{ fontSize: 9 }}>
          
            KEEP GOING
          </button>
        </div>
      </div>
    </div> :
  null;

  // Vertical is always vertical. Landscape is honored only where the viewport can hold it —
  // the fallback 'auto' used to provide, now applied to every choice.
  const useHorizontal = layoutMode !== 'vertical' && isWide;

  return (
    <div className="min-h-screen bg-background">
      <LeaveSessionDialog
        open={showExitWarning}
        onOpenChange={setShowExitWarning}
        doneCount={scores.filter(Boolean).length}
        totalCount={shuffledCards.length}
        onSave={handleExitSave}
        onDiscard={handleExitDiscard} />

      {/* Header section — deck name + settings + end session */}
      <div className="flex items-center justify-between gap-3 px-1 pb-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground font-fraunces flex items-center gap-1.5 min-w-0">
            <span>{deck?.title}</span>
            <DeckInfoTooltip
              deck={deck}
              totalCards={activeCards.length}
              masteredCount={cardStats.filter((s) => s.mastered).length} />
            
          </h1>
          <p className="text-xs mt-0.5">
            {filterMode === 'unmastered' && <span className="text-amber-600">Unmastered only</span>}
            {filterMode === 'bookmarked' && <span className="text-amber-600">Bookmarked only</span>}
            {filterMode === 'quick' && <span className="text-amber-600">Quick session</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setFilterChosen(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-foreground hover:bg-muted transition-colors"
            title="Settings">
            <SlidersVertical className="w-4 h-4" />
            <span className="[font-family:'Inter',_sans-serif] font-medium">Settings</span>
          </button>
          <button
            onClick={() => requestExit(`/deck/${deckId}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 transition-colors"
            title="End session">
            <LogOut className="w-4 h-4" />
            <span>End Session</span>
          </button>
        </div>
      </div>

      {/* Game world — bordered box holding the scene + HUD */}
      <motion.div
        className="relative mb-1 border-2 border-black rounded overflow-hidden"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}>
        
        {/* Background scene — only during active study */}
        {filterChosen &&
        <ProgressGameBand
          zombified={gameMode && hearts === 0}
          cardIndex={cardIndex}
          total={shuffledCards.length}
          scores={scores}
          correctStreak={correctStreak}
          soundEnabled={soundEnabled}
          entering={introPhase === 'intro'}
          wrongTick={wrongTick}
          speaking={speaking}
          onCharacterAnchor={handleCharacterAnchor}
          onIdleChange={setCharacterIdle}
          onEntryComplete={() => setTimeout(() => setIntroPhase('ready'), 0)} />

        }

        {/* HUD layer — paints on top of the scene */}
        <div className="relative z-10 flex items-center justify-end gap-2 pt-1 pr-3 pb-3 pl-3">
          {gameMode && <HeartsHud hearts={hearts} />}
          <div className="flex items-baseline gap-3 select-none px-1" style={{ fontFamily: "'VT323', monospace" }}>
            <span className="text-foreground uppercase" style={{ fontSize: 20, lineHeight: 1 }}>Score: {totalPoints.toFixed(2)}</span>
            <span className="text-muted-foreground uppercase" style={{ fontSize: 20, lineHeight: 1 }}>Top Score: {highScore > 0 ? highScore.toFixed(2) : '--'}</span>
          </div>
          <StreakCounter streak={correctStreak} record={Math.max(allTimeBest, bestStreak)} />
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              localStorage.setItem('flashdeck_sound', next ? '1' : '0');
            }}
            title={soundEnabled ? 'Sound on' : 'Sound off'}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors outline-none">
            <img
              key={soundEnabled ? 'on' : 'off'}
              src={soundEnabled ?
              'https://media.base44.com/images/public/69fd6153088222f7245f34d6/55db65aba_Sound-On.gif' :
              'https://media.base44.com/images/public/69fd6153088222f7245f34d6/737afdac2_Sound-Off.gif'}
              alt={soundEnabled ? 'Sound on' : 'Sound off'}
              style={{ width: 24, height: 24, imageRendering: 'pixelated' }} />
            
          </button>
          </div>

        {/* Floor space: extends the stage downward so the absolute scene has room for sky + ground below the controls */}
        {filterChosen && <div aria-hidden style={{ height: SCENE_FLOOR_H }} />}

        {filterChosen &&
        <SwabbieSpeechBubble
          open={speaking}
          onClose={() => setLearnMore(null)}
          explanation={learnMore?.explanation}
          title={learnMore?.title}
          anchorX={characterAnchor.x}
          anchorBottom={characterAnchor.bottom} />

        }

        {filterChosen &&
        <SessionSummaryBubble
          open={done && characterIdle && !summaryDismissed}
          onClose={() => setSummaryDismissed(true)}
          anchorX={characterAnchor.x}
          anchorBottom={characterAnchor.bottom}
          anchorWidth={characterAnchor.width}
          stats={{ pct, correctCount, totalCards: shuffledCards.length, bestStreak, longestWrongStreak, durationMs: completionDurationMs, avgAnswerMs }}
          onGetNerdy={() => navigate(`/stats/${deckId}`)}
          onReviewMissed={reviewMissed}
          hasMissed={missedCount > 0} />

        }
      </motion.div>

      <AnimatePresence mode="wait">
        {done ?
        <motion.div
          key="session-stats"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="relative bg-card border border-border rounded-lg p-4 mt-4">
            <div className="flex items-center justify-center gap-3 py-8">
              <Button onClick={restart} variant="outline" size="lg" className="gap-2">
                <RotateCcw className="w-5 h-5" /> Study again
              </Button>
              <Link to={`/stats/${deckId}`}>
                <Button variant="outline" size="lg" className="gap-2">
                  <BarChart2 className="w-5 h-5" /> Full stats
                </Button>
              </Link>
            </div>
          </motion.div> :

        <motion.div key="study-area" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {contactSheetOpen ?
          <div className="mt-4"><ContactSheet
              cards={shuffledCards}
              scores={scores}
              cardIndex={cardIndex}
              onJump={(i) => {setCardIndex(i);setContactSheetOpen(false);}} /></div> :

          (() => {
            const useHorizontal = layoutMode !== 'vertical' && isWide;
            const introReady = questionReady;
            const sharedProps = {
              key: `${current.id}-${cardIndex}`,
              card: current, deck,
              onNext: handleNext, onPrev: handlePrev, onSkip: handleSkip, canSkip,
              isFirst: cardIndex === 0, isLast: cardIndex === shuffledCards.length - 1,
              onScore: handleScore, soundEnabled, autoAdvance,
              note: notesByCardId[current.id] || null,
              cardIndex, total: shuffledCards.length,
              sessionStartTime, correctStreak, bestStreak, pastSessions,
              masteredCount: cardStats.filter((s) => s.mastered).length,
              totalCards: activeCards.length,
              cardStats: cardStats.find((s) => s.card_id === current.id) || null,
              eliminateAllowed,
              secondGuessAllowed,
              learningMode,
              isBookmarked: !!current.bookmarked,
              onToggleBookmark: handleToggleBookmark,
              onFirstWrong: handleFirstWrong,
              onShowLearnMore: handleShowLearnMore,
              introReady,
              maxChoices,
              characterIdle
            };

            const childVariant = {
              hidden: { opacity: 0, y: 14 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } }
            };
            const containerVariant = {
              hidden: {},
              visible: { transition: { staggerChildren: INTRO_STAGGER_MS } }
            };

            return (
              <motion.div
                className="relative bg-card border border-border rounded-lg p-4 mt-4"
                variants={containerVariant}
                initial="hidden"
                animate="visible">
                  
                  {RestartWarningOverlay}
                  {useHorizontal ?
                <StudyCardHorizontal {...sharedProps} handedness={handedness} childVariant={childVariant} /> :
                <StudyCard {...sharedProps} hintsAllowed={hintsAllowed} childVariant={childVariant} />
                }
                </motion.div>);

          })()}
          </motion.div>
        }
      </AnimatePresence>


    </div>);

}