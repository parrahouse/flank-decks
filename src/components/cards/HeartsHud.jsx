import { useEffect, useRef, useState } from 'react';

// Game Mode hearts — 16-frame 16x16 sheet.
// Frame map (0-indexed):
//   0      full heart (static hold)
//   1–13   break one-shot: blank flash -> dissolve -> clear
//   14–15  empty socket, 2-frame shimmer loop
const SHEET = 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/a4f085b72_Heart.png';
const FRAME  = 16;   // source frame px
const FRAMES = 16;   // total frames on the sheet
const SCALE  = 2;    // integer upscale -> 32x32 rendered, matches band chrome
const FRAME_MS   = 90;   // break playback speed (matches the band's REACT_FRAME_MS feel)
const SHIMMER_MS = 600;  // empty-socket shimmer half-period (tune by eye)

const FULL_FRAME  = 0;
const BREAK_START = 1;
const BREAK_END   = 13;
const EMPTY_A     = 14;
const EMPTY_B     = 15;

function Heart({ full }) {
  const [frame, setFrame] = useState(full ? FULL_FRAME : EMPTY_A);
  const prevRef  = useRef(full);
  const timerRef = useRef(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = full;
    if (timerRef.current) clearTimeout(timerRef.current);

    function shimmer() {
      let on = false;
      const swap = () => {
        setFrame(on ? EMPTY_B : EMPTY_A);
        on = !on;
        timerRef.current = setTimeout(swap, SHIMMER_MS);
      };
      swap();
    }

    if (full) {
      if (prev) {
        // was already full: just hold
        setFrame(FULL_FRAME);
      } else {
        // regained: materialize — the break one-shot in reverse, then hold full
        let i = BREAK_END;
        const tick = () => {
          setFrame(i);
          i -= 1;
          timerRef.current = setTimeout(i >= BREAK_START ? tick : () => setFrame(FULL_FRAME), FRAME_MS);
        };
        tick();
      }
    } else if (prev && !full) {
      // just lost: play the break one-shot, then settle into the shimmer loop
      let i = BREAK_START;
      const tick = () => {
        setFrame(i);
        i += 1;
        timerRef.current = setTimeout(i <= BREAK_END ? tick : shimmer, FRAME_MS);
      };
      tick();
    } else {
      // mounted empty: straight to shimmer
      shimmer();
    }

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [full]);

  return (
    <div style={{ width: FRAME * SCALE, height: FRAME * SCALE, overflow: 'hidden', position: 'relative' }}>
      <img
        src={SHEET}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          left: -frame * FRAME * SCALE,
          top: 0,
          width: FRAMES * FRAME * SCALE,
          height: FRAME * SCALE,
          maxWidth: 'none', // defeat Tailwind Preflight img { max-width: 100% }
          imageRendering: 'pixelated',
        }} />
    </div>
  );
}

export default function HeartsHud({ hearts = 3, max = 3 }) {
  return (
    <div className="flex items-center gap-1 select-none" title={`${hearts}/${max} hearts`}>
      {Array.from({ length: max }, (_, i) => <Heart key={i} full={i < hearts} />)}
    </div>
  );
}