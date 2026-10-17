import React, { useEffect, useRef, useState } from 'react';
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  Layers,
  Search,
  ExternalLink,
  Tag,
  Share2
} from 'lucide-react';

export interface Node3D {
  id: string;
  label: string;
  type: string;
  properties: Record<string, any>;
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
}

export interface Edge3D {
  source: string;
  target: string;
  type: string;
}

interface KnowledgeGraph3DProps {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    properties: Record<string, any>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    label?: string;
  }>;
  selectedNodeId?: string | null;
  onSelectNode?: (node: any) => void;
  theme?: 'glass' | 'cyber';
}

const TYPE_COLORS: Record<string, string> = {
  client: '#10b981', // emerald
  lead: '#06b6d4', // cyan
  voice_session: '#a855f7', // purple
  objection: '#f59e0b', // amber
  content_pack: '#ec4899', // pink
  guardrail_policy: '#6366f1', // indigo
  offer: '#3b82f6', // blue
  default: '#94a3b8' // slate
};

export const KnowledgeGraph3D: React.FC<KnowledgeGraph3DProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  theme = 'glass'
}) => {
  const isGlass = theme === 'glass';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState<number>(1.0);
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(true);
  const [hoveredNode, setHoveredNode] = useState<Node3D | null>(null);
  const [cameraZDepth, setCameraZDepth] = useState<number>(0);

  // Rotation angles
  const rotRef = useRef<{ x: number; y: number }>({ x: 0.2, y: 0.3 });
  const isDraggingRef = useRef<boolean>(false);
  const lastMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Map input nodes into 3D sphere/cluster layout
  const nodes3DRef = useRef<Node3D[]>([]);

  useEffect(() => {
    const total = nodes.length || 1;
    const radius = 220;

    nodes3DRef.current = nodes.map((node, i) => {
      // Golden spiral distribution on a sphere
      const phi = Math.acos(1 - (2 * (i + 0.5)) / total);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      const color = TYPE_COLORS[node.type] || TYPE_COLORS.default;
      const size = node.type === 'client' ? 9 : node.type === 'lead' ? 8 : 6;

      return {
        ...node,
        x,
        y,
        z,
        color,
        size
      };
    });
  }, [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const handleResize = () => {
      if (!canvas || !containerRef.current) return;
      canvas.width = containerRef.current.clientWidth || 800;
      canvas.height = containerRef.current.clientHeight || 500;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const render = () => {
      if (!canvas || !ctx) return;
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Auto rotation when not dragging
      if (isAutoRotate && !isDraggingRef.current) {
        rotRef.current.y += 0.003;
        rotRef.current.x += 0.001;
      }

      const cosX = Math.cos(rotRef.current.x);
      const sinX = Math.sin(rotRef.current.x);
      const cosY = Math.cos(rotRef.current.y);
      const sinY = Math.sin(rotRef.current.y);

      const fov = 450;
      const projectedNodes: Array<{
        node: Node3D;
        px: number;
        py: number;
        pz: number;
        scale: number;
        alpha: number;
      }> = [];

      // Project 3D points to 2D screen
      for (const node of nodes3DRef.current) {
        // Rotate around Y axis
        let x1 = node.x * cosY - node.z * sinY;
        let z1 = node.z * cosY + node.x * sinY;

        // Rotate around X axis
        let y2 = node.y * cosX - z1 * sinX;
        let z2 = z1 * cosX + node.y * sinX;

        // Apply camera zoom and Z-depth
        z2 += 400 + cameraZDepth;

        if (z2 <= 20) z2 = 20; // prevent divide-by-zero or inversion

        const scale = (fov / z2) * zoom;
        const px = centerX + x1 * scale;
        const py = centerY + y2 * scale;

        // Depth cueing (alpha falls off with distance)
        const alpha = Math.max(0.2, Math.min(1.0, 1.3 - z2 / 750));

        projectedNodes.push({
          node,
          px,
          py,
          pz: z2,
          scale,
          alpha
        });
      }

      // Sort by depth (painter algorithm: draw furthest first)
      projectedNodes.sort((a, b) => b.pz - a.pz);

      const projectedMap = new Map<string, { px: number; py: number; alpha: number }>();
      projectedNodes.forEach((p) => projectedMap.set(p.node.id, { px: p.px, py: p.py, alpha: p.alpha }));

      // 1. Draw 3D Edges with glowing synaptic pulses
      for (const edge of edges) {
        const p1 = projectedMap.get(edge.source);
        const p2 = projectedMap.get(edge.target);

        if (p1 && p2) {
          const edgeAlpha = Math.min(p1.alpha, p2.alpha) * 0.45;
          const isHighlighted =
            selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId);

          ctx.beginPath();
          ctx.moveTo(p1.px, p1.py);
          ctx.lineTo(p2.px, p2.py);
          ctx.strokeStyle = isHighlighted
            ? (isGlass ? 'rgba(2, 132, 199, 0.9)' : 'rgba(6, 182, 212, 0.85)')
            : (isGlass ? `rgba(148, 163, 184, ${edgeAlpha * 0.75})` : `rgba(148, 163, 184, ${edgeAlpha})`);
          ctx.lineWidth = isHighlighted ? 2.5 : 1.0;
          ctx.stroke();

          // Animated energy pulse particle traversing edge
          if (isHighlighted || edgeAlpha > 0.3) {
            const t = (performance.now() * 0.0008 + (p1.px % 10)) % 1;
            const pulseX = p1.px + (p2.px - p1.px) * t;
            const pulseY = p1.py + (p2.py - p1.py) * t;

            ctx.beginPath();
            ctx.arc(pulseX, pulseY, isHighlighted ? 3 : 1.8, 0, Math.PI * 2);
            ctx.fillStyle = isHighlighted ? '#38bdf8' : 'rgba(56, 189, 248, 0.7)';
            ctx.fill();
          }
        }
      }

      // 2. Draw 3D Nodes
      for (const p of projectedNodes) {
        const isSelected = p.node.id === selectedNodeId;
        const isHovered = hoveredNode?.id === p.node.id;
        const nodeRadius = Math.max(3, p.node.size * p.scale);

        // Glow halo for selected or hovered
        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(p.px, p.py, nodeRadius * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(56, 189, 248, 0.2)';
          ctx.fill();
        }

        // Pristine Colored Glass Marble Rendering
        const marbleGrad = ctx.createRadialGradient(
          p.px - nodeRadius * 0.35,
          p.py - nodeRadius * 0.35,
          nodeRadius * 0.1,
          p.px,
          p.py,
          nodeRadius
        );

        if (isGlass) {
          marbleGrad.addColorStop(0, '#ffffff'); // Specular highlight
          marbleGrad.addColorStop(0.3, p.node.color); // Colored translucent core
          marbleGrad.addColorStop(0.85, p.node.color);
          marbleGrad.addColorStop(1, 'rgba(15, 23, 42, 0.35)'); // Refractive rim shadow
        } else {
          marbleGrad.addColorStop(0, '#ffffff');
          marbleGrad.addColorStop(0.3, p.node.color);
          marbleGrad.addColorStop(1, p.node.color);
        }

        ctx.beginPath();
        ctx.arc(p.px, p.py, nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = marbleGrad;
        ctx.globalAlpha = p.alpha;
        ctx.fill();

        // Crisp white glass rim
        ctx.strokeStyle = isSelected
          ? (isGlass ? '#0284c7' : '#38bdf8')
          : (isGlass ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.6)');
        ctx.lineWidth = isSelected ? 2.5 : 1.2;
        ctx.stroke();

        // Secondary specular dot
        ctx.beginPath();
        ctx.arc(p.px - nodeRadius * 0.3, p.py - nodeRadius * 0.3, Math.max(1.2, nodeRadius * 0.22), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();

        ctx.globalAlpha = 1.0;

        // High-contrast label for closer or highlighted nodes
        if (p.scale > 0.75 || isSelected || isHovered) {
          ctx.font = `${Math.max(10, Math.min(12, 10 * p.scale))}px Inter, sans-serif`;
          ctx.fillStyle = isGlass
            ? (isSelected ? '#0f172a' : '#334155')
            : (isSelected ? '#ffffff' : '#cbd5e1');
          ctx.fillText(p.node.label, p.px + nodeRadius + 5, p.py + 4);
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [edges, selectedNodeId, hoveredNode, zoom, isAutoRotate, cameraZDepth]);

  // Mouse drag handlers for 3D orbit
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDraggingRef.current) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;

      rotRef.current.y += dx * 0.008;
      rotRef.current.x += dy * 0.008;

      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Hover detection
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const cosX = Math.cos(rotRef.current.x);
    const sinX = Math.sin(rotRef.current.x);
    const cosY = Math.cos(rotRef.current.y);
    const sinY = Math.sin(rotRef.current.y);
    const fov = 450;

    let closest: Node3D | null = null;
    let minDistance = 14;

    for (const node of nodes3DRef.current) {
      let x1 = node.x * cosY - node.z * sinY;
      let z1 = node.z * cosY + node.x * sinY;
      let y2 = node.y * cosX - z1 * sinX;
      let z2 = z1 * cosX + node.y * sinX + 400 + cameraZDepth;

      if (z2 <= 20) continue;
      const scale = (fov / z2) * zoom;
      const px = centerX + x1 * scale;
      const py = centerY + y2 * scale;

      const dist = Math.hypot(px - mx, py - my);
      if (dist < minDistance) {
        minDistance = dist;
        closest = node;
      }
    }

    setHoveredNode(closest);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleClick = () => {
    if (hoveredNode && onSelectNode) {
      onSelectNode(hoveredNode);
    }
  };

  // Scroll wheel to zoom in/out in 3D
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * -0.0015;
    setZoom((prev) => Math.max(0.5, Math.min(2.5, prev + delta)));
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[520px] rounded-2xl overflow-hidden backdrop-blur-2xl flex flex-col transition-all border ${
        isGlass
          ? "bg-white/65 border-white/85 shadow-[0_12px_40px_rgba(31,38,135,0.06)] text-slate-800"
          : "bg-gradient-to-b from-slate-950 via-slate-900/90 to-slate-950 border-indigo-500/20 shadow-2xl text-slate-100"
      }`}
    >
      {/* Top 3D Control Bar */}
      <div className={`relative z-10 flex flex-wrap items-center justify-between gap-2 p-4 border-b backdrop-blur-md ${
        isGlass ? "border-slate-200/70 bg-white/70" : "border-slate-800/80 bg-slate-950/70"
      }`}>
        <div className="flex items-center space-x-2.5">
          <span className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className={`text-sm font-semibold ${isGlass ? "text-slate-900" : "text-white"}`}>Interactive 3D Spatial Knowledge Cloud</h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
                ORBIT • ZOOM • SCROLL DEPTH
              </span>
            </div>
            <p className={`text-[11px] ${isGlass ? "text-slate-500" : "text-slate-400"}`}>
              Drag to orbit 360° in 3D • Scroll to zoom along the Z-axis • Click any node to anchor inspector
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-2">
          {/* Depth Scrubbing Slider (Cindy Zhu 5k Scroll Depth Model) */}
          <div className={`hidden sm:flex items-center space-x-2 px-3 py-1 rounded-lg text-[11px] font-mono ${
            isGlass ? "bg-slate-100 border-slate-200 text-slate-700" : "bg-slate-900 border-slate-800 text-slate-300"
          }`}>
            <span>Z-Depth:</span>
            <input
              type="range"
              min="-200"
              max="200"
              value={cameraZDepth}
              onChange={(e) => setCameraZDepth(Number(e.target.value))}
              className="w-24 accent-indigo-500 cursor-pointer"
              title="Camera Z-Axis Position"
            />
          </div>

          <button
            onClick={() => setIsAutoRotate(!isAutoRotate)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
              isAutoRotate
                ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isAutoRotate ? 'Orbit: ON' : 'Orbit: OFF'}
          </button>

          <button
            onClick={() => setZoom((prev) => Math.min(2.5, prev + 0.2))}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            onClick={() => setZoom((prev) => Math.max(0.5, prev - 0.2))}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              rotRef.current = { x: 0.2, y: 0.3 };
              setZoom(1.0);
              setCameraZDepth(0);
            }}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300"
            title="Reset Camera"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main 3D Canvas Viewport */}
      <div className="relative flex-1 cursor-grab active:cursor-grabbing overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onWheel={handleWheel}
          className="w-full h-full"
        />

        {/* Legend Overlay */}
        <div className={`absolute bottom-3 left-3 flex flex-wrap gap-2 p-2 rounded-xl backdrop-blur-md text-[10px] font-mono pointer-events-none border ${
          isGlass ? "bg-white/80 border-slate-200/80 text-slate-700 shadow-sm" : "bg-slate-950/80 border-slate-800/80 text-slate-300"
        }`}>
          {Object.entries(TYPE_COLORS)
            .filter(([k]) => k !== 'default')
            .map(([type, color]) => (
              <div key={type} className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="capitalize">{type.replace('_', ' ')}</span>
              </div>
            ))}
        </div>

        {/* Hovered Node Tooltip Card */}
        {hoveredNode && (
          <div className="absolute top-4 right-4 p-3 rounded-xl bg-slate-950/90 border border-indigo-500/40 shadow-2xl backdrop-blur-xl text-xs space-y-1.5 pointer-events-none max-w-xs animate-in fade-in zoom-in duration-150">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hoveredNode.color }} />
              <span className="font-bold text-white truncate">{hoveredNode.label}</span>
            </div>
            <div className="text-[10px] font-mono text-indigo-300 uppercase">
              Type: {hoveredNode.type.replace('_', ' ')}
            </div>
            {hoveredNode.properties && (
              <div className="text-[11px] text-slate-400 line-clamp-3">
                {JSON.stringify(hoveredNode.properties).slice(0, 120)}...
              </div>
            )}
            <div className="text-[10px] text-emerald-400 font-mono">Click to inspect in Obsidian Vault</div>
          </div>
        )}
      </div>
    </div>
  );
};
