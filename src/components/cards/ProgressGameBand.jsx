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
                                // ≈ 2 steps × ~12px sprite stride × scale(2). If feet skate
                                // FORWARD, lower this; if they drag BACK, raise it.

// CAMERA
const LEFT_MARGIN_FRAC  = 0.06;
const RIGHT_MARGIN_FRAC = 0.10; // flip a bit before the true right edge

const IDLE_CYCLE_MS = 800;
// Walk cycle is DERIVED so foot speed matches ground speed (no skating):
//   cyclesPerCard = STEP_PX / STRIDE_PER_CYCLE_PX
//   WALK_CYCLE_MS = STEP_MS / cyclesPerCard = STEP_MS * STRIDE_PER_CYCLE_PX / STEP_PX
const CYCLES_PER_CARD = STEP_PX / STRIDE_PER_CYCLE_PX;
const WALK_CYCLE_MS   = Math.round(STEP_MS * STRIDE_PER_CYCLE_PX / STEP_PX);

const FLAG_EVERY          = 10;
const MIN_CARDS_FOR_FLAGS = 20;
const FLAG_ACT_MS        = 600;
const FLAG_WAVE_MS       = 700;

// Pause between the answer being submitted and the character reacting —
// lets the answer feedback (sound/colour) land before the sprite moves.
const ANSWER_DELAY_MS   = 450;

const AVATAR_ENTRY_MS   = 1000;
const AVATAR_ENTRY_EASE = 'linear';

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
 *   wrongTick     — increments on a wrong answer to trigger the flinch reaction
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

  // ── Resolve sprites (happy variant for idle/walk this pass) ─────────────────
  const idleSprite  = resolveSprite(skin, 'idle', 'happy');
  const walkSprite  = resolveSprite(skin, 'walk', 'happy');
  const wrongSprite = resolveSprite(skin, 'react', 'wrong');

  const IDLE_FRAMES       = idleSprite?.frames || 0;
  const WALK_FRAMES       = walkSprite?.frames || 0;
  const WRONG_FRAMES      = wrongSprite?.frames || 0;
  const FLAG_ACT_FRAMES   = flag.activate.frames;
  const FLAG_WAVE_FRAMES  = flag.wave.frames;

  const AVATAR_ENTRY_OFFSET = W * 4;

  // ── CSS keyframes — names are skin-scoped so the browser never reuses stale values ──
  const KF_IDLE         = `pgb-idle-${skin.id}`;
  const KF_WALK         = `pgb-walk-${skin.id}`;
  const KF_WRONG        = `pgb-wrong-${skin.id}`;
  const KF_FLAG_ACT     = `pgb-flag-activate-${skin.id}`;
  const KF_FLAG_WAVE    = `pgb-flag-wave-${skin.id}`;

  const WRONG_CYCLE_MS  = WRONG_FRAMES > 0 ? Math.round((WRONG_FRAMES / Math.max(1, IDLE_FRAMES)) * IDLE_CYCLE_MS) : 600;
  const WRONG_DURATION  = WRONG_CYCLE_MS * 2; // play twice then return to idle

  const KEYFRAMES = `
@keyframes ${KF_IDLE} {
  from { background-position-x: 0 }
  to   { background-position-x: -${IDLE_FRAMES * W}px }
}
@keyframes ${KF_WALK} {
  from { background-position-x: 0 }
  to   { background-position-x: -${WALK_FRAMES * W}px }
}
@keyframes ${KF_WRONG} {
  from { background-position-x: 0 }
  to   { background-position-x: -${WRONG_FRAMES * W}px }
}
@keyframes ${KF_FLAG_ACT} {
  from { background-position-x: 0 }
  to   { background-position-x: -${FLAG_ACT_FRAMES * FW}px }
}
@keyframes ${KF_FLAG_WAVE} {
  from { background-position-x: 0 }
  to   { background-position-x: -${FLAG_WAVE_FRAMES * FW}px }
}
`;

  const { playWalking, stopWalking } = useSound(soundEnabled);

  const bandRef  = useRef(null);
  const [bandW, setBandW] = useState(0);
  const [walking, setWalking] = useState(false);
  const [wronging, setWronging] = useState(false);
  const catControls = useAnimation();
  const entryFiredRef = useRef(false);

  const completed = scores.filter(Boolean).length;
  const [shownCompleted, setShownCompleted] = useState(() => scores.filter(Boolean).length);
  const prevCompleted = useRef(shownCompleted);

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

  // ── Wrong trigger (reads react.wrong via resolved sprite) ──────────────────
  const prevWrongTick = useRef(wrongTick);
  useEffect(() => {
    if (wrongTick === prevWrongTick.current || !wrongSprite?.src) return;
    prevWrongTick.current = wrongTick;
    if (WRONG_FRAMES === 0) return;
    const t1 = setTimeout(() => setWronging(true), ANSWER_DELAY_MS);
    const t2 = setTimeout(() => setWronging(false), ANSWER_DELAY_MS + WRONG_DURATION);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [wrongTick]);

  // ── Walk trigger ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (completed === prevCompleted.current) return;
    const t1 = setTimeout(() => { setWalking(true); playWalking(); setShownCompleted(completed); }, ANSWER_DELAY_MS);
    const t2 = setTimeout(() => { setWalking(false); stopWalking(); }, ANSWER_DELAY_MS + STEP_MS);
    prevCompleted.current = completed;
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [completed]);

  // ── Fixed-world camera math ───────────────────────────────────────────────
  // World is fixed pixels; the viewport scrolls a follow camera under the character.
  const LEFT_MARGIN  = bandW * LEFT_MARGIN_FRAC;
  const RIGHT_MARGIN = bandW * RIGHT_MARGIN_FRAC;
  const LEAD_IN      = LEFT_MARGIN;
  const usableW      = Math.max(STEP_PX, bandW - LEFT_MARGIN - RIGHT_MARGIN);
  const cardsPerPage = Math.max(1, Math.floor(usableW / STEP_PX));
  const PAGE_STRIDE  = cardsPerPage * STEP_PX;
  const page         = Math.floor(shownCompleted / cardsPerPage);
  const lastPage     = Math.floor(total / cardsPerPage);
  const worldWidth   = LEAD_IN + (lastPage + 1) * PAGE_STRIDE + RIGHT_MARGIN;
  const cameraX      = page * PAGE_STRIDE;                  // changes ONLY at flips
  const charWorldX   = LEAD_IN + shownCompleted * STEP_PX;  // continuous, never resets

  // ── Entry walk-in animation (retargeted to world coords) ───────────────────
  // Camera is pinned at 0 during entry; character walks from off-left to LEAD_IN.
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

  const isWalking = entering || walking;
  const isWrong = wronging && !isWalking && wrongSprite?.src && WRONG_FRAMES > 0;

  // Sprite sources for the current character state
  const charBg = isWalking
    ? {
        backgroundImage: `url(${walkSprite?.src})`,
        backgroundSize: `${WALK_FRAMES * W}px ${W}px`,
        animation: `${KF_WALK} ${WALK_CYCLE_MS}ms steps(${WALK_FRAMES}) infinite`,
      }
    : isWrong
    ? {
        backgroundImage: `url(${wrongSprite?.src})`,
        backgroundSize: `${WRONG_FRAMES * W}px ${W}px`,
        animation: `${KF_WRONG} ${WRONG_CYCLE_MS}ms steps(${WRONG_FRAMES}) ${Math.ceil(WRONG_DURATION / WRONG_CYCLE_MS)}`,
      }
    : {
        backgroundImage: `url(${idleSprite?.src})`,
        backgroundSize: `${IDLE_FRAMES * W}px ${W}px`,
        animation: `${KF_IDLE} ${IDLE_CYCLE_MS}ms steps(${IDLE_FRAMES}) infinite`,
      };

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
          const phase = flagPhase(m);
          const sprite =
            phase === 'activation'
              ? { backgroundImage: `url(${flag.activate.src})`, backgroundSize: `${FLAG_ACT_FRAMES * FW}px ${FW}px`, animation: `${KF_FLAG_ACT} ${FLAG_ACT_MS}ms steps(${FLAG_ACT_FRAMES}) 1` }
              : phase === 'waving'
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
            <div style={{
              width: W, height: W,
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
              backgroundImage: `url(${walkSprite?.src})`,
              backgroundSize: `${WALK_FRAMES * W}px ${W}px`,
              animation: `${KF_WALK} ${WALK_CYCLE_MS}ms steps(${WALK_FRAMES}) infinite`,
            }} />
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
            <div style={{
              width: W, height: W,
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
              ...charBg,
            }} />
          </div>
        )}
      </div>
    </div>
  );
}