import { useEffect, useRef, useState } from 'react';

// Game Mode hearts — 8-frame 12x12 sheet.
// Frame map (0-indexed):
//   0     full heart (static hold)
//   1–6   flicker one-shot: blank/filled alternation (three blinks)
//   7     gray heart (static hold — no shimmer loop on this sheet)
const SHEET = 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/a0eecace9_Heart-Small.png';
const FRAME  = 12;   // source frame px
const FRAMES = 8;    // total frames on the sheet
const SCALE  = 2;    // integer upscale -> 24x24 rendered
const FRAME_MS = 90; // flicker playback speed (tune by eye)

const FULL_FRAME    = 0;
const FLICKER_START = 1;
const FLICKER_END   = 6;
const EMPTY_FRAME   = 7;

function Heart({ full }) {
  const [frame, setFrame] = useState(full ? FULL_FRAME : EMPTY_FRAME);
  const prevRef  = useRef(full);
  const timerRef = useRef(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = full;
    if (timerRef.current) clearTimeout(timerRef.current);

    if (full) {
      if (prev) {
        // was already full: just hold
        setFrame(FULL_FRAME);
      } else {
        // regained: flicker in reverse, then hold full.
        // Start at FLICKER_END (frame 7 is already on screen).
        let i = FLICKER_END;
        const tick = () => {
          setFrame(i);
          i -= 1;
          timerRef.current = setTimeout(i >= FLICKER_START ? tick : () => setFrame(FULL_FRAME), FRAME_MS);
        };
        tick();
      }
    } else if (prev && !full) {
      // just lost: play the flicker forward, ending on the gray hold frame
      let i = FLICKER_START;
      const run = () => {
        setFrame(i);
        i += 1;
        if (i <= EMPTY_FRAME) timerRef.current = setTimeout(run, FRAME_MS);
      };
      run();
    } else {
      // mounted empty: static gray hold
      setFrame(EMPTY_FRAME);
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