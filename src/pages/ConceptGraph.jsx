import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, ZoomIn, ZoomOut, Maximize2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const RELATIONSHIP_COLORS = {
  prerequisite_of: '#f59e0b',
  causes: '#ef4444',
  interprets: '#3b82f6',
  exemplifies: '#10b981',
};

const RELATIONSHIP_LABELS = {
  prerequisite_of: 'prerequisite of',
  causes: 'causes',
  interprets: 'interprets',
  exemplifies: 'exemplifies',
};

function buildGraph(concepts, relationships) {
  const nodes = {};
  concepts.forEach((c, i) => {
    const angle = (i / concepts.length) * 2 * Math.PI;
    const r = Math.min(300, 80 + concepts.length * 10);
    nodes[c.id] = {
      id: c.id,
      label: c.concept_name,
      topic: c.topic,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      vx: 0,
      vy: 0,
    };
  });

  const edges = relationships
    .filter(r => nodes[r.from_concept_id] && nodes[r.to_concept_id])
    .map(r => ({
      from: r.from_concept_id,
      to: r.to_concept_id,
      type: r.relationship_type,
    }));

  return { nodes, edges };
}

function runForceLayout(nodes, edges, iterations = 200) {
  const nodeList = Object.values(nodes);
  const k = 120; // spring length
  const repulsion = 8000;
  const damping = 0.85;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all nodes
    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const a = nodeList[i], b = nodeList[j];
        const dx = b.x - a.x || 0.1;
        const dy = b.y - a.y || 0.1;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    // Attraction along edges
    edges.forEach(edge => {
      const a = nodes[edge.from], b = nodes[edge.to];
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - k) * 0.05;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    });

    // Apply velocities
    nodeList.forEach(n => {
      n.vx *= damping; n.vy *= damping;
      n.x += n.vx; n.y += n.vy;
    });
  }

  return nodes;
}

export default function ConceptGraph() {
  const canvasRef = useRef(null);
  const stateRef = useRef({ pan: { x: 0, y: 0 }, zoom: 1, dragging: null, hoveredNode: null });
  const [hovered, setHovered] = useState(null);
  const [selectedEdgeType, setSelectedEdgeType] = useState(null);
  const animFrameRef = useRef(null);

  const { data: concepts = [], isLoading: loadingConcepts } = useQuery({
    queryKey: ['concepts'],
    queryFn: () => base44.entities.Concept.list(),
  });

  const { data: relationships = [], isLoading: loadingRels } = useQuery({
    queryKey: ['card-relationships'],
    queryFn: () => base44.entities.CardRelationship.list(),
  });

  const graphRef = useRef(null);

  useEffect(() => {
    if (!concepts.length || !relationships.length) return;
    const { nodes, edges } = buildGraph(concepts, relationships);
    const laid = runForceLayout(nodes, edges);
    graphRef.current = { nodes: laid, edges };

    // Center pan
    const nodeList = Object.values(laid);
    const cx = nodeList.reduce((s, n) => s + n.x, 0) / nodeList.length;
    const cy = nodeList.reduce((s, n) => s + n.y, 0) / nodeList.length;
    stateRef.current.pan = { x: -cx, y: -cy };
  }, [concepts, relationships]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graphRef.current) return;
    const ctx = canvas.getContext('2d');
    const { nodes, edges } = graphRef.current;
    const { pan, zoom, hoveredNode } = stateRef.current;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width, H = canvas.height;
    const CW = canvas.clientWidth, CH = canvas.clientHeight;
    const cx = CW / 2 + pan.x * zoom;
    const cy = CH / 2 + pan.y * zoom;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);

    // Draw edges
    edges.forEach(edge => {
      if (selectedEdgeType && edge.type !== selectedEdgeType) return;
      const a = nodes[edge.from], b = nodes[edge.to];
      if (!a || !b) return;

      const color = RELATIONSHIP_COLORS[edge.type] || '#94a3b8';
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nodeR = 28;

      // Start/end points offset by node radius
      const sx = a.x + (dx / dist) * nodeR;
      const sy = a.y + (dy / dist) * nodeR;
      const ex = b.x - (dx / dist) * nodeR;
      const ey = b.y - (dy / dist) * nodeR;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 / zoom;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Arrowhead
      const angle = Math.atan2(ey - sy, ex - sx);
      const arrowLen = 8 / zoom;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - arrowLen * Math.cos(angle - 0.4), ey - arrowLen * Math.sin(angle - 0.4));
      ctx.lineTo(ex - arrowLen * Math.cos(angle + 0.4), ey - arrowLen * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    });

    // Draw nodes
    Object.values(nodes).forEach(node => {
      const isHovered = hoveredNode === node.id;
      const r = 28;

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = isHovered ? '#3b82f6' : '#1e40af';
      ctx.fill();
      ctx.strokeStyle = isHovered ? '#fff' : '#93c5fd';
      ctx.lineWidth = isHovered ? 2.5 / zoom : 1.5 / zoom;
      ctx.stroke();

      // Label
      const maxW = 80;
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(9, 11 / zoom)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const words = node.label.split(' ');
      let lines = [], line = '';
      words.forEach(w => {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW / zoom) { lines.push(line); line = w; }
        else line = test;
      });
      lines.push(line);
      lines = lines.filter(Boolean);

      const lineH = 12 / zoom;
      const startY = node.y - ((lines.length - 1) * lineH) / 2;
      lines.forEach((l, i) => ctx.fillText(l, node.x, startY + i * lineH));
    });

    ctx.restore();
  }, [selectedEdgeType]);

  // Animation loop
  useEffect(() => {
    const loop = () => {
      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  // Mouse interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getNodeAt = (mx, my) => {
      if (!graphRef.current) return null;
      const { nodes } = graphRef.current;
      const { pan, zoom } = stateRef.current;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const cx = W / 2 + pan.x * zoom;
      const cy = H / 2 + pan.y * zoom;
      const wx = (mx - cx) / zoom;
      const wy = (my - cy) / zoom;
      return Object.values(nodes).find(n => Math.hypot(n.x - wx, n.y - wy) < 28) || null;
    };

    let dragStart = null;
    let panStart = null;

    const onMouseDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const node = getNodeAt(mx, my);
      if (node) {
        stateRef.current.dragging = node.id;
      } else {
        dragStart = { x: e.clientX, y: e.clientY };
        panStart = { ...stateRef.current.pan };
      }
    };

    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;

      if (stateRef.current.dragging && graphRef.current) {
        const { pan, zoom } = stateRef.current;
        const cx = canvas.clientWidth / 2 + pan.x * zoom;
        const cy = canvas.clientHeight / 2 + pan.y * zoom;
        graphRef.current.nodes[stateRef.current.dragging].x = (mx - cx) / zoom;
        graphRef.current.nodes[stateRef.current.dragging].y = (my - cy) / zoom;
        return;
      }

      if (dragStart) {
        stateRef.current.pan = {
          x: panStart.x + (e.clientX - dragStart.x) / stateRef.current.zoom,
          y: panStart.y + (e.clientY - dragStart.y) / stateRef.current.zoom,
        };
        return;
      }

      const node = getNodeAt(mx, my);
      stateRef.current.hoveredNode = node?.id || null;
      setHovered(node || null);
      canvas.style.cursor = node ? 'grab' : 'default';
    };

    const onMouseUp = () => {
      stateRef.current.dragging = null;
      dragStart = null;
      panStart = null;
    };

    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      stateRef.current.zoom = Math.min(4, Math.max(0.2, stateRef.current.zoom * delta));
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  const zoom = (factor) => {
    stateRef.current.zoom = Math.min(4, Math.max(0.2, stateRef.current.zoom * factor));
  };

  const resetView = () => {
    if (!graphRef.current) return;
    const nodeList = Object.values(graphRef.current.nodes);
    if (!nodeList.length) return;
    const cx = nodeList.reduce((s, n) => s + n.x, 0) / nodeList.length;
    const cy = nodeList.reduce((s, n) => s + n.y, 0) / nodeList.length;
    stateRef.current.pan = { x: -cx, y: -cy };
    stateRef.current.zoom = 1;
  };

  const isLoading = loadingConcepts || loadingRels;

  // Count edges per node for tooltip
  const getNodeEdges = (nodeId) => {
    if (!graphRef.current) return [];
    return graphRef.current.edges.filter(e => e.from === nodeId || e.to === nodeId);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Concept Graph</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {concepts.length} concepts · {relationships.length} relationships
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Edge type filter */}
          {Object.entries(RELATIONSHIP_COLORS).map(([type, color]) => (
            <button
              key={type}
              onClick={() => setSelectedEdgeType(prev => prev === type ? null : type)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                selectedEdgeType === type
                  ? 'text-white border-transparent'
                  : selectedEdgeType
                  ? 'opacity-40 border-border'
                  : 'border-border'
              }`}
              style={selectedEdgeType === type ? { backgroundColor: color, borderColor: color } : {}}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              {RELATIONSHIP_LABELS[type]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => zoom(1.2)}><ZoomIn className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => zoom(0.8)}><ZoomOut className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={resetView}><Maximize2 className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="relative flex-1 bg-slate-950 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}
        <canvas ref={canvasRef} className="w-full h-full" />

        {/* Hover tooltip */}
        {hovered && (
          <div className="absolute bottom-4 left-4 bg-card border border-border rounded-xl p-3 shadow-lg max-w-xs pointer-events-none z-10">
            <p className="font-semibold text-sm">{hovered.label}</p>
            {hovered.topic && <p className="text-xs text-muted-foreground mt-0.5">{hovered.topic}</p>}
            <p className="text-xs text-muted-foreground mt-1.5">
              {getNodeEdges(hovered.id).length} connection{getNodeEdges(hovered.id).length !== 1 ? 's' : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {[...new Set(getNodeEdges(hovered.id).map(e => e.type))].map(type => (
                <span
                  key={type}
                  className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium"
                  style={{ backgroundColor: RELATIONSHIP_COLORS[type] }}
                >
                  {RELATIONSHIP_LABELS[type]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Help hint */}
        {!isLoading && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/70 px-2.5 py-1.5 rounded-full">
            <Info className="w-3 h-3" />
            Drag nodes · Scroll to zoom · Drag canvas to pan
          </div>
        )}
      </div>
    </div>
  );
}