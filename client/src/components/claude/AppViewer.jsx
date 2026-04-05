import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function AppViewer({ url, appName, timeLimit, onClose }) {
  const [remaining, setRemaining] = useState(timeLimit); // minutes
  const endTimeRef = useRef(Date.now() + timeLimit * 60 * 1000);

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const interval = setInterval(() => {
      const left = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 60000));
      setRemaining(left);
      if (left <= 0) clearInterval(interval);
    }, 15000);

    // Also set a precise timeout for expiry
    const timeout = setTimeout(() => {
      setRemaining(0);
    }, timeLimit * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [timeLimit]);

  const expired = remaining <= 0;
  const isLow = remaining <= 5 && remaining > 0;

  const formatRemaining = (mins) => {
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins}m`;
  };

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh', zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#111' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#16161e', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: expired ? '#ef4444' : '#22c55e' }} />
          <span style={{ fontSize: 13, fontFamily: 'sans-serif', color: '#9ca3af' }}>
            {appName.replace(/[-_]/g, ' ')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: isLow ? '#f59e0b' : expired ? '#ef4444' : '#6b7280' }}>
            {expired ? 'Time up' : `${formatRemaining(remaining)} left`}
          </span>
          <button
            onClick={onClose}
            style={{ padding: '4px 12px', fontSize: 13, color: '#9ca3af', border: '1px solid #4b5563', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
      {expired ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <span style={{ fontSize: 48 }}>⏰</span>
          <p style={{ fontSize: 18, color: '#e5e7eb', fontFamily: 'sans-serif' }}>Time's up!</p>
          <p style={{ fontSize: 14, color: '#9ca3af', fontFamily: 'sans-serif' }}>Your app time limit has been reached.</p>
          <button
            onClick={onClose}
            style={{ marginTop: 8, padding: '8px 24px', fontSize: 14, color: '#fff', background: '#6366f1', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      ) : (
        <iframe
          src={url}
          style={{ flex: 1, border: 'none', width: '100%' }}
          sandbox="allow-scripts allow-same-origin allow-forms"
          title={appName}
        />
      )}
    </div>,
    document.body,
  );
}
