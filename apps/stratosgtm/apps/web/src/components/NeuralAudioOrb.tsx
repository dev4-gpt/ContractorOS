import React, { useEffect, useRef } from 'react';
import { Sparkles, Activity, Cpu, Layers, Disc3, Gem, Orbit, Square, Waves, Droplet, Radio } from 'lucide-react';

export type VisualizerMode = 'cymatic' | 'prism' | 'gyroscope' | 'monolith' | 'ribbon' | 'droplet';

interface VisualizerOption {
  id: VisualizerMode;
  name: string;
  tagline: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const VISUALIZER_MODES: VisualizerOption[] = [
  {
    id: 'cymatic',
    name: 'The Cymatic Plane',
    tagline: 'Liquid & Organic (Default)',
    description: 'Acoustic standing-wave harmonic plane with radial resonant ripples and translucent liquid quartz refraction.',
    icon: Waves
  },
  {
    id: 'prism',
    name: 'The Frosted Prism',
    tagline: 'Geometric & Authoritative',
    description: 'Sharp-edged crystalline prism with refractive dispersion, internal caustic bounce, and high-specular glass rims.',
    icon: Gem
  },
  {
    id: 'gyroscope',
    name: 'The Glass Gyroscope',
    tagline: 'Sleek & Data-Driven',
    description: 'Concentric multi-axis orbital glass rings rotating independently around an illuminated neural nucleus.',
    icon: Orbit
  },
  {
    id: 'monolith',
    name: 'The Monolith Lightbox',
    tagline: 'Minimalist Glass Column',
    description: 'Architectural chamfered glass slab with internal subsurface light column and acoustic amplitude pulse.',
    icon: Square
  },
  {
    id: 'ribbon',
    name: 'The Neural Ribbon',
    tagline: 'Flowing Harmonic Loop',
    description: 'Continuous Möbius glass band undulating smoothly in 3D space, deforming dynamically with voice timbre.',
    icon: Disc3
  },
  {
    id: 'droplet',
    name: 'The Liquid Droplet',
    tagline: 'Mercury Fluid Core',
    description: 'Molten liquid droplet with dynamic surface tension and organic fluid wobble.',
    icon: Droplet
  }
];

interface NeuralAudioOrbProps {
  isActive: boolean;
  isAgentSpeaking: boolean;
  isUserSpeaking: boolean;
  agentName?: string;
  samplingRate?: string;
  modelName?: string;
  theme?: 'glass' | 'cyber';
  visualMode?: VisualizerMode;
  onSelectVisualMode?: (mode: VisualizerMode) => void;
  /**
   * Measured amplitude, 0..1. When supplied and non-zero it drives the orb
   * directly; otherwise the synthetic idle oscillation is used. Nothing here
   * invents a level — the absence of a measurement falls back to an obviously
   * decorative animation instead of pretending to be one.
   */
  level?: number;
}

export const NeuralAudioOrb: React.FC<NeuralAudioOrbProps> = ({
  isActive,
  isAgentSpeaking,
  isUserSpeaking,
  agentName = 'Anna (GrowthOS Senior Advisor)',
  samplingRate = '24,000 Hz PCM16',
  modelName = 'AssemblyAI Voice Agent',
  theme = 'glass',
  visualMode = 'cymatic',
  onSelectVisualMode,
  level = 0
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Read inside the render loop via a ref so a new level does not tear down and
  // rebuild the WebGL program 12 times a second.
  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    // Full screen quad vertex shader
    const vsSource = `
      attribute vec2 aPosition;
      varying vec2 vUv;
      void main() {
        vUv = (aPosition + 1.0) * 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    // Multi-SDF Raymarching Fragment Shader
    const fsSource = `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uState; // 0=idle, 1=user speaking, 2=agent speaking
      uniform float uIntensity;
      uniform vec2 uResolution;
      uniform float uTheme; // 0=glass, 1=cyber
      uniform float uMode;  // 0=cymatic, 1=prism, 2=gyroscope, 3=monolith, 4=ribbon, 5=droplet

      mat3 rotateY(float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return mat3(
          c, 0.0, s,
          0.0, 1.0, 0.0,
          -s, 0.0, c
        );
      }

      mat3 rotateX(float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return mat3(
          1.0, 0.0, 0.0,
          0.0, c, -s,
          0.0, s, c
        );
      }

      mat3 rotateZ(float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return mat3(
          c, -s, 0.0,
          s, c, 0.0,
          0.0, 0.0, 1.0
        );
      }

      // 0. The Cymatic Plane (Liquid & Organic Standing Wave Resonator)
      float sdCymaticPlane(vec3 p) {
        vec3 q = rotateX(0.72) * rotateY(uTime * 0.25) * p;
        float r = length(q.xz);
        float ripples = sin(8.5 * r - uTime * 3.4) * cos(6.0 * atan(q.z, q.x) + uTime * 1.5) * (0.045 + uIntensity * 0.16);
        float wave2 = sin(14.0 * r - uTime * 4.8) * 0.02 * uIntensity;
        float dDisc = max(abs(q.y - ripples - wave2) - 0.032, r - 0.96);
        float dNucleus = length(q - vec3(0.0, ripples * 1.35 + 0.05, 0.0)) - 0.14;
        return min(dDisc, dNucleus);
      }

      // 1. The Frosted Prism (Geometric & Authoritative Crystal)
      float sdFrostedPrism(vec3 p) {
        vec3 q = rotateY(uTime * 0.55) * rotateX(0.45 + sin(uTime * 0.4) * 0.15) * p;
        vec3 a = abs(q);
        float dOcta = (a.x + a.y + a.z - (0.82 + uIntensity * 0.1)) * 0.57735;
        float dCube = max(a.x, max(a.y, a.z)) - 0.58;
        return max(dOcta, dCube) - 0.035;
      }

      // 2. The Glass Gyroscope (Sleek & Data-Driven Concentric Gimbals)
      float sdGlassGyroscope(vec3 p) {
        vec3 q1 = rotateY(uTime * 0.8) * rotateX(0.35) * p;
        vec3 q2 = rotateX(uTime * 1.1) * rotateZ(0.65) * p;
        vec3 q3 = rotateZ(uTime * 0.6) * rotateY(0.5) * p;

        float core = length(p) - (0.24 + uIntensity * 0.06);
        float ring1 = length(vec2(length(q1.xz) - 0.72, q1.y)) - 0.035;
        float ring2 = length(vec2(length(q2.xy) - 0.54, q2.z)) - 0.032;
        float ring3 = length(vec2(length(q3.yz) - 0.38, q3.x)) - 0.028;

        return min(core, min(ring1, min(ring2, ring3)));
      }

      // 3. The Monolith Lightbox (Architectural Chamfered Slab)
      float sdMonolithLightbox(vec3 p) {
        vec3 q = rotateY(uTime * 0.35 + sin(uTime * 0.2) * 0.2) * p;
        vec3 b = vec3(0.38, 0.72, 0.16);
        vec3 d = abs(q) - b;
        float slab = length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - 0.05;
        float pillar = max(length(q.xz) - (0.07 + uIntensity * 0.08), abs(q.y) - 0.74);
        return min(slab, pillar);
      }

      // 4. The Neural Ribbon (Flowing Möbius Harmonic Band)
      float sdNeuralRibbon(vec3 p) {
        vec3 q = rotateY(uTime * 0.45) * rotateX(0.3) * p;
        float angle = atan(q.z, q.x);
        float rad = length(q.xz) - 0.65;
        float twist = angle * 1.5 + uTime * 1.2;
        vec2 rotatedSection = vec2(
          rad * cos(twist) - q.y * sin(twist),
          rad * sin(twist) + q.y * cos(twist)
        );
        vec2 dRib = abs(rotatedSection) - vec2(0.16 + uIntensity * 0.06, 0.025);
        float ribbon = length(max(dRib, 0.0)) + min(max(dRib.x, dRib.y), 0.0) - 0.02;
        float centerSpark = length(q) - (0.12 + uIntensity * 0.08);
        return min(ribbon, centerSpark);
      }

      // 5. The Liquid Droplet (Mercury Fluid Core)
      float sdLiquidDroplet(vec3 p) {
        vec3 q = rotateY(uTime * 0.3) * p;
        float disp = sin(3.2 * q.x + uTime * 2.2) * sin(3.2 * q.y + uTime * 1.9) * sin(3.2 * q.z + uTime * 2.5) * (0.05 + uIntensity * 0.15);
        float disp2 = sin(6.0 * q.x - uTime * 3.1) * sin(6.0 * q.z + uTime * 2.8) * 0.02 * uIntensity;
        return length(q) - (0.62 + disp + disp2);
      }

      float sceneSDF(vec3 p) {
        if (uMode < 0.5) {
          return sdCymaticPlane(p);
        } else if (uMode < 1.5) {
          return sdFrostedPrism(p);
        } else if (uMode < 2.5) {
          return sdGlassGyroscope(p);
        } else if (uMode < 3.5) {
          return sdMonolithLightbox(p);
        } else if (uMode < 4.5) {
          return sdNeuralRibbon(p);
        } else {
          return sdLiquidDroplet(p);
        }
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);
        vec3 ro = vec3(0.0, 0.0, 2.25);
        vec3 rd = normalize(vec3(uv, -1.0));

        vec3 glassCore;
        vec3 glassAura;

        if (uTheme < 0.5) {
          // 💎 LUCID GLASS THEME (Warm Cream & Quartz)
          if (uState > 1.8) {
            // Agent Speaking: Emerald seafoam refraction
            glassCore = vec3(0.10, 0.76, 0.62);
            glassAura = vec3(0.32, 0.70, 0.95);
          } else if (uState > 0.8) {
            // User Speaking: Royal azure
            glassCore = vec3(0.18, 0.52, 0.96);
            glassAura = vec3(0.55, 0.40, 0.95);
          } else {
            // Standby: Crystalline lavender & cyan tint
            glassCore = vec3(0.42, 0.44, 0.88);
            glassAura = vec3(0.28, 0.65, 0.92);
          }
        } else {
          // 🌑 OBSIDIAN CYBER THEME
          if (uState > 1.8) {
            glassCore = vec3(0.05, 0.95, 0.65);
            glassAura = vec3(0.08, 0.65, 0.95);
          } else if (uState > 0.8) {
            glassCore = vec3(0.08, 0.78, 1.0);
            glassAura = vec3(0.45, 0.22, 0.98);
          } else {
            glassCore = vec3(0.42, 0.22, 0.85);
            glassAura = vec3(0.15, 0.38, 0.75);
          }
        }

        float t = 0.0;
        float d = 0.0;
        float glow = 0.0;

        for (int i = 0; i < 48; i++) {
          vec3 p = ro + rd * t;
          d = sceneSDF(p);
          glow += 0.014 / (0.035 + abs(d));
          if (d < 0.008 || t > 3.9) break;
          t += max(d * 0.62, 0.018);
        }

        vec4 finalColor = vec4(0.0);

        if (d < 0.038) {
          vec3 p = ro + rd * t;
          vec3 eps = vec3(0.002, 0.0, 0.0);
          vec3 norm = normalize(vec3(
            sceneSDF(p + eps.xyy) - sceneSDF(p - eps.xyy),
            sceneSDF(p + eps.yxy) - sceneSDF(p - eps.yxy),
            sceneSDF(p + eps.yyx) - sceneSDF(p - eps.yyx)
          ));

          float fresnel = pow(1.0 - max(dot(-rd, norm), 0.0), 2.2);

          if (uTheme < 0.5) {
            // Glassmorphic translucent refraction
            vec3 refColor = mix(glassCore, glassAura, fresnel * 0.85);
            refColor += vec3(0.96, 0.98, 1.0) * pow(fresnel, 3.4); // Pristine white edge rim
            finalColor = vec4(refColor, 0.84 + fresnel * 0.16);
          } else {
            vec3 col = mix(glassCore, glassAura, fresnel * 0.8);
            col += vec3(0.85, 1.0, 0.95) * pow(fresnel, 4.0);
            finalColor = vec4(col, 0.92);
          }
        }

        // Ambient atmospheric glow halo
        float haloAlpha = clamp(glow * (uTheme < 0.5 ? 0.075 : 0.17), 0.0, 0.82);
        finalColor += vec4(glassAura * glow * 0.11, haloAlpha);

        gl_FragColor = finalColor;
      }
    `;

    const createShader = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[Shader Error]', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[Program Link Error]', gl.getProgramInfoLog(prog));
      return;
    }

    gl.useProgram(prog);

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(prog, 'aPosition');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTimeLoc = gl.getUniformLocation(prog, 'uTime');
    const uStateLoc = gl.getUniformLocation(prog, 'uState');
    const uIntensityLoc = gl.getUniformLocation(prog, 'uIntensity');
    const uResLoc = gl.getUniformLocation(prog, 'uResolution');
    const uThemeLoc = gl.getUniformLocation(prog, 'uTheme');
    const uModeLoc = gl.getUniformLocation(prog, 'uMode');

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let animId: number;
    let startTime = performance.now();

    const resize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResLoc, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize);

    // Map visualMode to index
    let modeVal = 0.0;
    if (visualMode === 'cymatic') modeVal = 0.0;
    else if (visualMode === 'prism') modeVal = 1.0;
    else if (visualMode === 'gyroscope') modeVal = 2.0;
    else if (visualMode === 'monolith') modeVal = 3.0;
    else if (visualMode === 'ribbon') modeVal = 4.0;
    else if (visualMode === 'droplet') modeVal = 5.0;

    gl.uniform1f(uModeLoc, modeVal);

    const render = () => {
      const now = performance.now();
      const time = (now - startTime) * 0.001;

      let stateVal = 0.0;
      let intensityVal = 0.16;

      const measured = levelRef.current;
      if (measured > 0 && (isUserSpeaking || isAgentSpeaking)) {
        stateVal = isAgentSpeaking ? 2.0 : 1.0;
        intensityVal = 0.18 + Math.min(1, measured) * 0.72;
      } else if (isAgentSpeaking) {
        stateVal = 2.0;
        intensityVal = 0.58 + Math.sin(time * 12.0) * 0.36;
      } else if (isUserSpeaking) {
        stateVal = 1.0;
        intensityVal = 0.42 + Math.sin(time * 8.0) * 0.26;
      } else if (isActive) {
        intensityVal = 0.26 + Math.sin(time * 3.0) * 0.09;
      }

      gl.uniform1f(uTimeLoc, time);
      gl.uniform1f(uStateLoc, stateVal);
      gl.uniform1f(uIntensityLoc, intensityVal);
      gl.uniform1f(uThemeLoc, theme === 'glass' ? 0.0 : 1.0);
      gl.uniform1f(uModeLoc, modeVal);

      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(quadBuffer);
    };
  }, [isActive, isAgentSpeaking, isUserSpeaking, theme, visualMode]);

  const isGlass = theme === 'glass';
  const currentOption = VISUALIZER_MODES.find(m => m.id === visualMode) || VISUALIZER_MODES[0];

  return (
    <div
      className={`relative w-full rounded-3xl overflow-hidden transition-all duration-300 ${
        isGlass
          ? 'bg-[#fdfcf9]/85 backdrop-blur-2xl border border-[#e8e4dc]/95 shadow-[0_12px_40px_rgba(40,30,20,0.04)]'
          : 'bg-slate-950/85 border border-cyan-800/40 shadow-2xl'
      }`}
    >
      {/* Top Telemetry Strip */}
      <div
        className={`flex flex-wrap items-center justify-between px-6 py-3.5 border-b gap-2 ${
          isGlass ? 'border-[#e8e4dc]/80 bg-[#f7f3ea]/70' : 'border-cyan-900/40 bg-slate-900/60'
        }`}
      >
        <div className="flex items-center space-x-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isAgentSpeaking
                ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse'
                : isUserSpeaking
                ? 'bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.8)] animate-pulse'
                : isActive
                ? 'bg-indigo-500 animate-pulse'
                : 'bg-slate-400'
            }`}
          />
          <span className={`text-xs font-semibold ${isGlass ? 'text-slate-800' : 'text-slate-200'}`}>
            {agentName}
          </span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold ${
              isGlass
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'bg-cyan-950 text-cyan-400 border border-cyan-800'
            }`}
          >
            {isAgentSpeaking ? 'ANNA ADVISING (SPEAKING)' : isUserSpeaking ? 'LISTENING TO OPERATOR' : 'READY • STANDBY'}
          </span>
        </div>

        <div className="flex items-center space-x-3 text-[11px] font-mono">
          <div className="flex items-center space-x-1">
            <Activity className={`w-3.5 h-3.5 ${isGlass ? 'text-sky-600' : 'text-cyan-400'}`} />
            <span className={isGlass ? 'text-slate-600' : 'text-slate-400'}>{samplingRate}</span>
          </div>
          <div className="hidden sm:flex items-center space-x-1">
            <Cpu className={`w-3.5 h-3.5 ${isGlass ? 'text-purple-600' : 'text-purple-400'}`} />
            <span className={isGlass ? 'text-slate-600' : 'text-slate-400'}>{modelName}</span>
          </div>
        </div>
      </div>

      {/* Interactive Look Selector Toolbar: Direct Buttons + Text Select Box */}
      <div
        className={`px-5 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 ${
          isGlass ? 'border-[#e8e4dc]/70 bg-[#faf8f4]/60' : 'border-slate-800/80 bg-slate-900/40'
        }`}
      >
        <div className="flex items-center space-x-2">
          <Layers className={`w-3.5 h-3.5 ${isGlass ? 'text-slate-600' : 'text-cyan-400'}`} />
          <span className={`text-[11px] font-mono font-semibold uppercase tracking-wider ${
            isGlass ? 'text-slate-700' : 'text-slate-300'
          }`}>
            Anna 3D Visualizer:
          </span>

          {/* Text Select Dropdown Box */}
          <select
            value={visualMode}
            onChange={(e) => onSelectVisualMode && onSelectVisualMode(e.target.value as VisualizerMode)}
            className={`text-xs font-mono font-medium rounded-lg px-2.5 py-1 outline-none transition-all cursor-pointer border ${
              isGlass
                ? 'bg-[#ffffff] text-slate-800 border-[#d8d3c7] hover:border-slate-400 shadow-2xs'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-cyan-500 shadow-inner'
            }`}
          >
            {VISUALIZER_MODES.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.name} ({mode.tagline})
              </option>
            ))}
          </select>
        </div>

        {/* Quick-Pick Button Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {VISUALIZER_MODES.map((mode) => {
            const Icon = mode.icon;
            const isSelected = visualMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => onSelectVisualMode && onSelectVisualMode(mode.id)}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all ${
                  isSelected
                    ? isGlass
                      ? 'bg-sky-100/90 text-sky-900 border border-sky-300 font-bold shadow-xs'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold'
                    : isGlass
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-[#ede8dc]/50 border border-transparent'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
                title={mode.description}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{mode.name.replace('The ', '')}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Center 3D WebGL Canvas */}
      <div className="relative w-full h-64 sm:h-72 flex items-center justify-center overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full cursor-pointer" />

        {/* Floating Specular Ring Archetype Label */}
        <div className="absolute bottom-4 left-6 pointer-events-none flex items-center space-x-2">
          <div
            className={`px-3 py-1 rounded-xl text-[10px] font-mono font-medium backdrop-blur-md shadow-sm border ${
              isGlass
                ? 'bg-[#fdfcf9]/90 border-[#e8e4dc]/95 text-slate-800'
                : 'bg-slate-900/80 border-cyan-900/50 text-cyan-300'
            }`}
          >
            <span className="font-semibold text-sky-600 mr-1">Active Look:</span>
            {currentOption.name} • {currentOption.tagline}
          </div>
        </div>

        <div className="absolute bottom-4 right-6 pointer-events-none flex items-center space-x-2">
          <div
            className={`px-3 py-1 rounded-xl text-[10px] font-mono font-medium backdrop-blur-md shadow-sm border ${
              isGlass
                ? 'bg-[#fdfcf9]/90 border-[#e8e4dc]/95 text-slate-700'
                : 'bg-slate-900/80 border-emerald-900/50 text-emerald-300'
            }`}
          >
            Liquid Quartz Engine • 60 FPS GPU
          </div>
        </div>
      </div>
    </div>
  );
};
