import React, { useEffect, useRef } from 'react';

interface AmbientVercelShaderProps {
  theme?: 'glass' | 'cyber';
}

export const AmbientVercelShader: React.FC<AmbientVercelShaderProps> = ({ theme = 'glass' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    let mouseX = width / 2;
    let mouseY = height / 3;
    let targetMouseX = mouseX;
    let targetMouseY = mouseY;

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);

    // Floating 3D Geometric Reference Primitives for Glassmorphism
    // Warm editorial luxury palette (champagne gold, soft peach coral, warm sage, ecru mauve)
    const orbs = [
      {
        baseX: 0.18,
        baseY: 0.25,
        radius: 220,
        colorCore: 'rgba(245, 158, 11, 0.24)', // Warm champagne amber
        colorAura: 'rgba(251, 191, 36, 0.0)',
        speedX: 0.0008,
        speedY: 0.0011,
        phase: 0.0
      },
      {
        baseX: 0.82,
        baseY: 0.35,
        radius: 260,
        colorCore: 'rgba(251, 146, 60, 0.22)', // Soft peach / coral
        colorAura: 'rgba(249, 115, 22, 0.0)',
        speedX: 0.001,
        speedY: 0.0007,
        phase: 1.5
      },
      {
        baseX: 0.5,
        baseY: 0.75,
        radius: 280,
        colorCore: 'rgba(52, 211, 153, 0.18)', // Soft warm sage
        colorAura: 'rgba(16, 185, 129, 0.0)',
        speedX: 0.0007,
        speedY: 0.0009,
        phase: 3.2
      },
      {
        baseX: 0.35,
        baseY: 0.6,
        radius: 190,
        colorCore: 'rgba(168, 140, 220, 0.20)', // Soft warm mauve / ecru lilac
        colorAura: 'rgba(192, 132, 252, 0.0)',
        speedX: 0.0012,
        speedY: 0.0006,
        phase: 4.7
      }
    ];

    // Subtle ambient dust particles
    const particles: Array<{
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;
    }> = [];

    for (let i = 0; i < 35; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 2 + 0.8,
        speedX: (Math.random() - 0.5) * 0.2,
        speedY: (Math.random() - 0.5) * 0.2,
        opacity: Math.random() * 0.5 + 0.2
      });
    }

    let time = 0;

    const render = () => {
      time += 0.015;

      // Spring lerp mouse interpolation
      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;

      ctx.clearRect(0, 0, width, height);

      if (theme === 'glass') {
        // ==========================================
        // 💎 LUCID CREAM DATA SPACE (Warm Editorial Alabaster)
        // ==========================================

        // 1. Warm Editorial Cream Skybox Gradient
        const skybox = ctx.createLinearGradient(0, 0, width, height);
        skybox.addColorStop(0, '#faf8f5'); // Warm cream linen
        skybox.addColorStop(0.35, '#f6f3ec'); // Soft warm ecru / ivory
        skybox.addColorStop(0.7, '#f1ece1'); // Warm alabaster cream
        skybox.addColorStop(1, '#f5f0e6'); // Faint warm linen tint
        ctx.fillStyle = skybox;
        ctx.fillRect(0, 0, width, height);

        // 2. Floating 3D Geometric Reference Orbs (Soft Refractive Shapes)
        orbs.forEach((orb) => {
          const curX =
            (orb.baseX + Math.sin(time * orb.speedX * 100 + orb.phase) * 0.08) * width;
          const curY =
            (orb.baseY + Math.cos(time * orb.speedY * 100 + orb.phase) * 0.08) * height;

          const grad = ctx.createRadialGradient(curX, curY, 0, curX, curY, orb.radius);
          grad.addColorStop(0, orb.colorCore);
          grad.addColorStop(0.65, orb.colorCore.replace(/[\d.]+\)$/, '0.10)'));
          grad.addColorStop(1, orb.colorAura);

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(curX, curY, orb.radius, 0, Math.PI * 2);
          ctx.fill();

          // Subtle glossy specular rim highlight on orb
          const specGrad = ctx.createRadialGradient(
            curX - orb.radius * 0.35,
            curY - orb.radius * 0.35,
            0,
            curX,
            curY,
            orb.radius * 0.7
          );
          specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.40)');
          specGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
          ctx.fillStyle = specGrad;
          ctx.beginPath();
          ctx.arc(curX, curY, orb.radius * 0.7, 0, Math.PI * 2);
          ctx.fill();
        });

        // 3. Interactive Daylight Spotlight Diffusion (Tracks Cursor)
        const spotlight = ctx.createRadialGradient(
          mouseX,
          mouseY,
          0,
          mouseX,
          mouseY,
          Math.max(width * 0.45, 500)
        );
        spotlight.addColorStop(0, 'rgba(255, 255, 255, 0.40)');
        spotlight.addColorStop(0.4, 'rgba(254, 243, 199, 0.16)'); // Warm champagne highlight
        spotlight.addColorStop(0.8, 'rgba(253, 230, 138, 0.04)');
        spotlight.addColorStop(1, 'transparent');

        ctx.fillStyle = spotlight;
        ctx.fillRect(0, 0, width, height);

        // 4. Subtle Warm Architectural Reference Grid
        ctx.strokeStyle = 'rgba(180, 165, 145, 0.12)';
        ctx.lineWidth = 1;

        const gridSize = 70;
        ctx.beginPath();
        for (let x = 0; x < width; x += gridSize) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        for (let y = 0; y < height; y += gridSize) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.stroke();

        // 5. Ambient Luminous Dust Particles (Warm Ecru)
        particles.forEach((p) => {
          p.x += p.speedX;
          p.y += p.speedY;

          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          ctx.fillStyle = `rgba(130, 115, 95, ${p.opacity * 0.35})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      } else {
        // ==========================================
        // 🌑 OBSIDIAN CYBER (Dark Void Fallback)
        // ==========================================
        ctx.fillStyle = '#05070f';
        ctx.fillRect(0, 0, width, height);

        const spotlight = ctx.createRadialGradient(
          mouseX,
          mouseY,
          0,
          mouseX,
          mouseY,
          Math.max(width * 0.4, 450)
        );
        spotlight.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
        spotlight.addColorStop(0.35, 'rgba(99, 102, 241, 0.06)');
        spotlight.addColorStop(0.7, 'rgba(147, 51, 234, 0.02)');
        spotlight.addColorStop(1, 'transparent');

        ctx.fillStyle = spotlight;
        ctx.fillRect(0, 0, width, height);

        // Perspective grid lines
        ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
        ctx.lineWidth = 1;
        const gridHorizon = height * 0.35;

        for (let x = 0; x <= width; x += 60) {
          ctx.beginPath();
          ctx.moveTo(x, height);
          ctx.lineTo(width / 2 + (x - width / 2) * 0.15, gridHorizon);
          ctx.stroke();
        }

        particles.forEach((p) => {
          p.x += p.speedX;
          p.y += p.speedY;
          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          ctx.fillStyle = `rgba(56, 189, 248, ${p.opacity})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 w-full h-full"
      style={{ opacity: 0.95 }}
    />
  );
};
