import { useEffect } from 'react';
import useScrollLock from '../../hooks/useScrollLock.js';

/**
 * Simple modal dialog.
 * @param {{ open: boolean, onClose: () => void, title: string, children: React.ReactNode }} props
 */
export default function Modal({ open, onClose, title, children }) {
  useScrollLock(open);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center pt-4 sm:pt-0">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div className="relative z-10 bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden min-w-0 whitespace-normal">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
