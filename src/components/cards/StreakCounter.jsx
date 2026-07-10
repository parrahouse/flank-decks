import { useEffect, useRef, useState } from 'react';

// Swab streak counter — 32-frame 16x16 sheet. Egg fills over 5 correct answers,
// "lays" (empties) at each multiple of 5, and drains when the streak breaks.
const SHEET = 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/1550b7b3a_Swab-Streak-Counter.png';
const FRAME = 16;    // source frame px
const FRAMES = 32;   // total frames on the sheet
const SCALE = 2;     // integer upscale -> 32x32 rendered
const FRAME_MS = 38; // per-frame playback speed (tune to taste)

// Steady hold frame for the current fill level (index by streak % 5).
const HOLD = [0, 7, 11, 15, 19];

// Fill-burst start frame for each level (streak % 5; 0 is the milestone/lay).
const FILL_START = { 1: 1, 2: 8, 3: 12, 4: 16 };

// Break drain: enter the 24..31 emptying run at the frame whose fill roughly
// matches the current level, so a mid-fill break empties from where it sits
// instead of snapping to full first. Frames chosen from the measured grey fill.
const DRAIN_START = { 1: 27, 2: 26, 3: 26, 4: 25 };

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
    if (m === 0) return { frames: [...range(20, 23), ...range(24, 31)], land: 0 }; // lay + empty
    return { frames: range(FILL_START[m], HOLD[m]), land: HOLD[m] };               // fill burst
  }
  if (next === 0) {                                                                 // streak broke
    const pm = prev % 5;
    if (!DRAIN_START[pm]) return { frames: [], land: 0 };                           // was empty
    return { frames: range(DRAIN_START[pm], 31), land: 0 };
  }
  return { frames: [], land: HOLD[next % 5] };                                      // fallback settle
}

const pad = (n) => String(n).padStart(2, '0');

export default function StreakCounter({ streak = 0, record = 0 }) {
  const [frame, setFrame] = useState(HOLD[streak % 5] ?? 0);
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
            width: FRAME * FRAMES * SCALE, height: size, // 1024 x 32
            transform: `translateX(${-frame * size}px)`,  // always an integer step
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