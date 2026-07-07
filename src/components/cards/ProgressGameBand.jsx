import { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { useSound } from '@/hooks/useSound';
import { DEFAULT_GROUND, DEFAULT_FLAG, getSkin, DEFAULT_SKIN_ID, resolveSprite } from './skins';

// ── ART-INDEPENDENT CONSTANTS ─────────────────────────────────────────────────
const BAND_H = 100;
const SKY    = '#e5e7eb';

// FEEL DIALS — tune by eye
const STEP_PX  = 96;   // fixed world px advanced per completed card (walk distance)
const STEP_MS  = 600;  // time to walk one card's distance

// ART-ANCHORED — only change if the walk artwork's stride changes
const STRIDE_PER_CYCLE_PX = 48; // on-screen ground travel per one full walk cycle

// CAMERA
const LEFT_MARGIN_FRAC  = 0.06;
const RIGHT_MARGIN_FRAC = 0.10;

const IDLE_CYCLE_MS = 800;
// Walk cycle is DERIVED so foot speed matches ground speed (no skating):
const CYCLES_PER_CARD = STEP_PX / STRIDE_PER_CYCLE_PX;
const WALK_CYCLE_MS   = Math.round(STEP_MS * STRIDE_PER_CYCLE_PX / STEP_PX);

const FLAG_EVERY          = 10;
const MIN_CARDS_FOR_FLAGS = 20;
const FLAG_ACT_MS        = 600;
const FLAG_WAVE_MS       = 700;

// Reaction cadence — one-shot reactions; duration = frames * REACT_FRAME_MS
const REACT_FRAME_MS = 45;

const AVATAR_ENTRY_MS   = 1000;
const AVATAR_ENTRY_EASE = 'linear';

// Outcome classification — mirrors StudySession's CORRECT_KEYS so the band
// stays a pure consumer (no new props).
const CORRECT_KEYS = new Set([
  'correct', 'second_guess', 'correct_after_clue', 'second_guess_after_clue', 'partial',
]);

/**
 * ProgressGameBand — pixel-art walking-character progress HUD.
 * Pure consumer of props; owns no progress/score state. Camera is derived per-render.
 *
 * Props:
 *   skin          — skin descriptor from skins.js (defaults to DEFAULT_SKIN_ID)
 *   cardIndex     — current card (0-based)
 *   total         — total cards in session
 *   scores        — array of score results so far
 *   correctStreak — current consecutive correct streak
 *   soundEnabled  — whether sound effects are enabled
 *   entering      — true while the entry walk-in animation is playing
 *   onEntryComplete — callback fired when entry animation finishes
 *   wrongTick     — increments on the first wrong answer of a card → react.wrong
 */
export default function ProgressGameBand({
  skin = getSkin(DEFAULT_SKIN_ID),
  cardIndex = 0,
  total = 1,
  scores = [],
  correctStreak = 0,
  soundEnabled = true,
  entering = false,
  wrongTick = 0,
  onEntryComplete,
}) {
  // ── Derive per-render from skin ─────────────────────────────────────────────
  const ground  = skin.ground || DEFAULT_GROUND;
  const flag    = skin.flag   || DEFAULT_FLAG;

  const CELL     = skin.cell;
  const BASELINE = skin.baseline;
  const SCALE    = skin.scale;
  const W        = CELL * SCALE;

  const TILE_W            = ground.tileW;
  const TILE_H            = ground.tileH;
  const GROUND_DISP       = TILE_H * SCALE;
  const FOOT_TO_BOTTOM    = (CELL - BASELINE) * SCALE;
  const CHAR_BOTTOM       = GROUND_DISP - FOOT_TO_BOTTOM;
  const FLAG_OFFSET       = Math.round(W * 0.6);

  const FLAG_CELL         = flag.cell;
  const FLAG_BASELINE     = flag.baseline;
  const FW                = FLAG_CELL * SCALE;
  const FLAG_FOOT_TO_BOTTOM = (FLAG_CELL - FLAG_BASELINE) * SCALE;
  const FLAG_BOTTOM       = GROUND_DISP - FLAG_FOOT_TO_BOTTOM;

  // ── Resolve sprites through the nested fallback rules ───────────────────────
  // idle has no `sad` variant → resolveSprite falls back to `happy`.
  const idleSprite     = resolveSprite(skin, 'idle', 'happy');
  const idleSadSprite  = resolveSprite(skin, 'idle', 'sad');   // falls back to happy
  const walkHappySprite = resolveSprite(skin, 'walk', 'happy');
  const walkSadSprite   = resolveSprite(skin, 'walk', 'sad');   // falls back to happy
  const rightSprite    = resolveSprite(skin, 'react', 'right');
  const wrongSprite    = resolveSprite(skin, 'react', 'wrong');

  const IDLE_FRAMES       = idleSprite?.frames || 0;
  const IDLE_SAD_FRAMES   = idleSadSprite?.frames || 0;
  const WALK_HAPPY_FRAMES = walkHappySprite?.frames || 0;
  const WALK_SAD_FRAMES   = walkSadSprite?.frames || 0;
  const RIGHT_FRAMES      = rightSprite?.frames || 0;
  const WRONG_FRAMES      = wrongSprite?.frames || 0;
  const FLAG_ACT_FRAMES   = flag.activate.frames;
  const FLAG_WAVE_FRAMES  = flag.wave.frames;

  // One-shot reaction durations (frames × per-frame cadence)
  const RIGHT_DUR = RIGHT_FRAMES * REACT_FRAME_MS;
  const WRONG_DUR = WRONG_FRAMES * REACT_FRAME_MS;

  const AVATAR_ENTRY_OFFSET = W * 4;

  // ── CSS keyframes — skin-scoped so the browser never reuses stale values ──
  // Loops use steps(FRAMES) over the full sheet width (frame 0..FRAMES-1, blank
  // at the loop point is instantaneous). One-shots use steps(FRAMES-1) over the
  // last frame's offset with `forwards` so the final frame holds cleanly.
  const KF_IDLE        = `pgb-idle-${skin.id}`;
  const KF_IDLE_SAD    = `pgb-idle-sad-${skin.id}`;
  const KF_WALK_HAPPY  = `pgb-walk-happy-${skin.id}`;
  const KF_WALK_SAD    = `pgb-walk-sad-${skin.id}`;
  const KF_RIGHT_SHOT  = `pgb-react-right-shot-${skin.id}`;
  const KF_WRONG_SHOT  = `pgb-react-wrong-shot-${skin.id}`;
  const KF_FLAG_ACT    = `pgb-flag-activate-${skin.id}`;
  const KF_FLAG_WAVE   = `pgb-flag-wave-${skin.id}`;

  const KEYFRAMES = `
@keyframes ${KF_IDLE} { from { background-position-x: 0 } to { background-position-x: -${IDLE_FRAMES * W}px } }
@keyframes ${KF_IDLE_SAD} { from { background-position-x: 0 } to { background-position-x: -${IDLE_SAD_FRAMES * W}px } }
@keyframes ${KF_WALK_HAPPY} { from { background-position-x: 0 } to { background-position-x: -${WALK_HAPPY_FRAMES * W}px } }
@keyframes ${KF_WALK_SAD} { from { background-position-x: 0 } to { background-position-x: -${WALK_SAD_FRAMES * W}px } }
@keyframes ${KF_RIGHT_SHOT} { from { background-position-x: 0 } to { background-position-x: -${Math.max(0, RIGHT_FRAMES - 1) * W}px } }
@keyframes ${KF_WRONG_SHOT} { from { background-position-x: 0 } to { background-position-x: -${Math.max(0, WRONG_FRAMES - 1) * W}px } }
@keyframes ${KF_FLAG_ACT} { from { background-position-x: 0 } to { background-position-x: -${FLAG_ACT_FRAMES * FW}px } }
@keyframes ${KF_FLAG_WAVE} { from { background-position-x: 0 } to { background-position-x: -${FLAG_WAVE_FRAMES * FW}px } }
`;

  const { playWalking, stopWalking } = useSound(soundEnabled);

  const bandRef  = useRef(null);
  const [bandW, setBandW] = useState(0);

  // ── Phase machine ──────────────────────────────────────────────────────────
  // phase: 'idle' | 'reactRight' | 'reactWrong' | 'walk' | 'celebrate'
  // Exactly one character layer is visible at a time (opacity 1); the rest 0.
  const [phase, setPhase] = useState('idle');
  const [walkVariant, setWalkVariant] = useState('happy'); // 'happy' | 'sad'
  const [idleVariant, setIdleVariant] = useState('happy'); // idle shown after a walk
  const [reactKey, setReactKey] = useState(0);              // re-arm one-shot layers
  const [celebSub, setCelebSub] = useState('idle');         // 'idle' | 'react' during celebrate
  const phaseRef = useRef('idle');
  const reactEndRef = useRef(0); // wall-clock ms when the in-flight reaction ends

  const catControls = useAnimation();
  const entryFiredRef = useRef(false);

  const completed = scores.filter(Boolean).length;
  const [shownCompleted, setShownCompleted] = useState(() => scores.filter(Boolean).length);
  const prevCompleted = useRef(shownCompleted);

  // Snapshot of which score indices are committed (index → key) so we can read
  // the JUST-committed key without owning any progress state.
  const prevNonEmptyRef = useRef(null);
  if (prevNonEmptyRef.current === null) {
    const ne = {};
    scores.forEach((s, i) => { if (s) ne[i] = s.key; });
    prevNonEmptyRef.current = ne;
  }

  // ── Flag state ────────────────────────────────────────────────────────────
  const [activating, setActivating] = useState(null);
  const [activated, setActivated]   = useState(() => new Set());

  const milestones = useMemo(() => {
    if (total < MIN_CARDS_FOR_FLAGS) return [];
    const arr = [];
    for (let m = FLAG_EVERY; m < total; m += FLAG_EVERY) arr.push(m);
    return arr;
  }, [total]);

  // Seed flags already passed on mount → straight to waving
  const flagSeeded = useRef(false);
  useEffect(() => {
    if (flagSeeded.current || !milestones.length) return;
    flagSeeded.current = true;
    setActivated(new Set(milestones.filter((m) => m <= shownCompleted)));
  }, [milestones, shownCompleted]);

  // Fire activation when displayed progress crosses a milestone
  const prevFlagShown = useRef(shownCompleted);
  useEffect(() => {
    const prev = prevFlagShown.current;
    prevFlagShown.current = shownCompleted;
    if (shownCompleted <= prev) return;
    const hit = milestones.find((m) => m > prev && m <= shownCompleted);
    if (hit == null) return;
    setActivating(hit);
    const t = setTimeout(() => {
      setActivating(null);
      setActivated((s) => new Set(s).add(hit));
    }, FLAG_ACT_MS);
    return () => clearTimeout(t);
  }, [shownCompleted, milestones]);

  const flagPhase = (m) =>
    activating === m ? 'activation' : activated.has(m) ? 'waving' : 'inactive';

  // ── Measure band width (ResizeObserver catches non-window resizes too) ─────
  useLayoutEffect(() => {
    if (!bandRef.current) return;
    const el = bandRef.current;
    const measure = () => setBandW(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Wrong reaction: fires on the first wrong answer of a card (wrongTick) ──
  // One-shot; returns to idle when it finishes (the retry keeps the character
  // in place — no walk until a score is committed).
  const prevWrongTick = useRef(wrongTick);
  useEffect(() => {
    if (wrongTick === prevWrongTick.current) return;
    prevWrongTick.current = wrongTick;
    if (WRONG_FRAMES === 0 || !wrongSprite?.src) return;

    setReactKey((k) => k + 1);
    phaseRef.current = 'reactWrong'; setPhase('reactWrong');
    reactEndRef.current = Date.now() + WRONG_DUR;

    const t = setTimeout(() => {
      // Only drop to idle if no commit started a walk in the meantime.
      if (phaseRef.current === 'reactWrong') { phaseRef.current = 'idle'; setPhase('idle'); }
    }, WRONG_DUR);
    return () => clearTimeout(t);
  }, [wrongTick]);

  // ── Commit reaction + walk: fires when a card score is committed ───────────
  //   correct key  → react.right one-shot → happy walk
  //   wrong key    → no reaction (the wrong reaction already fired on wrongTick)
  //                 → sad walk, chained to the end of any in-flight reaction
  //   last card    → after the walk, switch to react.right looping (celebrate)
  useEffect(() => {
    if (completed === prevCompleted.current) return;
    prevCompleted.current = completed;

    // Read the just-committed key by diffing the committed-index map.
    const nonEmpty = {};
    scores.forEach((s, i) => { if (s) nonEmpty[i] = s.key; });
    let commitKey = null;
    for (const k in nonEmpty) {
      if (prevNonEmptyRef.current[k] !== nonEmpty[k]) { commitKey = nonEmpty[k]; break; }
    }
    prevNonEmptyRef.current = nonEmpty;
    if (commitKey === null) {
      const vals = Object.values(nonEmpty);
      commitKey = vals[vals.length - 1];
    }

    const isCorrect = !!commitKey && CORRECT_KEYS.has(commitKey);
    const variant = isCorrect ? 'happy' : 'sad';
    const isLast = completed >= total;
    const canCelebrate = RIGHT_FRAMES > 0 && !!rightSprite?.src;

    let cancelled = false;
    let tStart, tWalk;

    const finishWalk = () => {
      if (cancelled) return;
      stopWalking();
      setReactKey((k) => k + 1);
      if (isLast && canCelebrate) {
        phaseRef.current = 'celebrate'; setPhase('celebrate');
      } else if (isLast) {
        setIdleVariant('happy');                 // ends happy even with no reaction sprite
        phaseRef.current = 'idle'; setPhase('idle');
      } else {
        setIdleVariant(variant);
        phaseRef.current = 'idle'; setPhase('idle');
      }
    };

    const startWalk = () => {
      if (cancelled) return;
      setWalkVariant(variant);
      phaseRef.current = 'walk'; setPhase('walk');
      playWalking();
      setShownCompleted(completed); // advances world position (CSS transition = walk)
      tWalk = setTimeout(finishWalk, STEP_MS);
    };

    if (isCorrect && canCelebrate) {
      // Play the right reaction one-shot, then chain the walk off its completion.
      setReactKey((k) => k + 1);
      phaseRef.current = 'reactRight'; setPhase('reactRight');
      reactEndRef.current = Date.now() + RIGHT_DUR;
      tStart = setTimeout(startWalk, RIGHT_DUR);
    } else {
      // Wrong key (no right reaction): walk after any in-flight reaction ends,
      // so a simultaneous wrongTick reaction (e.g. true/false) plays first.
      const remaining = Math.max(0, reactEndRef.current - Date.now());
      tStart = setTimeout(startWalk, remaining);
    }

    return () => { cancelled = true; clearTimeout(tStart); clearTimeout(tWalk); };
  }, [completed]);

  // ── Celebration cycle: happy idle ×2, then right reaction ×1, looping ──────
  useEffect(() => {
    if (phase !== 'celebrate') return;
    let cancelled = false;
    let tReact, tIdle;
    const IDLE_DUR = 2 * IDLE_CYCLE_MS;
    const runIdle = () => {
      if (cancelled) return;
      setCelebSub('idle');
      tReact = setTimeout(runReact, IDLE_DUR);
    };
    const runReact = () => {
      if (cancelled) return;
      setReactKey((k) => k + 1); // re-arm one-shot from frame 0
      setCelebSub('react');
      tIdle = setTimeout(runIdle, RIGHT_DUR);
    };
    runIdle();
    return () => { cancelled = true; clearTimeout(tReact); clearTimeout(tIdle); };
  }, [phase]);

  // ── Preload character sprites so the first reveal has no paint gap ────────
  useEffect(() => {
    const urls = [
      idleSprite?.src, idleSadSprite?.src, walkHappySprite?.src, walkSadSprite?.src,
      rightSprite?.src, wrongSprite?.src,
    ].filter(Boolean);
    urls.forEach((u) => { const img = new Image(); img.src = u; });
  }, [idleSprite?.src, idleSadSprite?.src, walkHappySprite?.src, walkSadSprite?.src, rightSprite?.src, wrongSprite?.src]);

  // ── Fixed-world camera math ───────────────────────────────────────────────
  const LEFT_MARGIN  = bandW * LEFT_MARGIN_FRAC;
  const RIGHT_MARGIN = bandW * RIGHT_MARGIN_FRAC;
  const LEAD_IN      = LEFT_MARGIN;
  const usableW      = Math.max(STEP_PX, bandW - LEFT_MARGIN - RIGHT_MARGIN);
  const cardsPerPage = Math.max(1, Math.floor(usableW / STEP_PX));
  const PAGE_STRIDE  = cardsPerPage * STEP_PX;
  const page         = Math.floor(shownCompleted / cardsPerPage);
  const lastPage     = Math.floor(total / cardsPerPage);
  const worldWidth   = LEAD_IN + (lastPage + 1) * PAGE_STRIDE + RIGHT_MARGIN;
  const cameraX      = page * PAGE_STRIDE;
  const charWorldX   = LEAD_IN + shownCompleted * STEP_PX;

  // ── Entry walk-in animation (retargeted to world coords) ───────────────────
  useEffect(() => {
    if (!entering) {
      entryFiredRef.current = false;
      return;
    }
    if (entryFiredRef.current || bandW === 0) return;
    entryFiredRef.current = true;
    const startX = LEAD_IN - AVATAR_ENTRY_OFFSET;
    const targetX = LEAD_IN;
    catControls.set({ x: startX });
    catControls.start({
      x: targetX,
      transition: { duration: AVATAR_ENTRY_MS / 1000, ease: AVATAR_ENTRY_EASE },
    }).then(() => {
      onEntryComplete && onEntryComplete();
    });
  }, [entering, bandW]);

  // ── Layer visibility — exactly one layer lit at a time ─────────────────────
  const showIdleHappy  = !entering && ((phase === 'idle' && idleVariant === 'happy') || (phase === 'celebrate' && celebSub === 'idle'));
  const showIdleSad    = !entering && phase === 'idle' && idleVariant === 'sad';
  const showWalkHappy  = entering || (phase === 'walk' && walkVariant === 'happy');
  const showWalkSad    = !entering && phase === 'walk' && walkVariant === 'sad';
  const showReactRight = !entering && (phase === 'reactRight' || (phase === 'celebrate' && celebSub === 'react'));
  const showReactWrong = !entering && phase === 'reactWrong';

  // ── Character layers — stacked, opacity-toggled (never swap backgroundImage) ─
  const layers = (
    <>
      {/* IDLE happy — loop, always running underneath */}
      {idleSprite?.src && IDLE_FRAMES > 0 && (
        <div style={{
          position: 'absolute', inset: 0, width: W, height: W,
          backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
          backgroundImage: `url(${idleSprite.src})`,
          backgroundSize: `${IDLE_FRAMES * W}px ${W}px`,
          animation: `${KF_IDLE} ${IDLE_CYCLE_MS}ms steps(${IDLE_FRAMES}) infinite`,
          opacity: showIdleHappy ? 1 : 0,
        }} />
      )}
      {/* IDLE sad — loop (shown after a fully failed card's sad walk) */}
      {idleSadSprite?.src && IDLE_SAD_FRAMES > 0 && (
        <div style={{
          position: 'absolute', inset: 0, width: W, height: W,
          backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
          backgroundImage: `url(${idleSadSprite.src})`,
          backgroundSize: `${IDLE_SAD_FRAMES * W}px ${W}px`,
          animation: `${KF_IDLE_SAD} ${IDLE_CYCLE_MS}ms steps(${IDLE_SAD_FRAMES}) infinite`,
          opacity: showIdleSad ? 1 : 0,
        }} />
      )}

      {/* WALK happy — loop */}
      {walkHappySprite?.src && WALK_HAPPY_FRAMES > 0 && (
        <div style={{
          position: 'absolute', inset: 0, width: W, height: W,
          backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
          backgroundImage: `url(${walkHappySprite.src})`,
          backgroundSize: `${WALK_HAPPY_FRAMES * W}px ${W}px`,
          animation: `${KF_WALK_HAPPY} ${WALK_CYCLE_MS}ms steps(${WALK_HAPPY_FRAMES}) infinite`,
          opacity: showWalkHappy ? 1 : 0,
        }} />
      )}

      {/* WALK sad — loop (falls back to happy sprite when no sad art) */}
      {walkSadSprite?.src && WALK_SAD_FRAMES > 0 && (
        <div style={{
          position: 'absolute', inset: 0, width: W, height: W,
          backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
          backgroundImage: `url(${walkSadSprite.src})`,
          backgroundSize: `${WALK_SAD_FRAMES * W}px ${W}px`,
          animation: `${KF_WALK_SAD} ${WALK_CYCLE_MS}ms steps(${WALK_SAD_FRAMES}) infinite`,
          opacity: showWalkSad ? 1 : 0,
        }} />
      )}

      {/* REACT right — one-shot during play; loops as the deck-completion celebration */}
      {rightSprite?.src && RIGHT_FRAMES > 0 && (
        <div
          key={`right-${reactKey}`}
          style={{
            position: 'absolute', inset: 0, width: W, height: W,
            backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
            backgroundImage: `url(${rightSprite.src})`,
            backgroundSize: `${RIGHT_FRAMES * W}px ${W}px`,
            animation: `${KF_RIGHT_SHOT} ${RIGHT_DUR}ms steps(${Math.max(1, RIGHT_FRAMES - 1)}) forwards`,
            opacity: showReactRight ? 1 : 0,
          }}
        />
      )}

      {/* REACT wrong — one-shot */}
      {wrongSprite?.src && WRONG_FRAMES > 0 && (
        <div
          key={`wrong-${reactKey}`}
          style={{
            position: 'absolute', inset: 0, width: W, height: W,
            backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
            backgroundImage: `url(${wrongSprite.src})`,
            backgroundSize: `${WRONG_FRAMES * W}px ${W}px`,
            animation: `${KF_WRONG_SHOT} ${WRONG_DUR}ms steps(${Math.max(1, WRONG_FRAMES - 1)}) forwards`,
            opacity: showReactWrong ? 1 : 0,
          }}
        />
      )}
    </>
  );

  return (
    <div
      ref={bandRef}
      className="progress-game-band"
      aria-hidden="true"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden', imageRendering: 'pixelated' }}
    >
      <style>{KEYFRAMES}</style>

      {/* World container — fixed-pixel width, scrolled by the follow camera (LINEAR easing) */}
      <div style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: worldWidth,
        height: '100%',
        transform: `translateX(${-cameraX}px)`,
        willChange: 'transform',
      }}>
        {/* Ground strip — tiled across the whole world */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: worldWidth,
          height: GROUND_DISP,
          backgroundImage: `url(${ground.src})`,
          backgroundRepeat: 'repeat-x',
          backgroundSize: `${TILE_W * SCALE}px ${GROUND_DISP}px`,
          imageRendering: 'pixelated',
        }} />

        {/* Milestone flags — positioned in world space */}
        {milestones.map((m) => {
          const fx    = LEAD_IN + m * STEP_PX + FLAG_OFFSET;
          const phaseF = flagPhase(m);
          const sprite =
            phaseF === 'activation'
              ? { backgroundImage: `url(${flag.activate.src})`, backgroundSize: `${FLAG_ACT_FRAMES * FW}px ${FW}px`, animation: `${KF_FLAG_ACT} ${FLAG_ACT_MS}ms steps(${FLAG_ACT_FRAMES}) 1` }
              : phaseF === 'waving'
              ? { backgroundImage: `url(${flag.wave.src})`,     backgroundSize: `${FLAG_WAVE_FRAMES * FW}px ${FW}px`, animation: `${KF_FLAG_WAVE} ${FLAG_WAVE_MS}ms steps(${FLAG_WAVE_FRAMES}) infinite` }
              : { backgroundImage: `url(${flag.inactive.src})`, backgroundSize: `${FW}px ${FW}px`, animation: 'none' };
          return (
            <div key={m} style={{
              position: 'absolute', bottom: FLAG_BOTTOM, left: 0, width: FW, height: FW,
              transform: `translateX(${fx}px)`,
              backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
              ...sprite,
            }} />
          );
        })}

        {/* Character — positioned in world space (LINEAR easing matches camera) */}
        {entering ? (
          <motion.div
            animate={catControls}
            style={{
              position: 'absolute',
              bottom: CHAR_BOTTOM,
              left: 0,
              width: W,
              height: W,
              willChange: 'transform',
            }}
          >
            {layers}
          </motion.div>
        ) : (
          <div style={{
            position: 'absolute',
            bottom: CHAR_BOTTOM,
            left: 0,
            width: W,
            height: W,
            transform: `translateX(${charWorldX}px)`,
            transition: `transform ${STEP_MS}ms linear`,
            willChange: 'transform',
          }}>
            {layers}
          </div>
        )}
      </div>
    </div>
  );
}