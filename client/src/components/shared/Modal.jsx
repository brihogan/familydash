import { useEffect } from 'react';
import useScrollLock from '../../hooks/useScrollLock.js';

const SIZE_CLS = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Simple modal dialog.
 * @param {{ open: boolean, onClose: () => void, title: string, subtitle?: React.ReactNode, children: React.ReactNode, size?: 'md' | 'lg' | 'xl', stickyHeader?: boolean }} props
 */
export default function Modal({ open, onClose, title, subtitle, children, size = 'md', stickyHeader = false }) {
  useScrollLock(open);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div className={`relative z-10 bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full ${SIZE_CLS[size] || SIZE_CLS.md} mx-4 ${stickyHeader ? 'px-6 pb-6 pt-0' : 'p-6'} max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden min-w-0 whitespace-normal`}>
        <div className={`flex items-start justify-between gap-3 mb-4 ${stickyHeader ? 'sticky top-0 z-10 -mx-6 px-6 pt-6 pb-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700' : ''}`}>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
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
