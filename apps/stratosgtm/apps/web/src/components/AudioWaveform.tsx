import React, { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  isActive: boolean;
  isAgentSpeaking: boolean;
  isUserSpeaking: boolean;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isActive,
  isAgentSpeaking,
  isUserSpeaking
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      if (!isActive) {
        // Idle flatline with subtle pulse
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      phase += 0.05;
      const waveCount = 3;

      for (let w = 0; w < waveCount; w++) {
        ctx.beginPath();
        const amplitude = isAgentSpeaking ? 45 : isUserSpeaking ? 30 : 10;
        const frequency = 0.015 + w * 0.005;
        const offset = phase + w * (Math.PI / 2);

        // Color gradient
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        if (isAgentSpeaking) {
          gradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
          gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.9)');
          gradient.addColorStop(1, 'rgba(139, 92, 246, 0.2)');
        } else if (isUserSpeaking) {
          gradient.addColorStop(0, 'rgba(6, 182, 212, 0.2)');
          gradient.addColorStop(0.5, 'rgba(14, 165, 233, 0.9)');
          gradient.addColorStop(1, 'rgba(6, 182, 212, 0.2)');
        } else {
          gradient.addColorStop(0, 'rgba(16, 185, 129, 0.1)');
          gradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.6)');
          gradient.addColorStop(1, 'rgba(16, 185, 129, 0.1)');
        }

        ctx.strokeStyle = gradient;
        ctx.lineWidth = isAgentSpeaking ? 3 : 2;

        for (let x = 0; x < width; x++) {
          const y = centerY + Math.sin(x * frequency + offset) * amplitude * Math.sin((x / width) * Math.PI);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isActive, isAgentSpeaking, isUserSpeaking]);

  return (
    <div className="relative w-full h-36 bg-slate-950/60 rounded-2xl border border-slate-800/80 p-4 flex flex-col items-center justify-center overflow-hidden shadow-2xl backdrop-blur-xl">
      <div className="absolute top-3 left-4 flex items-center space-x-2 text-xs font-mono text-slate-400">
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            isActive ? (isAgentSpeaking ? 'bg-purple-500 animate-pulse' : 'bg-cyan-400 animate-pulse') : 'bg-slate-600'
          }`}
        />
        <span>
          {isActive
            ? isAgentSpeaking
              ? 'ASSEMBLYAI VOICE AGENT (SPEAKING)'
              : isUserSpeaking
              ? 'LISTENING TO OPERATOR / USER'
              : 'LIVE DUPLEX STANDBY'
            : 'MICROPHONE DISCONNECTED'}
        </span>
      </div>

      <div className="absolute top-3 right-4 text-xs font-mono text-slate-500">
        24,000 Hz PCM16 • AssemblyAI Voice Agent
      </div>

      <canvas ref={canvasRef} width={700} height={120} className="w-full h-full object-contain" />
    </div>
  );
};
