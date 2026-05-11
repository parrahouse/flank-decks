import { useEffect, useRef, useCallback } from 'react';

const W = 160;
const H = 280;
const LEDGE_COUNT = 7; // visible ledges
const LEDGE_H = 6;
const LEDGE_W = 52;
const LEDGE_SPACING = 36;

// Ledge x positions: alternate left/right
function getLedgeX(index) {
  return index % 2 === 0 ? 12 : W - LEDGE_W - 12;
}
function getLedgeY(index, cameraOffset) {
  // index 0 = bottom start ledge
  return H - 40 - index * LEDGE_SPACING + cameraOffset;
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
  pts.forEach(([px, py]) => drawRect(ctx, x + px, y + py, 1, 1, 'rgba(255,255,255,0.92)'));
}

function drawLedge(ctx, x, y) {
  // Gray rock base
  for (let i = 0; i < LEDGE_W; i++) {
    drawRect(ctx, x + i, y + 1, 1, LEDGE_H - 1, '#8a8a8a');
    drawRect(ctx, x + i, y, 1, 1, '#aaaaaa');
  }
  // Shadows/depth
  drawRect(ctx, x, y + LEDGE_H - 1, LEDGE_W, 1, '#666');
  drawRect(ctx, x + LEDGE_W - 1, y + 1, 1, LEDGE_H - 1, '#666');
  // Rock detail pixels
  drawRect(ctx, x + 4, y + 2, 2, 1, '#777');
  drawRect(ctx, x + 12, y + 3, 3, 1, '#777');
  drawRect(ctx, x + 22, y + 2, 2, 1, '#888');
  drawRect(ctx, x + 34, y + 3, 2, 1, '#777');
  drawRect(ctx, x + 44, y + 2, 3, 1, '#888');
  // Green moss patches on top edge
  const mossSpots = [2, 6, 11, 17, 24, 30, 38, 45];
  mossSpots.forEach(mx => {
    drawRect(ctx, x + mx, y, 1, 1, '#4a7c3f');
    if (mx + 1 < LEDGE_W) drawRect(ctx, x + mx + 1, y, 1, 1, '#5a9c4f');
  });
}

// Climber pixel art - 9x14 px sprite
function drawClimber(ctx, x, y, state, frame) {
  const px = Math.round(x);
  const py = Math.round(y);

  // Colors
  const skin = '#f4c08a';
  const shirt = '#3a6fc4';
  const pants = '#4a3a2a';
  const boots = '#2a1a0a';
  const hair = '#3a2a0a';
  const shadow = '#c08050';

  if (state === 'dead') return; // don't draw climber on death screen

  // HEAD (3x3)
  drawRect(ctx, px + 3, py, 3, 1, hair);
  drawRect(ctx, px + 2, py + 1, 5, 3, skin);
  // eyes
  drawRect(ctx, px + 3, py + 2, 1, 1, '#333');
  drawRect(ctx, px + 5, py + 2, 1, 1, '#333');
  // mouth
  if (state === 'scramble') {
    drawRect(ctx, px + 3, py + 3, 3, 1, '#c05040'); // open mouth
  } else {
    drawRect(ctx, px + 3, py + 3, 3, 1, shadow);
  }

  if (state === 'idle') {
    // Body
    drawRect(ctx, px + 2, py + 4, 5, 4, shirt);
    // Arms
    drawRect(ctx, px + 1, py + 4, 1, 3, skin);
    drawRect(ctx, px + 7, py + 4, 1, 3, skin);
    // Legs
    drawRect(ctx, px + 2, py + 8, 2, 3, pants);
    drawRect(ctx, px + 5, py + 8, 2, 3, pants);
    // Boots
    drawRect(ctx, px + 2, py + 11, 2, 2, boots);
    drawRect(ctx, px + 5, py + 11, 2, 2, boots);
    // Idle bob
    if (frame % 40 < 20) {
      // slightly adjust nothing (already drawn at base)
    }
  } else if (state === 'jump') {
    // Body
    drawRect(ctx, px + 2, py + 4, 5, 4, shirt);
    // Arms up
    drawRect(ctx, px + 1, py + 2, 1, 3, skin);
    drawRect(ctx, px + 7, py + 2, 1, 3, skin);
    // Legs bent
    drawRect(ctx, px + 2, py + 8, 2, 2, pants);
    drawRect(ctx, px + 5, py + 8, 2, 2, pants);
    drawRect(ctx, px + 1, py + 10, 2, 1, pants);
    drawRect(ctx, px + 6, py + 10, 2, 1, pants);
    drawRect(ctx, px + 1, py + 11, 2, 2, boots);
    drawRect(ctx, px + 6, py + 11, 2, 2, boots);
  } else if (state === 'scramble') {
    // Body leaning
    drawRect(ctx, px + 2, py + 4, 5, 4, shirt);
    // Arms outstretched reaching
    drawRect(ctx, px, py + 3, 2, 2, skin);
    drawRect(ctx, px + 7, py + 3, 2, 2, skin);
    // Legs scrambling alternating
    const legOff = frame % 12 < 6 ? 0 : 1;
    drawRect(ctx, px + 2, py + 8, 2, 3 + legOff, pants);
    drawRect(ctx, px + 5, py + 8, 2, 3 - legOff, pants);
    drawRect(ctx, px + 2, py + 11 + legOff, 2, 2, boots);
    drawRect(ctx, px + 5, py + 11 - legOff, 2, 2, boots);
  } else if (state === 'fall') {
    // Arms and legs splayed
    drawRect(ctx, px + 2, py + 4, 5, 4, shirt);
    // Arms out wide
    drawRect(ctx, px, py + 4, 2, 2, skin);
    drawRect(ctx, px + 7, py + 4, 2, 2, skin);
    // Legs spread
    drawRect(ctx, px + 1, py + 8, 2, 3, pants);
    drawRect(ctx, px + 6, py + 8, 2, 3, pants);
    drawRect(ctx, px + 1, py + 11, 2, 2, boots);
    drawRect(ctx, px + 6, py + 11, 2, 2, boots);
  }
}

function drawSkull(ctx, cx, cy) {
  // Large skull and crossbones pixel art ~50x60px
  const S = '#e8e8e8';
  const D = '#888';
  const B = '#222';

  // Skull dome
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
  dome.forEach(([px, py]) => drawRect(ctx, cx - 12 + px, cy - 20 + py, 1, 1, S));

  // Eye sockets (dark)
  [[5,3],[6,3],[7,3],[5,4],[6,4],[7,4],[5,5],[6,5],[7,5]].forEach(([px, py]) =>
    drawRect(ctx, cx - 12 + px, cy - 20 + py, 1, 1, B));
  [[13,3],[14,3],[15,3],[13,4],[14,4],[15,4],[13,5],[14,5],[15,5]].forEach(([px, py]) =>
    drawRect(ctx, cx - 12 + px, cy - 20 + py, 1, 1, B));

  // Nose
  [[10,6],[11,6],[10,7],[11,7]].forEach(([px, py]) =>
    drawRect(ctx, cx - 12 + px, cy - 20 + py, 1, 1, D));

  // Jaw / teeth
  const jaw = [
    [5,9],[6,9],[7,9],[8,9],[9,9],[10,9],[11,9],[12,9],[13,9],[14,9],[15,9],[16,9],[17,9],[18,9],[19,9],
    [5,10],[6,10],[19,10],[7,10],[11,10],[12,10],[15,10],[16,10],
    [5,11],[7,11],[9,11],[11,11],[13,11],[15,11],[17,11],[19,11],
    [5,12],[6,12],[7,12],[8,12],[9,12],[10,12],[11,12],[12,12],[13,12],[14,12],[15,12],[16,12],[17,12],[18,12],[19,12],
  ];
  jaw.forEach(([px, py]) => drawRect(ctx, cx - 12 + px, cy - 20 + py, 1, 1, S));
  // Tooth gaps
  [[8,10],[9,10],[10,10],[13,10],[14,10],[17,10],[18,10]].forEach(([px, py]) =>
    drawRect(ctx, cx - 12 + px, cy - 20 + py, 1, 1, B));

  // Crossbones
  // Bone 1: top-left to bottom-right
  for (let i = 0; i < 18; i++) {
    drawRect(ctx, cx - 14 + i, cy + 4 + i, 2, 2, S);
  }
  // Bone end knobs
  drawRect(ctx, cx - 16, cy + 2, 5, 5, S); drawRect(ctx, cx - 15, cy + 3, 3, 3, B);
  drawRect(ctx, cx + 4, cy + 20, 5, 5, S); drawRect(ctx, cx + 5, cy + 21, 3, 3, B);
  drawRect(ctx, cx - 16, cy + 20, 5, 5, S); drawRect(ctx, cx - 15, cy + 21, 3, 3, B);
  drawRect(ctx, cx + 4, cy + 2, 5, 5, S); drawRect(ctx, cx + 5, cy + 3, 3, 3, B);
  // Bone 2: top-right to bottom-left
  for (let i = 0; i < 18; i++) {
    drawRect(ctx, cx + 12 - i, cy + 4 + i, 2, 2, S);
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
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 + 42);
      ctx.fillStyle = '#aaa';
      ctx.font = '7px monospace';
      ctx.fillText('answer correctly to restart', W / 2, H / 2 + 54);
      frameRef.current++;
      animRef.current = requestAnimationFrame(draw);
      return;
    }

    // Camera: keep current ledge in lower third
    const cameraOffset = currentLevel * LEDGE_SPACING;

    // Draw ledges
    for (let i = 0; i <= LEDGE_COUNT + currentLevel + 1; i++) {
      const ly = getLedgeY(i, cameraOffset);
      if (ly < -LEDGE_H || ly > H + LEDGE_H) continue;
      drawLedge(ctx, getLedgeX(i), ly);
    }

    // Draw climber
    const ledgeIdx = currentLevel;
    const lx = getLedgeX(ledgeIdx);
    const ly = getLedgeY(ledgeIdx, cameraOffset);
    const climberX = lx + LEDGE_W / 2 - 4.5;
    const climberY = ly - 14;

    // Jump arc: animate climber moving between ledges
    drawClimber(ctx, climberX, climberY, climberState, frame);

    // Wrong-answer hearts / skulls indicator
    for (let i = 0; i < 3; i++) {
      const filled = i < consecutiveWrong;
      ctx.fillStyle = filled ? '#ff3333' : '#444';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(filled ? '💀' : '○', 4 + i * 14, 12);
    }

    // Level indicator
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(W - 36, 2, 34, 12);
    ctx.fillStyle = '#fff';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`LVL ${currentLevel}`, W - 4, 12);

    frameRef.current++;
    animRef.current = requestAnimationFrame(draw);
  }, [currentLevel, consecutiveWrong, gameOver, climberState]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm" style={{ width: 160 }}>
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