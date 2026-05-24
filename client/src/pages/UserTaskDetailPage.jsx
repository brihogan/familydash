import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faStickyNote } from '@fortawesome/free-solid-svg-icons';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import Fireworks from '../components/shared/Fireworks.jsx';
import { IconDisplay } from '../components/shared/IconPicker.jsx';
import { taskSetsApi } from '../api/taskSets.api.js';
import { badgesApi } from '../api/badges.api.js';
import { BADGE_LEVELS } from '../constants/badgeLevels.js';
import BadgeImageLightbox from '../components/badges/BadgeImageLightbox.jsx';
import AwardDetail from '../components/awards/AwardDetail.jsx';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import { playChoreCheck, playVictory } from '../utils/sounds.js';
import useScrollLock from '../hooks/useScrollLock.js';

// ── Fullscreen step detail modal (image + description) ───────────────────────
function StepDetailModal({ step, onClose }) {
  useScrollLock(true);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  const hasImage = !!step.image;
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center text-lg hover:bg-white/30 transition-colors"
        aria-label="Close"
      >
        ×
      </button>
      {/* Image area */}
      {hasImage && (
        <div className="flex-1 min-h-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <img
            src={`/api/uploads/steps/${step.image}`}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
      {/* Description area */}
      {step.description && (
        <div
          className={`${hasImage ? '' : 'flex-1 flex items-center justify-center'} px-6 ${hasImage ? 'pb-8 pt-2' : 'p-6'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`${hasImage ? '' : 'w-full max-w-md'} bg-white/10 backdrop-blur rounded-xl px-5 py-4 max-h-[40vh] overflow-y-auto`}>
            <p className="font-medium text-white text-sm mb-2">{step._displayName || step.name}</p>
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{step.description}</p>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── Duration formatter ────────────────────────────────────────────────────────

function formatDuration(fromISO, toDate) {
  // SQLite stores UTC without a 'Z' — append it so Date parses correctly
  const start  = new Date(fromISO.replace(' ', 'T') + 'Z');
  const diffMs = toDate - start;
  const days    = Math.floor(diffMs / 86_400_000);
  const hours   = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000)  / 60_000);
  if (days > 0)  return hours   > 0 ? `${days} day${days   !== 1 ? 's' : ''}, ${hours} hr${hours !== 1 ? 's' : ''}` : `${days} day${days !== 1 ? 's' : ''}`;
  if (hours > 0) return minutes > 0 ? `${hours} hr${hours  !== 1 ? 's' : ''}, ${minutes} min` : `${hours} hr${hours !== 1 ? 's' : ''}`;
  const totalMin = Math.floor(diffMs / 60_000);
  return totalMin > 0 ? `${totalMin} min` : 'just now';
}

// ── Project completion modal ──────────────────────────────────────────────────

function ProjectCompletionModal({ taskSet, stepCount, assignedAt, completedAt, pendingApproval, onClose }) {
  useScrollLock(true);
  const { useTickets } = useFamilySettings();
  // Keyboard dismiss
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Panel */}
      <div
        className="relative z-10 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs p-6 flex flex-col items-center text-center"
        style={{ animation: 'award-pop 420ms cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mb-0.5">🎉 Congrats!</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">You've completed a project</p>

        {/* Emoji in dimmed circle */}
        <div className="w-28 h-28 rounded-full bg-gray-200/70 dark:bg-gray-700/70 flex items-center justify-center mb-6 text-5xl leading-none">
          <IconDisplay value={taskSet.emoji} fallback="📋" />
        </div>

        {/* Name + category */}
        <p className="font-bold text-lg text-gray-900 dark:text-gray-100 leading-snug mb-1">{taskSet.name}</p>
        {taskSet.category && (
          <span className="px-2 py-0.5 text-xs font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-500/30 rounded-full">
            {taskSet.category}
          </span>
        )}
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Steps completed: {stepCount}</p>
        {useTickets && taskSet.ticket_reward > 0 && (
          pendingApproval
            ? <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-1">🎟 After approval: +{taskSet.ticket_reward} tickets</p>
            : <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-1">🎟 +{taskSet.ticket_reward} tickets earned!</p>
        )}
        {assignedAt && completedAt && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Completed in {formatDuration(assignedAt, completedAt)}
          </p>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="mt-5 w-full py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Award completion modal ────────────────────────────────────────────────────

// One palette is chosen randomly each time the modal opens
const AWARD_PALETTES = [
  ['#ff4500', '#ff6a00', '#ffb347', '#ffe066'], // fire
  ['#1a78e6', '#00c3ff', '#7efcff', '#c8f7ff'], // electric blue
  ['#7c3aed', '#a855f7', '#e879f9', '#fbc4ff'], // plasma
  ['#065f46', '#10b981', '#6ee7b7', '#bbf7d0'], // emerald
  ['#92400e', '#f59e0b', '#fcd34d', '#fef3c7'], // gold
  ['#be123c', '#f43f5e', '#fb7185', '#fecdd3'], // rose
];

function AwardCompletionModal({ taskSet, userId, assignedAt, completedAt, pendingApproval, onClose }) {
  useScrollLock(true);
  const navigate  = useNavigate();
  const canvasRef = useRef(null);
  // Mutable animation state lives in a ref so it doesn't cause re-renders
  const stateRef  = useRef({ angle: 0, particles: [] });

  // Keyboard dismiss
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Pick three different colour palettes once per modal open
  const palettes = useMemo(() => {
    const idx = Array.from({ length: AWARD_PALETTES.length }, (_, i) => i)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    return idx.map((i) => AWARD_PALETTES[i]);
  }, []);

  const badgeSz = 120;
  const pad     = 50;
  const wrapSz  = badgeSz + pad * 2; // 220

  // Canvas particle animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx    = canvas.getContext('2d');
    const cx     = wrapSz / 2;
    const cy     = wrapSz / 2;
    const orbitR = badgeSz / 2 + 1;
    const state  = stateRef.current;

    // Helper: initial direction-flip state with a random starting threshold offset
    // so each arc is already partway through its first rotation when the modal opens
    function mkArc(startAngle) {
      return {
        angle:    startAngle,
        speed:    0.036 + Math.random() * 0.020,       // ~2.1–3.3 s/rev
        dir:      Math.random() < 0.5 ? 1 : -1,        // random initial direction
        traveled: Math.random() * Math.PI * 2,          // random phase offset → desync
        thresh:   (1.0 + Math.random() * 1.0) * Math.PI * 2, // 1–2 rotations
      };
    }
    state.arcs      = [mkArc(0), mkArc(Math.PI), mkArc(Math.PI * 0.5)];
    state.pulseT    = 0;
    state.particles = [];
    let rafId;

    function spawnParticle(ex, ey, pal) {
      const baseDir = Math.atan2(ey - cy, ex - cx);
      const spread  = (Math.random() - 0.5) * Math.PI * 1.4;
      const dir     = baseDir + spread;
      const speed   = 0.5 + Math.random() * 2.2;
      state.particles.push({
        x:     ex,
        y:     ey,
        vx:    Math.cos(dir) * speed,
        vy:    Math.sin(dir) * speed,
        life:  1,
        decay: 0.016 + Math.random() * 0.028,
        size:  1.2 + Math.random() * 2.6,
        color: pal[Math.floor(Math.random() * pal.length)],
      });
    }

    function drawArc(angle, pal, pulse) {
      const arcSpan   = 0.42;
      const ARC_STEPS = 22;
      for (let i = 0; i < ARC_STEPS; i++) {
        const t      = i / (ARC_STEPS - 1);
        const a      = angle - arcSpan * (1 - t);
        const ax     = cx + Math.cos(a) * orbitR;
        const ay     = cy + Math.sin(a) * orbitR;
        const alpha  = t * t * t * 0.55 * pulse;
        const radius = (1.2 + t * 2.8) * (0.88 + 0.12 * pulse);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur  = (6 + t * 12) * pulse;
        ctx.shadowColor = t > 0.55 ? pal[2] : pal[0];
        ctx.fillStyle   = t > 0.82 ? '#ffffff' : t > 0.45 ? pal[2] : pal[1];
        ctx.beginPath();
        ctx.arc(ax, ay, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function frame() {
      ctx.clearRect(0, 0, wrapSz, wrapSz);

      // Advance all three arcs — each flips direction independently
      for (const arc of state.arcs) {
        arc.angle    += arc.speed * arc.dir;
        arc.traveled += arc.speed;
        if (arc.traveled >= arc.thresh) {
          arc.dir      *= -1;
          arc.traveled  = 0;
          arc.thresh    = (1.0 + Math.random() * 1.0) * Math.PI * 2; // 1–2 rotations
        }
      }

      // Spawn sparkles from all three emitter heads
      for (let n = 0; n < 3; n++) {
        const ex    = cx + Math.cos(state.arcs[n].angle) * orbitR;
        const ey    = cy + Math.sin(state.arcs[n].angle) * orbitR;
        const count = 1 + (Math.random() < 0.55 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0);
        for (let i = 0; i < count; i++) spawnParticle(ex, ey, palettes[n]);
      }

      // Update particles
      state.particles = state.particles.filter((p) => p.life > 0);
      for (const p of state.particles) {
        p.x  += p.vx;
        p.y  += p.vy;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.life -= p.decay;
      }

      // Draw particles
      for (const p of state.particles) {
        const a = Math.max(0, p.life);
        const r = p.size * (0.35 + p.life * 0.65);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.shadowBlur  = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.globalAlpha = a * 0.75;
        ctx.fillStyle   = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw all three arcs with shared pulse
      state.pulseT += 0.07;
      const pulse = 0.68 + 0.32 * Math.sin(state.pulseT);
      for (let n = 0; n < 3; n++) {
        drawArc(state.arcs[n].angle, palettes[n], pulse);
      }

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [palettes, wrapSz]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Panel */}
      <div
        className="relative z-10 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs p-6 flex flex-col items-center text-center"
        style={{ animation: 'award-pop 420ms cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mb-0.5">🎉 Congrats!</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">You earned an award!</p>

        {/* Badge + particle canvas */}
        <div className="relative flex-shrink-0 mb-6" style={{ width: wrapSz, height: wrapSz }}>
          {/* Particle canvas — first in DOM so badge layers render on top, hiding the arc centre */}
          <canvas
            ref={canvasRef}
            width={wrapSz}
            height={wrapSz}
            className="absolute inset-0 pointer-events-none"
          />
          {/* Gold ring */}
          <div
            className="absolute rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 shadow-lg"
            style={{ inset: pad }}
          />
          {/* Inner badge face */}
          <div
            className="absolute rounded-full bg-gradient-to-br from-yellow-50 via-yellow-100 to-amber-200 dark:from-yellow-200 dark:via-amber-200 dark:to-amber-300 flex items-center justify-center leading-none overflow-hidden"
            style={{ inset: pad + 10, fontSize: 44 }}
          >
            {taskSet.badge_image_file ? (
              <img
                src={`/api/uploads/badges/${taskSet.badge_image_file}`}
                alt={taskSet.name}
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <IconDisplay value={taskSet.emoji} fallback="🏆" />
            )}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.65) 50%, transparent 70%)',
                animation:  'award-badge-shimmer 3s ease-in-out infinite',
              }}
            />
          </div>
        </div>

        {/* Name + category */}
        <p className="font-bold text-lg text-gray-900 dark:text-gray-100 leading-snug mb-1">{taskSet.name}</p>
        {taskSet.category && (
          <span className="px-2 py-0.5 text-xs font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-500/30 rounded-full">
            {taskSet.category}
          </span>
        )}
        {taskSet.ticket_reward > 0 && (
          pendingApproval
            ? <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-2">🎟 After approval: +{taskSet.ticket_reward} tickets</p>
            : <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-2">🎟 +{taskSet.ticket_reward} tickets earned!</p>
        )}
        {pendingApproval && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">⏳ A parent must approve before this appears on your trophy shelf.</p>
        )}
        {assignedAt && completedAt && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Earned in {formatDuration(assignedAt, completedAt)}
          </p>
        )}

        {/* Buttons */}
        <div className="flex gap-2 w-full mt-5">
          {!pendingApproval && (
            <button
              onClick={() => navigate(`/trophies/${userId}`)}
              className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Go to Trophy Shelf
            </button>
          )}
          <button
            onClick={onClose}
            className={`${pendingApproval ? 'flex-1' : ''} px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Burst particle config (mirrors ChoreItem) ─────────────────────────────────
const AWARD_LEVEL_LABELS = {
  preschool: 'Preschool · Penguin',
  level1:    'Level 1 · Otter',
  level2:    'Level 2 · Frog',
  level3:    'Level 3 · Hawk',
  level4:    'Level 4 · Fox',
  level5:    'Level 5 · Owl',
  all:       'All Levels',
};

// Walk a step array and bucket consecutive steps under the same `level` so the
// renderer can drop in a section header per level for award task_lists. Steps
// without a `level` value share a single trailing group with no header.
function groupStepsByLevel(rows) {
  const out = [];
  for (const row of rows) {
    const key = row.level || null;
    if (!out.length || out[out.length - 1].level !== key) out.push({ level: key, rows: [] });
    out[out.length - 1].rows.push(row);
  }
  return out;
}

const BURST = [
  { angle: 0,   color: '#10b981' },
  { angle: 60,  color: '#6366f1' },
  { angle: 120, color: '#f59e0b' },
  { angle: 180, color: '#ef4444' },
  { angle: 240, color: '#3b82f6' },
  { angle: 300, color: '#8b5cf6' },
];
const RAD  = Math.PI / 180;
const DIST = 26;

// ── Step item with chore-style animation ──────────────────────────────────────
function StepItem({ step, onToggle, disabled }) {
  const { userId } = useParams();
  const done = false; // todo items are never done
  const [phase, setPhase] = useState('idle');
  const [inputValue, setInputValue] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const inputRef = useRef(null);

  const needsInput = !!step.require_input;
  // Steps that point at a specific badge auto-complete when that badge is
  // finished. Kids can't toggle them manually — show them as inert / awaiting.
  const isAutoLinked = !!step.linked_badge_id;

  const handleClick = () => {
    if (disabled || step._limitedToday || phase !== 'idle') return;

    // If this step requires input and we haven't shown the input yet, show it
    if (needsInput && !showInput) {
      setShowInput(true);
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

    // If requires input, validate
    if (needsInput && !inputValue.trim()) return;

    playChoreCheck();
    setPhase('pop');
    const response = needsInput ? inputValue.trim() : null;
    setTimeout(() => setPhase('exit'), 420);
    setTimeout(() => {
      onToggle(step, false, response);
      setPhase('idle');
      setShowInput(false);
      setInputValue('');
    }, 780);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      handleClick();
    } else if (e.key === 'Escape') {
      setShowInput(false);
      setInputValue('');
    }
  };

  const isAnimating = phase !== 'idle';
  const showDone    = done || isAnimating;

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
    return {};
  })();

  const canClick = !disabled && !isAnimating && !step._limitedToday && !isAutoLinked;

  return (
    <div
      onClick={canClick && !showInput ? handleClick : undefined}
      className={`flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${canClick && !showInput ? 'cursor-pointer active:bg-gray-50 dark:active:bg-gray-700/50' : ''}`}
      style={cardStyle}
    >
      {/* Checkbox + burst container */}
      <div className="relative shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
          disabled={disabled || isAnimating || step._limitedToday || isAutoLinked}
          aria-label={isAutoLinked ? 'Auto-completes when linked badge is finished' : (showDone ? 'Mark incomplete' : 'Mark complete')}
          title={isAutoLinked ? 'Auto-completes when the linked badge is finished' : undefined}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors disabled:cursor-not-allowed ${
            showDone
              ? 'border-green-500 bg-green-500'
              : isAutoLinked
                ? 'border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 cursor-not-allowed'
                : 'border-gray-300 dark:border-gray-600 hover:border-brand-400'
          }`}
          style={phase === 'pop' ? { animation: 'chore-checkbox-pop 480ms cubic-bezier(0.36,0.07,0.19,0.97) both' } : undefined}
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
                style={phase === 'pop' ? { animation: 'chore-check-draw 320ms ease-out 60ms both' } : { strokeDashoffset: 0 }}
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
              top: '50%', left: '50%',
              backgroundColor: color,
              animation: `chore-burst 560ms ease-out ${i * 40}ms both`,
              '--tx': `${Math.cos(angle * RAD) * DIST}px`,
              '--ty': `${Math.sin(angle * RAD) * DIST}px`,
            }}
          />
        ))}
      </div>

      {/* Step name + description */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium transition-colors ${showDone ? 'line-through text-gray-400 dark:text-gray-500' : step._limitedToday ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
          {step._displayName || step.name}
        </p>
        {step._limitedToday && (
          <p className="text-xs text-amber-500 dark:text-amber-400">Come back tomorrow!</p>
        )}
        {!step._limitedToday && step.description && !showInput && (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{step.description}</p>
        )}
        {showInput && (
          <div className="mt-1.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={step.input_prompt || 'Type your response…'}
              maxLength={500}
              className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              onClick={handleClick}
              disabled={!inputValue.trim()}
              className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors shrink-0"
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* Step image (list view — small thumbnail on right) */}
      {step.image && (
        <img
          src={`/api/uploads/steps/${step.image}`}
          alt=""
          className="w-10 h-10 object-cover rounded-lg flex-shrink-0 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setLightbox(true); }}
        />
      )}
      {/* Linked-badge thumbnail (award-step pointing at a specific badge) */}
      {!step.image && step.linked_badge_id && step.linked_badge_image && (
        <Link
          to={`/badges/${userId || ''}?type=badge&search=${encodeURIComponent(step.linked_badge_name || '')}`}
          onClick={(e) => e.stopPropagation()}
          className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-brand-200 dark:ring-brand-500/40 hover:opacity-80 transition-opacity"
          title={`Find the ${step.linked_badge_name} badge`}
        >
          <img
            src={`/api/uploads/badges/${step.linked_badge_image}`}
            alt={step.linked_badge_name || ''}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </Link>
      )}
      {/* Linked-area pill (award-step pointing at an Area of Discovery) */}
      {!step.image && !step.linked_badge_id && step.linked_badge_category && (
        <Link
          to={`/badges/${userId || ''}?type=badge&category=${encodeURIComponent(step.linked_badge_category)}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] font-semibold px-2 py-1 rounded-full border border-brand-300 dark:border-brand-500/50 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors flex-shrink-0 whitespace-nowrap"
          title={`Find a badge in ${step.linked_badge_category}`}
        >
          Find ↗
        </Link>
      )}
      {/* Note icon for description (no-image steps in list view) */}
      {!step.image && !step.linked_badge_id && !step.linked_badge_category && step.description && !showInput && (
        <button
          onClick={(e) => { e.stopPropagation(); setLightbox(true); }}
          className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
          aria-label="Show description"
        >
          <FontAwesomeIcon icon={faStickyNote} className="text-[10px]" />
        </button>
      )}
      {lightbox && <StepDetailModal step={step} onClose={() => setLightbox(false)} />}
    </div>
  );
}

// ── Card-style step item ────────────────────────────────────────────────────
function StepCard({ step, onToggle, disabled, done, isLast }) {
  const [phase, setPhase] = useState('idle');
  const [inputValue, setInputValue] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const inputRef = useRef(null);
  const needsInput = !!step.require_input;

  const handleCheck = () => {
    if (done) return;
    if (disabled || step._limitedToday || phase !== 'idle') return;
    if (needsInput && !showInput) {
      setShowInput(true);
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    if (needsInput && !inputValue.trim()) return;
    playChoreCheck();
    setPhase('pop');
    const response = needsInput ? inputValue.trim() : null;
    setTimeout(() => setPhase('exit'), 420);
    setTimeout(() => {
      onToggle(step, false, response);
      setPhase('idle');
      setShowInput(false);
      setInputValue('');
    }, 780);
  };

  const isAnimating = phase !== 'idle';
  const showDone = done || isAnimating;
  const canCheck = !done && !disabled && !isAnimating && !step._limitedToday;

  const cardStyle = (() => {
    if (phase === 'exit') return { transition: 'opacity 360ms ease-out, transform 360ms ease-out', opacity: 0, transform: 'scale(0.9)' };
    if (phase === 'pop') return { transition: 'transform 200ms', transform: 'scale(1.05)' };
    return {};
  })();

  return (
    <div
      className={`relative flex flex-col rounded-xl border text-center overflow-hidden transition-colors p-0 ${
        showDone
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50'
          : step._limitedToday
            ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}
      style={{ ...cardStyle, animation: done ? 'chore-enter 350ms ease-out both' : undefined }}
    >
      {/* Image area — real image or placeholder */}
      <div
        className={`relative w-full aspect-square ${step.image ? '' : 'bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center'} ${step.image || step.description ? 'cursor-pointer' : ''}`}
        onClick={() => { if (step.image || step.description) setLightbox(true); }}
      >
        {step.image ? (
          <img
            src={`/api/uploads/steps/${step.image}`}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 flex items-center justify-center text-sm font-bold">
            {step.sort_order || '·'}
          </span>
        )}
        {step.description && (
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(true); }}
            className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
              step.image
                ? 'bg-black/50 text-white hover:bg-black/70'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
            }`}
            aria-label="Show description"
          >
            <FontAwesomeIcon icon={faStickyNote} className="text-[10px]" />
          </button>
        )}
      </div>

      {/* Undo button for last completed */}
      {done && isLast && (
        <button
          onClick={() => onToggle(step, true)}
          disabled={disabled}
          className="absolute top-1.5 left-1.5 text-[10px] text-red-500 border border-red-200 dark:border-red-500 px-1.5 py-0.5 rounded bg-white/80 dark:bg-gray-800/80 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
        >
          Undo
        </button>
      )}

      {/* Checkbox + name row */}
      <div
        className={`flex items-center gap-1.5 w-full p-2 ${canCheck && !showInput ? 'cursor-pointer' : ''}`}
        onClick={canCheck && !showInput ? handleCheck : undefined}
      >
        {/* Checkbox circle */}
        <div className="relative shrink-0">
          <span
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
              showDone
                ? 'border-green-500 bg-green-500'
                : 'border-gray-300 dark:border-gray-600'
            }`}
            style={phase === 'pop' ? { animation: 'chore-checkbox-pop 480ms cubic-bezier(0.36,0.07,0.19,0.97) both' } : undefined}
          >
            {showDone && (
              <svg viewBox="0 0 12 10" className="w-2.5 h-2.5" fill="none" aria-hidden>
                <polyline
                  points="1,5 4,8 11,1"
                  stroke="white"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="20"
                  style={phase === 'pop' ? { animation: 'chore-check-draw 320ms ease-out 60ms both' } : { strokeDashoffset: 0 }}
                />
              </svg>
            )}
          </span>
          {/* Burst */}
          {phase === 'pop' && BURST.map(({ angle, color }, i) => (
            <span
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full pointer-events-none"
              style={{
                top: '50%', left: '50%',
                backgroundColor: color,
                animation: `chore-burst 560ms ease-out ${i * 40}ms both`,
                '--tx': `${Math.cos(angle * RAD) * (DIST * 0.6)}px`,
                '--ty': `${Math.sin(angle * RAD) * (DIST * 0.6)}px`,
              }}
            />
          ))}
        </div>

        {/* Name */}
        <p className={`text-xs font-medium leading-tight text-left flex-1 min-w-0 ${
          showDone ? 'line-through text-gray-400 dark:text-gray-500' : step._limitedToday ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'
        }`}>
          {step._displayName || step.name}
        </p>
      </div>

      {step._limitedToday && (
        <p className="text-[10px] text-amber-500 dark:text-amber-400 px-2 pb-1">Tomorrow</p>
      )}

      {done && step._inputResponse && (
        <p className="text-[10px] text-gray-500 dark:text-gray-400 italic truncate w-full px-2 pb-1">{step._inputResponse}</p>
      )}

      {/* Input prompt (inline for card) */}
      {showInput && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-2 bg-white dark:bg-gray-800 rounded-xl border border-brand-400" onClick={(e) => e.stopPropagation()}>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">{step.input_prompt || 'Your response'}</p>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && inputValue.trim()) handleCheck(); else if (e.key === 'Escape') { setShowInput(false); setInputValue(''); } }}
            maxLength={500}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <button
            onClick={handleCheck}
            disabled={!inputValue.trim()}
            className="mt-1 px-2 py-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white rounded text-[10px] font-medium transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {/* Step detail modal */}
      {lightbox && <StepDetailModal step={step} onClose={() => setLightbox(false)} />}
    </div>
  );
}

// ── Completed step (list view) with lightbox support ─────────────────────────
function CompletedStepItem({ step, onUndo, canUndo, disabled }) {
  const [lightbox, setLightbox] = useState(false);
  return (
    <div
      className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-xl"
      style={{ animation: 'chore-enter 350ms ease-out both' }}
    >
      <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
        <svg viewBox="0 0 12 10" className="w-3 h-3" fill="none" aria-hidden>
          <polyline points="1,5 4,8 11,1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 line-through">{step._displayName}</p>
        {step._inputResponse && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">{step._inputResponse}</p>
        )}
      </div>
      {step.image && (
        <img
          src={`/api/uploads/steps/${step.image}`}
          alt=""
          className="w-10 h-10 object-cover rounded-lg flex-shrink-0 cursor-pointer"
          onClick={() => setLightbox(true)}
        />
      )}
      {!step.image && step.description && (
        <button
          onClick={() => setLightbox(true)}
          className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
          aria-label="Show description"
        >
          <FontAwesomeIcon icon={faStickyNote} className="text-[10px]" />
        </button>
      )}
      {lightbox && <StepDetailModal step={step} onClose={() => setLightbox(false)} />}
      {canUndo && (
        <button
          onClick={onUndo}
          disabled={disabled}
          className="text-xs text-red-500 hover:text-red-700 border border-red-200 dark:border-red-500 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors shrink-0"
        >
          Undo
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UserTaskDetailPage() {
  const { userId, taskSetId } = useParams();
  const navigate = useNavigate();
  const { useTickets } = useFamilySettings();

  const [taskSet,       setTaskSet]       = useState(null);
  const [steps,         setSteps]         = useState([]);
  const [completions,   setCompletions]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [toggling,      setToggling]      = useState(new Set());
  const [showFireworks,    setShowFireworks]    = useState(false);
  const [showAwardModal,   setShowAwardModal]   = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [assignedAt,       setAssignedAt]       = useState(null);
  const [completionStatus, setCompletionStatus] = useState(null);
  const [pendingApproval,  setPendingApproval]  = useState(false);
  const completedAtRef = useRef(null);

  // Badge optional pool (for swap chevron)
  const [optionalPool,     setOptionalPool]     = useState(null);
  const [poolOpen,         setPoolOpen]         = useState(false);
  const [swapping,         setSwapping]         = useState(false);
  const [swapError,        setSwapError]        = useState('');
  const [imageLightbox,    setImageLightbox]    = useState(false);
  const [descExpanded,     setDescExpanded]     = useState(false);
  const [descOverflowing,  setDescOverflowing]  = useState(false);
  const descRef = useRef(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taskSetsApi.getUserTaskSet(userId, taskSetId);
      setTaskSet(data.taskSet);
      setSteps(data.steps);
      setCompletions(data.completions ?? []);
      setAssignedAt(data.assignedAt ?? null);
      setCompletionStatus(data.completionStatus ?? null);
    } catch {
      setError('Failed to load task set.');
    } finally {
      setLoading(false);
    }
  }, [userId, taskSetId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // Measure whether the description overflows when clamped to 2 lines.
  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el || descExpanded) return;
    setDescOverflowing(el.scrollHeight - el.clientHeight > 1);
  }, [taskSet?.description, descExpanded]);

  // Load optional pool when needed (chevron or shortfall picker)
  const loadOptionalPool = useCallback(async () => {
    if (!taskSet?.badge_id) return;
    try {
      const data = await badgesApi.getBadgeOptionals(taskSet.badge_id);
      setOptionalPool(data.optionals || []);
    } catch {
      setOptionalPool([]);
    }
  }, [taskSet?.badge_id]);

  // Auto-load pool for badge task sets so the kid sees options upfront
  useEffect(() => {
    if (taskSet?.badge_id && !optionalPool) {
      loadOptionalPool();
    }
  }, [taskSet?.badge_id, optionalPool, loadOptionalPool]);

  const handleOpenPool = () => setPoolOpen((o) => !o);

  const handleSwapOptional = async (removeStepId, addOptionalReqId) => {
    setSwapping(true);
    setSwapError('');
    try {
      const result = await badgesApi.swapOptional(userId, taskSetId, removeStepId, addOptionalReqId);
      setSteps(result.steps);
      setOptionalPool(null);
    } catch (e) {
      setSwapError(e?.response?.data?.error || 'Could not swap optional.');
    } finally {
      setSwapping(false);
    }
  };

  const handleAddOptional = async (addOptionalReqId) => {
    setSwapping(true);
    setSwapError('');
    try {
      const result = await badgesApi.addOptional(userId, taskSetId, addOptionalReqId);
      setSteps(result.steps);
      setOptionalPool(null);
    } catch (e) {
      setSwapError(e?.response?.data?.error || 'Could not add optional.');
    } finally {
      setSwapping(false);
    }
  };

  const handleToggle = async (step, undo = false, inputResponse = null) => {
    if (toggling.has(step.id)) return;
    setToggling((prev) => new Set([...prev, step.id]));
    const prevCount = step.completed_count || 0;

    // Snapshot done-count before optimistic update for celebration detection
    const doneBefore  = steps.reduce((sum, s) => sum + (s.completed_count || 0), 0);
    const totalNeeded = steps.reduce((sum, s) => sum + (s.repeat_count || 1), 0);

    // Optimistic update
    setSteps((prev) => prev.map((s) => s.id === step.id
      ? { ...s, completed_count: undo ? Math.max(0, prevCount - 1) : prevCount + 1 }
      : s));
    if (!undo && inputResponse) {
      setCompletions((prev) => [...prev, { task_step_id: step.id, instance: prevCount + 1, input_response: inputResponse }]);
    }
    try {
      const result = await taskSetsApi.toggleStep(userId, taskSetId, step.id, undo, inputResponse);
      setSteps((prev) => prev.map((s) => s.id === step.id
        ? { ...s, completed_count: result.completed_count, completed_today: result.completed_today ?? 0 }
        : s));
      if (result.set_pending_approval) setCompletionStatus('pending');
      if (result.approval_status === 'pending') {
        setCompletions((prev) => {
          const updated = prev.filter((c) => !(c.task_step_id === step.id && c.instance === (step.completed_count || 0) + 1));
          return [...updated, { task_step_id: step.id, instance: (step.completed_count || 0) + 1, input_response: inputResponse, approval_status: 'pending' }];
        });
      }
      if (undo) {
        setCompletions((prev) => {
          const idx = prev.findLastIndex((c) => c.task_step_id === step.id);
          if (idx >= 0) return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
          return prev;
        });
      }

      // Celebration: detect set just completed (transition from incomplete → complete)
      if (!undo && doneBefore < totalNeeded) {
        const doneAfter = doneBefore - prevCount + result.completed_count;
        if (doneAfter >= totalNeeded) {
          const isPending = !!(result.set_pending_approval || result.approval_status === 'pending');
          completedAtRef.current = new Date();
          setPendingApproval(isPending);
          setShowFireworks(true);
          playVictory();
          if (taskSet?.type === 'One-Off')   setShowAwardModal(true);
          if (taskSet?.type === 'Project' || taskSet?.type === 'Countdown') setShowProjectModal(true);
        }
      }
    } catch {
      // Revert on failure
      setSteps((prev) => prev.map((s) => s.id === step.id ? { ...s, completed_count: prevCount } : s));
      if (!undo && inputResponse) {
        setCompletions((prev) => prev.slice(0, -1));
      }
    } finally {
      setToggling((prev) => { const next = new Set(prev); next.delete(step.id); return next; });
    }
  };

  if (loading) {
    return (
      <div>
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 transition-colors">
          <FontAwesomeIcon icon={faChevronLeft} className="text-xs" /> Back
        </button>
        <LoadingSkeleton rows={4} />
      </div>
    );
  }

  if (error || !taskSet) {
    return (
      <div>
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 transition-colors">
          <FontAwesomeIcon icon={faChevronLeft} className="text-xs" /> Back
        </button>
        <p className="text-red-500 text-sm">{error || 'Task set not found.'}</p>
      </div>
    );
  }

  // Expand steps into virtual instances for repeating steps
  const expanded = (() => {
    const todo = [];
    const done = [];
    const pending = [];
    for (const step of steps) {
      const repeat = step.repeat_count || 1;
      const count = step.completed_count || 0;
      for (let i = 1; i <= count; i++) {
        const name = repeat > 1 ? step.name.replace('{#}', String(i)) : step.name;
        const completion = completions.find((c) => c.task_step_id === step.id && c.instance === i);
        const isPending = completion?.approval_status === 'pending';
        const entry = { ...step, _instance: i, _displayName: name, _isLast: i === count, _inputResponse: completion?.input_response || null };
        if (isPending) pending.push(entry);
        else done.push(entry);
      }
      if (count < repeat) {
        const nextInst = count + 1;
        const name = repeat > 1 ? step.name.replace('{#}', String(nextInst)) : step.name;
        const disabled = !!(step.limit_one_per_day && step.completed_today);
        todo.push({ ...step, _instance: nextInst, _displayName: name, _limitedToday: disabled });
      }
    }
    // For badge sets: split todo into required and optional
    const isBadge      = !!taskSet?.badge_id;
    const todoRequired = isBadge ? todo.filter((s) => !s.is_optional) : todo;
    const todoOptional = isBadge ? todo.filter((s) =>  s.is_optional) : [];
    return { todo, todoRequired, todoOptional, done, pending };
  })();

  // For the swap chevron: which optional req IDs are already selected
  const selectedOptReqIds = new Set(
    steps.filter((s) => s.is_optional && s.is_active !== 0).map((s) => s.badge_opt_req_id)
  );

  // Unselected optionals from the pool (loaded lazily)
  const unselectedOptionals = (optionalPool || []).filter((o) => !selectedOptReqIds.has(o.id));

  // Badge optional-pick shortfall (how many more the kid needs to pick)
  const badgeLevel        = taskSet?.badge_level;
  const levelOptCount     = (taskSet?.level_opt_counts && badgeLevel) ? (taskSet.level_opt_counts[badgeLevel] ?? 0) : 0;
  const selectedOptCount  = selectedOptReqIds.size;
  const optionalsRemaining = Math.max(0, levelOptCount - selectedOptCount);
  const needsPicks         = !!taskSet?.badge_id && optionalsRemaining > 0;

  const totalCount     = steps.reduce((sum, s) => sum + (s.repeat_count || 1), 0);
  const completedCount = steps.reduce((sum, s) => sum + (s.completed_count || 0), 0);
  const allDone        = totalCount > 0 && completedCount >= totalCount;
  const pct            = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const anyBusy        = toggling.size > 0;

  return (
    <div>
      {showFireworks && <Fireworks onDone={() => setShowFireworks(false)} />}
      {imageLightbox && taskSet?.badge_image_file && (
        <BadgeImageLightbox
          imageFile={taskSet.badge_image_file}
          alt={taskSet.name}
          onClose={() => setImageLightbox(false)}
        />
      )}
      {showAwardModal && taskSet && (
        <AwardCompletionModal
          taskSet={taskSet}
          userId={userId}
          assignedAt={assignedAt}
          completedAt={completedAtRef.current}
          pendingApproval={pendingApproval}
          onClose={() => setShowAwardModal(false)}
        />
      )}
      {showProjectModal && taskSet && (
        <ProjectCompletionModal
          taskSet={taskSet}
          stepCount={steps.length}
          assignedAt={assignedAt}
          completedAt={completedAtRef.current}
          pendingApproval={pendingApproval}
          onClose={() => setShowProjectModal(false)}
        />
      )}

      {/* ── Header ── */}
      <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mt-1"
            aria-label="Go back"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>

          {/* Large badge icon with circular progress ring */}
          {(() => {
            const size = 120;
            const sw   = 5;
            const r    = (size - sw * 2) / 2;
            const circ = 2 * Math.PI * r;
            return (
              <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
                  <circle
                    cx={size / 2} cy={size / 2} r={r}
                    fill="none" stroke="currentColor" strokeWidth={sw}
                    className="text-gray-200 dark:text-gray-600"
                  />
                  {totalCount > 0 && (
                    <circle
                      cx={size / 2} cy={size / 2} r={r}
                      fill="none" stroke="currentColor" strokeWidth={sw}
                      strokeDasharray={circ}
                      strokeDashoffset={circ - (pct / 100) * circ}
                      strokeLinecap="round"
                      className={allDone ? 'text-green-500' : 'text-brand-500'}
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center p-3">
                  {taskSet.badge_image_file ? (
                    <button
                      type="button"
                      onClick={() => setImageLightbox(true)}
                      className="w-full h-full rounded-full overflow-hidden shadow cursor-zoom-in hover:opacity-90 transition-opacity"
                      aria-label="View badge full size"
                    >
                      <img
                        src={`/api/uploads/badges/${taskSet.badge_image_file}`}
                        alt={taskSet.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </button>
                  ) : taskSet.badge_id ? (
                    <span
                      className="w-full h-full flex items-center justify-center text-5xl rounded-full shadow"
                      style={{ background: 'radial-gradient(circle at center, #FFFCF0 0%, #F5E6C8 100%)' }}
                    >
                      <IconDisplay value={taskSet.emoji} fallback="🏅" />
                    </span>
                  ) : (
                    <span className="w-full h-full flex items-center justify-center text-5xl text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-full">
                      <IconDisplay value={taskSet.emoji} fallback="📋" />
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Title + description + pills below */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
              {taskSet.name}
            </h1>
            {taskSet.description && (
              <>
                <p
                  ref={descRef}
                  className={`text-sm text-gray-500 dark:text-gray-400 mt-1 leading-snug ${
                    descExpanded ? '' : 'line-clamp-2'
                  }`}
                >
                  {taskSet.description}
                </p>
                {descOverflowing && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded((v) => !v)}
                    className="mt-0.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
                  >
                    {descExpanded ? 'Show less' : 'Show more…'}
                  </button>
                )}
              </>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full whitespace-nowrap">
                {taskSet.type}
              </span>
              {taskSet.category && !taskSet.is_award && (
                <span className="px-2 py-0.5 text-xs font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-100 border border-brand-200 dark:border-brand-500/30 rounded-full whitespace-nowrap">
                  {taskSet.category}
                </span>
              )}
              {Array.isArray(taskSet.tags) && taskSet.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 whitespace-nowrap"
                >
                  {tag}
                </span>
              ))}
              {taskSet.badge_level && BADGE_LEVELS[taskSet.badge_level] && (() => {
                const lvl = BADGE_LEVELS[taskSet.badge_level];
                return (
                  <span
                    className="px-2 py-0.5 text-xs font-semibold rounded-full border whitespace-nowrap"
                    style={{ backgroundColor: lvl.color, color: lvl.textColor, borderColor: lvl.borderColor }}
                  >
                    {lvl.label}
                  </span>
                );
              })()}
              {totalCount > 0 && (
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
                  allDone
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {allDone ? '🎉 Done' : `${completedCount}/${totalCount}`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Set-level pending approval banner ── */}
      {completionStatus === 'pending' && (
        <div className="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">⏳ Waiting for parent to approve this set</p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">All steps are done! A parent needs to approve before rewards are given.</p>
        </div>
      )}

      {steps.length === 0 && taskSet.is_award ? (
        // Award types without a per-step structure (manual / count_at_level /
        // composite) fall back to the generic "How to earn it" view.
        <AwardDetail
          userId={parseInt(userId, 10)}
          taskSet={taskSet}
          onAwardStateChanged={(newState) => setTaskSet((t) => t ? { ...t, award_state: newState } : t)}
        />
      ) : steps.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No steps in this task set yet.</p>
      ) : taskSet.display_mode === 'card' ? (
        /* ── Card view ── */
        <div className="space-y-6">
          {expanded.todo.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
              {expanded.todo.map((step) => (
                <StepCard
                  key={`${step.id}-${step._instance}`}
                  step={step}
                  onToggle={handleToggle}
                  disabled={anyBusy}
                  done={false}
                />
              ))}
            </div>
          )}

          {allDone && completionStatus !== 'pending' && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium text-center py-2">All done! 🎉</p>
          )}

          {/* Pending approval steps (step mode) */}
          {expanded.pending.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">⏳ Waiting for Approval</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                {expanded.pending.map((step) => (
                  <StepCard
                    key={`${step.id}-pending-${step._instance}`}
                    step={step}
                    onToggle={handleToggle}
                    disabled={anyBusy}
                    done
                    isLast={step._isLast}
                  />
                ))}
              </div>
            </div>
          )}

          {expanded.done.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Completed</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                {expanded.done.map((step) => (
                  <StepCard
                    key={`${step.id}-done-${step._instance}`}
                    step={step}
                    onToggle={handleToggle}
                    disabled={anyBusy}
                    done
                    isLast={step._isLast}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── List view (default) ── */
        <div className="space-y-6">
          {/* ── Todo steps (badge: split into required + optional) ── */}
          {taskSet.badge_id ? (
            <>
              {/* Required steps — awards with per-step level metadata get grouped
                  by level so it's clear which steps come from which level. */}
              {expanded.todoRequired.length > 0 && taskSet.is_award && expanded.todoRequired.some((s) => s.level) ? (
                <div className="space-y-4">
                  {groupStepsByLevel(expanded.todoRequired).map((group, gi) => (
                    <div key={`${group.level || 'none'}-${gi}`}>
                      {group.level && (
                        <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">
                          {AWARD_LEVEL_LABELS[group.level] || group.level}
                        </h3>
                      )}
                      <div className="space-y-2">
                        {group.rows.map((step) => (
                          <StepItem key={`${step.id}-${step._instance}`} step={step} onToggle={handleToggle} disabled={anyBusy} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : expanded.todoRequired.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Required</h3>
                  <div className="space-y-2">
                    {expanded.todoRequired.map((step) => (
                      <StepItem key={`${step.id}-${step._instance}`} step={step} onToggle={handleToggle} disabled={anyBusy} />
                    ))}
                  </div>
                </div>
              )}

              {/* Optional picks: show shortfall banner if below quota */}
              {needsPicks && (
                <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
                  <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
                    🎯 Pick {optionalsRemaining} more optional task{optionalsRemaining === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                    You need to choose {levelOptCount} optional task{levelOptCount === 1 ? '' : 's'} for your level
                    {selectedOptCount > 0 ? ` (${selectedOptCount} already picked)` : ''}. Tap one below to add it to your list.
                  </p>
                  {swapError && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{swapError}</p>}
                  <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                    {!optionalPool && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Loading options…</p>
                    )}
                    {(optionalPool || []).filter((o) => !selectedOptReqIds.has(o.id)).map((opt) => (
                      <button
                        key={opt.id}
                        disabled={swapping}
                        onClick={() => handleAddOptional(opt.id)}
                        className="w-full text-left flex gap-2.5 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-white dark:bg-gray-800 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50"
                      >
                        <span className="mt-0.5 text-amber-500 shrink-0">+</span>
                        <span className="text-sm text-gray-700 dark:text-gray-200 leading-snug">{opt.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected optional steps */}
              {(expanded.todoOptional.length > 0 || steps.some((s) => s.is_optional)) && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                    Your Picks ({selectedOptCount}{levelOptCount > 0 ? ` of ${levelOptCount}` : ''} selected)
                  </h3>
                  <div className="space-y-2">
                    {expanded.todoOptional.map((step) => (
                      <StepItem key={`${step.id}-${step._instance}`} step={step} onToggle={handleToggle} disabled={anyBusy} />
                    ))}
                  </div>

                  {/* Chevron toggle for unselected optional pool (swap mode) */}
                  {!needsPicks && (
                    <>
                      <button
                        onClick={handleOpenPool}
                        className="mt-3 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-brand-500 transition-colors"
                      >
                        <span>{poolOpen ? '▲' : '▼'}</span>
                        {unselectedOptionals.length > 0
                          ? `${poolOpen ? 'Hide' : 'See'} other options — change your picks`
                          : 'No other options available'}
                      </button>

                      {poolOpen && (
                        <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                          {swapError && (
                            <p className="text-xs text-red-500 px-3 pt-2">{swapError}</p>
                          )}
                          {unselectedOptionals.map((opt) => (
                            <div key={opt.id} className="flex items-start gap-3 p-3 border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <span className="mt-0.5 text-gray-300 dark:text-gray-600 text-sm shrink-0">○</span>
                              <p className="text-sm text-gray-600 dark:text-gray-300 flex-1 leading-snug">{opt.text}</p>
                              {expanded.todoOptional.length > 0 && (
                                <div className="shrink-0">
                                  <select
                                    disabled={swapping}
                                    defaultValue=""
                                    onChange={(e) => {
                                      const removeId = parseInt(e.target.value, 10);
                                      if (!isNaN(removeId)) handleSwapOptional(removeId, opt.id);
                                      e.target.value = '';
                                    }}
                                    className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                                  >
                                    <option value="" disabled>Swap with…</option>
                                    {expanded.todoOptional.map((s) => (
                                      <option key={s.id} value={s.id}>{s._displayName.length > 40 ? s._displayName.slice(0, 40) + '…' : s._displayName}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          ))}
                          {optionalPool && unselectedOptionals.length === 0 && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 p-3">All options are already selected.</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Non-badge: regular todo list */
            expanded.todo.length > 0 && (
              <div className="space-y-2">
                {expanded.todo.map((step) => (
                  <StepItem key={`${step.id}-${step._instance}`} step={step} onToggle={handleToggle} disabled={anyBusy} />
                ))}
              </div>
            )
          )}

          {allDone && completionStatus !== 'pending' && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium text-center py-2">All done! 🎉</p>
          )}

          {/* ── Pending approval steps (step mode) ── */}
          {expanded.pending.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">⏳ Waiting for Approval</h3>
              <div className="space-y-2">
                {expanded.pending.map((step) => (
                  <div
                    key={`${step.id}-pending-${step._instance}`}
                    className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg"
                  >
                    <span className="text-amber-500 text-sm shrink-0">⏳</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{step._displayName}</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">Waiting for parent to approve</p>
                    </div>
                    <button
                      onClick={() => handleToggle(step, true)}
                      disabled={anyBusy}
                      className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors shrink-0"
                    >
                      Undo
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Completed steps ── */}
          {expanded.done.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Completed</h3>
              <div className="space-y-2">
                {expanded.done.map((step) => (
                  <CompletedStepItem key={`${step.id}-done-${step._instance}`} step={step} onUndo={() => handleToggle(step, true)} canUndo={step._isLast} disabled={anyBusy} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
