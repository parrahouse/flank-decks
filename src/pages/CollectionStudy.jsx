import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft } from 'lucide-react';
import StudyCard from '@/components/cards/StudyCard';
import StudyCardHorizontal from '@/components/cards/StudyCardHorizontal';
import SessionStatsPanel from '@/components/cards/SessionStatsPanel';
import ProgressGameBand from '@/components/cards/ProgressGameBand';
import HeartsHud from '@/components/cards/HeartsHud';
import StreakCounter from '@/components/cards/StreakCounter';
import CollectionStudySettings from '@/components/cards/CollectionStudySettings';
import { getSkin, DEFAULT_SKIN_ID, canZombify } from '@/components/cards/skins';
import { cardLabel } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useSound } from '@/hooks/useSound';

const CORRECT_KEYS = new Set(['correct', 'second_guess', 'correct_after_clue', 'second_guess_after_clue', 'partial']);
const SCENE_FLOOR_H = 165;
const INTRO_STAGGER_MS = 0.18;
const GAME_MODE_MIN_CARDS = 20;
const MAX_HEARTS = 3;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CollectionStudy() {
  const { collectionId } = useParams();
  const navigate = useNavigate();

  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('flashdeck_sound') !== '0');
  const [autoAdvance, setAutoAdvance] = useState(() => localStorage.getItem('flashdeck_autoadvance') === '1');
  const [eliminateAllowed, setEliminateAllowed] = useState(() => localStorage.getItem('flashdeck_eliminate') !== '0');
  const [secondGuessAllowed, setSecondGuessAllowed] = useState(() => localStorage.getItem('flashdeck_secondguess') !== '0');
  const [hintsAllowed, setHintsAllowed] = useState(() => localStorage.getItem('flashdeck_hints') !== '0');
  const [gameModeWanted, setGameModeWanted] = useState(() => localStorage.getItem('flashdeck_gamemode') === '1');
  const [gameMode, setGameMode] = useState(false);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [layoutMode] = useState(() => localStorage.getItem('flashdeck_layout') || 'auto');
  const [handedness] = useState(() => localStorage.getItem('flashdeck_handedness') || 'left');
  const [isWide, setIsWide] = useState(() => window.innerWidth >= 900);

  const [started, setStarted] = useState(false);
  const [shuffledCards, setShuffledCards] = useState([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [scores, setScores] = useState([]);
  const [firstWrongChoices, setFirstWrongChoices] = useState([]);
  const [answerTimes, setAnswerTimes] = useState([]);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [wrongTick, setWrongTick] = useState(0);
  const [introPhase, setIntroPhase] = useState('intro');
  const [questionReady, setQuestionReady] = useState(false);

  const cardShownAtRef = useRef(null);
  const levelStartTimerRef = useRef(null);
  const sessionSaved = useRef(false);

  const { playLevelStart } = useSound(soundEnabled);

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => () => clearTimeout(levelStartTimerRef.current), []);

  useEffect(() => {
    if (started && questionReady && !done) {
      cardShownAtRef.current = Date.now();
    }
  }, [cardIndex, questionReady, started, done, shuffledCards]);

  const { data: collection } = useQuery({
    queryKey: ['collection', collectionId],
    queryFn: () => base44.entities.Collection.filter({ id: collectionId }).then((r) => r[0]),
    enabled: !!collectionId,
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ['collection-decks', collectionId],
    queryFn: () => base44.entities.CollectionDeck.filter({ collection: collectionId }, 'sort_order'),
    enabled: !!collectionId,
  });

  const deckIds = useMemo(() => memberships.map((m) => m.deck), [memberships]);

  const { data: allCards = [], isLoading } = useQuery({
    queryKey: ['collection-cards', collectionId],
    queryFn: async () => {
      if (!deckIds.length) return [];
      const results = await Promise.all(deckIds.map((id) => base44.entities.Card.filter({ deck_id: id }, 'order')));
      return results.flat().filter((c) => !c.deleted);
    },
    enabled: deckIds.length > 0,
  });

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  const { data: cardStats = [] } = useQuery({
    queryKey: ['card-stats-collection', collectionId, currentUser?.id],
    queryFn: async () => {
      if (!deckIds.length) return [];
      const results = await Promise.all(deckIds.map((id) => base44.entities.UserCardStats.filter({ deck_id: id, user_id: currentUser.id })));
      return results.flat();
    },
    enabled: deckIds.length > 0 && !!currentUser?.id,
  });

  const { data: cardNotes = [] } = useQuery({
    queryKey: ['card-notes-session', collectionId, currentUser?.email],
    queryFn: () => base44.entities.CardNote.filter({ created_by: currentUser.email }),
    enabled: !!currentUser?.email,
  });

  const notesByCardId = Object.fromEntries(cardNotes.map((n) => [n.card_id, n.note]));

  const beginIntro = () => {
    setQuestionReady(false);
    playLevelStart();
    clearTimeout(levelStartTimerRef.current);
    levelStartTimerRef.current = setTimeout(() => setQuestionReady(true), 3000);
  };

  const startSession = () => {
    beginIntro();
    setShuffledCards(shuffle(allCards));
    setCardIndex(0);
    setDone(false);
    setScores([]);
    setFirstWrongChoices([]);
    setAnswerTimes([]);
    setCorrectStreak(0);
    setBestStreak(0);
    setSessionStartTime(new Date());
    sessionSaved.current = false;
    setIntroPhase('intro');
    setGameMode(gameModeWanted && allCards.length >= GAME_MODE_MIN_CARDS && canZombify(getSkin(DEFAULT_SKIN_ID)));
    setHearts(MAX_HEARTS);
    setStarted(true);
  };

  // Save stats when done
  useEffect(() => {
    if (!done || sessionSaved.current || !shuffledCards.length || !currentUser?.id) return;
    sessionSaved.current = true;

    const saveStats = async () => {
      // Group cards by deck and save a StudySession per deck
      const byDeck = {};
      shuffledCards.forEach((card, i) => {
        if (!byDeck[card.deck_id]) byDeck[card.deck_id] = [];
        byDeck[card.deck_id].push({ card, i });
      });

      const endedAt = new Date();
      const durationMs = sessionStartTime ? endedAt.getTime() - sessionStartTime.getTime() : null;

      for (const [deckId, items] of Object.entries(byDeck)) {
        const cardResults = items.map(({ card, i }) => ({
          card_id: card.id,
          correct_answer: cardLabel(card),
          image_url: card.image_url || '',
          points: scores[i]?.points ?? 0,
          key: scores[i]?.key ?? 'skipped',
          first_wrong: firstWrongChoices[i] ?? null,
          time_to_answer_ms: answerTimes[i] ?? null,
          question_type: card.question_type || 'multiple_choice',
          max_points: card.point_value ?? 20,
        }));

        const total = cardResults.reduce((s, r) => s + r.points, 0);
        const max = items.reduce((s, { card }) => s + (card.point_value ?? 20), 0);

        await base44.entities.StudySession.create({
          deck_id: deckId,
          score_pct: max > 0 ? (total / max) * 100 : 0,
          total_points: total,
          max_points: max,
          card_results: cardResults,
          started_at: sessionStartTime?.toISOString(),
          ended_at: endedAt.toISOString(),
          duration_ms: durationMs,
          filter_mode: 'collection',
          card_count: items.length,
          best_streak: bestStreak,
          game_mode: gameMode,
          hearts_remaining: gameMode ? hearts : null,
        });

        // Update UserCardStats
        for (const { card, i } of items) {
          const wasCorrect = CORRECT_KEYS.has(scores[i]?.key);
          const existing = cardStats.find((s) => s.card_id === card.id);
          const newCorrect = (existing?.correct_attempts ?? 0) + (wasCorrect ? 1 : 0);
          const newTotal = (existing?.total_attempts ?? 0) + 1;
          const newSessions = (existing?.sessions_completed ?? 0) + 1;
          const answerMs = answerTimes[i] ?? null;
          const newTotalTime = (existing?.total_time_ms ?? 0) + (answerMs ?? 0);
          const newFastest = answerMs != null ? Math.min(existing?.fastest_answer_ms ?? Infinity, answerMs) : (existing?.fastest_answer_ms ?? null);
          const nowIso = new Date().toISOString();

          if (existing) {
            await base44.entities.UserCardStats.update(existing.id, {
              correct_attempts: newCorrect,
              total_attempts: newTotal,
              sessions_completed: newSessions,
              last_studied_date: nowIso,
              total_time_ms: newTotalTime,
              ...(newFastest != null && { fastest_answer_ms: newFastest }),
            });
          } else {
            await base44.entities.UserCardStats.create({
              user_id: currentUser.id,
              deck_id: card.deck_id,
              card_id: card.id,
              correct_attempts: newCorrect,
              total_attempts: newTotal,
              sessions_completed: newSessions,
              last_studied_date: nowIso,
              first_studied_date: nowIso,
              total_time_ms: newTotalTime,
              ...(newFastest != null && { fastest_answer_ms: newFastest }),
            });
          }
        }
      }
    };

    saveStats();
  }, [done]);

  const handleNext = () => {
    if (cardIndex < shuffledCards.length - 1) setCardIndex((i) => i + 1);
    else setDone(true);
  };
  const handlePrev = () => { if (cardIndex > 0) setCardIndex((i) => i - 1); };

  const handleFirstWrong = (choice) => {
    setFirstWrongChoices((prev) => { const next = [...prev]; next[cardIndex] = choice; return next; });
    setWrongTick((n) => n + 1);
  };

  const handleScore = (points, key) => {
    const firstCommit = scores[cardIndex] == null;
    setAnswerTimes((prev) => {
      if (prev[cardIndex] != null) return prev;
      const next = [...prev];
      next[cardIndex] = cardShownAtRef.current ? Date.now() - cardShownAtRef.current : null;
      return next;
    });
    setScores((prev) => { const next = [...prev]; next[cardIndex] = { points, key }; return next; });
    if (firstCommit) {
      const streakWorthy = key === 'correct';
      setCorrectStreak((prev) => {
        const next = streakWorthy ? prev + 1 : 0;
        if (streakWorthy) setBestStreak((b) => Math.max(b, next));
        return next;
      });
      if (gameMode) {
        if (key === 'wrong') {
          setHearts((h) => Math.max(0, h - 1));
        } else if (key === 'correct' && (correctStreak + 1) % 5 === 0) {
          setHearts((h) => (h > 0 ? Math.min(MAX_HEARTS, h + 1) : h));
        }
      }
    }
  };

  const completionDurationMs = useMemo(() => {
    if (!done || !sessionStartTime) return null;
    return Date.now() - sessionStartTime.getTime();
  }, [done, sessionStartTime]);

  const totalPoints = scores.reduce((s, r) => s + (r?.points || 0), 0);
  const maxPoints = shuffledCards.reduce((s, c) => s + (c.point_value ?? 20), 0);
  const pct = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  const useHorizontal = layoutMode === 'horizontal' || (layoutMode === 'auto' && isWide);

  const loading = isLoading || memberships.length === 0;

  // Pre-start screen
  if (!started) {
    const gameModeAvailable = allCards.length >= GAME_MODE_MIN_CARDS && canZombify(getSkin(DEFAULT_SKIN_ID));
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate(`/collections/${collectionId}`)} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold">{collection?.name || 'Collection'}</h1>
            <p className="text-xs text-muted-foreground">{allCards.length} cards across {deckIds.length} deck{deckIds.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="flex flex-col gap-8 py-8 lg:flex-row lg:items-start lg:gap-16">
          <div className="flex-1 flex flex-col items-center gap-6 text-center">
            <div>
              <h2 className="text-xl font-bold">Study entire collection</h2>
              <p className="text-muted-foreground text-sm max-w-sm mt-1">
                All {allCards.length} cards from this collection will be shuffled together into one session.
              </p>
            </div>
            {loading ? (
              <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
            ) : allCards.length === 0 ? (
              <p className="text-destructive text-sm">No cards found in this collection.</p>
            ) : (
              <button
                onClick={startSession}
                className="border-2 border-primary bg-primary text-primary-foreground rounded-[4px] px-8 py-3 font-semibold hover:opacity-90 transition-opacity"
              >
                Start session
              </button>
            )}
          </div>

          <div className="flex-1 w-full">
            <CollectionStudySettings
              soundEnabled={soundEnabled}
              onSoundChange={(v) => { setSoundEnabled(v); localStorage.setItem('flashdeck_sound', v ? '1' : '0'); }}
              autoAdvance={autoAdvance}
              onAutoAdvanceChange={(v) => { setAutoAdvance(v); localStorage.setItem('flashdeck_autoadvance', v ? '1' : '0'); }}
              secondGuessAllowed={secondGuessAllowed}
              onSecondGuessChange={(v) => { setSecondGuessAllowed(v); localStorage.setItem('flashdeck_secondguess', v ? '1' : '0'); }}
              hintsAllowed={hintsAllowed}
              onHintsChange={(v) => { setHintsAllowed(v); localStorage.setItem('flashdeck_hints', v ? '1' : '0'); }}
              eliminateAllowed={eliminateAllowed}
              onEliminateChange={(v) => { setEliminateAllowed(v); localStorage.setItem('flashdeck_eliminate', v ? '1' : '0'); }}
              gameMode={gameModeWanted}
              onGameModeChange={(v) => { setGameModeWanted(v); localStorage.setItem('flashdeck_gamemode', v ? '1' : '0'); }}
              gameModeAvailable={gameModeAvailable}
            />
          </div>
        </div>
      </div>
    );
  }

  const current = shuffledCards[cardIndex];

  const containerVariant = { hidden: {}, visible: { transition: { staggerChildren: INTRO_STAGGER_MS } } };
  const childVariant = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } } };

  const sharedProps = {
    key: `${current?.id}-${cardIndex}`,
    card: current,
    deck: null,
    onNext: handleNext,
    onPrev: handlePrev,
    onSkip: null,
    canSkip: false,
    isFirst: cardIndex === 0,
    isLast: cardIndex === shuffledCards.length - 1,
    onScore: handleScore,
    soundEnabled,
    autoAdvance,
    note: notesByCardId[current?.id] || null,
    cardIndex,
    total: shuffledCards.length,
    sessionStartTime,
    correctStreak,
    bestStreak,
    pastSessions: [],
    masteredCount: cardStats.filter((s) => s.mastered).length,
    totalCards: allCards.length,
    cardStats: cardStats.find((s) => s.card_id === current?.id) || null,
    eliminateAllowed,
    secondGuessAllowed,
    hintsAllowed,
    learningMode: false,
    isBookmarked: !!current?.bookmarked,
    onToggleBookmark: async (cardId, newVal) => { await base44.entities.Card.update(cardId, { bookmarked: newVal }); },
    onFirstWrong: handleFirstWrong,
    introReady: questionReady,
  };

  return (
    <div className={cn('mx-auto px-4 py-8 min-h-screen bg-background', useHorizontal ? 'max-w-7xl' : 'max-w-6xl')}>
      <motion.div className="relative mb-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
        <ProgressGameBand
          zombified={gameMode && hearts === 0}
          cardIndex={cardIndex}
          total={shuffledCards.length}
          scores={scores}
          correctStreak={correctStreak}
          soundEnabled={soundEnabled}
          entering={introPhase === 'intro'}
          wrongTick={wrongTick}
          onEntryComplete={() => setTimeout(() => setIntroPhase('ready'), 0)}
        />

        <div className="relative z-10 flex items-center gap-1 pt-1 pr-3 pb-3 pl-3">
          <button onClick={() => navigate(`/collections/${collectionId}`)} className="text-muted-foreground hover:text-foreground transition-colors" title="Exit">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 style={{ fontFamily: "'VT323', monospace", fontSize: 26, lineHeight: 1 }}>{collection?.name}</h1>
          </div>
          {gameMode && <HeartsHud hearts={hearts} />}
          <div className="flex items-baseline gap-3 select-none px-1" style={{ fontFamily: "'VT323', monospace" }}>
            <span className="text-foreground uppercase" style={{ fontSize: 20, lineHeight: 1 }}>Score: {totalPoints.toFixed(2)}</span>
          </div>
          <StreakCounter streak={correctStreak} record={bestStreak} />
          <button
            onClick={() => { const next = !soundEnabled; setSoundEnabled(next); localStorage.setItem('flashdeck_sound', next ? '1' : '0'); }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors outline-none"
          >
            <img
              key={soundEnabled ? 'on' : 'off'}
              src={soundEnabled
                ? 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/55db65aba_Sound-On.gif'
                : 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/737afdac2_Sound-Off.gif'}
              alt={soundEnabled ? 'Sound on' : 'Sound off'}
              style={{ width: 24, height: 24, imageRendering: 'pixelated' }}
            />
          </button>
        </div>

        <div aria-hidden style={{ height: SCENE_FLOOR_H }} />
      </motion.div>

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div key="stats" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="relative bg-card border border-border rounded-lg p-4 mt-4">
            <SessionStatsPanel
              shuffledCards={shuffledCards}
              scores={scores}
              answerTimes={answerTimes}
              firstWrongChoices={firstWrongChoices}
              cardStats={cardStats}
              totalPoints={totalPoints}
              maxPoints={maxPoints}
              pct={pct}
              bestStreak={bestStreak}
              streak={null}
              durationMs={completionDurationMs}
              skipsUsed={0}
              deckId={null}
              onRestart={startSession}
              onReviewMissed={() => {}}
              useHorizontal={useHorizontal}
            />
          </motion.div>
        ) : current ? (
          <motion.div key="study" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <motion.div className="relative bg-card border border-border rounded-lg p-4 mt-4" variants={containerVariant} initial="hidden" animate="visible">
              {useHorizontal
                ? <StudyCardHorizontal {...sharedProps} handedness={handedness} childVariant={childVariant} />
                : <StudyCard {...sharedProps} childVariant={childVariant} />
              }
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}