import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, RotateCcw, ChevronLeft, ChevronRight, BarChart2, Brain, Volume2, VolumeX, Info, Gamepad2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudyCard from '@/components/cards/StudyCard';
import StreakBar from '@/components/cards/StreakBar';
import StreakPanel from '@/components/cards/StreakPanel';
import ClimberGame from '@/components/minigames/ClimberGame';
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
  wrong: { label: 'Incorrect', color: 'text-destructive' },
};

const CORRECT_KEYS = new Set(['correct', 'second_guess', 'correct_after_clue', 'second_guess_after_clue']);

function MasteryTooltip({ minSessions, masteryPct }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="p-0.5 rounded focus:outline-none"
      >
        <Info className="w-3.5 h-3.5 text-muted-foreground/60" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 rounded-lg bg-foreground text-background text-xs px-2.5 py-1.5 z-10 text-center shadow-lg pointer-events-none">
          Requires {minSessions}+ sessions at ≥{masteryPct}% correct
        </span>
      )}
    </span>
  );
}

export default function StudySession() {
  const { deckId } = useParams();
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('flashdeck_sound') !== '0');
  const [autoAdvance, setAutoAdvance] = useState(() => localStorage.getItem('flashdeck_autoadvance') === '1');
  const [activeMinigames, setActiveMinigames] = useState(() => {
    const saved = localStorage.getItem('flashdeck_minigames');
    return saved ? JSON.parse(saved) : { climber: true };
  });
  const [cardIndex, setCardIndex] = useState(0);
  const [shuffledCards, setShuffledCards] = useState([]);
  const [done, setDone] = useState(false);
  const [scores, setScores] = useState([]);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  // Climber game state
  const [climberLevel, setClimberLevel] = useState(0);
  const [climberConsecWrong, setClimberConsecWrong] = useState(0);
  const [climberGameOver, setClimberGameOver] = useState(false);
  const [climberState, setClimberState] = useState('idle'); // idle | jump | scramble | fall
  // 'all' | 'unmastered'
  const [filterMode, setFilterMode] = useState('all');
  const [filterChosen, setFilterChosen] = useState(false);

  const { data: deck } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => base44.entities.Deck.filter({ id: deckId }).then(r => r[0]),
    enabled: !!deckId,
  });

  const { data: allCards = [], isLoading } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => base44.entities.Card.filter({ deck_id: deckId }, 'order'),
    enabled: !!deckId,
  });

  const activeCards = allCards.filter(c => !c.deleted);

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  const { data: streakData = [], refetch: refetchStreak } = useQuery({
    queryKey: ['streak', currentUser?.id],
    queryFn: () => base44.entities.Streak.filter({ user_id: currentUser.id }),
    enabled: !!currentUser?.id,
  });
  const streak = streakData[0] || null;

  const { data: cardStats = [], refetch: refetchStats } = useQuery({
    queryKey: ['card-stats', deckId, currentUser?.id],
    queryFn: () => base44.entities.UserCardStats.filter({ deck_id: deckId, user_id: currentUser.id }),
    enabled: !!deckId && !!currentUser?.id,
  });

  const { data: pastSessions = [] } = useQuery({
    queryKey: ['study-sessions', deckId],
    queryFn: () => base44.entities.StudySession.filter({ deck_id: deckId }),
    enabled: !!deckId,
  });

  const { data: cardNotes = [] } = useQuery({
    queryKey: ['card-notes-session', deckId, currentUser?.id],
    queryFn: () => base44.entities.CardNote.filter({ created_by: currentUser.email }),
    enabled: !!deckId && !!currentUser?.id,
  });

  const notesByCardId = Object.fromEntries(cardNotes.map(n => [n.card_id, n.note]));

  // Compute all-time best consecutive correct streak across all past sessions
  const allTimeBest = pastSessions.reduce((best, session) => {
    const results = session.card_results || [];
    let cur = 0;
    let sessionBest = 0;
    for (const r of results) {
      if (CORRECT_KEYS.has(r.key)) { cur++; sessionBest = Math.max(sessionBest, cur); }
      else cur = 0;
    }
    return Math.max(best, sessionBest);
  }, 0);

  const masteredCardIds = new Set(cardStats.filter(s => s.mastered).map(s => s.card_id));
  const unmasteredCards = activeCards.filter(c => !masteredCardIds.has(c.id));
  const allMastered = unmasteredCards.length === 0 && activeCards.length > 0;

  const startSession = (mode) => {
    const pool = mode === 'unmastered' ? unmasteredCards : activeCards;
    setShuffledCards(shuffle(pool));
    setCardIndex(0);
    setDone(false);
    setScores([]);
    setFilterMode(mode);
    setFilterChosen(true);
    setCorrectStreak(0);
    setBestStreak(0);
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
      }));

      const total = cardResults.reduce((s, r) => s + r.points, 0);
      const max = shuffledCards.length;

      // Save study session
      await base44.entities.StudySession.create({
        deck_id: deckId,
        score_pct: max > 0 ? (total / max) * 100 : 0,
        total_points: total,
        max_points: max,
        card_results: cardResults,
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
        } else if (last === yesterday) {
          newStreak = streak.current_streak + 1;
        } else {
          newStreak = 1;
        }
        const newLongest = Math.max(streak.longest_streak || 0, newStreak);
        const newMilestone = [3, 7, 14, 30, 60, 100].filter(m => newStreak >= m).pop() || 0;
        await base44.entities.Streak.update(streak.id, {
          current_streak: newStreak,
          longest_streak: newLongest,
          last_study_date: today,
          milestone_reached: Math.max(streak.milestone_reached || 0, newMilestone),
        });
      } else if (currentUser?.id) {
        await base44.entities.Streak.create({
          user_id: currentUser.id,
          current_streak: 1,
          longest_streak: 1,
          last_study_date: today,
          milestone_reached: 0,
        });
      }
      refetchStreak();

      // Milestone toast
      const newMilestoneVal = [3, 7, 14, 30, 60, 100].filter(m => newStreak >= m).pop() || 0;
      const prevMilestone = streak?.milestone_reached || 0;
      if (newMilestoneVal > prevMilestone) {
        const { toast: sonnerToast } = await import('sonner');
        sonnerToast(`🏆 ${newMilestoneVal}-day milestone reached!`, {
          description: `You've studied ${newMilestoneVal} days in a row. Keep it up!`,
          duration: 5000,
        });
      }

      // Update UserCardStats for every card in this session
      for (const result of cardResults) {
        const wasCorrect = CORRECT_KEYS.has(result.key);
        const existing = cardStats.find(s => s.card_id === result.card_id);

        const newCorrect = (existing?.correct_attempts ?? 0) + (wasCorrect ? 1 : 0);
        const newTotal = (existing?.total_attempts ?? 0) + 1;
        const newSessions = (existing?.sessions_completed ?? 0) + 1;

        // Mastery only evaluated once min sessions reached; requires >= masteryPct% correct
        const nowMastered = newSessions >= minSessions && (newCorrect / newSessions) * 100 >= masteryPct;

        if (existing) {
          await base44.entities.UserCardStats.update(existing.id, {
            correct_attempts: newCorrect,
            total_attempts: newTotal,
            sessions_completed: newSessions,
            mastered: nowMastered,
            last_studied_date: new Date().toISOString(),
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
            last_studied_date: new Date().toISOString(),
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
    sessionSaved.current = false;
  };

  const handleNext = () => {
    if (cardIndex < shuffledCards.length - 1) setCardIndex(i => i + 1);
    else setDone(true);
  };
  const handlePrev = () => { if (cardIndex > 0) setCardIndex(i => i - 1); };

  const handleScore = (points, key) => {
    setScores(prev => {
      const next = [...prev];
      next[cardIndex] = { points, key };
      return next;
    });
    const wasCorrect = CORRECT_KEYS.has(key);
    setCorrectStreak(prev => {
      const next = wasCorrect ? prev + 1 : 0;
      if (wasCorrect) setBestStreak(b => Math.max(b, next));
      return next;
    });

    // Climber game logic
    const isScramble = key === 'correct_after_clue' || key === 'second_guess' || key === 'second_guess_after_clue';
    if (wasCorrect) {
      if (climberGameOver) {
        // Restart on correct answer after game over
        setClimberGameOver(false);
        setClimberLevel(0);
        setClimberConsecWrong(0);
        setClimberState('jump');
        setTimeout(() => setClimberState('idle'), 600);
      } else {
        setClimberConsecWrong(0);
        setClimberState(isScramble ? 'scramble' : 'jump');
        setTimeout(() => {
          setClimberLevel(l => l + 1);
          setClimberState('idle');
        }, 500);
      }
    } else {
      setClimberConsecWrong(prev => {
        const next = prev + 1;
        if (next >= 3) {
          setClimberState('fall');
          setTimeout(() => setClimberGameOver(true), 700);
        } else {
          setClimberState('fall');
          setTimeout(() => {
            setClimberLevel(l => Math.max(0, l - 1));
            setClimberState('idle');
          }, 500);
        }
        return next >= 3 ? 0 : next;
      });
    }
  };

  if (isLoading || !activeCards.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const totalPoints = scores.reduce((s, r) => s + (r?.points || 0), 0);
  const maxPoints = shuffledCards.length;
  const pct = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
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
              className="w-full border-2 border-border hover:border-primary rounded-xl p-4 text-left transition-all hover:bg-accent/40"
            >
              <div className="font-semibold">All cards</div>
              <div className="text-sm text-muted-foreground mt-0.5">{activeCards.length} cards</div>
            </button>

            <button
              onClick={() => startSession('unmastered')}
              disabled={allMastered}
              className={cn(
                'w-full border-2 rounded-xl p-4 text-left transition-all',
                allMastered
                  ? 'border-border opacity-50 cursor-not-allowed'
                  : 'border-border hover:border-primary hover:bg-accent/40'
              )}
            >
              <div className="font-semibold flex items-center gap-2">
                Unmastered only
                {unmasteredCards.length < activeCards.length && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                    {unmasteredCards.length} remaining
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                {allMastered
                 ? '🎉 All cards mastered!'
                 : (
                   <>
                     {unmasteredCards.length} card{unmasteredCards.length !== 1 ? 's' : ''} not yet mastered
                     <MasteryTooltip minSessions={deck?.mastery_min_sessions ?? 3} masteryPct={deck?.mastery_pct ?? 90} />
                   </>
                 )}
              </div>
            </button>

            {/* Mini-games section */}
            <div className="pt-2">
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <Gamepad2 className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">Mini-games</p>
              </div>
              <div className="flex flex-col gap-2">
                {[{ id: 'climber', label: 'Climber', description: 'A pixel climber that reacts to your answers' }].map(game => {
                  const isOn = !!activeMinigames[game.id];
                  return (
                    <button
                      key={game.id}
                      onClick={() => {
                        const next = { ...activeMinigames, [game.id]: !isOn };
                        setActiveMinigames(next);
                        localStorage.setItem('flashdeck_minigames', JSON.stringify(next));
                      }}
                      className={cn(
                        'w-full border-2 rounded-xl p-3 text-left transition-all flex items-center gap-3',
                        isOn ? 'border-primary bg-accent/40' : 'border-border hover:border-muted-foreground/40'
                      )}
                    >
                      <div className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-colors', isOn ? 'bg-primary border-primary' : 'border-border')}>
                        {isOn && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{game.label}</div>
                        <div className="text-xs text-muted-foreground">{game.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
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
                )}
              >
                <span className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform',
                  autoAdvance ? 'translate-x-5' : 'translate-x-0'
                )} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/deck/${deckId}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-semibold">{deck?.title}</h1>
          <p className="text-xs text-muted-foreground">
            {filterMode === 'unmastered' && <span className="text-amber-600">Unmastered only</span>}
          </p>
        </div>
        <button
          onClick={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            localStorage.setItem('flashdeck_sound', next ? '1' : '0');
          }}
          title={soundEnabled ? 'Sound on' : 'Sound off'}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
        <Button variant="ghost" size="sm" onClick={restart} className="gap-1.5 text-muted-foreground">
          <RotateCcw className="w-4 h-4" /> Restart
        </Button>
      </div>

      {/* Progress bar */}
      <StreakBar
        cardIndex={cardIndex}
        total={shuffledCards.length}
        done={done}
      />

      {done ? (
        <div className="flex flex-col items-center py-10 gap-6">
          <div className="text-5xl">🎉</div>
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">Deck complete!</h2>
            <p className="text-muted-foreground text-sm">
              Score: <span className="font-semibold text-foreground">{totalPoints.toFixed(2)} / {maxPoints}</span>
              <span className="ml-2 text-xs">({pct}%)</span>
            </p>
            {(streak?.current_streak || 0) > 0 && (
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
            )}
          </div>

          {/* Per-card breakdown */}
          <div className="w-full bg-card border border-border rounded-xl overflow-hidden">
            {shuffledCards.map((card, i) => {
              const result = scores[i];
              const info = result ? SCORE_LABELS[result.key] : { label: 'Skipped', color: 'text-muted-foreground' };
              const stat = cardStats.find(s => s.card_id === card.id);
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
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Link to={`/stats/${deckId}`}>
              <Button variant="outline" className="gap-1.5"><BarChart2 className="w-4 h-4" /> View Stats</Button>
            </Link>
            <Button onClick={restart} className="gap-1.5"><RotateCcw className="w-4 h-4" /> Study Again</Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 items-start">
          <div className="flex-1 min-w-0">
            <StudyCard
              key={`${current.id}-${cardIndex}`}
              card={current}
              deck={deck}
              onNext={handleNext}
              onPrev={handlePrev}
              isFirst={cardIndex === 0}
              isLast={cardIndex === shuffledCards.length - 1}
              onScore={handleScore}
              soundEnabled={soundEnabled}
              autoAdvance={autoAdvance}
              note={notesByCardId[current.id] || null}
            />
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

          {/* Side panels */}
          <div className="hidden md:flex flex-col gap-3 shrink-0 w-44 sticky top-8 self-start">
            {activeMinigames.climber && (
              <ClimberGame
                currentLevel={climberLevel}
                consecutiveWrong={climberConsecWrong}
                gameOver={climberGameOver}
                climberState={climberState}
              />
            )}
            <StreakPanel
              currentStreak={correctStreak}
              bestStreak={bestStreak}
              allTimeBest={allTimeBest > 0 ? allTimeBest : null}
              hasPastSession={pastSessions.length > 0}
            />
          </div>
        </div>
      )}
    </div>
  );
}