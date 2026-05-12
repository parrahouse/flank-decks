import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, ZoomIn, ZoomOut, Maximize2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

const REL_COLORS = {
  prerequisite_of: '#f59e0b',
  causes: '#ef4444',
  interprets: '#3b82f6',
  exemplifies: '#10b981',
};
const REL_LABELS = {
  prerequisite_of: 'prerequisite of',
  causes: 'causes',
  interprets: 'interprets',
  exemplifies: 'exemplifies',
};

function buildGraph(concepts, relationships) {
  const nodes = {};
  concepts.forEach((c, i) => {
    const angle = (i / concepts.length) * 2 * Math.PI;
    const r = Math.min(350, 100 + concepts.length * 12);
    nodes[c.id] = { id: c.id, label: c.concept_name, topic: c.topic, x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0 };
  });
  const edges = relationships
    .filter(r => nodes[r.from_concept_id] && nodes[r.to_concept_id])
    .map(r => ({ from: r.from_concept_id, to: r.to_concept_id, type: r.relationship_type }));
  return { nodes, edges };
}

function runForceLayout(nodes, edges) {
  const nodeList = Object.values(nodes);
  const k = 130, repulsion = 9000, damping = 0.85;
  for (let iter = 0; iter < 300; iter++) {
    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const a = nodeList[i], b = nodeList[j];
        const dx = b.x - a.x || 0.1, dy = b.y - a.y || 0.1;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
      }
    }
    edges.forEach(edge => {
      const a = nodes[edge.from], b = nodes[edge.to];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - k) * 0.05;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    });
    nodeList.forEach(n => { n.vx *= damping; n.vy *= damping; n.x += n.vx; n.y += n.vy; });
  }
  return nodes;
}

const NODE_R = 28;

export default function ConceptGraph() {
  const svgRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [graph, setGraph] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [selectedEdgeType, setSelectedEdgeType] = useState(null);
  const dragging = useRef(null); // { type: 'node'|'pan', id?, start, transformStart }

  const { data: concepts = [], isLoading: loadingConcepts } = useQuery({
    queryKey: ['concepts'],
    queryFn: () => base44.entities.Concept.list(),
  });
  const { data: relationships = [], isLoading: loadingRels } = useQuery({
    queryKey: ['card-relationships'],
    queryFn: () => base44.entities.CardRelationship.list(),
  });

  useEffect(() => {
    if (!concepts.length) return;
    const { nodes, edges } = buildGraph(concepts, relationships);
    const laid = runForceLayout(nodes, edges);
    // center
    const nodeList = Object.values(laid);
    const cx = nodeList.reduce((s, n) => s + n.x, 0) / nodeList.length;
    const cy = nodeList.reduce((s, n) => s + n.y, 0) / nodeList.length;
    nodeList.forEach(n => { n.x -= cx; n.y -= cy; });
    setGraph({ nodes: laid, edges });
  }, [concepts, relationships]);

  const getSVGPoint = (e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const toWorld = (sx, sy, t) => ({
    x: (sx - t.x) / t.scale,
    y: (sy - t.y) / t.scale,
  });

  const getNodeAt = (sx, sy, t) => {
    if (!graph) return null;
    const { x: wx, y: wy } = toWorld(sx, sy, t);
    return Object.values(graph.nodes).find(n => Math.hypot(n.x - wx, n.y - wy) < NODE_R) || null;
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    const pt = getSVGPoint(e);
    const node = getNodeAt(pt.x, pt.y, transform);
    if (node) {
      dragging.current = { type: 'node', id: node.id, start: pt, transformStart: { ...transform } };
    } else {
      dragging.current = { type: 'pan', start: pt, transformStart: { ...transform } };
    }
  };

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) {
      const pt = getSVGPoint(e);
      const node = getNodeAt(pt.x, pt.y, transform);
      setHovered(node || null);
      if (svgRef.current) svgRef.current.style.cursor = node ? 'grab' : 'default';
      return;
    }
    const pt = getSVGPoint(e);
    const d = dragging.current;
    if (d.type === 'pan') {
      setTransform(t => ({ ...t, x: d.transformStart.x + (pt.x - d.start.x), y: d.transformStart.y + (pt.y - d.start.y) }));
    } else if (d.type === 'node' && graph) {
      const wx = (pt.x - transform.x) / transform.scale;
      const wy = (pt.y - transform.y) / transform.scale;
      setGraph(g => {
        if (!g) return g;
        const updated = { ...g, nodes: { ...g.nodes, [d.id]: { ...g.nodes[d.id], x: wx, y: wy } } };
        return updated;
      });
    }
  }, [transform, graph]);

  const onMouseUp = () => { dragging.current = null; };

  const onWheel = (e) => {
    e.preventDefault();
    const pt = getSVGPoint(e);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform(t => {
      const newScale = Math.min(4, Math.max(0.15, t.scale * factor));
      // zoom toward mouse pointer
      const wx = (pt.x - t.x) / t.scale;
      const wy = (pt.y - t.y) / t.scale;
      return { scale: newScale, x: pt.x - wx * newScale, y: pt.y - wy * newScale };
    });
  };

  const zoomIn = () => setTransform(t => ({ ...t, scale: Math.min(4, t.scale * 1.2) }));
  const zoomOut = () => setTransform(t => ({ ...t, scale: Math.max(0.15, t.scale * 0.8) }));
  const resetView = () => {
    const svg = svgRef.current;
    const w = svg ? svg.clientWidth : 800;
    const h = svg ? svg.clientHeight : 600;
    setTransform({ x: w / 2, y: h / 2, scale: 1 });
  };

  // Set initial transform to center once svg is ready
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const w = svg.clientWidth, h = svg.clientHeight;
    setTransform({ x: w / 2, y: h / 2, scale: 1 });
  }, []);

  const isLoading = loadingConcepts || loadingRels;

  const getNodeEdges = (nodeId) => {
    if (!graph) return [];
    return graph.edges.filter(e => e.from === nodeId || e.to === nodeId);
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Concept Graph</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {concepts.length} concepts · {relationships.length} relationships
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(REL_COLORS).map(([type, color]) => (
            <button
              key={type}
              onClick={() => setSelectedEdgeType(prev => prev === type ? null : type)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                selectedEdgeType === type ? 'text-white border-transparent' :
                selectedEdgeType ? 'opacity-40 border-border' : 'border-border'
              }`}
              style={selectedEdgeType === type ? { backgroundColor: color, borderColor: color } : {}}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              {REL_LABELS[type]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={zoomIn}><ZoomIn className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={zoomOut}><ZoomOut className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={resetView}><Maximize2 className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* SVG area */}
      <div className="relative flex-1 bg-slate-950 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {!isLoading && graph && (
          <svg
            ref={svgRef}
            className="w-full h-full"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
          >
            <defs>
              {Object.entries(REL_COLORS).map(([type, color]) => (
                <marker
                  key={type}
                  id={`arrow-${type}`}
                  markerWidth="8" markerHeight="8"
                  refX="6" refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L8,3 z" fill={color} />
                </marker>
              ))}
            </defs>

            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
              {/* Edges */}
              {graph.edges.map((edge, i) => {
                if (selectedEdgeType && edge.type !== selectedEdgeType) return null;
                const a = graph.nodes[edge.from], b = graph.nodes[edge.to];
                if (!a || !b) return null;
                const dx = b.x - a.x, dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const sx = a.x + (dx / dist) * NODE_R;
                const sy = a.y + (dy / dist) * NODE_R;
                const ex = b.x - (dx / dist) * (NODE_R + 10);
                const ey = b.y - (dy / dist) * (NODE_R + 10);
                const color = REL_COLORS[edge.type] || '#94a3b8';
                return (
                  <line
                    key={i}
                    x1={sx} y1={sy} x2={ex} y2={ey}
                    stroke={color}
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                    markerEnd={`url(#arrow-${edge.type})`}
                  />
                );
              })}

              {/* Nodes */}
              {Object.values(graph.nodes).map(node => {
                const isHov = hovered?.id === node.id;
                const edges = getNodeEdges(node.id);
                const words = node.label.split(' ');
                const lines = [];
                let cur = '';
                words.forEach(w => {
                  const test = cur ? cur + ' ' + w : w;
                  if (test.length > 12 && cur) { lines.push(cur); cur = w; }
                  else cur = test;
                });
                if (cur) lines.push(cur);

                return (
                  <g key={node.id} style={{ cursor: 'grab' }}>
                    <circle
                      cx={node.x} cy={node.y} r={NODE_R}
                      fill={isHov ? '#3b82f6' : '#1e40af'}
                      stroke={isHov ? '#fff' : '#93c5fd'}
                      strokeWidth={isHov ? 2.5 : 1.5}
                    />
                    {lines.map((line, li) => (
                      <text
                        key={li}
                        x={node.x}
                        y={node.y + (li - (lines.length - 1) / 2) * 13}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize={10}
                        style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'Inter, sans-serif' }}
                      >
                        {line}
                      </text>
                    ))}
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {!isLoading && !graph && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
            No concepts found.
          </div>
        )}

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
                <span key={type} className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium"
                  style={{ backgroundColor: REL_COLORS[type] }}>
                  {REL_LABELS[type]}
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