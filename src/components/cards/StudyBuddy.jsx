import { useEffect, useRef, useState } from 'react';

const SPRITE_URL = 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/ca052c87c_sprite-sheet.png';

// Sprite sheet: 4 columns × 3 rows of frames
// Each frame: 48px wide × 64px tall (sheet is 192×192)
const FRAME_W = 48;
const FRAME_H = 64;
const DISPLAY_SCALE = 1.5; // render at 1.5x

// Row definitions (0-indexed)
// Row 0: walk right (4 frames)
// Row 1: idle / front-facing (4 frames)
// Row 2: walk left (4 frames)
const ANIMS = {
  walkRight: { row: 0, frames: 4, fps: 8 },
  idle:      { row: 1, frames: 4, fps: 4 },
  walkLeft:  { row: 2, frames: 4, fps: 8 },
};

const WALK_SPEED = 40; // px per second
const PANEL_PADDING = 16; // px from each edge

export default function StudyBuddy({ containerWidth = 160 }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    x: PANEL_PADDING,
    dir: 1, // 1 = right, -1 = left
    anim: 'walkRight',
    frame: 0,
    frameTimer: 0,
    lastTime: null,
  });
  const imgRef = useRef(null);
  const rafRef = useRef(null);
  const [imgReady, setImgReady] = useState(false);

  const displayW = FRAME_W * DISPLAY_SCALE;
  const displayH = FRAME_H * DISPLAY_SCALE;
  const maxX = containerWidth - displayW - PANEL_PADDING;

  // Load sprite sheet once
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = SPRITE_URL;
    img.onload = () => {
      imgRef.current = img;
      setImgReady(true);
    };
  }, []);

  useEffect(() => {
    if (!imgReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const tick = (timestamp) => {
      const s = stateRef.current;
      if (!s.lastTime) s.lastTime = timestamp;
      const dt = Math.min((timestamp - s.lastTime) / 1000, 0.1);
      s.lastTime = timestamp;

      // Move
      s.x += WALK_SPEED * s.dir * dt;

      // Bounce at edges
      if (s.x >= maxX) {
        s.x = maxX;
        s.dir = -1;
        s.anim = 'walkLeft';
        s.frame = 0;
        s.frameTimer = 0;
      } else if (s.x <= PANEL_PADDING) {
        s.x = PANEL_PADDING;
        s.dir = 1;
        s.anim = 'walkRight';
        s.frame = 0;
        s.frameTimer = 0;
      }

      // Advance animation frame
      const anim = ANIMS[s.anim];
      s.frameTimer += dt;
      const frameDuration = 1 / anim.fps;
      if (s.frameTimer >= frameDuration) {
        s.frameTimer -= frameDuration;
        s.frame = (s.frame + 1) % anim.frames;
      }

      // Draw
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        imgRef.current,
        s.frame * FRAME_W,       // source x
        anim.row * FRAME_H,       // source y
        FRAME_W,                  // source w
        FRAME_H,                  // source h
        s.x,                      // dest x
        0,                        // dest y
        displayW,                 // dest w
        displayH                  // dest h
      );

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [imgReady, maxX]);

  return (
    <canvas
      ref={canvasRef}
      width={containerWidth}
      height={displayH}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    />
  );
}