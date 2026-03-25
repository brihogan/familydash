import { useEffect, useRef, useState } from 'react';

const ROLL_MS = 350;

/**
 * Single digit that slides up like a rotary clock when it changes.
 */
function RollingDigit({ digit, animate }) {
  const isFirst = useRef(true);
  const [state, setState] = useState({ prev: digit, current: digit, seq: 0, rolling: false });

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      setState({ prev: digit, current: digit, seq: 0, rolling: false });
      return;
    }

    if (!animate) {
      setState({ prev: digit, current: digit, seq: 0, rolling: false });
      return;
    }

    setState((s) => {
      if (digit === s.current) return s;
      return { prev: s.current, current: digit, seq: s.seq + 1, rolling: true };
    });

    const t = setTimeout(() => {
      setState((s) => ({ ...s, rolling: false }));
    }, ROLL_MS);
    return () => clearTimeout(t);
  }, [digit, animate]); // eslint-disable-line react-hooks/exhaustive-deps

  const { prev, current, seq, rolling } = state;

  return (
    <span
      className="inline-block overflow-hidden relative"
      style={{ width: '0.65em', height: '1.15em', lineHeight: '1.15em', verticalAlign: 'top' }}
    >
      <span
        className="absolute inset-x-0 text-center"
        style={rolling ? {
          animation: `roll-out ${ROLL_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
        } : undefined}
      >
        {rolling ? prev : current}
      </span>
      {rolling && (
        <span
          key={seq}
          className="absolute inset-x-0 text-center"
          style={{
            animation: `roll-in ${ROLL_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
          }}
        >
          {current}
        </span>
      )}
      <span className="invisible">{current}</span>
    </span>
  );
}

/**
 * Animates between number values with per-digit rolling transitions.
 * Set animate=false to snap instantly (e.g. on user switch).
 */
export default function RollingNumber({ value, animate = true, className = '' }) {
  const displayRef = useRef(value);
  const [display, setDisplay] = useState(value);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    // Snap instantly when not animating
    if (!animate) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    const target = value;
    const current = displayRef.current;
    if (target === current) return;

    const diff = target - current;
    const step = diff > 0 ? 1 : -1;
    const steps = Math.abs(diff);

    let i = 0;
    function tick() {
      i++;
      const next = current + step * i;
      displayRef.current = next;
      setDisplay(next);
      if (i < steps) {
        timerRef.current = setTimeout(tick, ROLL_MS + 50);
      }
    }
    timerRef.current = setTimeout(tick, 200);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [value, animate]);

  const digits = String(display).split('');

  return (
    <span className={`inline-flex ${className}`}>
      {digits.map((d, i) => (
        <RollingDigit key={digits.length - i} digit={d} animate={animate} />
      ))}
    </span>
  );
}
