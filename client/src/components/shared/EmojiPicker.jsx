import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import { AVATAR_COLORS } from '../../utils/constants.js';

const EMOJIS = [
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼',
  '🐨','🐯','🦁','🐸','🐵','🦄','🐧','🐢',
  '🦖','🦕','🐬','🦈','🦋','🐙','🌟','⭐',
  '🌈','☀️','🌙','🌺','🌻','🌊','🍕','🍦',
  '🍩','🍎','🎮','⚽','🏀','🎸','🚀','🎨',
];

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onPickEmoji: (emoji: string | null) => void,
 *   onPickColor: (color: string) => void,
 *   currentEmoji?: string | null,
 *   currentColor?: string,
 *   previewName?: string,
 * }} props
 */
export default function EmojiPicker({ open, onClose, onPickEmoji, onPickColor, currentEmoji, currentColor, previewName = '?' }) {
  const handlePickEmoji = (emoji) => {
    onPickEmoji(emoji);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Avatar">
      {/* Live preview */}
      <div className="flex justify-center mb-5">
        <Avatar name={previewName} color={currentColor || '#6366f1'} emoji={currentEmoji} size="lg" />
      </div>

      {/* Color section */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Background Color</p>
        <div className="flex gap-2 flex-wrap">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onPickColor(c)}
              className={`w-7 h-7 rounded-full border-2 transition-transform ${
                currentColor === c ? 'border-gray-800 scale-125' : 'border-transparent hover:scale-110'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Emoji section */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Emoji</p>
        <div className="grid grid-cols-8 gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => handlePickEmoji(e)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl hover:bg-brand-50 transition-colors ${
                e === currentEmoji ? 'bg-brand-100 ring-2 ring-brand-400' : ''
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {currentEmoji && (
        <button
          type="button"
          onClick={() => handlePickEmoji(null)}
          className="w-full py-2 text-sm text-gray-500 hover:text-red-500 border border-dashed border-gray-300 hover:border-red-300 rounded-lg transition-colors"
        >
          Remove emoji (use initials instead)
        </button>
      )}
    </Modal>
  );
}
