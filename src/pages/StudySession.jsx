import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, RotateCcw, ChevronLeft, ChevronRight, BarChart2, Volume2, VolumeX, Info, Trophy, PlayCircle, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cardLabel } from '@/lib/utils';
import StudyCard from '@/components/cards/StudyCard';
import StudyCardHorizontal from '@/components/cards/StudyCardHorizontal';
import ContactSheet from '@/components/cards/ContactSheet';
import ProgressGameBand from '@/components/cards/ProgressGameBand';
import HeartsHud from '@/components/cards/HeartsHud';
import { getSkin, DEFAULT_SKIN_ID, canZombify } from '@/components/cards/skins';
import SessionStatsPanel from '@/components/cards/SessionStatsPanel';
import StreakCounter from '@/components/cards/StreakCounter';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useSavedSession } from '@/hooks/useSavedSession';
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

function MasteryTooltip({ minSessions, masteryPct }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {e.stopPropagation();setOpen((v) => !v);}}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="p-0.5 rounded focus:outline-none">
        
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
    </div>
  );
}

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
  const [done, setDone] = useState(false);
  const [scores, setScores] = useState([]);
  const [firstWrongChoices, setFirstWrongChoices] = useState([]);
  const [answerTimes, setAnswerTimes] = useState([]);  // ms per card, parallel to scores
  const [correctStreak, setCorrectStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  // 'all' | 'unmastered'
  const [filterMode, setFilterMode] = useState('all');
  const [filterChosen, setFilterChosen] = useState(false);
  const [selectedPool, setSelectedPool] = useState(null); // 'all' | 'unmastered' | 'bookmarked' | null
  const [gameModeWanted, setGameModeWanted] = useState(() => localStorage.getItem('flashdeck_gamemode') === '1');
  const [gameMode, setGameMode] = useState(false); // engaged for the running session only
  const [skipsUsed, setSkipsUsed] = useState(0);   // deferrals used this session (display only)
  const [hearts, setHearts] = useState(3);         // Game Mode hearts remaining (0..MAX_HEARTS)
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  // Layout defaults: seeded from user profile, then overrideable per-session
  const [layoutMode, setLayoutMode] = useState(() => localStorage.getItem('flashdeck_layout') || 'auto');
  const [handedness, setHandedness] = useState(() => localStorage.getItem('flashdeck_handedness') || 'left');
  const [isWide, setIsWide] = useState(() => window.innerWidth >= 900);
  const SCENE_FLOOR_H = 165; // px of sky+ground the scene gets BELOW the header line
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [introPhase, setIntroPhase] = useState('intro'); // 'intro' | 'ready'
  const [wrongTick, setWrongTick] = useState(0); // increments each time a wrong answer is picked
  const [showExitWarning, setShowExitWarning] = useState(false);
  const pendingExitRef = useRef(null); // stores the path to navigate to after exit decision
  const { playLevelStart } = useSound(soundEnabled);
  const [questionReady, setQuestionReady] = useState(false);
  const levelStartTimerRef = useRef(null);
  // Timing capture — per-card answer time + session origin (preserved across resume)
  const cardShownAtRef = useRef(null);                  // when the current card became interactive
  const sessionStartedAtRef = useRef(null);             // ISO string of the original session start
  // Play the level-start fanfare and hold the first question inactive for 3s so the track can finish
  const beginIntro = () => {
    setQuestionReady(false);
    playLevelStart();
    clearTimeout(levelStartTimerRef.current);
    levelStartTimerRef.current = setTimeout(() => setQuestionReady(true), 3000);
  };

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => () => clearTimeout(levelStartTimerRef.current), []);

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
    if (currentUser.default_layout_mode) setLayoutMode(currentUser.default_layout_mode);
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
  const allMastered = unmasteredCards.length === 0 && activeCards.length > 0;
  const bookmarkedCards = activeCards.filter((c) => c.bookmarked);

  // Game Mode gate — evaluated against the SELECTED pool, engaged at start time.
  const GAME_MODE_MIN_CARDS = 20;
  const MAX_HEARTS = 3;
  const poolFor = (mode) =>
    mode === 'unmastered' ? unmasteredCards : mode === 'bookmarked' ? bookmarkedCards : activeCards;
  const selectedQualifies =
    selectedPool != null &&
    poolFor(selectedPool).length >= GAME_MODE_MIN_CARDS &&
    canZombify(getSkin(DEFAULT_SKIN_ID));

  const handleToggleBookmark = async (cardId, newVal) => {
    await base44.entities.Card.update(cardId, { bookmarked: newVal });
    refetchCards();
  };

  const startSession = (mode) => {
    clearSession(); // discard any saved session on fresh start
    beginIntro();
    const pool = poolFor(mode);
    setGameMode(gameModeWanted && pool.length >= GAME_MODE_MIN_CARDS && canZombify(getSkin(DEFAULT_SKIN_ID)));
    setShuffledCards(shuffle(pool));
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
    setSkipsUsed(0);    // defer count isn't persisted yet (later stage)
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
        best_streak: bestStreak
      });

      // Update streak
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      let newStreak = 1;
      if (streak) {
        const last = streak.last_study_date;
        newStreak = streak.current_streak;
        if (last === today) {





          // already studied today, no change
        } else if (last === yesterday) {newStreak = streak.current_streak + 1;} else {newStreak = 1;}const newLongest = Math.max(streak.longest_streak || 0, newStreak);
        const newMilestone = [3, 7, 14, 30, 60, 100].filter((m) => newStreak >= m).pop() || 0;
        await base44.entities.Streak.update(streak.id, {
          current_streak: newStreak,
          longest_streak: newLongest,
          last_study_date: today,
          milestone_reached: Math.max(streak.milestone_reached || 0, newMilestone)
        });
      } else if (currentUser?.id) {
        await base44.entities.Streak.create({
          user_id: currentUser.id,
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
        const newFastest = answerMs != null
          ? Math.min(existing?.fastest_answer_ms ?? Infinity, answerMs)
          : (existing?.fastest_answer_ms ?? null);
        const nowIso = new Date().toISOString();

        // Mastery-moment snapshot: only on the FIRST flip to true, never overwritten.
        const firstMastery = nowMastered && !existing?.mastered_at && !(existing?.mastered);
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
          setHearts((h) => (h > 0 ? Math.min(MAX_HEARTS, h + 1) : h)); // death is permanent
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
      </div>
    );
  }

  if (deckError || cardsError) {
    return (
      <SessionNotice
        title="Couldn't load this deck"
        body="Something went wrong fetching this deck. Try again, or head back and pick another."
        deckId={deckId}
        onRetry={() => refetchCards()} />
    );
  }

  if (!deck) {
    return (
      <SessionNotice
        title="Deck not found"
        body="This deck doesn't exist, or it isn't visible to your account." />
    );
  }

  if (!activeCards.length) {
    const isOwner = !!currentUser?.email && deck.created_by === currentUser.email;
    return (
      <SessionNotice
        title={isOwner ? 'This deck has no cards yet' : 'No cards available'}
        body={isOwner ?
          "Add some cards to this deck and it'll be ready to study." :
          "This deck has no cards you can view. If you expected to see cards here, your account may not have access to them."}
        deckId={deckId} />
    );
  }

  const totalPoints = scores.reduce((s, r) => s + (r?.points || 0), 0);
  const maxPoints = shuffledCards.reduce((s, c) => s + (c.point_value ?? 20), 0);
  const pct = maxPoints > 0 ? Math.round(totalPoints / maxPoints * 100) : 0;
  const highScore = pastSessions.length > 0 ?
  Math.max(...pastSessions.map((s) => s.total_points || 0)) :
  0;

  const current = shuffledCards[cardIndex];

  // Filter selection screen
  if (!filterChosen) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate(`/deck/${deckId}`)} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold">{deck?.title}</h1>
            <p className="text-xs text-muted-foreground">{activeCards.length} cards total</p>
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

        <div className="flex flex-col gap-8 py-8 lg:flex-row lg:items-start lg:gap-16">
          {/* Left: study mode selection */}
          <div className="flex-1 flex flex-col items-center gap-6">
          <div className="text-center">
            <h2 className="text-xl font-bold">What would you like to study?</h2>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-sm">
            <button
              onClick={() => setSelectedPool('all')}
              className={cn(
                'w-full border-2 rounded-[4px] p-4 text-left transition-all',
                selectedPool === 'all'
                  ? 'border-primary bg-accent/40'
                  : 'border-border hover:border-primary hover:bg-accent/40'
              )}>
              
              <div className="font-semibold" style={{ fontSize: '18px' }}>All cards</div>
              <div className="text-sm text-muted-foreground mt-0.5">{activeCards.length} cards</div>
            </button>

            <button
              onClick={() => setSelectedPool('unmastered')}
              disabled={allMastered}
              className={cn(
                'w-full border-2 rounded-[4px] p-4 text-left transition-all',
                allMastered ?
                'border-border opacity-50 cursor-not-allowed' :
                selectedPool === 'unmastered' ?
                'border-primary bg-accent/40' :
                'border-border hover:border-primary hover:bg-accent/40'
              )}>
              
              <div className="font-semibold flex items-center gap-2" style={{ fontSize: '18px' }}>
                Unmastered only
                {unmasteredCards.length < activeCards.length &&
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                    {unmasteredCards.length} remaining
                  </span>
                }
              </div>
              <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                {allMastered ?
                '🎉 All cards mastered!' :

                <>
                     {unmasteredCards.length} card{unmasteredCards.length !== 1 ? 's' : ''} not yet mastered
                     <MasteryTooltip minSessions={deck?.mastery_min_sessions ?? 3} masteryPct={deck?.mastery_pct ?? 90} />
                   </>
                }
              </div>
            </button>

            <button
              onClick={() => setSelectedPool('bookmarked')}
              disabled={bookmarkedCards.length < 10}
              className={cn(
                'w-full border-2 rounded-[4px] p-4 text-left transition-all',
                bookmarkedCards.length < 10 ?
                'border-border opacity-50 cursor-not-allowed' :
                selectedPool === 'bookmarked' ?
                'border-primary bg-accent/40' :
                'border-border hover:border-primary hover:bg-accent/40'
              )}>
              
              <div className="font-semibold flex items-center gap-2" style={{ fontSize: '18px' }}>
                Bookmarked only
                {bookmarkedCards.length >= 10 &&
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                    {bookmarkedCards.length} card{bookmarkedCards.length !== 1 ? 's' : ''}
                  </span>
                }
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {bookmarkedCards.length === 0
                  ? 'No bookmarked cards yet'
                  : bookmarkedCards.length < 10
                    ? `Need 10 bookmarked cards (${bookmarkedCards.length} so far)`
                    : 'Study only your bookmarked cards'}
              </div>
            </button>

            {/* Learning mode toggle */}
            <div className="flex items-center justify-between px-1 pt-2">
              <div>
                <p className="text-sm font-medium">Learning mode</p>
                <p className="text-xs text-muted-foreground">
                  Auto-show explanation when you answer incorrectly
                  {!hasCompletedFullSession && <span className="ml-1 text-amber-600 font-medium">(auto-on until first full session)</span>}
                </p>
              </div>
              <button
                onClick={() => setLearningModeOverride(!learningMode)}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ml-4',
                  learningMode ? 'bg-primary' : 'bg-muted'
                )}>
                <span className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform',
                  learningMode ? 'translate-x-5' : 'translate-x-0'
                )} />
              </button>
            </div>

            {selectedQualifies &&
            <div className="flex items-center justify-between px-1 pt-2">
              <div>
                <p className="text-sm font-medium">Game Mode</p>
                <p className="text-xs text-muted-foreground">Three hearts on the line ({GAME_MODE_MIN_CARDS}+ cards)</p>
              </div>
              <button
                onClick={() => {
                  const next = !gameModeWanted;
                  setGameModeWanted(next);
                  localStorage.setItem('flashdeck_gamemode', next ? '1' : '0');
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ml-4',
                  gameModeWanted ? 'bg-primary' : 'bg-muted'
                )}>
                <span className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform',
                  gameModeWanted ? 'translate-x-5' : 'translate-x-0'
                )} />
              </button>
            </div>
            }

            <button
              onClick={() => selectedPool && startSession(selectedPool)}
              disabled={!selectedPool}
              className={cn(
                'w-full border-2 rounded-[4px] p-3 text-center font-semibold transition-all',
                selectedPool
                  ? 'border-primary bg-primary text-primary-foreground hover:opacity-90'
                  : 'border-border text-muted-foreground opacity-50 cursor-not-allowed'
              )}>
              Start session
            </button>
          </div>
          </div>

          {/* Right: session options & layout preferences */}
          <div className="flex-1 w-full">
          <div className="flex flex-col gap-3 w-full max-w-sm lg:max-w-md">

            {/* Helper Settings group */}
            <div className="border-t border-border pt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Helpers</p>
            </div>

            {/* Allow 2nd guesses toggle */}
            <div className="flex items-center justify-between px-1 pt-1">
              <div>
                <p className="text-sm font-medium">Allow 2nd guesses</p>
                <p className="text-xs text-muted-foreground">Let a wrong first pick be retried once</p>
              </div>
              <button
                onClick={() => {
                  const next = !secondGuessAllowed;
                  setSecondGuessAllowed(next);
                  localStorage.setItem('flashdeck_secondguess', next ? '1' : '0');
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ml-4',
                  secondGuessAllowed ? 'bg-primary' : 'bg-muted'
                )}>
                
                <span className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform',
                  secondGuessAllowed ? 'translate-x-5' : 'translate-x-0'
                )} />
              </button>
            </div>

            {/* Hints toggle */}
            <div className="flex items-center justify-between px-1 pt-1">
              <div>
                <p className="text-sm font-medium">Allow notes</p>
                <p className="text-xs text-muted-foreground">Show the clue toggle on each card</p>
              </div>
              <button
                onClick={() => {
                  const next = !hintsAllowed;
                  setHintsAllowed(next);
                  localStorage.setItem('flashdeck_hints', next ? '1' : '0');
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ml-4',
                  hintsAllowed ? 'bg-primary' : 'bg-muted'
                )}>
                
                <span className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform',
                  hintsAllowed ? 'translate-x-5' : 'translate-x-0'
                )} />
              </button>
            </div>

            {/* Eliminate toggle */}
            <div className="flex items-center justify-between px-1 pt-1">
              <div>
                <p className="text-sm font-medium">Allow eliminate one</p>
                <p className="text-xs text-muted-foreground">Let the sparkle button remove a wrong answer choice</p>
              </div>
              <button
                onClick={() => {
                  const next = !eliminateAllowed;
                  setEliminateAllowed(next);
                  localStorage.setItem('flashdeck_eliminate', next ? '1' : '0');
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ml-4',
                  eliminateAllowed ? 'bg-primary' : 'bg-muted'
                )}>
                <span className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform',
                  eliminateAllowed ? 'translate-x-5' : 'translate-x-0'
                )} />
              </button>
            </div>

            {/* UI Preferences group */}
            <div className="border-t border-border pt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">UI Settings</p>
            </div>

            {/* Auto-advance toggle */}
            <div className="flex items-center justify-between px-1 pt-1">
              <div>
                <p className="text-sm font-medium">Auto-advance</p>
                <p className="text-xs text-muted-foreground">Move to next card automatically after a correct answer</p>
              </div>
              <button
                onClick={() => {
                  const next = !autoAdvance;
                  setAutoAdvance(next);
                  localStorage.setItem('flashdeck_autoadvance', next ? '1' : '0');
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ml-4',
                  autoAdvance ? 'bg-primary' : 'bg-muted'
                )}>
                
                <span className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform',
                  autoAdvance ? 'translate-x-5' : 'translate-x-0'
                )} />
              </button>
            </div>

            {/* Layout mode */}
            <div className="flex items-center justify-between px-1">
              <div>
                <p className="text-sm font-medium">Card layout</p>
                <p className="text-xs text-muted-foreground">How cards are displayed during study</p>
              </div>
              <div className="flex gap-1 ml-4">
                {['auto', 'vertical', 'horizontal'].map((mode) =>
                <button
                  key={mode}
                  onClick={() => {
                    setLayoutMode(mode);
                    localStorage.setItem('flashdeck_layout', mode);
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                    layoutMode === mode ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
                  )}>
                  
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                )}
              </div>
            </div>

            {/* Handedness */}
            <div className="flex items-center justify-between px-1 pt-1">
              <div>
                <p className="text-sm font-medium">Image position</p>
                <p className="text-xs text-muted-foreground">Which side the image appears on (horizontal layout only)</p>
              </div>
              <div className="flex gap-1 ml-4">
                {[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }].map(({ value, label }) =>
                <button
                  key={value}
                  onClick={() => {
                    setHandedness(value);
                    localStorage.setItem('flashdeck_handedness', value);
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                    handedness === value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
                  )}>
                  
                    {label}
                  </button>
                )}
              </div>
            </div>

            {/* Save as default */}
            <div className="flex justify-end px-1 pt-1">
              <button
                onClick={async () => {
                  setSavingDefaults(true);
                  await base44.auth.updateMe({ default_layout_mode: layoutMode, default_handedness: handedness });
                  refetchMe();
                  setSavingDefaults(false);
                }}
                className="text-xs text-primary hover:underline disabled:opacity-50"
                disabled={savingDefaults}>
                
                {savingDefaults ? 'Saving…' : 'Save as my default'}
              </button>
            </div>
          </div>
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

  // ── Exit warning — inline overlay inside the game pane ───────────────────
  const ExitWarningOverlay = showExitWarning ?
  <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
      <div className="flex flex-col items-center gap-4 px-6 py-7 text-center max-w-xs">
        <img
        src="https://media.base44.com/images/public/69fd6153088222f7245f34d6/06551a213_Interface-Essential-Signin-Login--Streamline-Pixel.png"
        alt="Exit"
        style={{ width: 32, height: 32, imageRendering: 'pixelated' }} />
      
        <p className="text-foreground uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: 22, lineHeight: 1 }}>
          LEAVE SESSION?
        </p>
        <p className="text-muted-foreground uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: 16, lineHeight: 1.1 }}>
          {scores.filter(Boolean).length} / {shuffledCards.length} CARDS DONE.{'\n'}SAVE TO RESUME WITHIN 24H.
        </p>
        <div className="flex flex-col gap-2 w-full mt-1">
          <button
          onClick={handleExitSave}
          className="px-4 py-2 bg-primary text-primary-foreground border-2 border-primary hover:opacity-90 transition-opacity w-full uppercase"
          style={{ fontFamily: "'VT323', monospace", fontSize: 16 }}>
          
            SAVE &amp; EXIT
          </button>
          <button
          onClick={handleExitDiscard}
          className="px-4 py-2 border-2 border-destructive text-destructive hover:bg-destructive/10 transition-colors w-full uppercase"
          style={{ fontFamily: "'VT323', monospace", fontSize: 16 }}>
          
            DISCARD &amp; EXIT
          </button>
          <button
          onClick={() => setShowExitWarning(false)}
          className="px-4 py-2 border-2 border-border text-foreground hover:bg-muted transition-colors w-full uppercase"
          style={{ fontFamily: "'VT323', monospace", fontSize: 16 }}>
          
            KEEP GOING
          </button>
        </div>
      </div>
    </div> :
  null;

  const useHorizontal = layoutMode === 'horizontal' || layoutMode === 'auto' && isWide;

  return (
    <div className={cn('mx-auto px-4 py-8 min-h-screen bg-background', useHorizontal ? 'max-w-7xl' : 'max-w-6xl')}>
      {/* Stage: header controls + game scene share one positioned parent so the scene sits behind the controls */}
      <motion.div
        className="relative mb-1"
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
          onEntryComplete={() => setTimeout(() => setIntroPhase('ready'), 0)} />

        }

        {/* Controls layer — paints on top of the scene */}
        <div className="relative z-10 flex items-center gap-1 pt-1 pr-3 pb-3 pl-3">
          <button
            onClick={() => requestExit(`/deck/${deckId}`)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Quit">
            
            <img
              src="https://media.base44.com/images/public/69fd6153088222f7245f34d6/06551a213_Interface-Essential-Signin-Login--Streamline-Pixel.png"
              alt="Quit"
              style={{ width: 16, height: 16, imageRendering: 'pixelated' }} />
            
          </button>
          <div className="flex-1">
            <h1 style={{ fontFamily: "'VT323', monospace", fontSize: 26, lineHeight: 1 }}>{deck?.title}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {filterMode === 'unmastered' && <span className="text-amber-600">Unmastered only</span>}
              {filterMode === 'bookmarked' && <span className="text-amber-600">Bookmarked only</span>}
            </p>
          </div>
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
      </motion.div>

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div
            key="session-stats"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="relative bg-card border border-border rounded-lg p-4 mt-4">
            <SessionStatsPanel
              shuffledCards={shuffledCards} scores={scores} answerTimes={answerTimes}
              firstWrongChoices={firstWrongChoices} cardStats={cardStats}
              totalPoints={totalPoints} maxPoints={maxPoints} pct={pct}
              bestStreak={bestStreak} streak={streak}
              durationMs={completionDurationMs} skipsUsed={skipsUsed}
              deckId={deckId} onRestart={restart} onReviewMissed={reviewMissed}
              useHorizontal={useHorizontal} />
          </motion.div>
        ) : (
          <motion.div key="study-area" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {contactSheetOpen ?
            <div className="mt-4"><ContactSheet
                cards={shuffledCards}
                scores={scores}
                cardIndex={cardIndex}
                onJump={(i) => {setCardIndex(i);setContactSheetOpen(false);}} /></div> :

            (() => {
              const useHorizontal = layoutMode === 'horizontal' || layoutMode === 'auto' && isWide;
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
                introReady
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
                  {ExitWarningOverlay}
                  {useHorizontal ?
                  <StudyCardHorizontal {...sharedProps} handedness={handedness} childVariant={childVariant} /> :
                  <StudyCard {...sharedProps} hintsAllowed={hintsAllowed} childVariant={childVariant} />
                  }
                </motion.div>);

            })()}
          </motion.div>
        )}
      </AnimatePresence>


    </div>);

}