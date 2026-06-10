import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, RotateCcw, ChevronLeft, ChevronRight, BarChart2, Brain, Volume2, VolumeX, Info, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudyCard from '@/components/cards/StudyCard';
import StudyCardHorizontal from '@/components/cards/StudyCardHorizontal';
import ContactSheet from '@/components/cards/ContactSheet';
import ProgressGameBand from '@/components/cards/ProgressGameBand';
import { cn } from '@/lib/utils';

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

export default function StudySession() {
  const { deckId } = useParams();
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('flashdeck_sound') !== '0');
  const [autoAdvance, setAutoAdvance] = useState(() => localStorage.getItem('flashdeck_autoadvance') === '1');
  const [hintsAllowed, setHintsAllowed] = useState(() => localStorage.getItem('flashdeck_hints') !== '0');
  const [eliminateAllowed, setEliminateAllowed] = useState(() => localStorage.getItem('flashdeck_eliminate') !== '0');
  const [cardIndex, setCardIndex] = useState(0);
  const [shuffledCards, setShuffledCards] = useState([]);
  const [done, setDone] = useState(false);
  const [scores, setScores] = useState([]);
  const [firstWrongChoices, setFirstWrongChoices] = useState([]);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  // 'all' | 'unmastered'
  const [filterMode, setFilterMode] = useState('all');
  const [filterChosen, setFilterChosen] = useState(false);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  // Layout defaults: seeded from user profile, then overrideable per-session
  const [layoutMode, setLayoutMode] = useState(() => localStorage.getItem('flashdeck_layout') || 'auto');
  const [handedness, setHandedness] = useState(() => localStorage.getItem('flashdeck_handedness') || 'left');
  const [isWide, setIsWide] = useState(() => window.innerWidth >= 900);
  const SCENE_FLOOR_H = 75; // px of sky+ground the scene gets BELOW the header line
  const [savingDefaults, setSavingDefaults] = useState(false);

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { data: deck } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => base44.entities.Deck.filter({ id: deckId }).then((r) => r[0]),
    enabled: !!deckId
  });

  const { data: allCards = [], isLoading, refetch: refetchCards } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => base44.entities.Card.filter({ deck_id: deckId }, 'order'),
    enabled: !!deckId
  });

  const activeCards = allCards.filter((c) => !c.deleted);

  const { data: currentUser, refetch: refetchMe } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me()
  });

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

  const { data: pastSessions = [] } = useQuery({
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

  // Compute all-time best consecutive correct streak across all past sessions
  const allTimeBest = pastSessions.reduce((best, session) => {
    const results = session.card_results || [];
    let cur = 0;
    let sessionBest = 0;
    for (const r of results) {
      if (CORRECT_KEYS.has(r.key)) {cur++;sessionBest = Math.max(sessionBest, cur);} else
      cur = 0;
    }
    return Math.max(best, sessionBest);
  }, 0);

  const masteredCardIds = new Set(cardStats.filter((s) => s.mastered).map((s) => s.card_id));
  const unmasteredCards = activeCards.filter((c) => !masteredCardIds.has(c.id));
  const allMastered = unmasteredCards.length === 0 && activeCards.length > 0;
  const bookmarkedCards = activeCards.filter((c) => c.bookmarked);

  const handleToggleBookmark = async (cardId, newVal) => {
    await base44.entities.Card.update(cardId, { bookmarked: newVal });
    refetchCards();
  };

  const startSession = (mode) => {
    const pool = mode === 'unmastered' ? unmasteredCards : mode === 'bookmarked' ? bookmarkedCards : activeCards;
    setShuffledCards(shuffle(pool));
    setCardIndex(0);
    setDone(false);
    setScores([]);
    setFirstWrongChoices([]);
    setFilterMode(mode);
    setFilterChosen(true);
    setCorrectStreak(0);
    setBestStreak(0);
    setSessionStartTime(new Date());
    sessionSaved.current = false;
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
        correct_answer: card.correct_answer,
        image_url: card.image_url || '',
        points: scores[i]?.points ?? 0,
        key: scores[i]?.key ?? 'skipped',
        first_wrong: firstWrongChoices[i] ?? null
      }));

      const total = cardResults.reduce((s, r) => s + r.points, 0);
      const max = shuffledCards.length;

      // Save study session
      await base44.entities.StudySession.create({
        deck_id: deckId,
        score_pct: max > 0 ? total / max * 100 : 0,
        total_points: total,
        max_points: max,
        card_results: cardResults
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
        } else if (last === yesterday) {newStreak = streak.current_streak + 1;} else {newStreak = 1;
        }
        const newLongest = Math.max(streak.longest_streak || 0, newStreak);
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

        if (existing) {
          await base44.entities.UserCardStats.update(existing.id, {
            correct_attempts: newCorrect,
            total_attempts: newTotal,
            sessions_completed: newSessions,
            mastered: nowMastered,
            last_studied_date: new Date().toISOString()
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
            last_studied_date: new Date().toISOString()
          });
        }
      }

      refetchStats();
    };

    saveStats();
  }, [done]);

  const restart = () => {
    setFilterChosen(false);
    setDone(false);
    setShuffledCards([]);
    setScores([]);
    setFirstWrongChoices([]);
    sessionSaved.current = false;
  };

  const handleNext = () => {
    if (cardIndex < shuffledCards.length - 1) setCardIndex((i) => i + 1);else
    setDone(true);
  };
  const handlePrev = () => {if (cardIndex > 0) setCardIndex((i) => i - 1);};

  const handleFirstWrong = (choice, meta) => {
    setFirstWrongChoices((prev) => {
      const next = [...prev];
      next[cardIndex] = choice;
      return next;
    });
    // meta.retry reserved for the progress-game flinch animation; not used yet
  };

  const handleScore = (points, key) => {
    setScores((prev) => {
      const next = [...prev];
      next[cardIndex] = { points, key };
      return next;
    });
    const wasCorrect = CORRECT_KEYS.has(key);
    setCorrectStreak((prev) => {
      const next = wasCorrect ? prev + 1 : 0;
      if (wasCorrect) setBestStreak((b) => Math.max(b, next));
      return next;
    });
  };

  if (isLoading || !activeCards.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>);

  }

  const totalPoints = scores.reduce((s, r) => s + (r?.points || 0), 0);
  const maxPoints = shuffledCards.length;
  const pct = maxPoints > 0 ? Math.round(totalPoints / maxPoints * 100) : 0;
  const current = shuffledCards[cardIndex];

  // Filter selection screen
  if (!filterChosen) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Link to={`/deck/${deckId}`} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="font-semibold">{deck?.title}</h1>
            <p className="text-xs text-muted-foreground">{activeCards.length} cards total</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6 py-8">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
            <Brain className="w-7 h-7 text-accent-foreground" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold">What would you like to study?</h2>
            <p className="text-muted-foreground text-sm mt-1">
              {masteredCardIds.size} of {activeCards.length} cards mastered
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-sm">
            <button
              onClick={() => startSession('all')}
              className="w-full border-2 border-border hover:border-primary p-4 text-left transition-all hover:bg-accent/40 rounded-[4px]">
              
              <div className="font-semibold" style={{ fontSize: '18px' }}>All cards</div>
              <div className="text-sm text-muted-foreground mt-0.5">{activeCards.length} cards</div>
            </button>

            <button
              onClick={() => startSession('unmastered')}
              disabled={allMastered}
              className={cn(
                'w-full border-2 rounded-[4px] p-4 text-left transition-all',
                allMastered ?
                'border-border opacity-50 cursor-not-allowed' :
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
              onClick={() => startSession('bookmarked')}
              disabled={bookmarkedCards.length === 0}
              className={cn(
                'w-full border-2 rounded-[4px] p-4 text-left transition-all',
                bookmarkedCards.length === 0 ?
                'border-border opacity-50 cursor-not-allowed' :
                'border-border hover:border-primary hover:bg-accent/40'
              )}>
              
              <div className="font-semibold flex items-center gap-2" style={{ fontSize: '18px' }}>
                Bookmarked only
                {bookmarkedCards.length > 0 &&
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                    {bookmarkedCards.length} card{bookmarkedCards.length !== 1 ? 's' : ''}
                  </span>
                }
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {bookmarkedCards.length === 0 ? 'No bookmarked cards yet' : 'Study only your bookmarked cards'}
              </div>
            </button>

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

            {/* Hints toggle */}
            <div className="flex items-center justify-between px-1 pt-1">
              <div>
                <p className="text-sm font-medium">Allow hints</p>
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

            {/* Divider */}
            <div className="border-t border-border pt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">Layout Preferences</p>
            </div>

            {/* Layout mode */}
            <div className="flex items-center justify-between px-1">
              <div>
                <p className="text-sm font-medium">Card layout</p>
                <p className="text-xs text-muted-foreground">How cards are displayed during study</p>
              </div>
              <div className="flex gap-1 ml-4">
                {['auto', 'vertical', 'horizontal'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setLayoutMode(mode);
                      localStorage.setItem('flashdeck_layout', mode);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                      layoutMode === mode ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Handedness */}
            <div className="flex items-center justify-between px-1 pt-1">
              <div>
                <p className="text-sm font-medium">Image position</p>
                <p className="text-xs text-muted-foreground">Which side the image appears on (horizontal layout only)</p>
              </div>
              <div className="flex gap-1 ml-4">
                {[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => {
                      setHandedness(value);
                      localStorage.setItem('flashdeck_handedness', value);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                      handedness === value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
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
                disabled={savingDefaults}
              >
                {savingDefaults ? 'Saving…' : 'Save as my default'}
              </button>
            </div>
          </div>
        </div>
      </div>);

  }

  const useHorizontal = layoutMode === 'horizontal' || layoutMode === 'auto' && isWide;

  return (
    <div className={cn('mx-auto px-4 py-8 min-h-screen bg-background', useHorizontal ? 'max-w-7xl' : 'max-w-6xl')}>
      {/* Stage: header controls + game scene share one positioned parent so the scene sits behind the controls */}
      <div className="relative mb-1">
        {/* Background scene — only during active study */}
        {!done && filterChosen && (
          <ProgressGameBand
            cardIndex={cardIndex}
            total={shuffledCards.length}
            scores={scores}
            correctStreak={correctStreak}
            deckTitle={deck?.title}
          />
        )}

        {/* Controls layer — paints on top of the scene */}
        <div className="relative z-10 flex items-center gap-3 px-3 py-2">
          <Link
            to={`/deck/${deckId}`}
            className="pixel-ui text-muted-foreground hover:text-foreground transition-colors"
            style={{ fontSize: 9, padding: '6px 10px' }}
            title="Back to deck"
          >
            QUIT
          </Link>
          <div className="flex-1">
            <h1 className="pixel-ui" style={{ fontSize: 11 }}>{deck?.title}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {filterMode === 'unmastered' && <span className="text-amber-600">Unmastered only</span>}
              {filterMode === 'bookmarked' && <span className="text-amber-600">Bookmarked only</span>}
            </p>
          </div>
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              localStorage.setItem('flashdeck_sound', next ? '1' : '0');
            }}
            title={soundEnabled ? 'Sound on' : 'Sound off'}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            {soundEnabled ? <Volume2 className="w-4 h-4 shrink-0" /> : <VolumeX className="w-4 h-4 shrink-0" />}
            <span className="pixel-ui" style={{ fontSize: 9 }}>{soundEnabled ? 'SOUND ON' : 'MUTED'}</span>
          </button>

          <button
            onClick={restart}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span className="pixel-ui" style={{ fontSize: 9 }}>RESTART</span>
          </button>
        </div>

        {/* Floor space: extends the stage downward so the absolute scene has room for sky + ground below the controls */}
        {!done && filterChosen && <div aria-hidden style={{ height: SCENE_FLOOR_H }} />}
      </div>

      {done ?
      <div className="flex flex-col items-center py-10 gap-6 mt-6">
          <div className="text-5xl">🎉</div>
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">Deck complete!</h2>
            <p className="text-muted-foreground text-sm">
              Score: <span className="font-semibold text-foreground">{totalPoints.toFixed(2)} / {maxPoints}</span>
              <span className="ml-2 text-xs">({pct}%)</span>
            </p>
            {(streak?.current_streak || 0) > 0 &&
          <p className={cn(
            'text-sm font-semibold mt-1',
            (streak.current_streak || 0) >= 30 ? 'text-purple-500' :
            (streak.current_streak || 0) >= 14 ? 'text-red-500' :
            (streak.current_streak || 0) >= 7 ? 'text-orange-500' :
            'text-amber-500'
          )}>
                🔥 {streak.current_streak}-day streak!
                {streak.current_streak === streak.longest_streak && streak.current_streak >= 3 && ' (personal best)'}
              </p>
          }
          </div>

          {/* Per-card breakdown */}
          <div className="w-full bg-card border border-border rounded-xl overflow-hidden">
            {shuffledCards.map((card, i) => {
            const result = scores[i];
            const info = result ? SCORE_LABELS[result.key] : { label: 'Skipped', color: 'text-muted-foreground' };
            const stat = cardStats.find((s) => s.card_id === card.id);
            return (
              <div key={card.id} className={cn('flex items-center justify-between px-4 py-2.5 text-sm', i > 0 && 'border-t border-border')}>
                  <div className="flex items-center gap-3 min-w-0">
                    {card.image_url && <img src={card.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                    <span className="truncate font-medium">{card.correct_answer}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {stat?.mastered && <span className="text-xs bg-success/10 text-success px-1.5 py-0.5 rounded font-medium">Mastered</span>}
                    <span className={cn('text-xs font-medium', info.color)}>{info.label}</span>
                    <span className="text-xs text-muted-foreground w-8 text-right">{result ? result.points.toFixed(2) : '—'}</span>
                  </div>
                </div>);

          })}
          </div>

          <div className="flex gap-2">
            <Link to={`/stats/${deckId}`}>
              <Button variant="outline" className="gap-1.5"><BarChart2 className="w-4 h-4" /> View Stats</Button>
            </Link>
            <Button onClick={restart} className="gap-1.5"><RotateCcw className="w-4 h-4" /> Study Again</Button>
          </div>

          {/* Historical stats */}
          {pastSessions.length > 0 && (() => {
          const allScores = pastSessions.map((s) => s.score_pct);
          const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
          const best = Math.max(...allScores);
          const masteredCount = cardStats.filter((s) => s.mastered).length;
          const stillLearning = activeCards.length - masteredCount;

          return (
            <div className="w-full space-y-4 pt-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">All-time Stats</h3>

                {/* Summary row */}
                <div className="grid grid-cols-3 gap-3 w-full">
                  <div className="bg-card border border-border rounded-xl p-3 flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Sessions</span>
                    <span className="text-xl font-bold">{pastSessions.length}</span>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-3 flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Avg Score</span>
                    <span className="text-xl font-bold">{Math.round(avg)}%</span>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-3 flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Trophy className="w-3 h-3 text-amber-500" /> Best</span>
                    <span className="text-xl font-bold text-success">{Math.round(best)}%</span>
                  </div>
                </div>

                {/* Mastery overview */}
                {cardStats.length > 0 &&
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Trophy className="w-4 h-4 text-amber-500" /> Mastery
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                    className="bg-success h-2 rounded-full transition-all duration-700"
                    style={{ width: `${activeCards.length > 0 ? masteredCount / activeCards.length * 100 : 0}%` }} />
                  
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-success font-medium">✓ {masteredCount} mastered</span>
                      <span className="text-muted-foreground">{stillLearning} still learning</span>
                    </div>
                  </div>
              }

                {/* Recent session history */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Recent Sessions
                  </div>
                  {[...pastSessions].slice(0, 6).map((s, i) =>
                <div key={s.id} className={cn('flex items-center justify-between px-4 py-2.5 text-sm', i > 0 && 'border-t border-border')}>
                      <span className="text-muted-foreground text-xs">
                        {new Date(s.created_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                        className={cn('h-1.5 rounded-full', s.score_pct >= 75 ? 'bg-success' : s.score_pct >= 50 ? 'bg-amber-400' : 'bg-destructive')}
                        style={{ width: `${s.score_pct}%` }} />
                      
                        </div>
                        <span className="font-semibold w-10 text-right">{Math.round(s.score_pct)}%</span>
                      </div>
                    </div>
                )}
                </div>
              </div>);

        })()}
        </div> :
      contactSheetOpen ?
      <div className="mt-4"><ContactSheet
        cards={shuffledCards}
        scores={scores}
        cardIndex={cardIndex}
        onJump={(i) => {setCardIndex(i);setContactSheetOpen(false);}} /></div> :

      (() => {
        const useHorizontal = layoutMode === 'horizontal' || layoutMode === 'auto' && isWide;
        const sharedProps = {
          key: `${current.id}-${cardIndex}`,
          card: current, deck,
          onNext: handleNext, onPrev: handlePrev,
          isFirst: cardIndex === 0, isLast: cardIndex === shuffledCards.length - 1,
          onScore: handleScore, soundEnabled, autoAdvance,
          note: notesByCardId[current.id] || null,
          cardIndex, total: shuffledCards.length,
          sessionStartTime, correctStreak, bestStreak, pastSessions,
          masteredCount: cardStats.filter((s) => s.mastered).length,
          totalCards: activeCards.length,
          cardStats: cardStats.find((s) => s.card_id === current.id) || null,
          eliminateAllowed,
          isBookmarked: !!current.bookmarked,
          onToggleBookmark: handleToggleBookmark,
          onFirstWrong: handleFirstWrong
        };

        return useHorizontal ?
        <div className="bg-card border border-border rounded-lg p-4 mt-4">
          <StudyCardHorizontal {...sharedProps} handedness={handedness} />
        </div> :

        <div className="bg-card border border-border rounded-lg p-4 mt-4">
            <div className="flex gap-4 items-start">
              <div className="flex-1 min-w-0">
                <StudyCard {...sharedProps} hintsAllowed={hintsAllowed} />
                {/* Nav arrows */}
                <div className="flex justify-center gap-3 mt-5">
                  <Button variant="ghost" size="icon" onClick={handlePrev} disabled={cardIndex === 0}>
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleNext} disabled={cardIndex === shuffledCards.length - 1}>
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>;

      })()}

    </div>);

}