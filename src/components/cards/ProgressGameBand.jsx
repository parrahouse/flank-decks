import { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { useSound } from '@/hooks/useSound';
import { DEFAULT_GROUND, getSkin, DEFAULT_SKIN_ID, resolveSprite } from './skins';

// ── ART-INDEPENDENT CONSTANTS ─────────────────────────────────────────────────
const BAND_H = 100;
const SKY    = '#e5e7eb';

// FEEL DIALS — tune by eye
const STEP_MS  = 1000;  // time to walk one card's distance

// ART-ANCHORED — only change if the walk artwork's stride changes
const STRIDE_PER_CYCLE_PX = 48; // on-screen ground travel per one full walk cycle

// CAMERA — waypoint-anchored
const ANCHOR_FRAC = 0.52;  // waypoints sit just right of center
const ENTRY_FRAC  = 0.08;  // where a segment starts, from the left

const IDLE_CYCLE_MS = 800;
// Walk cycle is DERIVED so foot speed matches ground speed (no skating):
//   WALK_CYCLE_MS = STEP_MS * STRIDE_PER_CYCLE_PX / STEP_PX
// (computed in-component now that STEP_PX is width-relative)

// Reaction cadence — one-shot reactions; duration = frames * REACT_FRAME_MS
const REACT_FRAME_MS = 90;

// Waypoint system — egg-laying choreography at every-10 intervals
const WAYPOINT_EVERY   = 10;
// markers now follow the same SCALE as the character
const EGGLAY_MS       = 15 * REACT_FRAME_MS;  // egg-laying one-shot duration
const EGG_REVEAL_MS   = 6  * REACT_FRAME_MS;  // egg settle one-shot
const MARKER_PLANT_MS = 19 * REACT_FRAME_MS;  // pole+flag plant one-shot
const WAYPOINT_OFFSET = 0;   // world-x offset from Swab's stand point at m — tune by eye
const FINISH_OFFSET_PX_FACTOR = -1.0; // × character width W; pole sits behind Swab's final stand point — tune by eye

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
function GroundCanvas({ src, tileW, tileH, scale, dispH, cameraX, stepMs }) {
  const canvasRef  = useRef(null);
  const imgRef     = useRef(null);
  const readyRef   = useRef(false);

  const drawnXRef  = useRef(cameraX);   // currently-drawn offset
  const fromXRef   = useRef(cameraX);   // tween start
  const targetXRef = useRef(cameraX);   // tween end
  const startTRef  = useRef(0);
  const rafRef     = useRef(0);
  const runningRef = useRef(false);

  const draw = () => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !readyRef.current) return;

    const dpr   = window.devicePixelRatio || 1;
    const needW = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const needH = Math.max(1, Math.round(dispH * dpr));
    if (canvas.width  !== needW) canvas.width  = needW;   // assigning size also clears
    if (canvas.height !== needH) canvas.height = needH;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;                    // <-- the crispness switch

    const tileDevW = Math.round(tileW * scale * dpr);     // integer => uniform pixels
    const tileDevH = needH;

    const offsetDev = Math.round(drawnXRef.current * dpr); // snap to device grid
    const startX = -(((offsetDev % tileDevW) + tileDevW) % tileDevW); // in [-tileDevW, 0]

    ctx.clearRect(0, 0, needW, needH);
    for (let x = startX; x < needW; x += tileDevW) {
      ctx.drawImage(img, 0, 0, tileW, tileH, x, 0, tileDevW, tileDevH);
    }
  };

  // linear tween over stepMs, matching the removed `transition: ... linear`
  const tick = () => {
    const span = Math.max(1, stepMs);
    const t = Math.min(1, (performance.now() - startTRef.current) / span);
    drawnXRef.current = fromXRef.current + (targetXRef.current - fromXRef.current) * t;
    draw();
    if (t < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      runningRef.current = false;
    }
  };

  // load the tile once
  useEffect(() => {
    const img = new Image();
    img.onload = () => { readyRef.current = true; draw(); };
    img.src = src;
    imgRef.current = img;
  }, [src]);

  // retarget whenever the camera moves
  useEffect(() => {
    fromXRef.current   = drawnXRef.current;
    targetXRef.current = cameraX;
    startTRef.current  = performance.now();
    if (!runningRef.current) {
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [cameraX]);

  // redraw on band resize / DPR change
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        bottom: 0, left: 0,
        width: '100%', height: dispH,
        display: 'block',
        imageRendering: 'pixelated', // harmless belt-and-suspenders
      }}
    />
  );
}

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

  const CELL     = skin.cell;
  const BASELINE = skin.baseline;
  const SCALE    = skin.scale;
  const W        = CELL * SCALE;

  // Reveal nudge — forward step past a freshly laid egg so it sits visible behind Swab
  const REVEAL_NUDGE_PX = 1.00 * CELL;

  const TILE_W            = ground.tileW;
  const TILE_H            = ground.tileH;
  const GROUND_DISP       = TILE_H * SCALE;
  const FOOT_TO_BOTTOM    = (CELL - BASELINE) * SCALE;
  const CHAR_BOTTOM       = GROUND_DISP - FOOT_TO_BOTTOM;

  // ── Waypoint assets (egg-laying system) ────────────────────────────────────
  const eggLaySprite = skin.sprites?.eggLay;    // character one-shot (uses SCALE)
  const eggAsset     = skin.egg;                 // world element — scales with SCALE
  const markerAsset  = skin.marker;              // world element — NEVER scales (MARKER_SCALE only)

  // Egg — scales with the character
  const EGG_CELL      = eggAsset?.cell      ?? CELL;
  const EGG_BASELINE  = eggAsset?.baseline  ?? BASELINE;
  const EW            = EGG_CELL * SCALE;
  const EGG_FOOT_TO_BOTTOM = (EGG_CELL - EGG_BASELINE) * SCALE;
  const EGG_BOTTOM   = GROUND_DISP - EGG_FOOT_TO_BOTTOM;

  // Marker — follows the same SCALE as the character
  const MW           = (markerAsset?.tileW ?? 0) * SCALE;
  const MH           = (markerAsset?.tileH ?? 0) * SCALE;
  const MARKER_BASE  = markerAsset?.baseline ?? 0;
  const MARKER_FOOT_TO_BOTTOM = ((markerAsset?.tileH ?? 0) - MARKER_BASE) * SCALE;
  const MARKER_BOTTOM = GROUND_DISP - MARKER_FOOT_TO_BOTTOM;

  // Finish line — world element at m === total; scales with SCALE like the marker
  const finishAsset  = skin.finish;
  const FW           = (finishAsset?.tileW ?? 0) * SCALE;
  const FH           = (finishAsset?.tileH ?? 0) * SCALE;
  const FINISH_BASE  = finishAsset?.baseline ?? 0;
  const FINISH_FOOT_TO_BOTTOM = ((finishAsset?.tileH ?? 0) - FINISH_BASE) * SCALE;
  const FINISH_BOTTOM = GROUND_DISP - FINISH_FOOT_TO_BOTTOM;
  const FINISH_FRAMES = finishAsset?.frames || 0;
  const FINISH_LOOP_MS = FINISH_FRAMES * REACT_FRAME_MS; // loop cadence, matches reaction frame rate

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
  const EGGLAY_FRAMES    = eggLaySprite?.frames || 0;
  const EGG_FRAMES       = eggAsset?.frames || 0;
  const MARKER_FRAMES    = markerAsset?.frames || 0;

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
  const KF_EGGLAY     = `pgb-egglay-${skin.id}`;
  const KF_EGG        = `pgb-egg-${skin.id}`;
  const KF_MARKER     = `pgb-marker-${skin.id}`;
  const KF_FINISH     = `pgb-finish-${skin.id}`;

  const KEYFRAMES = `
@keyframes ${KF_IDLE} { from { background-position-x: 0 } to { background-position-x: -${IDLE_FRAMES * W}px } }
@keyframes ${KF_IDLE_SAD} { from { background-position-x: 0 } to { background-position-x: -${IDLE_SAD_FRAMES * W}px } }
@keyframes ${KF_WALK_HAPPY} { from { background-position-x: 0 } to { background-position-x: -${WALK_HAPPY_FRAMES * W}px } }
@keyframes ${KF_WALK_SAD} { from { background-position-x: 0 } to { background-position-x: -${WALK_SAD_FRAMES * W}px } }
@keyframes ${KF_RIGHT_SHOT} { from { background-position-x: 0 } to { background-position-x: -${Math.max(0, RIGHT_FRAMES - 1) * W}px } }
@keyframes ${KF_WRONG_SHOT} { from { background-position-x: 0 } to { background-position-x: -${Math.max(0, WRONG_FRAMES - 1) * W}px } }
@keyframes ${KF_EGGLAY} { from { background-position-x: 0 } to { background-position-x: -${Math.max(0, EGGLAY_FRAMES - 1) * W}px } }
@keyframes ${KF_EGG} { from { background-position-x: 0 } to { background-position-x: -${EGG_FRAMES * EW}px } }
@keyframes ${KF_MARKER} { from { background-position-x: 0 } to { background-position-x: -${Math.max(0, MARKER_FRAMES - 1) * MW}px } }
@keyframes ${KF_FINISH} { from { background-position-x: 0 } to { background-position-x: -${FINISH_FRAMES * FW}px } }
`;

  const { playWalking, stopWalking, playEggLay } = useSound(soundEnabled);

  const bandRef  = useRef(null);
  const [bandW, setBandW] = useState(0);

  // ── Phase machine ──────────────────────────────────────────────────────────
  // phase: 'idle' | 'reactRight' | 'reactWrong' | 'walk' | 'eggLay' | 'celebrate'
  // Exactly one character layer is visible at a time (opacity 1); the rest 0.
  const [phase, setPhase] = useState('idle');
  const [walkVariant, setWalkVariant] = useState('happy'); // 'happy' | 'sad'
  const [idleVariant, setIdleVariant] = useState('happy'); // idle shown after a walk
  const [reactKey, setReactKey] = useState(0);              // re-arm one-shot layers
  const [celebSub, setCelebSub] = useState('idle');         // 'idle' | 'react' during celebrate
  const [nudgeOffset, setNudgeOffset] = useState(0);        // forward reveal-nudge offset (px)
  const [nudgeDurMs, setNudgeDurMs] = useState(STEP_MS);    // duration of the current nudge animation
  const phaseRef = useRef('idle');
  const reactEndRef = useRef(0); // wall-clock ms when the in-flight reaction ends

  const catControls = useAnimation();
  const entryFiredRef = useRef(false);

  const processCommitRef = useRef(null);
  const commitCancelRef = useRef(null);         // cleanup of the in-flight processCommit

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

  // ── Waypoint positions — every 10 cards, excluding the finish ──────────────
  const waypoints = useMemo(() => {
    const arr = [];
    for (let m = WAYPOINT_EVERY; m < total; m += WAYPOINT_EVERY) arr.push(m);
    return arr; // finish (m === total) is handled by the separate finish prompt
  }, [total]);

  // Snapshot waypoints already passed on mount → seeded (marker planted, egg present, no animation)
  const seededPlantedRef = useRef(null);
  if (seededPlantedRef.current === null && waypoints.length) {
    seededPlantedRef.current = new Set(waypoints.filter((m) => shownCompleted > m));
  }

  // Eggs are laid at ARRIVAL, not at walk-start. shownCompleted flips to m the
  // instant the walk toward m begins, so gating egg visibility on it pops the egg
  // in before Swab reaches the marker. Track laid eggs explicitly; the live "laid"
  // event fires in finishWalk. Seed already-laid waypoints for resumed sessions
  // (egg is laid at arrival ⇒ present when shownCompleted >= m; note this is >=,
  // whereas marker seeding is > m because the marker plants on departure).
  const [laidEggs, setLaidEggs] = useState(() => new Set(waypoints.filter((m) => shownCompleted >= m)));

  // Finish line lights up when Swab clears it (final walk completes). Seed lit
  // for resumed already-complete sessions so it mounts mid-loop, not re-triggered.
  const [finishLit, setFinishLit] = useState(() => total > 0 && shownCompleted >= total);

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
  //   wrong key    → no reaction (wrong reaction already fired on wrongTick)
  //                  → sad walk, chained to the end of any in-flight reaction
  //   waypoint m  → lay an egg, then nudge forward to reveal it
  //   last card    → after the walk, switch to react.right looping (celebrate)
  function processCommit(completedVal, commitKey) {
    const isCorrect = !!commitKey && CORRECT_KEYS.has(commitKey);
    const variant = isCorrect ? 'happy' : 'sad';
    const isLast = completedVal >= total;
    const canCelebrate = RIGHT_FRAMES > 0 && !!rightSprite?.src;

    let cancelled = false;
    let tStart, tWalk, tEggLay, tNudge;

    const finishWalk = () => {
      if (cancelled) return;
      setReactKey((k) => k + 1);
      // Arrival at a waypoint = egg is laid now (behind Swab; the nudge reveals it).
      // Covers both the lay-animation path and any no-lay-sprite fallback below.
      if (isLast) {
        setFinishLit(true);
      }
      if (waypoints.includes(completedVal)) {
        setLaidEggs((prev) => prev.has(completedVal) ? prev : new Set(prev).add(completedVal));
      }
      if (isLast && canCelebrate) {
        stopWalking();
        phaseRef.current = 'celebrate'; setPhase('celebrate');
      } else if (isLast) {
        stopWalking();
        setIdleVariant('happy');                 // ends happy even with no reaction sprite
        phaseRef.current = 'idle'; setPhase('idle');
      } else if (waypoints.includes(completedVal) && EGGLAY_FRAMES > 0 && eggLaySprite?.src) {
        // Arrived at a waypoint → lay an egg, then nudge forward to reveal it
        stopWalking();
        phaseRef.current = 'eggLay'; setPhase('eggLay');
        playEggLay();   // one of three lay sounds, at random
        tEggLay = setTimeout(() => {
          if (cancelled) return;
          setNudgeDurMs(STEP_MS / 2);
          setWalkVariant('happy');
          phaseRef.current = 'walk'; setPhase('walk');
          setNudgeOffset(REVEAL_NUDGE_PX);
          playWalking();
          tNudge = setTimeout(() => {
            if (cancelled) return;
            stopWalking();
            setIdleVariant('happy');
            phaseRef.current = 'idle'; setPhase('idle');
          }, STEP_MS / 2);
        }, EGGLAY_MS);
      } else {
        stopWalking();
        setIdleVariant(variant);
        phaseRef.current = 'idle'; setPhase('idle');
      }
    };

    const startWalk = () => {
      if (cancelled) return;
      setNudgeOffset(0);
      setNudgeDurMs(STEP_MS);
      setWalkVariant(variant);
      phaseRef.current = 'walk'; setPhase('walk');
      playWalking();
      setShownCompleted(completedVal); // advances world position (CSS transition = walk)
      tWalk = setTimeout(finishWalk, STEP_MS);
    };

    if (isCorrect && canCelebrate) {
      // Play the right reaction one-shot, then chain the walk off its completion.
      setReactKey((k) => k + 1);
      phaseRef.current = 'reactRight'; setPhase('reactRight');
      reactEndRef.current = Date.now() + RIGHT_DUR;
      tStart = setTimeout(startWalk, RIGHT_DUR);
    } else {
      // Wrong commit. Two cases:
      //  • A wrong reaction is already in flight (flinch + commit on the same tick,
      //    e.g. eliminate-path or true/false first wrong) → chain the sad walk after
      //    it, exactly as before. Don't fire a second reaction.
      //  • Nothing in flight → this is a wrong SECOND GUESS, whose first-wrong flinch
      //    already finished. Fire a fresh wrong reaction now, then sad-walk after it.
      const remaining = Math.max(0, reactEndRef.current - Date.now());
      const canReactWrong = WRONG_FRAMES > 0 && !!wrongSprite?.src;
      if (remaining > 0 || !canReactWrong) {
        tStart = setTimeout(startWalk, remaining);
      } else {
        setReactKey((k) => k + 1);
        phaseRef.current = 'reactWrong'; setPhase('reactWrong');
        reactEndRef.current = Date.now() + WRONG_DUR;
        tStart = setTimeout(startWalk, WRONG_DUR);
      }
    }

    return () => { cancelled = true; clearTimeout(tStart); clearTimeout(tWalk); clearTimeout(tEggLay); clearTimeout(tNudge); };
  }

  processCommitRef.current = processCommit;

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

    commitCancelRef.current?.();
    commitCancelRef.current = processCommitRef.current(completed, commitKey);
  }, [completed]);

  useEffect(() => () => { commitCancelRef.current?.(); }, []);

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
      rightSprite?.src, wrongSprite?.src, eggLaySprite?.src, eggAsset?.src, markerAsset?.src,
      finishAsset?.src,
    ].filter(Boolean);
    urls.forEach((u) => { const img = new Image(); img.src = u; });
  }, [idleSprite?.src, idleSadSprite?.src, walkHappySprite?.src, walkSadSprite?.src, rightSprite?.src, wrongSprite?.src, eggLaySprite?.src, eggAsset?.src, markerAsset?.src, finishAsset?.src]);

  // ── Deadzone/push camera — Swab walks to center, then the world scrolls ────
  const ANCHOR_X = bandW * ANCHOR_FRAC;
  const LEAD_IN  = bandW * ENTRY_FRAC;
  const STEP_PX  = (ANCHOR_X - LEAD_IN) / WAYPOINT_EVERY || 1; // width-relative per-card distance
  // Walk cycle derived so foot speed matches ground speed (no skating):
  const WALK_CYCLE_MS = Math.round(STEP_MS * STRIDE_PER_CYCLE_PX / STEP_PX);

  // Each waypoint Swab has passed adds one REVEAL_NUDGE_PX forward; carry it into
  // charWorldX so the first walk after a waypoint is a full STEP_PX (the nudge that
  // uncovered the egg retracts at the same time the world advances by STEP_PX+nudge).
  const revealOffset = REVEAL_NUDGE_PX * waypoints.filter((m) => m < shownCompleted).length;
  const charWorldX = LEAD_IN + shownCompleted * STEP_PX + revealOffset;
  // Deadzone: camera stays 0 while Swab is left of ANCHOR_X, then pushes so he holds center.
  const cameraX = Math.max(0, charWorldX - ANCHOR_X);
  // Land the camera on a whole physical pixel so WebKit doesn't resample the
  // tiled ground at a fractional offset (the iPad-at-rest blur). Pure derivation.
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const snapPx = (v) => Math.round(v * dpr) / dpr;
  const cameraXSnapped = snapPx(cameraX);
  // World must hold every card + buffer (incl. accumulated reveal) so nothing clips:
  const worldWidth = LEAD_IN + total * STEP_PX + REVEAL_NUDGE_PX * waypoints.length + bandW;

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
  const showEggLay     = !entering && phase === 'eggLay';

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

      {/* EGG LAY — one-shot character pose (arrived at a waypoint) */}
      {eggLaySprite?.src && EGGLAY_FRAMES > 0 && (
        <div
          key={`egglay-${reactKey}`}
          style={{
            position: 'absolute', inset: 0, width: W, height: W,
            backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
            backgroundImage: `url(${eggLaySprite.src})`,
            backgroundSize: `${EGGLAY_FRAMES * W}px ${W}px`,
            animation: `${KF_EGGLAY} ${EGGLAY_MS}ms steps(${Math.max(1, EGGLAY_FRAMES - 1)}) forwards`,
            opacity: showEggLay ? 1 : 0,
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

      {/* Ground — canvas layer; tiles drawn crisp (nearest-neighbor) on WebKit */}
      <GroundCanvas
        src={ground.src}
        tileW={TILE_W}
        tileH={TILE_H}
        scale={SCALE}
        dispH={GROUND_DISP}
        cameraX={cameraXSnapped}
        stepMs={STEP_MS}
      />

      {/* World container — eggs + markers, scrolled by the camera */}
      <div style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: worldWidth,
        height: '100%',
        transform: `translateX(${-cameraXSnapped}px)`,
        willChange: 'transform',
        transition: `transform ${STEP_MS}ms linear`,
      }}>
        {/* Waypoint eggs — rendered BEFORE the character so Swab covers them at m */}
        {eggAsset?.src && EGG_FRAMES > 0 && waypoints.map((m) => {
          if (!laidEggs.has(m)) return null; // not laid until Swab arrives (see finishWalk)
          // Pre-reveal spot: accumulated earlier-waypoint reveal, but NOT m's own nudge.
          const fx = LEAD_IN + m * STEP_PX + REVEAL_NUDGE_PX * waypoints.filter((k) => k < m).length + WAYPOINT_OFFSET;
          return (
            <div
              key={`egg-${m}`}
              style={{
                position: 'absolute', zIndex: 1, bottom: EGG_BOTTOM, left: 0, width: EW, height: EW,
                transform: `translateX(${fx}px)`,
                backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
                backgroundImage: `url(${eggAsset.src})`,
                backgroundSize: `${EGG_FRAMES * EW}px ${EW}px`,
                animation: EGG_FRAMES > 1 ? `${KF_EGG} ${EGG_REVEAL_MS}ms steps(${EGG_FRAMES}) infinite` : 'none',
              }}
            />
          );
        })}

        {/* Waypoint markers — planted flag/pole; scales with SCALE */}
        {markerAsset?.src && MARKER_FRAMES > 0 && waypoints.map((m) => {
          // Pre-reveal spot: accumulated earlier-waypoint reveal, but NOT m's own nudge.
          const fx = LEAD_IN + m * STEP_PX + REVEAL_NUDGE_PX * waypoints.filter((k) => k < m).length + WAYPOINT_OFFSET;
          const isPlanted = shownCompleted > m;
          const wasSeeded = seededPlantedRef.current?.has(m);
          // Stable key (no remount flash). Re-arm the plant one-shot by toggling the
          // `animation` property when isPlanted flips — never by changing the key.
          //   seeded  (passed before mount) → hold final frame, no animation
          //   planted (live)                → play plant one-shot once, holds via `forwards`
          //   pending                       → frame 0, no animation
          return (
            <div
              key={`marker-${m}`}
              style={{
                position: 'absolute', bottom: MARKER_BOTTOM, left: 0, width: MW, height: MH,
                transform: `translateX(${fx}px)`,
                backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
                backgroundImage: `url(${markerAsset.src})`,
                backgroundSize: `${MARKER_FRAMES * MW}px ${MH}px`,
                backgroundPositionX: wasSeeded ? `-${(MARKER_FRAMES - 1) * MW}px` : '0',
                animation: (isPlanted && !wasSeeded)
                  ? `${KF_MARKER} ${MARKER_PLANT_MS}ms steps(${Math.max(1, MARKER_FRAMES - 1)}) forwards`
                  : 'none',
              }}
            />
          );
        })}

        {/* Finish line — world element at m === total; holds frame 0, loops once Swab clears it */}
        {finishAsset?.src && FINISH_FRAMES > 0 && (() => {
          const fx = LEAD_IN + total * STEP_PX
                   + REVEAL_NUDGE_PX * waypoints.length
                   + FINISH_OFFSET_PX_FACTOR * W;
          return (
            <div
              key="finish-line"
              style={{
                position: 'absolute', bottom: FINISH_BOTTOM, left: 0, width: FW, height: FH,
                transform: `translateX(${fx}px)`,
                backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
                backgroundImage: `url(${finishAsset.src})`,
                backgroundSize: `${FINISH_FRAMES * FW}px ${FH}px`,
                animation: finishLit
                  ? `${KF_FINISH} ${FINISH_LOOP_MS}ms steps(${FINISH_FRAMES}) infinite`
                  : 'none',
              }}
            />
          );
        })()}

      </div>

      {/* Character — screen space (sibling of the world container) */}
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
          transform: `translateX(${snapPx(charWorldX - cameraX)}px)`,
          transition: `transform ${STEP_MS}ms linear`,
          willChange: 'transform',
        }}>
          <motion.div
            animate={{ x: nudgeOffset }}
            transition={{ duration: nudgeDurMs / 1000, ease: 'linear' }}
            style={{ position: 'absolute', inset: 0, willChange: 'transform' }}
          >
            {layers}
          </motion.div>
        </div>
      )}
    </div>
  );
}