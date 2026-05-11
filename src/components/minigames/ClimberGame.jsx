import { useEffect, useRef, useCallback } from 'react';

const W = 240;
const H = 480;
const LEDGE_COUNT = 7;
const LEDGE_SPACING = 52;

// Floating island variants: [width, rockHeight, xOffset (0..1 of remaining space)]
const LEDGE_VARIANTS = [
  [90,  22, 0.05],
  [110, 26, 0.50],
  [80,  20, 0.15],
  [100, 24, 0.60],
  [95,  22, 0.02],
  [115, 28, 0.40],
  [85,  20, 0.55],
];

function getLedgeVariant(index) {
  return LEDGE_VARIANTS[index % LEDGE_VARIANTS.length];
}

function getLedgeX(index) {
  const [lw, , xFrac] = getLedgeVariant(index);
  return Math.round(xFrac * (W - lw));
}

function getLedgeY(index, cameraOffset) {
  return H - 40 - index * LEDGE_SPACING - cameraOffset;
}

// --- Pixel art drawing helpers ---
function drawRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// Draw a fluffy pixel cloud at (x, y)
function drawCloud(ctx, x, y, scale = 1) {
  const S = scale;
  const pts = [
    // bottom row
    [2,6],[3,6],[4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],[12,6],[13,6],
    // mid row
    [1,5],[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],[12,5],[13,5],[14,5],
    // mid row 2
    [0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],[12,4],[13,4],[14,4],[15,4],
    // bumps
    [2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3],[12,3],[13,3],
    [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
    [6,1],[7,1],[8,1],[9,1],
    // second bump
    [10,3],[11,3],[12,3],[13,3],[14,3],
    [11,2],[12,2],[13,2],[14,2],[15,2],
    [12,1],[13,1],[14,1],
  ];
  const px = Math.round(x);
  const py = Math.round(y);
  // Shadow
  pts.forEach(([cx, cy]) => {
    ctx.fillStyle = 'rgba(180,210,255,0.35)';
    ctx.fillRect(px + cx * S + S, py + cy * S + S, S, S);
  });
  // White body
  pts.forEach(([cx, cy]) => {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(px + cx * S, py + cy * S, S, S);
  });
}

// Draw a floating island platform
function drawIsland(ctx, x, y, islandW, rockH) {
  const grassH = 5;
  const totalH = grassH + rockH;

  // --- Rock body (dark gray, rounded bottom) ---
  for (let row = 0; row < rockH; row++) {
    // Taper the sides as we go down
    const taper = Math.floor((row / rockH) * (islandW * 0.18));
    const rx = x + taper;
    const rw = islandW - taper * 2;
    if (rw <= 0) continue;

    // Color gradient: lighter top, darker bottom
    const brightness = Math.round(130 - (row / rockH) * 50);
    const shade = `rgb(${brightness},${brightness},${brightness})`;
    drawRect(ctx, rx, y + grassH + row, rw, 1, shade);

    // Side highlight (left edge)
    drawRect(ctx, rx, y + grassH + row, 2, 1, `rgb(${Math.min(255, brightness + 30)},${Math.min(255, brightness + 30)},${Math.min(255, brightness + 30)})`);
    // Side shadow (right edge)
    drawRect(ctx, rx + rw - 2, y + grassH + row, 2, 1, `rgb(${Math.max(0, brightness - 30)},${Math.max(0, brightness - 30)},${Math.max(0, brightness - 30)})`);
  }

  // Rock boulders embedded in the side face
  const boulderPositions = [
    { ox: 0.12, oy: 0.2, r: 0.10 },
    { ox: 0.35, oy: 0.45, r: 0.09 },
    { ox: 0.60, oy: 0.25, r: 0.11 },
    { ox: 0.80, oy: 0.55, r: 0.08 },
    { ox: 0.22, oy: 0.70, r: 0.09 },
    { ox: 0.50, oy: 0.65, r: 0.10 },
    { ox: 0.70, oy: 0.80, r: 0.08 },
  ];
  boulderPositions.forEach(({ ox, oy, r }) => {
    const taper = Math.floor((oy * rockH / rockH) * (islandW * 0.18));
    const availW = islandW - taper * 2;
    if (availW <= 0) return;
    const bx = Math.round(x + taper + ox * availW);
    const by = Math.round(y + grassH + oy * rockH);
    const bw = Math.max(3, Math.round(r * islandW));
    const bh = Math.max(2, Math.round(r * rockH * 0.7));
    // Boulder highlight
    drawRect(ctx, bx, by, bw, bh, 'rgba(200,200,200,0.4)');
    drawRect(ctx, bx + 1, by + 1, bw - 2, bh - 2, 'rgba(100,100,100,0.25)');
  });

  // --- Grass top ---
  // Base green strip
  drawRect(ctx, x, y + grassH - 3, islandW, 3, '#3a7d1e');
  drawRect(ctx, x, y + grassH - 5, islandW, 2, '#4a9e2a');

  // Grass blades / spikes
  for (let gx = x + 2; gx < x + islandW - 1; gx += 3) {
    const h = 2 + (gx % 5 === 0 ? 2 : 0);
    drawRect(ctx, gx, y + grassH - 5 - h, 2, h, '#5ec228');
    if (gx % 7 === 0) {
      drawRect(ctx, gx + 1, y + grassH - 5 - h - 1, 1, 2, '#7de040');
    }
  }

  // Dirt underside hint (thin dark strip at very bottom)
  const bottomTaper = Math.floor((islandW * 0.18));
  if (islandW - bottomTaper * 2 > 0) {
    drawRect(ctx, x + bottomTaper, y + totalH - 2, islandW - bottomTaper * 2, 2, '#555');
  }
}

// Climber pixel art sprite
function drawClimber(ctx, x, y, state, frame) {
  const px = Math.round(x);
  const py = Math.round(y);
  const S = 2;

  const skin = '#f4b87a';
  const jacket = '#c0392b';  // red jacket
  const pants = '#4a3a2a';
  const boots = '#2a1a0a';
  const hair = '#3a2a0a';
  const goggle = '#1a3a6a';
  const goggleGlass = '#5a9adf';
  const pack = '#c87830';   // backpack

  if (state === 'dead') return;

  const r = (ox, oy, w, h, c) => drawRect(ctx, px + ox * S, py + oy * S, w * S, h * S, c);

  // HEAD with helmet/goggle
  r(3, 0, 3, 1, hair);
  r(2, 0, 4, 1, '#8b0000'); // red helmet
  r(1, 0, 1, 1, '#8b0000');
  r(2, 1, 5, 3, skin);
  // Goggles
  r(2, 1, 2, 1, goggle);
  r(4, 1, 2, 1, goggle);
  r(2, 2, 2, 1, goggleGlass);
  r(4, 2, 2, 1, goggleGlass);
  r(3, 1, 1, 1, goggle); // bridge
  // Mouth
  r(3, 3, 3, 1, '#c07050');

  // Backpack (behind body, drawn first)
  r(7, 4, 2, 5, pack);
  r(7, 3, 2, 1, pack);
  r(7, 9, 2, 1, '#a05c20');

  if (state === 'idle') {
    r(2, 4, 5, 5, jacket);
    r(1, 4, 1, 4, skin); // left arm
    r(0, 5, 1, 2, skin);
    r(2, 9, 2, 3, pants);
    r(5, 9, 2, 3, pants);
    r(2, 12, 2, 2, boots);
    r(5, 12, 2, 2, boots);
  } else if (state === 'jump') {
    r(2, 4, 5, 5, jacket);
    r(0, 2, 2, 3, skin); // arms up
    r(7, 2, 2, 3, skin);
    r(2, 9, 2, 2, pants);
    r(5, 9, 2, 2, pants);
    r(1, 11, 2, 1, pants);
    r(6, 11, 2, 1, pants);
    r(1, 12, 2, 2, boots);
    r(6, 12, 2, 2, boots);
  } else if (state === 'scramble') {
    r(2, 4, 5, 5, jacket);
    r(0, 3, 2, 2, skin);
    r(7, 3, 2, 2, skin);
    const legOff = frame % 12 < 6 ? 0 : 1;
    r(2, 9, 2, 3 + legOff, pants);
    r(5, 9, 2, 3 - legOff, pants);
    r(2, 12 + legOff, 2, 2, boots);
    r(5, 12 - legOff, 2, 2, boots);
  } else if (state === 'fall') {
    r(2, 4, 5, 5, jacket);
    r(0, 4, 2, 2, skin);
    r(7, 4, 2, 2, skin);
    r(1, 9, 2, 3, pants);
    r(6, 9, 2, 3, pants);
    r(1, 12, 2, 2, boots);
    r(6, 12, 2, 2, boots);
  }
}

// Pixel heart
function drawHeart(ctx, x, y, filled) {
  const S = 2;
  const color = filled ? '#e03030' : '#555555';
  const highlight = filled ? '#ff6060' : '#888888';
  const pts = [
    [1,0],[2,0],[4,0],[5,0],
    [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
    [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],
    [1,3],[2,3],[3,3],[4,3],[5,3],
    [2,4],[3,4],[4,4],
    [3,5],
  ];
  pts.forEach(([px, py]) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + px * S, y + py * S, S, S);
  });
  // Highlight
  ctx.fillStyle = highlight;
  ctx.fillRect(x + 1 * S, y + 1 * S, S, S);
  ctx.fillRect(x + 4 * S, y + 1 * S, S, S);
}

function drawSkull(ctx, cx, cy) {
  const P = 2;
  const SC = '#e8e8e8';
  const D = '#888';
  const B = '#222';

  const dome = [
    [8,0],[9,0],[10,0],[11,0],[12,0],[13,0],[14,0],[15,0],[16,0],
    [5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],[13,1],[14,1],[15,1],[16,1],[17,1],[18,1],[19,1],
    [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[12,2],[13,2],[14,2],[15,2],[16,2],[17,2],[18,2],[19,2],[20,2],
    [3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3],[12,3],[13,3],[14,3],[15,3],[16,3],[17,3],[18,3],[19,3],[20,3],[21,3],
    [3,4],[21,4],[3,5],[21,5],[3,6],[21,6],
    [4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],[13,7],[14,7],[15,7],[16,7],[17,7],[18,7],[19,7],[20,7],
  ];
  dome.forEach(([px, py]) => drawRect(ctx, cx - 24 + px * P, cy - 40 + py * P, P, P, SC));
  [[5,3],[6,3],[7,3],[5,4],[6,4],[7,4],[5,5],[6,5],[7,5]].forEach(([px, py]) =>
    drawRect(ctx, cx - 24 + px * P, cy - 40 + py * P, P, P, B));
  [[13,3],[14,3],[15,3],[13,4],[14,4],[15,4],[13,5],[14,5],[15,5]].forEach(([px, py]) =>
    drawRect(ctx, cx - 24 + px * P, cy - 40 + py * P, P, P, B));
  [[10,6],[11,6],[10,7],[11,7]].forEach(([px, py]) =>
    drawRect(ctx, cx - 24 + px * P, cy - 40 + py * P, P, P, D));
  for (let i = 0; i < 18; i++) drawRect(ctx, cx - 28 + i * 2, cy + 8 + i * 2, 4, 4, SC);
  drawRect(ctx, cx - 32, cy + 4, 10, 10, SC); drawRect(ctx, cx - 30, cy + 6, 6, 6, B);
  drawRect(ctx, cx + 8, cy + 40, 10, 10, SC); drawRect(ctx, cx + 10, cy + 42, 6, 6, B);
  drawRect(ctx, cx - 32, cy + 40, 10, 10, SC); drawRect(ctx, cx - 30, cy + 42, 6, 6, B);
  drawRect(ctx, cx + 8, cy + 4, 10, 10, SC); drawRect(ctx, cx + 10, cy + 6, 6, 6, B);
  for (let i = 0; i < 18; i++) drawRect(ctx, cx + 24 - i * 2, cy + 8 + i * 2, 4, 4, SC);
}

export default function ClimberGame({ currentLevel, consecutiveWrong, gameOver, climberState }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const animRef = useRef(null);
  const cloudsRef = useRef([
    { x: -10, y: 15,  speed: 0.10, scale: 2 },
    { x: 80,  y: 50,  speed: 0.06, scale: 2 },
    { x: 140, y: 20,  speed: 0.08, scale: 2 },
    { x: 30,  y: 80,  speed: 0.05, scale: 2 },
    { x: 170, y: 100, speed: 0.07, scale: 2 },
    { x: 60,  y: 130, speed: 0.04, scale: 2 },
    { x: 120, y: 160, speed: 0.09, scale: 2 },
    { x: 10,  y: 190, speed: 0.06, scale: 2 },
    { x: 180, y: 210, speed: 0.05, scale: 2 },
    { x: 50,  y: 250, speed: 0.07, scale: 2 },
    { x: 150, y: 280, speed: 0.04, scale: 2 },
    { x: 90,  y: 320, speed: 0.08, scale: 2 },
    { x: 200, y: 350, speed: 0.05, scale: 2 },
    { x: 20,  y: 370, speed: 0.06, scale: 2 },
  ]);

  const jumpRef = useRef(null);
  const prevLevelRef = useRef(currentLevel);
  const posRef = useRef({
    x: getLedgeX(0) + getLedgeVariant(0)[0] / 2 - 9,
    y: H - 40 - 28,
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const frame = frameRef.current;

    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   '#2980b9');
    grad.addColorStop(0.4, '#5dade2');
    grad.addColorStop(1,   '#85c1e9');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Animate and draw clouds
    cloudsRef.current.forEach(cloud => {
      cloud.x += cloud.speed;
      if (cloud.x > W + 40) cloud.x = -40;
      drawCloud(ctx, Math.round(cloud.x), Math.round(cloud.y), cloud.scale);
    });

    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);
      drawSkull(ctx, W / 2, H / 2 - 10);
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

    if (prevLevelRef.current !== currentLevel) {
      const lw = getLedgeVariant(currentLevel)[0];
      const toX = getLedgeX(currentLevel) + lw / 2 - 9;
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

    if (jumpRef.current) {
      const { fromX, fromY, toX, toY, startFrame } = jumpRef.current;
      const elapsed = frame - startFrame;
      const t = Math.min(elapsed / JUMP_FRAMES, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const arcHeight = toY < fromY ? -22 : 6;
      const cx = fromX + (toX - fromX) * ease;
      const cy = fromY + (toY - fromY) * ease + arcHeight * Math.sin(Math.PI * t);
      posRef.current = { x: cx, y: cy };
      if (t >= 1) {
        posRef.current = { x: toX, y: toY };
        jumpRef.current = null;
      }
    }

    const SCROLL_THRESHOLD = Math.round(H * 0.30);
    const climberWorldY = posRef.current.y;
    const cameraOffset = climberWorldY < SCROLL_THRESHOLD
      ? climberWorldY - SCROLL_THRESHOLD
      : 0;

    // Draw floating islands
    for (let i = 0; i <= LEDGE_COUNT + currentLevel + 1; i++) {
      const ly = getLedgeY(i, cameraOffset);
      const [lw, lh] = getLedgeVariant(i);
      if (ly < -lh - 10 || ly > H + lh) continue;
      drawIsland(ctx, getLedgeX(i), ly, lw, lh);
    }

    // Draw climber
    const climberX = posRef.current.x;
    const climberY = posRef.current.y - cameraOffset;
    drawClimber(ctx, climberX, climberY, climberState, frame);

    // Hearts (lives) top-left
    for (let i = 0; i < 3; i++) {
      const filled = i < (3 - consecutiveWrong);
      drawHeart(ctx, 6 + i * 18, 6, filled);
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
        style={{ display: 'block', width: '100%', height: 'auto', imageRendering: 'pixelated' }}
      />
    </div>
  );
}