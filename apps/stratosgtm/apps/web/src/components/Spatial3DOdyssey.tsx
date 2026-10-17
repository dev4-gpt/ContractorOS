import React, { useState, useEffect, useRef } from 'react';
import {
  Compass,
  Zap,
  Mic,
  Database,
  Sparkles,
  BarChart3,
  GitFork,
  ChevronRight,
  ChevronDown,
  Navigation2,
  Sliders,
  Maximize2
} from 'lucide-react';

export interface SpatialStratum {
  id: string;
  name: string;
  subtitle: string;
  depthMeters: number; // e.g. 0, 1800, 3600, 5400, 7200
  accentColor: string;
  icon: React.ReactNode;
}

export const STRATA: SpatialStratum[] = [
  {
    id: 'senses',
    name: 'Stratum 0: Acoustic Surface',
    subtitle: 'Real-time Full-Duplex Speech & Sensory Gateway',
    depthMeters: 0,
    accentColor: '#0284c7', // Sky blue
    icon: <Mic className="w-4 h-4 text-sky-600" />
  },
  {
    id: 'crm',
    name: 'Stratum 1: Logic Stream',
    subtitle: 'Autonomous BANT Qualification & Revenue Pipeline',
    depthMeters: 1800,
    accentColor: '#059669', // Emerald
    icon: <Database className="w-4 h-4 text-emerald-600" />
  },
  {
    id: 'content',
    name: 'Stratum 2: Synthesizer Reactor',
    subtitle: 'Hermes Content Studio & DeepSeek-R1 DSPy Self-Healing',
    depthMeters: 3600,
    accentColor: '#7c3aed', // Purple
    icon: <Sparkles className="w-4 h-4 text-purple-600" />
  },
  {
    id: 'evals',
    name: 'Stratum 3: Diagnostics Observatory',
    subtitle: 'Anthropic Automated Evals & Latency Telemetry Matrix',
    depthMeters: 5400,
    accentColor: '#2563eb', // Cobalt Blue
    icon: <BarChart3 className="w-4 h-4 text-blue-600" />
  },
  {
    id: 'vault',
    name: 'Stratum 4: Memory Cosmos',
    subtitle: 'Persistent Knowledge Graph & Obsidian Markdown Vault',
    depthMeters: 7200,
    accentColor: '#059669', // Emerald
    icon: <GitFork className="w-4 h-4 text-emerald-600" />
  }
];

interface Spatial3DOdysseyProps {
  consoleContent: React.ReactNode;
  crmContent: React.ReactNode;
  contentStudioContent: React.ReactNode;
  evalsContent: React.ReactNode;
  graphContent: React.ReactNode;
  onExitOdyssey?: () => void;
  theme?: 'glass' | 'cyber';
  requestedZ?: number | null;
}

export const Spatial3DOdyssey: React.FC<Spatial3DOdysseyProps> = ({
  consoleContent,
  crmContent,
  contentStudioContent,
  evalsContent,
  graphContent,
  onExitOdyssey,
  theme = 'glass',
  requestedZ = null
}) => {
  // Current camera Z position in CSS pixels (0 to 7200)
  const [currentZ, setCurrentZ] = useState(0);
  const targetZRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Programmatic camera warp (e.g. from 60s Judge Auto-Pilot Tour)
  useEffect(() => {
    if (typeof requestedZ === 'number' && !isNaN(requestedZ)) {
      targetZRef.current = Math.max(0, Math.min(7200, requestedZ));
    }
  }, [requestedZ]);

  // Mouse tilt / parallax state
  const [mouseTilt, setMouseTilt] = useState({ x: 0, y: 0 });

  const isGlass = theme === 'glass';

  // Camera damping physics loop (lerp)
  useEffect(() => {
    const loop = () => {
      setCurrentZ((prev) => {
        const diff = targetZRef.current - prev;
        if (Math.abs(diff) < 0.2) return targetZRef.current;
        return prev + diff * 0.085; // smooth damping
      });
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Wheel scroll handler: map vertical scroll delta to Z-axis travel
  const handleWheel = (e: React.WheelEvent) => {
    const target = e.target as HTMLElement;
    const isInsideScrollable = target.closest('.scrollable-chamber-content');
    
    if (!isInsideScrollable) {
      e.preventDefault();
      const delta = e.deltaY * 1.6;
      targetZRef.current = Math.max(0, Math.min(7200, targetZRef.current + delta));
    }
  };

  // Mouse move for subtle 3D parallax
  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    const x = (clientX / innerWidth - 0.5) * 4; // -2 to +2 deg
    const y = (clientY / innerHeight - 0.5) * -4;
    setMouseTilt({ x, y });
  };

  // Warp directly to a stratum
  const handleWarpToStratum = (depth: number) => {
    targetZRef.current = depth;
  };

  // Find active stratum based on currentZ
  const activeStratumIndex = Math.min(
    STRATA.length - 1,
    Math.max(0, Math.round(currentZ / 1800))
  );
  const activeStratum = STRATA[activeStratumIndex];

  // Calculate chamber transform style based on camera position
  const getChamberStyle = (stratumDepth: number) => {
    const relZ = stratumDepth - currentZ;
    const absDist = Math.abs(relZ);

    if (absDist > 2400) {
      return {
        display: 'none',
        transform: `translate3d(0, 0, ${-stratumDepth}px)`
      };
    }

    const opacity = Math.max(0, Math.min(1, 1 - (absDist - 300) / 1200));
    const blur = Math.max(0, (absDist - 400) / 120);
    const isInteractive = absDist < 450;

    return {
      transform: `translate3d(0, 0, ${-stratumDepth}px)`,
      opacity,
      filter: blur > 0.5 ? `blur(${blur}px)` : 'none',
      pointerEvents: isInteractive ? ('auto' as const) : ('none' as const),
      transition: 'filter 0.3s ease-out, opacity 0.3s ease-out'
    };
  };

  // Glass chamber styling tokens
  const chamberBoxClass = isGlass
    ? 'w-full max-w-6xl max-h-[85vh] overflow-y-auto custom-scrollbar scrollable-chamber-content bg-[#fdfcf9]/85 border border-[#e8e4dc]/90 rounded-3xl p-5 shadow-[0_20px_60px_rgba(40,30,20,0.04)] backdrop-blur-2xl text-slate-800'
    : 'w-full max-w-6xl max-h-[85vh] overflow-y-auto custom-scrollbar scrollable-chamber-content bg-slate-950/80 border border-cyan-800/40 rounded-3xl p-5 shadow-[0_30px_90px_rgba(0,0,0,0.9)] backdrop-blur-2xl text-slate-100';

  const headerBorderClass = isGlass ? 'border-[#e8e4dc]/80 pb-4 mb-4' : 'border-cyan-800/30 pb-4 mb-4';

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      className={`relative w-full h-[calc(100vh-80px)] overflow-hidden select-none ${
        isGlass ? 'bg-transparent' : 'bg-[#03050d]'
      }`}
      style={{ perspective: '1100px' }}
    >
      {/* 1. Spatial Warp Radar HUD (Floating Top Control Deck) */}
      <div className="absolute top-4 left-6 right-6 z-40 flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
        {/* Left: Active Chamber Telemetry */}
        <div
          className={`flex items-center space-x-3 px-4 py-2 rounded-2xl shadow-lg backdrop-blur-2xl border ${
            isGlass
              ? 'bg-[#fdfcf9]/85 border-[#e8e4dc]/90 text-slate-900 shadow-[0_8px_32px_rgba(40,30,20,0.04)]'
              : 'bg-slate-950/80 border-cyan-800/60 text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.8)]'
          }`}
        >
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              isGlass
                ? 'bg-sky-50 border border-sky-200 text-sky-600'
                : 'bg-cyan-500/20 border border-cyan-400/40 text-cyan-300'
            }`}
          >
            <Compass className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span
                className={`text-[10px] font-mono uppercase tracking-widest font-bold ${
                  isGlass ? 'text-sky-800' : 'text-cyan-400'
                }`}
              >
                {activeStratum.name}
              </span>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                  isGlass
                    ? 'bg-slate-100 border border-slate-200 text-slate-700'
                    : 'bg-cyan-950 border border-cyan-800 text-cyan-300'
                }`}
              >
                Z: -{Math.round(currentZ)}m
              </span>
            </div>
            <p className={`text-[11px] font-medium ${isGlass ? 'text-slate-600' : 'text-slate-300'}`}>
              {activeStratum.subtitle}
            </p>
          </div>
        </div>

        {/* Center: Interactive Stratum Warp Pills */}
        <div
          className={`flex items-center space-x-1.5 p-1.5 rounded-2xl shadow-lg backdrop-blur-2xl border ${
            isGlass ? 'bg-[#fdfcf9]/85 border-[#e8e4dc]/90' : 'bg-slate-950/80 border-slate-800/80'
          }`}
        >
          {STRATA.map((stratum, idx) => {
            const isActive = activeStratumIndex === idx;
            return (
              <button
                key={stratum.id}
                onClick={() => handleWarpToStratum(stratum.depthMeters)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all ${
                  isActive
                    ? isGlass
                      ? 'bg-sky-50 text-sky-900 border border-sky-300/80 shadow-sm'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/60 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                    : isGlass
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                {stratum.icon}
                <span className="hidden md:inline">{stratum.name.split(':')[1]?.trim() || stratum.name}</span>
                <span className="text-[9px] opacity-60">L{idx}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Depth Scrubber & Exit Control */}
        <div
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-2xl shadow-lg backdrop-blur-2xl border ${
            isGlass ? 'bg-[#fdfcf9]/85 border-[#e8e4dc]/90' : 'bg-slate-950/80 border-slate-800/80'
          }`}
        >
          <div className="flex items-center space-x-2 mr-2">
            <Sliders className={`w-3.5 h-3.5 ${isGlass ? 'text-sky-600' : 'text-cyan-400'}`} />
            <input
              type="range"
              min="0"
              max="7200"
              step="50"
              value={Math.round(currentZ)}
              onChange={(e) => {
                targetZRef.current = Number(e.target.value);
              }}
              className={`w-24 sm:w-32 h-1 rounded-lg appearance-none cursor-pointer ${
                isGlass ? 'bg-slate-200 accent-sky-600' : 'bg-slate-800 accent-cyan-400'
              }`}
              title="Z-Axis Scrollytelling Depth Slider"
            />
          </div>

          {onExitOdyssey && (
            <button
              onClick={onExitOdyssey}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-mono transition-all border ${
                isGlass
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
              }`}
              title="Return to standard flat workspace view"
            >
              <Maximize2 className="w-3 h-3 text-slate-400" />
              <span>Tactical View</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Floating Navigation Helper Pill (Bottom Center) */}
      <div
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex items-center space-x-2 backdrop-blur-xl px-4 py-1.5 rounded-full text-[11px] font-mono shadow-xl border ${
          isGlass
            ? 'bg-[#fdfcf9]/90 border-[#e8e4dc]/95 text-slate-700'
            : 'bg-slate-950/80 border-cyan-800/40 text-slate-300'
        }`}
      >
        <Navigation2 className={`w-3.5 h-3.5 animate-bounce ${isGlass ? 'text-sky-600' : 'text-cyan-400'}`} />
        <span>
          Scroll mouse wheel to <strong>Dive Forward</strong> into AI Core • Click pills above to <strong>Warp</strong>
        </span>
      </div>

      {/* 3. The 3D Spatial World */}
      <div
        className="w-full h-full relative"
        style={{
          transformStyle: 'preserve-3d',
          transform: `translate3d(0, 0, ${currentZ}px) rotateX(${mouseTilt.y}deg) rotateY(${mouseTilt.x}deg)`,
          transition: 'transform 0.06s cubic-bezier(0.1, 0.9, 0.2, 1)'
        }}
      >
        {/* ============================================================ */}
        {/* CHAMBER 0: THE ACOUSTIC SURFACE (Voice Console & Senses)     */}
        {/* ============================================================ */}
        <div
          className="absolute inset-0 flex items-center justify-center p-6"
          style={getChamberStyle(0)}
        >
          <div className={chamberBoxClass}>
            {/* Sleek Waypoint Breadcrumb */}
            <div className={`flex items-center justify-between px-3.5 py-2 rounded-xl mb-4 border ${
              isGlass ? 'bg-[#f6f2ea]/90 border-[#e5e0d6] text-slate-800' : 'bg-cyan-950/40 border-cyan-800/40 text-slate-200'
            }`}>
              <div className="flex items-center space-x-2.5">
                <div className={`p-1.5 rounded-lg border ${
                  isGlass ? 'bg-[#fdfcf9] border-sky-200 text-sky-700' : 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                }`}>
                  <Mic className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center space-x-2 text-xs font-mono">
                  <span className={`font-bold ${isGlass ? 'text-sky-900' : 'text-cyan-300'}`}>Stratum 0 • Acoustic Surface</span>
                  <span className="opacity-40">•</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${
                    isGlass ? 'bg-sky-100/70 text-sky-800' : 'bg-cyan-950 text-cyan-400'
                  }`}>Z = 0m</span>
                </div>
              </div>
              <button
                onClick={() => handleWarpToStratum(1800)}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all border ${
                  isGlass ? 'bg-[#fdfcf9] hover:bg-white border-[#e2ded5] text-sky-900 shadow-2xs' : 'bg-cyan-600/20 hover:bg-cyan-600/40 border-cyan-500/50 text-cyan-200'
                }`}
              >
                <span>Warp to CRM (Z = -1,800m)</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {consoleContent}
          </div>
        </div>

        {/* ============================================================ */}
        {/* CHAMBER 1: THE LOGIC STREAM (Revenue CRM & Deal Flow)        */}
        {/* ============================================================ */}
        <div
          className="absolute inset-0 flex items-center justify-center p-6"
          style={getChamberStyle(1800)}
        >
          <div className={chamberBoxClass}>
            {/* Sleek Waypoint Breadcrumb */}
            <div className={`flex items-center justify-between px-3.5 py-2 rounded-xl mb-4 border ${
              isGlass ? 'bg-[#f4f6ef]/90 border-[#dce3d5] text-slate-800' : 'bg-emerald-950/40 border-emerald-800/40 text-slate-200'
            }`}>
              <div className="flex items-center space-x-2.5">
                <div className={`p-1.5 rounded-lg border ${
                  isGlass ? 'bg-[#fdfcf9] border-emerald-200 text-emerald-700' : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                }`}>
                  <Database className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center space-x-2 text-xs font-mono">
                  <span className={`font-bold ${isGlass ? 'text-emerald-900' : 'text-emerald-300'}`}>Stratum 1 • Logic Stream</span>
                  <span className="opacity-40">•</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${
                    isGlass ? 'bg-emerald-100/70 text-emerald-800' : 'bg-emerald-950 text-emerald-400'
                  }`}>Z = -1,800m</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleWarpToStratum(0)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono border ${
                    isGlass ? 'bg-[#fdfcf9] hover:bg-white border-[#e2ded5] text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  ↑ Surface
                </button>
                <button
                  onClick={() => handleWarpToStratum(3600)}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all border ${
                    isGlass ? 'bg-[#fdfcf9] hover:bg-white border-[#e2ded5] text-emerald-900 shadow-2xs' : 'bg-emerald-600/20 hover:bg-emerald-600/40 border-emerald-500/50 text-emerald-200'
                  }`}
                >
                  <span>Warp to Hermes Studio</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
            {crmContent}
          </div>
        </div>

        {/* ============================================================ */}
        {/* CHAMBER 2: THE SYNTHESIZER REACTOR (Hermes Content Studio)   */}
        {/* ============================================================ */}
        <div
          className="absolute inset-0 flex items-center justify-center p-6"
          style={getChamberStyle(3600)}
        >
          <div className={chamberBoxClass}>
            {/* Sleek Waypoint Breadcrumb */}
            <div className={`flex items-center justify-between px-3.5 py-2 rounded-xl mb-4 border ${
              isGlass ? 'bg-[#f6f2f7]/90 border-[#e4dbe8] text-slate-800' : 'bg-purple-950/40 border-purple-800/40 text-slate-200'
            }`}>
              <div className="flex items-center space-x-2.5">
                <div className={`p-1.5 rounded-lg border ${
                  isGlass ? 'bg-[#fdfcf9] border-purple-200 text-purple-700' : 'bg-purple-500/20 border-purple-400/40 text-purple-300'
                }`}>
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center space-x-2 text-xs font-mono">
                  <span className={`font-bold ${isGlass ? 'text-purple-900' : 'text-purple-300'}`}>Stratum 2 • Synthesizer Reactor</span>
                  <span className="opacity-40">•</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${
                    isGlass ? 'bg-purple-100/70 text-purple-800' : 'bg-purple-950 text-purple-400'
                  }`}>Z = -3,600m</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleWarpToStratum(1800)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono border ${
                    isGlass ? 'bg-[#fdfcf9] hover:bg-white border-[#e2ded5] text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  ↑ CRM
                </button>
                <button
                  onClick={() => handleWarpToStratum(5400)}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all border ${
                    isGlass ? 'bg-[#fdfcf9] hover:bg-white border-[#e2ded5] text-purple-900 shadow-2xs' : 'bg-purple-600/20 hover:bg-purple-600/40 border-purple-500/50 text-purple-200'
                  }`}
                >
                  <span>Warp to Evals Matrix</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
            {contentStudioContent}
          </div>
        </div>

        {/* ============================================================ */}
        {/* CHAMBER 3: THE DIAGNOSTICS OBSERVATORY (Anthropic Evals)     */}
        {/* ============================================================ */}
        <div
          className="absolute inset-0 flex items-center justify-center p-6"
          style={getChamberStyle(5400)}
        >
          <div className={chamberBoxClass}>
            {/* Sleek Waypoint Breadcrumb */}
            <div className={`flex items-center justify-between px-3.5 py-2 rounded-xl mb-4 border ${
              isGlass ? 'bg-[#f3f5f9]/90 border-[#dae1ec] text-slate-800' : 'bg-blue-950/40 border-blue-800/40 text-slate-200'
            }`}>
              <div className="flex items-center space-x-2.5">
                <div className={`p-1.5 rounded-lg border ${
                  isGlass ? 'bg-[#fdfcf9] border-blue-200 text-blue-700' : 'bg-blue-500/20 border-blue-400/40 text-blue-300'
                }`}>
                  <BarChart3 className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center space-x-2 text-xs font-mono">
                  <span className={`font-bold ${isGlass ? 'text-blue-900' : 'text-blue-300'}`}>Stratum 3 • Diagnostics Observatory</span>
                  <span className="opacity-40">•</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${
                    isGlass ? 'bg-blue-100/70 text-blue-800' : 'bg-blue-950 text-blue-400'
                  }`}>Z = -5,400m</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleWarpToStratum(3600)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono border ${
                    isGlass ? 'bg-[#fdfcf9] hover:bg-white border-[#e2ded5] text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  ↑ Synthesizer
                </button>
                <button
                  onClick={() => handleWarpToStratum(7200)}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all border ${
                    isGlass ? 'bg-[#fdfcf9] hover:bg-white border-[#e2ded5] text-blue-900 shadow-2xs' : 'bg-blue-600/20 hover:bg-blue-600/40 border-blue-500/50 text-blue-200'
                  }`}
                >
                  <span>Warp to Knowledge Vault</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
            {evalsContent}
          </div>
        </div>

        {/* ============================================================ */}
        {/* CHAMBER 4: THE MEMORY COSMOS (Knowledge Graph & Vault)       */}
        {/* ============================================================ */}
        <div
          className="absolute inset-0 flex items-center justify-center p-6"
          style={getChamberStyle(7200)}
        >
          <div className={chamberBoxClass}>
            {/* Sleek Waypoint Breadcrumb */}
            <div className={`flex items-center justify-between px-3.5 py-2 rounded-xl mb-4 border ${
              isGlass ? 'bg-[#f4f6ef]/90 border-[#dce3d5] text-slate-800' : 'bg-emerald-950/40 border-emerald-800/40 text-slate-200'
            }`}>
              <div className="flex items-center space-x-2.5">
                <div className={`p-1.5 rounded-lg border ${
                  isGlass ? 'bg-[#fdfcf9] border-emerald-200 text-emerald-700' : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                }`}>
                  <GitFork className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center space-x-2 text-xs font-mono">
                  <span className={`font-bold ${isGlass ? 'text-emerald-900' : 'text-emerald-300'}`}>Stratum 4 • Memory Cosmos & Knowledge Vault</span>
                  <span className="opacity-40">•</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${
                    isGlass ? 'bg-emerald-100/70 text-emerald-800' : 'bg-emerald-950 text-emerald-400'
                  }`}>Z = -7,200m</span>
                </div>
              </div>
              <button
                onClick={() => handleWarpToStratum(0)}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all border ${
                  isGlass ? 'bg-[#fdfcf9] hover:bg-white border-[#e2ded5] text-slate-800 shadow-2xs' : 'bg-emerald-600/20 hover:bg-emerald-600/40 border-emerald-500/50 text-emerald-200'
                }`}
              >
                <span>↑ Ascent to Surface (Z = 0m)</span>
              </button>
            </div>
            {graphContent}
          </div>
        </div>
      </div>
    </div>
  );
};
