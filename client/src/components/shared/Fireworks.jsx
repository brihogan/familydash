import { useEffect, useRef } from 'react';

const PALETTES = [
  ['#fbbf24', '#f59e0b', '#ffffff'],
  ['#ef4444', '#f97316', '#fbbf24'],
  ['#3b82f6', '#60a5fa', '#ffffff'],
  ['#10b981', '#34d399', '#ffffff'],
  ['#8b5cf6', '#a78bfa', '#ffffff'],
  ['#ec4899', '#f472b6', '#ffffff'],
  ['#06b6d4', '#67e8f9', '#ffffff'],
];

function rnd(min, max) { return Math.random() * (max - min) + min; }
function rndInt(min, max) { return Math.floor(rnd(min, max + 1)); }

export default function Fireworks({ onDone }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    let animId;
    const startTime = performance.now();
    const TOTAL_DURATION = 4500;

    // Pre-schedule burst positions and timings
    const bursts = Array.from({ length: 10 }, (_, i) => ({
      delay:   i * 380 + rnd(0, 120),
      x:       rnd(0.1, 0.9) * canvas.width,
      y:       rnd(0.12, 0.48) * canvas.height,
      palette: PALETTES[rndInt(0, PALETTES.length - 1)],
      fired:   false,
    }));

    function createBurst(x, y, palette) {
      const count = 80;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + rnd(-0.08, 0.08);
        const speed = rnd(2.5, 7.5);
        const color = palette[rndInt(0, palette.length - 1)];
        particles.push({
          x, y,
          vx:      Math.cos(angle) * speed,
          vy:      Math.sin(angle) * speed,
          alpha:   1,
          color,
          radius:  rnd(2, 3.5),
          decay:   rnd(0.013, 0.022),
          history: [],
        });
      }
    }

    function tick(now) {
      const elapsed = now - startTime;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      bursts.forEach((b) => {
        if (!b.fired && elapsed >= b.delay) {
          b.fired = true;
          createBurst(b.x, b.y, b.palette);
        }
      });

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Save trail position before moving
        p.history.unshift({ x: p.x, y: p.y });
        if (p.history.length > 6) p.history.pop();

        // Physics
        p.vy  += 0.10;
        p.vx  *= 0.97;
        p.vy  *= 0.97;
        p.x   += p.vx;
        p.y   += p.vy;
        p.alpha -= p.decay;

        if (p.alpha <= 0) { particles.splice(i, 1); continue; }

        ctx.save();

        // Draw fading trail
        p.history.forEach((pos, idx) => {
          const a = p.alpha * (1 - (idx + 1) / (p.history.length + 1)) * 0.55;
          const r = Math.max(p.radius * (1 - (idx + 1) / (p.history.length + 2)), 0.5);
          ctx.globalAlpha = a;
          ctx.fillStyle   = p.color;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.fill();
        });

        // Draw particle head
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      if (elapsed < TOTAL_DURATION || particles.length > 0) {
        animId = requestAnimationFrame(tick);
      } else {
        onDone?.();
      }
    }

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [onDone]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
    />
  );
}
