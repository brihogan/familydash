import { useEffect } from 'react';
import useScrollLock from '../../hooks/useScrollLock.js';

/**
 * Fullscreen badge image overlay. Click anywhere or press Escape to close.
 */
export default function BadgeImageLightbox({ imageFile, alt, onClose }) {
  useScrollLock(true);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!imageFile) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm cursor-zoom-out p-4"
      onClick={onClose}
      role="dialog"
      aria-label="Full size badge image"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl leading-none transition-colors"
        aria-label="Close"
      >
        ×
      </button>
      <img
        src={`/api/uploads/badges/${imageFile}`}
        alt={alt || ''}
        className="rounded-full object-cover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          cursor: 'default',
          width:  'min(80vw, 80vh)',
          height: 'min(80vw, 80vh)',
        }}
      />
    </div>
  );
}
