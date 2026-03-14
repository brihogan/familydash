import { useState, useEffect } from 'react';

const listeners = new Set();

function notifyOnline() {
  listeners.forEach((cb) => cb());
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', notifyOnline);
}

/** Subscribe to the browser coming back online. Returns unsubscribe fn. */
export function onOnline(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** React hook — returns { isOnline: boolean } */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { isOnline };
}
