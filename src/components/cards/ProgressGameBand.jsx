import { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';

// ── CONFIG ──────────────────────────────────────────────────────────────────
const CELL     = 32;
const BASELINE = 29;
const SCALE    = 2;
const TILE_W   = 64;
const TILE_H   = 16;
const BAND_H   = 100;
const PAD      = 12;

const SKY = '#e5e7eb';

const GROUND_SRC = "https://media.base44.com/images/public/69fd6153088222f7245f34d6/5e5dbe4f0_groundtile.png";
const IDLE_SRC   = "https://media.base44.com/images/public/69fd6153088222f7245f34d6/f2e415cfd_catidle.png";
const WALK_SRC   = "https://media.base44.com/images/public/69fd6153088222f7245f34d6/6ede5faf0_catwalk.png";

const IDLE_FRAMES = 4;
const WALK_FRAMES = 4;

const STEP_MS       = 600;
const IDLE_CYCLE_MS = 800;
const WALK_CYCLE_MS = 500;

// ── FLAG CONFIG ──────────────────────────────────────────────────────────────
const FLAG_EVERY          = 10;
const MIN_CARDS_FOR_FLAGS = 20;
const FLAG_INACTIVE_SRC   = "https://media.base44.com/images/public/69fd6153088222f7245f34d6/6cec62a7e_flaginactive.png";
const FLAG_ACTIVATE_SRC   = "https://media.base44.com/images/public/69fd6153088222f7245f34d6/7ebf67c3a_flagactivation.png";
const FLAG_WAVE_SRC       = "https://media.base44.com/images/public/69fd6153088222f7245f34d6/c6323ddf5_flagwaving.png";
const FLAG_ACT_FRAMES     = 4;
const FLAG_WAVE_FRAMES    = 3;
const FLAG_ACT_MS         = 600;
const FLAG_WAVE_MS        = 700;

// ── DERIVED ──────────────────────────────────────────────────────────────────
const W              = CELL * SCALE;
const GROUND_DISP    = TILE_H * SCALE;
const FOOT_TO_BOTTOM = (CELL - BASELINE) * SCALE;
const CAT_BOTTOM     = GROUND_DISP - FOOT_TO_BOTTOM;
const FLAG_OFFSET    = Math.round(W * 0.6);

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
  to   { background-position-x: -${FLAG_ACT_FRAMES * W}px }
}
@keyframes pgb-flag-wave {
  from { background-position-x: 0 }
  to   { background-position-x: -${FLAG_WAVE_FRAMES * W}px }
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
  const COMPLETE_DELAY_MS = 300;

  const bandRef  = useRef(null);
  const [bandW, setBandW] = useState(0);
  const [walking, setWalking] = useState(false);

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
    const t1 = setTimeout(() => { setWalking(true); setShownCompleted(completed); }, COMPLETE_DELAY_MS);
    const t2 = setTimeout(() => setWalking(false), COMPLETE_DELAY_MS + STEP_MS);
    prevCompleted.current = completed;
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [completed]);

  // ── Horizontal position ───────────────────────────────────────────────────
  const progress = total > 0 ? shownCompleted / total : 0;
  const travel   = Math.max(0, bandW - W - PAD * 2);
  const x        = PAD + progress * travel;

  return (
    <div
      ref={bandRef}
      className="progress-game-band"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden', imageRendering: 'pixelated', background: SKY }}
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

      {/* Milestone flags — rendered before cat so cat paints on top */}
      {milestones.map((m) => {
        const fx    = PAD + (m / total) * travel + FLAG_OFFSET;
        const phase = flagPhase(m);
        const sprite =
          phase === 'activation'
            ? { backgroundImage: `url(${FLAG_ACTIVATE_SRC})`, backgroundSize: `${FLAG_ACT_FRAMES * W}px ${W}px`, animation: `pgb-flag-activate ${FLAG_ACT_MS}ms steps(${FLAG_ACT_FRAMES}) 1` }
            : phase === 'waving'
            ? { backgroundImage: `url(${FLAG_WAVE_SRC})`,    backgroundSize: `${FLAG_WAVE_FRAMES * W}px ${W}px`, animation: `pgb-flag-wave ${FLAG_WAVE_MS}ms steps(${FLAG_WAVE_FRAMES}) infinite` }
            : { backgroundImage: `url(${FLAG_INACTIVE_SRC})`, backgroundSize: `${W}px ${W}px`, animation: 'none' };
        return (
          <div key={m} style={{
            position: 'absolute', bottom: CAT_BOTTOM, left: 0, width: W, height: W,
            transform: `translateX(${fx}px)`,
            backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
            ...sprite,
          }} />
        );
      })}

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