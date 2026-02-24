import { useState } from 'react';
import { playChoreCheck } from '../../utils/sounds.js';

// Burst particle colours + angles (degrees)
const BURST = [
  { angle: 0,   color: '#10b981' }, // emerald
  { angle: 60,  color: '#6366f1' }, // indigo
  { angle: 120, color: '#f59e0b' }, // amber
  { angle: 180, color: '#ef4444' }, // red
  { angle: 240, color: '#3b82f6' }, // blue
  { angle: 300, color: '#8b5cf6' }, // violet
];
const RAD  = Math.PI / 180;
const DIST = 26; // px each particle travels

export default function ChoreItem({ log, onToggle, disabled }) {
  const done = !!log.completed_at;
  // 'idle' → 'pop' (checkbox + burst) → 'exit' (card fades out) → onToggle called
  const [phase, setPhase] = useState('idle');

  const handleClick = () => {
    if (disabled || phase !== 'idle') return;
    if (!done) {
      playChoreCheck();
      setPhase('pop');
      setTimeout(() => setPhase('exit'), 420);
      setTimeout(() => {
        onToggle(log, true);
        setPhase('idle');
      }, 780);
    } else {
      onToggle(log, false);
    }
  };

  const isAnimating = phase !== 'idle';
  const showDone    = done || isAnimating;

  // Card background / border driven by phase
  const cardStyle = (() => {
    if (phase === 'exit') return {
      transition: 'opacity 360ms ease-out, transform 360ms ease-out',
      opacity: 0,
      transform: 'translateY(14px) scale(0.97)',
      backgroundColor: '#f0fdf4',
      borderColor: '#bbf7d0',
    };
    if (phase === 'pop') return {
      transition: 'background-color 200ms, border-color 200ms',
      backgroundColor: '#f0fdf4',
      borderColor: '#86efac',
    };
    if (done) return { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' };
    return {};
  })();

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border"
      style={cardStyle}
    >
      {/* Checkbox + burst container */}
      <div className="relative shrink-0">
        <button
          onClick={handleClick}
          disabled={disabled || isAnimating}
          aria-label={showDone ? 'Mark incomplete' : 'Mark complete'}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors disabled:cursor-not-allowed ${
            showDone
              ? 'border-green-500 bg-green-500'
              : 'border-gray-300 hover:border-brand-400'
          }`}
          style={
            phase === 'pop'
              ? { animation: 'chore-checkbox-pop 480ms cubic-bezier(0.36,0.07,0.19,0.97) both' }
              : undefined
          }
        >
          {showDone && (
            <svg viewBox="0 0 12 10" className="w-3 h-3" fill="none" aria-hidden>
              <polyline
                points="1,5 4,8 11,1"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="20"
                style={
                  phase === 'pop'
                    ? { animation: 'chore-check-draw 320ms ease-out 60ms both' }
                    : { strokeDashoffset: 0 }
                }
              />
            </svg>
          )}
        </button>

        {/* Confetti burst — only during 'pop' phase */}
        {phase === 'pop' && BURST.map(({ angle, color }, i) => (
          <span
            key={i}
            className="absolute w-2 h-2 rounded-full pointer-events-none"
            style={{
              top: '50%',
              left: '50%',
              backgroundColor: color,
              animation: `chore-burst 560ms ease-out ${i * 40}ms both`,
              '--tx': `${Math.cos(angle * RAD) * DIST}px`,
              '--ty': `${Math.sin(angle * RAD) * DIST}px`,
            }}
          />
        ))}
      </div>

      {/* Chore name + description */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium transition-colors ${showDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {log.name}
        </p>
        {log.description && (
          <p className="text-xs text-gray-400 truncate">{log.description}</p>
        )}
      </div>

      {/* Ticket badge */}
      {log.ticket_reward_at_time > 0 && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 transition-colors ${
          showDone ? 'bg-green-100 text-green-700' : 'bg-brand-50 text-brand-600'
        }`}>
          🎟 {log.ticket_reward_at_time}
        </span>
      )}
    </div>
  );
}
