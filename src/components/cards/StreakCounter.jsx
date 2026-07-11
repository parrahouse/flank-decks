import { useEffect, useRef, useState } from 'react';

// Swab streak counter — 32-frame 16x16 sheet. Egg fills over 5 correct answers,
// "lays" (empties) at each multiple of 5, and drains when the streak breaks.
const SHEET = 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/1550b7b3a_Swab-Streak-Counter.png';
const FRAME = 16;    // source frame px
const FRAMES = 32;   // total frames on the sheet
const SCALE = 2;     // integer upscale -> 32x32 rendered
const FRAME_MS = 38; // per-frame playback speed (tune to taste)

const LEVEL = { 1: 6, 2: 10, 3: 14, 4: 18 }; // holds for the 1st..4th correct
const FULL = 22;                             // hold for the 5th — egg full (milestone)
const FILL_START = { 1: 1, 2: 7, 3: 11, 4: 15 };

// Break drain: enter the 24..31 emptying run at the frame whose fill roughly
// matches the current level, so a mid-fill break empties from where it sits
// instead of snapping to full first. Frames chosen from the measured grey fill.
const DRAIN_START = { 1: 27, 2: 26, 3: 25, 4: 24 };
const LAY_DELAY_MS = 450; // hold full this long before draining, so the drain lines
                          // up with Swab's egg-lay (tune to the react gap; 0 = drain at once)

// Resting frame for a streak value: empty at 0 and after each lay.
const holdFrame = (s) => (s % 5 === 0 ? 0 : LEVEL[s % 5]);

const range = (a, b) => {
  const out = [], step = a <= b ? 1 : -1;
  for (let i = a; i !== b + step; i += step) out.push(i);
  return out;
};

// Frames to play (and where to settle) when the streak goes prev -> next.
function sequenceFor(prev, next) {
  if (next === prev) return null;
  if (next > prev) {
    const m = next % 5;
    if (m === 0) {
      // Milestone: fill to full, hold full through the reaction, then drain in
      // sync with the egg-lay. The full-frame pad delays the drain by ~LAY_DELAY_MS.
      const pad = Array(Math.max(0, Math.round(LAY_DELAY_MS / FRAME_MS))).fill(FULL);
      return { frames: [...range(19, 22), ...pad, ...range(23, 31)], land: 0 };
    }
    return { frames: range(FILL_START[m], LEVEL[m]), land: LEVEL[m] };
  }
  if (next === 0) {                                                                 // streak broke
    const pm = prev % 5;
    if (!DRAIN_START[pm]) return { frames: [], land: 0 };   // pm===0: already empty (post-lay)
    return { frames: range(DRAIN_START[pm], 31), land: 0 };
  }
  return { frames: [], land: holdFrame(next) };                                     // fallback settle
}

const pad = (n) => String(n).padStart(2, '0');

export default function StreakCounter({ streak = 0, record = 0 }) {
  const [frame, setFrame] = useState(holdFrame(streak));
  const prevRef = useRef(streak);
  const timerRef = useRef(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = streak;
    const seq = sequenceFor(prev, streak);
    if (!seq) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    if (seq.frames.length === 0) { setFrame(seq.land); return; }

    let i = 0;
    const tick = () => {
      setFrame(seq.frames[i]);
      i += 1;
      timerRef.current = setTimeout(
        i < seq.frames.length ? tick : () => setFrame(seq.land),
        FRAME_MS
      );
    };
    tick();

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [streak]);

  const size = FRAME * SCALE; // 32

  return (
    <div
      className="flex items-center gap-1.5 select-none"
      aria-label={`Streak ${streak}, record ${record}`}
      title={`Streak ${streak} / record ${record}`}
    >
      <div style={{ width: size, height: size, overflow: 'hidden', position: 'relative' }}>
        <img
          src={SHEET}
          alt=""
          aria-hidden
          style={{
            position: 'absolute', top: 0, left: 0,
            display: 'block',
            width: FRAME * FRAMES * SCALE,   // 1024
            height: size,                    // 32
            maxWidth: 'none',                // opt out of Tailwind Preflight's img{max-width:100%}
            transform: `translateX(${-frame * size}px)`,
            imageRendering: 'pixelated',
          }}
        />
      </div>
      <span className="uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: 20, lineHeight: 1, letterSpacing: 1 }}>
        <span className="text-foreground">{pad(streak)}</span>
        <span className="text-muted-foreground">/{pad(record)}</span>
      </span>
    </div>
  );
}