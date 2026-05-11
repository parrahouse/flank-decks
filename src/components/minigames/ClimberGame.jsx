import { useEffect, useRef, useCallback } from 'react';

const W = 240;
const H = 400;
const LEDGE_COUNT = 7;
const LEDGE_H = 12;
const LEDGE_W = 80;
const LEDGE_SPACING = 52;

// Ledge x positions: alternate left/right
function getLedgeX(index) {
  return index % 2 === 0 ? 8 : W - LEDGE_W - 8;
}
function getLedgeY(index, cameraOffset) {
  // index 0 = bottom start ledge; cameraOffset scrolls the world upward
  return H - 40 - index * LEDGE_SPACING - cameraOffset;
}

// --- Pixel art drawing helpers ---
function drawRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function drawCloud(ctx, x, y) {
  const pts = [
    [8,4],[9,4],[10,4],[11,4],[12,4],
    [6,3],[7,3],[8,3],[9,3],[10,3],[11,3],[12,3],[13,3],[14,3],
    [5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[12,2],[13,2],[14,2],[15,2],
    [4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],[13,1],[14,1],[15,1],[16,1],[17,1],
    [3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],[12,0],[13,0],[14,0],[15,0],[16,0],[17,0],[18,0],[19,0],[20,0],
  ];
  pts.forEach(([px, py]) => drawRect(ctx, x + px * 2, y + py * 2, 2, 2, 'rgba(255,255,255,0.92)'));
}

function drawLedge(ctx, x, y) {
  // Gray rock base
  for (let i = 0; i < LEDGE_W; i++) {
    drawRect(ctx, x + i, y + 2, 1, LEDGE_H - 2, '#8a8a8a');
    drawRect(ctx, x + i, y, 1, 2, '#aaaaaa');
  }
  // Shadows/depth
  drawRect(ctx, x, y + LEDGE_H - 2, LEDGE_W, 2, '#666');
  drawRect(ctx, x + LEDGE_W - 2, y + 2, 2, LEDGE_H - 2, '#666');
  // Rock detail pixels
  drawRect(ctx, x + 6, y + 4, 4, 2, '#777');
  drawRect(ctx, x + 18, y + 6, 4, 2, '#777');
  drawRect(ctx, x + 32, y + 4, 4, 2, '#888');
  drawRect(ctx, x + 50, y + 6, 4, 2, '#777');
  drawRect(ctx, x + 66, y + 4, 4, 2, '#888');
  // Green moss patches on top edge
  const mossSpots = [4, 12, 22, 34, 46, 58, 68];
  mossSpots.forEach(mx => {
    drawRect(ctx, x + mx, y, 2, 2, '#4a7c3f');
    if (mx + 2 < LEDGE_W) drawRect(ctx, x + mx + 2, y, 2, 2, '#5a9c4f');
  });
}

// Climber pixel art - 9x14 px sprite, drawn at 2x scale (18x28)
function drawClimber(ctx, x, y, state, frame) {
  const px = Math.round(x);
  const py = Math.round(y);
  const S = 2; // pixel scale

  // Colors
  const skin = '#f4c08a';
  const shirt = '#3a6fc4';
  const pants = '#4a3a2a';
  const boots = '#2a1a0a';
  const hair = '#3a2a0a';
  const shadow = '#c08050';

  if (state === 'dead') return;

  const r = (ox, oy, w, h, c) => drawRect(ctx, px + ox * S, py + oy * S, w * S, h * S, c);

  // HEAD
  r(3, 0, 3, 1, hair);
  r(2, 1, 5, 3, skin);
  r(3, 2, 1, 1, '#333');
  r(5, 2, 1, 1, '#333');
  if (state === 'scramble') {
    r(3, 3, 3, 1, '#c05040');
  } else {
    r(3, 3, 3, 1, shadow);
  }

  if (state === 'idle') {
    r(2, 4, 5, 4, shirt);
    r(1, 4, 1, 3, skin);
    r(7, 4, 1, 3, skin);
    r(2, 8, 2, 3, pants);
    r(5, 8, 2, 3, pants);
    r(2, 11, 2, 2, boots);
    r(5, 11, 2, 2, boots);
  } else if (state === 'jump') {
    r(2, 4, 5, 4, shirt);
    r(1, 2, 1, 3, skin);
    r(7, 2, 1, 3, skin);
    r(2, 8, 2, 2, pants);
    r(5, 8, 2, 2, pants);
    r(1, 10, 2, 1, pants);
    r(6, 10, 2, 1, pants);
    r(1, 11, 2, 2, boots);
    r(6, 11, 2, 2, boots);
  } else if (state === 'scramble') {
    r(2, 4, 5, 4, shirt);
    r(0, 3, 2, 2, skin);
    r(7, 3, 2, 2, skin);
    const legOff = frame % 12 < 6 ? 0 : 1;
    r(2, 8, 2, 3 + legOff, pants);
    r(5, 8, 2, 3 - legOff, pants);
    r(2, 11 + legOff, 2, 2, boots);
    r(5, 11 - legOff, 2, 2, boots);
  } else if (state === 'fall') {
    r(2, 4, 5, 4, shirt);
    r(0, 4, 2, 2, skin);
    r(7, 4, 2, 2, skin);
    r(1, 8, 2, 3, pants);
    r(6, 8, 2, 3, pants);
    r(1, 11, 2, 2, boots);
    r(6, 11, 2, 2, boots);
  }
}

function drawSkull(ctx, cx, cy) {
  // Skull and crossbones drawn at 2x pixel scale
  const P = 2;
  const SC = '#e8e8e8';
  const D = '#888';
  const B = '#222';

  const dome = [
    [8,0],[9,0],[10,0],[11,0],[12,0],[13,0],[14,0],[15,0],[16,0],
    [5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],[13,1],[14,1],[15,1],[16,1],[17,1],[18,1],[19,1],
    [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[12,2],[13,2],[14,2],[15,2],[16,2],[17,2],[18,2],[19,2],[20,2],
    [3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3],[12,3],[13,3],[14,3],[15,3],[16,3],[17,3],[18,3],[19,3],[20,3],[21,3],
    [3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],[12,4],[13,4],[14,4],[15,4],[16,4],[17,4],[18,4],[19,4],[20,4],[21,4],
    [3,5],[4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],[12,5],[13,5],[14,5],[15,5],[16,5],[17,5],[18,5],[19,5],[20,5],[21,5],
    [3,6],[4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[15,6],[16,6],[17,6],[18,6],[19,6],[20,6],[21,6],
    [4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],[13,7],[14,7],[15,7],[16,7],[17,7],[18,7],[19,7],[20,7],
    [5,8],[6,8],[7,8],[8,8],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[15,8],[16,8],[17,8],[18,8],[19,8],
  ];
  dome.forEach(([px, py]) => drawRect(ctx, cx - 24 + px * P, cy - 40 + py * P, P, P, SC));

  [[5,3],[6,3],[7,3],[5,4],[6,4],[7,4],[5,5],[6,5],[7,5]].forEach(([px, py]) =>
    drawRect(ctx, cx - 24 + px * P, cy - 40 + py * P, P, P, B));
  [[13,3],[14,3],[15,3],[13,4],[14,4],[15,4],[13,5],[14,5],[15,5]].forEach(([px, py]) =>
    drawRect(ctx, cx - 24 + px * P, cy - 40 + py * P, P, P, B));

  [[10,6],[11,6],[10,7],[11,7]].forEach(([px, py]) =>
    drawRect(ctx, cx - 24 + px * P, cy - 40 + py * P, P, P, D));

  const jaw = [
    [5,9],[6,9],[7,9],[8,9],[9,9],[10,9],[11,9],[12,9],[13,9],[14,9],[15,9],[16,9],[17,9],[18,9],[19,9],
    [5,10],[6,10],[19,10],[7,10],[11,10],[12,10],[15,10],[16,10],
    [5,11],[7,11],[9,11],[11,11],[13,11],[15,11],[17,11],[19,11],
    [5,12],[6,12],[7,12],[8,12],[9,12],[10,12],[11,12],[12,12],[13,12],[14,12],[15,12],[16,12],[17,12],[18,12],[19,12],
  ];
  jaw.forEach(([px, py]) => drawRect(ctx, cx - 24 + px * P, cy - 40 + py * P, P, P, SC));
  [[8,10],[9,10],[10,10],[13,10],[14,10],[17,10],[18,10]].forEach(([px, py]) =>
    drawRect(ctx, cx - 24 + px * P, cy - 40 + py * P, P, P, B));

  // Crossbones (scaled 2x)
  for (let i = 0; i < 18; i++) {
    drawRect(ctx, cx - 28 + i * 2, cy + 8 + i * 2, 4, 4, SC);
  }
  drawRect(ctx, cx - 32, cy + 4, 10, 10, SC); drawRect(ctx, cx - 30, cy + 6, 6, 6, B);
  drawRect(ctx, cx + 8, cy + 40, 10, 10, SC); drawRect(ctx, cx + 10, cy + 42, 6, 6, B);
  drawRect(ctx, cx - 32, cy + 40, 10, 10, SC); drawRect(ctx, cx - 30, cy + 42, 6, 6, B);
  drawRect(ctx, cx + 8, cy + 4, 10, 10, SC); drawRect(ctx, cx + 10, cy + 6, 6, 6, B);
  for (let i = 0; i < 18; i++) {
    drawRect(ctx, cx + 24 - i * 2, cy + 8 + i * 2, 4, 4, SC);
  }
}

export default function ClimberGame({ currentLevel, consecutiveWrong, gameOver, climberState }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const animRef = useRef(null);
  const cloudsRef = useRef([
    { x: 10, y: 18, speed: 0.08 },
    { x: 80, y: 45, speed: 0.05 },
    { x: 50, y: 8, speed: 0.06 },
  ]);

  // Animation state: from/to positions + start frame
  const jumpRef = useRef(null);  // { fromX, fromY, toX, toY, startFrame }
  const prevLevelRef = useRef(currentLevel);
  // Current rendered position (updated each frame from jump or settled)
  const posRef = useRef({
    x: getLedgeX(0) + LEDGE_W / 2 - 9,
    y: H - 40 - 28,
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const frame = frameRef.current;

    // Background sky gradient (pixel style)
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, W, H);
    // Horizon lighter band
    ctx.fillStyle = '#b0e0f8';
    ctx.fillRect(0, H - 50, W, 50);
    // Ground
    ctx.fillStyle = '#5a3e1b';
    ctx.fillRect(0, H - 8, W, 8);
    ctx.fillStyle = '#4a7c3f';
    ctx.fillRect(0, H - 10, W, 3);

    // Animate clouds
    cloudsRef.current.forEach(cloud => {
      cloud.x += cloud.speed;
      if (cloud.x > W + 24) cloud.x = -24;
      drawCloud(ctx, Math.round(cloud.x), Math.round(cloud.y));
    });

    if (gameOver) {
      // Dark overlay
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);
      drawSkull(ctx, W / 2, H / 2 - 10);
      // Pixel font "GAME OVER"
      ctx.fillStyle = '#ff2222';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 + 60);
      ctx.fillStyle = '#aaa';
      ctx.font = '10px monospace';
      ctx.fillText('answer correctly to restart', W / 2, H / 2 + 78);
      frameRef.current++;
      animRef.current = requestAnimationFrame(draw);
      return;
    }

    const JUMP_FRAMES = 18;

    // On level change, record a new jump from current pos to target ledge
    if (prevLevelRef.current !== currentLevel) {
      const toX = getLedgeX(currentLevel) + LEDGE_W / 2 - 9;
      const toY = H - 40 - currentLevel * LEDGE_SPACING - 28;
      jumpRef.current = {
        fromX: posRef.current.x,
        fromY: posRef.current.y,
        toX,
        toY,
        startFrame: frame,
      };
      prevLevelRef.current = currentLevel;
    }

    // Compute current position from jump animation
    if (jumpRef.current) {
      const { fromX, fromY, toX, toY, startFrame } = jumpRef.current;
      const elapsed = frame - startFrame;
      const t = Math.min(elapsed / JUMP_FRAMES, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      // Arc: higher jump going up, small hop going down
      const arcHeight = toY < fromY ? -22 : 6;
      const cx = fromX + (toX - fromX) * ease;
      const cy = fromY + (toY - fromY) * ease + arcHeight * Math.sin(Math.PI * t);
      posRef.current = { x: cx, y: cy };
      if (t >= 1) {
        posRef.current = { x: toX, y: toY };
        jumpRef.current = null;
      }
    }

    // Camera: only scroll once climber world-Y rises above threshold
    const SCROLL_THRESHOLD = Math.round(H * 0.30);
    const climberWorldY = posRef.current.y;
    const cameraOffset = climberWorldY < SCROLL_THRESHOLD
      ? climberWorldY - SCROLL_THRESHOLD
      : 0;

    // Draw ledges
    for (let i = 0; i <= LEDGE_COUNT + currentLevel + 1; i++) {
      const ly = getLedgeY(i, cameraOffset);
      if (ly < -LEDGE_H || ly > H + LEDGE_H) continue;
      drawLedge(ctx, getLedgeX(i), ly);
    }

    // Draw climber at animated position
    const climberX = posRef.current.x;
    const climberY = posRef.current.y - cameraOffset;

    drawClimber(ctx, climberX, climberY, climberState, frame);

    // Wrong-answer indicator
    for (let i = 0; i < 3; i++) {
      const filled = i < consecutiveWrong;
      ctx.fillStyle = filled ? '#ff3333' : '#444';
      ctx.font = '13px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(filled ? '💀' : '○', 5 + i * 18, 17);
    }

    // Level indicator
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(W - 52, 3, 48, 16);
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`LVL ${currentLevel}`, W - 5, 15);

    frameRef.current++;
    animRef.current = requestAnimationFrame(draw);
  }, [currentLevel, consecutiveWrong, gameOver, climberState]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm w-full">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center py-1 border-b border-border">
        Climber
      </p>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ display: 'block', width: '100%', imageRendering: 'pixelated' }}
      />
    </div>
  );
}