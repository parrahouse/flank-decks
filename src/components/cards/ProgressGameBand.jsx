import { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { useSound } from '@/hooks/useSound';
import { DEFAULT_GROUND, DEFAULT_FLAG, getSkin, DEFAULT_SKIN_ID } from './skins';

// ── ART-INDEPENDENT CONSTANTS ─────────────────────────────────────────────────
const BAND_H = 100;
const PAD    = 12;
const SKY    = '#e5e7eb';

const STEP_MS       = 600;
const IDLE_CYCLE_MS = 800;
const WALK_CYCLE_MS = 500;

const FLAG_EVERY          = 10;
const MIN_CARDS_FOR_FLAGS = 20;
const FLAG_ACT_MS         = 600;
const FLAG_WAVE_MS        = 700;

const AVATAR_ENTRY_MS   = 1000;
const AVATAR_ENTRY_EASE = 'linear';

/**
 * ProgressGameBand — pixel-art walking-character progress HUD.
 * Pure consumer of props; owns no progress/score state.
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
 */
export default function ProgressGameBand({
  skin = getSkin(DEFAULT_SKIN_ID),
  cardIndex = 0,
  total = 1,
  scores = [],
  correctStreak = 0,
  soundEnabled = true,
  entering = false,
  onEntryComplete,
}) {
  // ── Derive per-render from skin ─────────────────────────────────────────────
  const ground  = skin.ground || DEFAULT_GROUND;
  const flag    = skin.flag   || DEFAULT_FLAG;
  const sprites = skin.sprites;

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

  const IDLE_FRAMES       = sprites.idle.frames;
  const WALK_FRAMES       = sprites.walk.frames;
  const FLAG_ACT_FRAMES   = flag.activate.frames;
  const FLAG_WAVE_FRAMES  = flag.wave.frames;

  const AVATAR_ENTRY_OFFSET = W * 4;

  // ── CSS keyframes (rebuilt whenever skin dims change) ───────────────────────
  const KEYFRAMES = `
@keyframes pgb-idle {
  from { background-position-x: 0 }
  to   { background-position-x: -${IDLE_FRAMES * W}px }
}
@keyframes pgb-walk {
  from { background-position-x: 0 }
  to   { background-position-x: -${WALK_FRAMES * W}px }
}
@keyframes pgb-flag-activate {
  from { background-position-x: 0 }
  to   { background-position-x: -${FLAG_ACT_FRAMES * FW}px }
}
@keyframes pgb-flag-wave {
  from { background-position-x: 0 }
  to   { background-position-x: -${FLAG_WAVE_FRAMES * FW}px }
}
`;

  const { playWalking, stopWalking } = useSound(soundEnabled);

  const bandRef  = useRef(null);
  const [bandW, setBandW] = useState(0);
  const [walking, setWalking] = useState(false);
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

  // ── Measure band width ────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const measure = () => {
      if (bandRef.current) setBandW(bandRef.current.offsetWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ── Walk trigger ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (completed === prevCompleted.current) return;
    const t1 = setTimeout(() => { setWalking(true); playWalking(); setShownCompleted(completed); }, 300);
    const t2 = setTimeout(() => { setWalking(false); stopWalking(); }, 300 + STEP_MS);
    prevCompleted.current = completed;
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [completed]);

  // ── Horizontal position ───────────────────────────────────────────────────
  const progress = total > 0 ? shownCompleted / total : 0;
  const travel   = Math.max(0, bandW - W - PAD * 2);
  const restX    = PAD + progress * travel;

  // ── Entry walk-in animation ───────────────────────────────────────────────
  useEffect(() => {
    if (!entering) {
      entryFiredRef.current = false;
      return;
    }
    if (entryFiredRef.current || bandW === 0) return;
    entryFiredRef.current = true;
    const startX = restX - AVATAR_ENTRY_OFFSET;
    catControls.set({ x: startX });
    catControls.start({
      x: restX,
      transition: { duration: AVATAR_ENTRY_MS / 1000, ease: AVATAR_ENTRY_EASE },
    }).then(() => {
      onEntryComplete && onEntryComplete();
    });
  }, [entering, bandW]);

  const isWalking = entering || walking;

  return (
    <div
      ref={bandRef}
      className="progress-game-band"
      aria-hidden="true"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden', imageRendering: 'pixelated' }}
    >
      <style>{KEYFRAMES}</style>

      {/* Ground strip */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: GROUND_DISP,
        backgroundImage: `url(${ground.src})`,
        backgroundRepeat: 'repeat-x',
        backgroundSize: `${TILE_W * SCALE}px ${GROUND_DISP}px`,
        imageRendering: 'pixelated',
      }} />

      {/* Milestone flags — rendered before character so character paints on top */}
      {milestones.map((m) => {
        const fx    = PAD + (m / total) * travel + FLAG_OFFSET;
        const phase = flagPhase(m);
        const sprite =
          phase === 'activation'
            ? { backgroundImage: `url(${flag.activate.src})`, backgroundSize: `${FLAG_ACT_FRAMES * FW}px ${FW}px`, animation: `pgb-flag-activate ${FLAG_ACT_MS}ms steps(${FLAG_ACT_FRAMES}) 1` }
            : phase === 'waving'
            ? { backgroundImage: `url(${flag.wave.src})`,     backgroundSize: `${FLAG_WAVE_FRAMES * FW}px ${FW}px`, animation: `pgb-flag-wave ${FLAG_WAVE_MS}ms steps(${FLAG_WAVE_FRAMES}) infinite` }
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

      {/* Character wrapper — translates horizontally */}
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
            backgroundImage: `url(${sprites.walk.src})`,
            backgroundSize: `${WALK_FRAMES * W}px ${W}px`,
            animation: `pgb-walk ${WALK_CYCLE_MS}ms steps(${WALK_FRAMES}) infinite`,
          }} />
        </motion.div>
      ) : (
        <div style={{
          position: 'absolute',
          bottom: CHAR_BOTTOM,
          left: 0,
          width: W,
          height: W,
          transform: `translateX(${restX}px)`,
          transition: `transform ${STEP_MS}ms ease`,
          willChange: 'transform',
        }}>
          <div style={{
            width: W, height: W,
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            ...(isWalking
              ? {
                  backgroundImage: `url(${sprites.walk.src})`,
                  backgroundSize: `${WALK_FRAMES * W}px ${W}px`,
                  animation: `pgb-walk ${WALK_CYCLE_MS}ms steps(${WALK_FRAMES}) infinite`,
                }
              : {
                  backgroundImage: `url(${sprites.idle.src})`,
                  backgroundSize: `${IDLE_FRAMES * W}px ${W}px`,
                  animation: `pgb-idle ${IDLE_CYCLE_MS}ms steps(${IDLE_FRAMES}) infinite`,
                }
            ),
          }} />
        </div>
      )}
    </div>
  );
}