import { useState, useEffect, useRef } from 'react';
import { formatCents } from '../../utils/formatCents.js';

const ANIM_DURATION = 1200; // ms

export default function CurrencyDisplay({ cents, className = '' }) {
  const [display, setDisplay] = useState(cents);
  const [direction, setDirection] = useState(0); // +1, -1, or 0
  const prevRef = useRef(cents);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = cents;
    prevRef.current = to;

    if (from === to) { setDisplay(to); setDirection(0); return; }

    const diff = to - from;
    setDirection(diff > 0 ? 1 : -1);
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min((now - start) / ANIM_DURATION, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + diff * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDirection(0);
      }
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cents]);

  const negative = display < 0;
  return (
    <span className={`font-mono ${negative ? 'text-red-600' : 'text-green-700'} ${className}`}>
      {formatCents(display)}
      {direction !== 0 && (
        <span className={`ml-1 text-[0.7em] font-bold ${direction > 0 ? 'text-green-500' : 'text-red-500'}`}>
          {direction > 0 ? '+' : '−'}
        </span>
      )}
    </span>
  );
}
