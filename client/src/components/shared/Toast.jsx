import { useState, useEffect, useCallback } from 'react';

// Simple event-based toast: any module can call showToast(message)
const toastListeners = new Set();

export function showToast(message, duration = 3000) {
  toastListeners.forEach((cb) => cb(message, duration));
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, duration) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  useEffect(() => {
    toastListeners.add(addToast);
    return () => toastListeners.delete(addToast);
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="px-4 py-2.5 rounded-lg bg-gray-800 dark:bg-gray-700 text-white text-sm shadow-lg pointer-events-auto"
          style={{ animation: 'toast-in 200ms ease-out' }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
