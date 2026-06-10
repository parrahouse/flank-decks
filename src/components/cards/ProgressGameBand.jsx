import { useRef, useState, useEffect, useLayoutEffect } from 'react';

// ── CONFIG ──────────────────────────────────────────────────────────────────
const CELL     = 32;
const BASELINE = 29;
const SCALE    = 2;
const TILE_W   = 64;
const TILE_H   = 16;
const BAND_H   = 100;
const PAD      = 12;

const GROUND_SRC = "https://media.base44.com/images/public/69fd6153088222f7245f34d6/5e5dbe4f0_groundtile.png";
const IDLE_SRC   = "https://media.base44.com/images/public/69fd6153088222f7245f34d6/f2e415cfd_catidle.png";
const WALK_SRC   = "https://media.base44.com/images/public/69fd6153088222f7245f34d6/6ede5faf0_catwalk.png";

const IDLE_FRAMES = 4;
const WALK_FRAMES = 4;

const STEP_MS       = 600;
const IDLE_CYCLE_MS = 800;
const WALK_CYCLE_MS = 500;

// ── DERIVED ──────────────────────────────────────────────────────────────────
const W              = CELL * SCALE;
const GROUND_DISP    = TILE_H * SCALE;
const FOOT_TO_BOTTOM = (CELL - BASELINE) * SCALE;
const CAT_BOTTOM     = GROUND_DISP - FOOT_TO_BOTTOM;

const KEYFRAMES = `
@keyframes pgb-idle {
  from { background-position-x: 0 }
  to   { background-position-x: -${IDLE_FRAMES * W}px }
}
@keyframes pgb-walk {
  from { background-position-x: 0 }
  to   { background-position-x: -${WALK_FRAMES * W}px }
}
`;

/**
 * ProgressGameBand — pixel-art walking-cat progress HUD.
 * Pure consumer of props; owns no progress/score state.
 *
 * Props:
 *   cardIndex     — current card (0-based)
 *   total         — total cards in session
 *   scores        — array of score results so far
 *   correctStreak — current consecutive correct streak
 */
export default function ProgressGameBand({ cardIndex = 0, total = 1, scores = [], correctStreak = 0 }) {
  const bandRef     = useRef(null);
  const [bandW, setBandW] = useState(0);
  const [walking, setWalking]   = useState(false);
  const prevIndexRef = useRef(cardIndex);
  const walkTimerRef = useRef(null);

  // Measure band width
  useLayoutEffect(() => {
    const measure = () => {
      if (bandRef.current) setBandW(bandRef.current.offsetWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Trigger walk animation on card change
  useEffect(() => {
    if (prevIndexRef.current !== cardIndex) {
      prevIndexRef.current = cardIndex;
      setWalking(true);
      clearTimeout(walkTimerRef.current);
      walkTimerRef.current = setTimeout(() => setWalking(false), STEP_MS);
    }
    return () => clearTimeout(walkTimerRef.current);
  }, [cardIndex]);

  // Horizontal position
  const progress = total > 1 ? cardIndex / (total - 1) : 0;
  const travel   = Math.max(0, bandW - W - PAD * 2);
  const x        = PAD + progress * travel;

  // Progress stripe width
  const progressPct = total > 0 ? (cardIndex / total) * 100 : 0;

  return (
    <div
      ref={bandRef}
      className="progress-game-band"
      aria-hidden="true"
      style={{ position: 'relative', height: BAND_H, overflow: 'hidden', imageRendering: 'pixelated' }}
    >
      <style>{KEYFRAMES}</style>

      {/* Ground strip */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: GROUND_DISP,
        backgroundImage: `url(${GROUND_SRC})`,
        backgroundRepeat: 'repeat-x',
        backgroundSize: `${TILE_W * SCALE}px ${GROUND_DISP}px`,
        imageRendering: 'pixelated',
      }} />

      {/* Progress stripe — sits above the ground */}
      <div style={{
        position: 'absolute',
        bottom: GROUND_DISP,
        left: 0,
        height: 3,
        width: `${progressPct}%`,
        backgroundColor: '#4ade80',
        transition: 'width 0.4s ease',
      }} />

      {/* Cat wrapper — translates horizontally */}
      <div style={{
        position: 'absolute',
        bottom: CAT_BOTTOM,
        left: 0,
        width: W,
        height: W,
        transform: `translateX(${x}px)`,
        transition: `transform ${STEP_MS}ms ease`,
        willChange: 'transform',
      }}>
        {/* Cat sprite */}
        <div style={{
          width: W,
          height: W,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          ...(walking
            ? {
                backgroundImage: `url(${WALK_SRC})`,
                backgroundSize: `${WALK_FRAMES * W}px ${W}px`,
                animation: `pgb-walk ${WALK_CYCLE_MS}ms steps(${WALK_FRAMES}) infinite`,
              }
            : {
                backgroundImage: `url(${IDLE_SRC})`,
                backgroundSize: `${IDLE_FRAMES * W}px ${W}px`,
                animation: `pgb-idle ${IDLE_CYCLE_MS}ms steps(${IDLE_FRAMES}) infinite`,
              }
          ),
        }} />
      </div>
    </div>
  );
}