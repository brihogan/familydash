import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faStar, faTrophy, faMedal, faCrown, faGem, faBolt, faFire, faHeart,
  faBrain, faBook, faGraduationCap, faAtom, faFlask, faMicroscope, faRocket, faDumbbell,
  faMusic, faPalette, faGamepad, faPuzzlePiece, faBicycle, faPersonRunning, faBullseye, faFlag,
  faClipboardCheck, faBroom, faLeaf, faSun, faMoon, faThumbsUp, faPeace, faShieldHalved,
} from '@fortawesome/free-solid-svg-icons';

// ─── Data ─────────────────────────────────────────────────────────────────────

export const FA_TASK_ICONS = [
  { key: 'star',            icon: faStar },
  { key: 'trophy',          icon: faTrophy },
  { key: 'medal',           icon: faMedal },
  { key: 'crown',           icon: faCrown },
  { key: 'gem',             icon: faGem },
  { key: 'bolt',            icon: faBolt },
  { key: 'fire',            icon: faFire },
  { key: 'heart',           icon: faHeart },
  { key: 'brain',           icon: faBrain },
  { key: 'book',            icon: faBook },
  { key: 'graduation-cap',  icon: faGraduationCap },
  { key: 'atom',            icon: faAtom },
  { key: 'flask',           icon: faFlask },
  { key: 'microscope',      icon: faMicroscope },
  { key: 'rocket',          icon: faRocket },
  { key: 'dumbbell',        icon: faDumbbell },
  { key: 'music',           icon: faMusic },
  { key: 'palette',         icon: faPalette },
  { key: 'gamepad',         icon: faGamepad },
  { key: 'puzzle-piece',    icon: faPuzzlePiece },
  { key: 'bicycle',         icon: faBicycle },
  { key: 'person-running',  icon: faPersonRunning },
  { key: 'bullseye',        icon: faBullseye },
  { key: 'flag',            icon: faFlag },
  { key: 'clipboard-check', icon: faClipboardCheck },
  { key: 'broom',           icon: faBroom },
  { key: 'leaf',            icon: faLeaf },
  { key: 'sun',             icon: faSun },
  { key: 'moon',            icon: faMoon },
  { key: 'thumbs-up',       icon: faThumbsUp },
  { key: 'peace',           icon: faPeace },
  { key: 'shield',          icon: faShieldHalved },
];

export const FA_ICON_MAP = Object.fromEntries(FA_TASK_ICONS.map(({ key, icon }) => [key, icon]));

const EMOJIS = [
  '🏅','🥇','🥈','🥉','🏆','🎖️','⭐','🌟',
  '✨','💫','🎯','💡','🔥','❤️','💪','👑',
  '🌈','🦋','🌺','🌻','🌊','🍀','🌙','☀️',
  '🐶','🐱','🦁','🐸','🐢','🦊','🐝','🦄',
  '🎮','🎲','🎨','🎭','🎬','🎸','🎺','🎵',
  '🍕','🍦','🍩','🎂','🍎','🏀','⚽','🚀',
  '📚','✏️','📝','🔬','🎒','🎓','🧩','💎',
];

const PICKER_WIDTH = 312;

// ─── IconDisplay ──────────────────────────────────────────────────────────────

/**
 * Renders a stored icon value:
 *   "fa:key"  → FontAwesomeIcon
 *   emoji str → plain span
 *   empty     → fallback
 */
export function IconDisplay({ value, fallback = '📋', className = '' }) {
  if (!value) return <span className={className}>{fallback}</span>;
  if (value.startsWith('fa:')) {
    const icon = FA_ICON_MAP[value.slice(3)];
    if (icon) return <FontAwesomeIcon icon={icon} className={className} />;
  }
  return <span className={className}>{value}</span>;
}

// ─── IconPicker ───────────────────────────────────────────────────────────────

/**
 * Floating icon/emoji picker rendered via React portal into document.body,
 * positioned with `position: fixed` relative to the trigger element.
 *
 * Props:
 *   anchorRef – ref to the trigger button (used for positioning + outside-click exclusion)
 *   value     – current stored value (emoji char or "fa:key")
 *   onChange  – called by custom input (does NOT close the picker)
 *   onSelect  – called when a grid item is clicked (caller should close)
 *   onClose   – called when clicking outside both the picker and the anchor
 */
export default function IconPicker({ anchorRef, value, onChange, onSelect, onClose }) {
  const panelRef = useRef(null);
  const [customInput, setCustomInput] = useState('');

  // Compute fixed position from anchor's bounding rect
  const rect = anchorRef.current?.getBoundingClientRect() ?? { bottom: 0, left: 0 };
  const top  = rect.bottom + 6;
  const left = Math.min(rect.left, window.innerWidth - PICKER_WIDTH - 8);

  // Close on outside mousedown (excludes both the panel and the anchor trigger)
  useEffect(() => {
    const handler = (e) => {
      if (
        panelRef.current  && !panelRef.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorRef, onClose]);

  const handleCustomChange = (e) => {
    const v = e.target.value;
    setCustomInput(v);
    if (v.trim()) onChange(v.trim());
  };

  const BTN = (isActive) =>
    `w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
      isActive
        ? 'bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 ring-1 ring-brand-400'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top, left, width: PICKER_WIDTH, zIndex: 9999 }}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-3 space-y-3"
    >
      {/* Custom emoji input */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
          Custom Emoji
        </p>
        <input
          type="text"
          value={customInput}
          onChange={handleCustomChange}
          placeholder="Paste or type any emoji…"
          maxLength={4}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {/* FontAwesome icons */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
          Icons
        </p>
        <div className="grid grid-cols-8 gap-0.5">
          {FA_TASK_ICONS.map(({ key, icon }) => (
            <button
              key={key}
              type="button"
              title={key.replace(/-/g, ' ')}
              onClick={() => onSelect(`fa:${key}`)}
              className={BTN(value === `fa:${key}`)}
            >
              <FontAwesomeIcon icon={icon} className="text-sm" />
            </button>
          ))}
        </div>
      </div>

      {/* Emoji grid */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
          Emoji
        </p>
        <div className="grid grid-cols-8 gap-0.5 max-h-36 overflow-y-auto">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onSelect(emoji)}
              className={BTN(value === emoji)}
            >
              <span className="text-base leading-none">{emoji}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
