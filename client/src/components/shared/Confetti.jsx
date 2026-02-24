import { useEffect, useRef } from 'react';

const COLORS = [
  '#10b981', '#6366f1', '#f59e0b', '#ef4444',
  '#3b82f6', '#8b5cf6', '#f97316', '#ec4899', '#facc15',
];

function rand(a, b) { return a + Math.random() * (b - a); }

function makeParticles(w) {
  return Array.from({ length: 120 }, () => ({
    x:         rand(0, w),
    y:         rand(-80, -5),      // staggered above viewport
    vx:        rand(-2, 2),
    vy:        rand(1, 4.5),
    sway:      rand(0, Math.PI * 2),
    swaySpeed: rand(0.025, 0.07),
    swayAmp:   rand(0.4, 1.6),
    rotation:  rand(0, 360),
    rotSpeed:  rand(-5, 5),
    w:         rand(7, 14),
    h:         rand(4, 9),
    color:     COLORS[Math.floor(Math.random() * COLORS.length)],
    circle:    Math.random() < 0.3,
    alpha:     1,
  }));
}

/**
 * Full-screen canvas confetti. Unmount (or use onDone) when finished.
 * @param {{ onDone: () => void }} props
 */
export default function Confetti({ onDone }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles = makeParticles(canvas.width);
    let raf;
    const started   = performance.now();
    const FADE_AFTER = 3800; // ms before global alpha fade begins

    const tick = (now) => {
      const elapsed = now - started;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let alive = 0;
      for (const p of particles) {
        if (p.alpha <= 0) continue;
        alive++;

        // Physics
        p.vy       += 0.07;             // gravity
        p.sway     += p.swaySpeed;
        p.x        += p.vx + Math.sin(p.sway) * p.swayAmp;
        p.y        += p.vy;
        p.rotation += p.rotSpeed;

        // Fade near the bottom of the viewport
        if (p.y > canvas.height * 0.72) p.alpha -= 0.025;
        // Global fade-out after FADE_AFTER ms
        if (elapsed > FADE_AFTER) p.alpha -= 0.012;
        p.alpha = Math.max(0, p.alpha);

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle   = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        if (p.circle) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }

      if (alive === 0) { onDone?.(); return; }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
    />
  );
}
