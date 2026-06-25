import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { initSyncEngine } from './offline/syncEngine.js';
import { initConnectivity } from './offline/connectivity.js';
import { initEventLog } from './debug/eventLog.js';
import { applyPwaState } from './pwa/pwa.js';
import { initAppHeight } from './utils/appHeight.js';

// Diagnostic logger first (no-op unless ?debug=1) so it captures boot + errors.
initEventLog();

// Drive layout height off the real visible viewport (--app-h) so the app shell
// doesn't overflow in browsers where 100dvh is unreliable.
initAppHeight();

// Register the service worker only if the user opted in; otherwise remove any
// stale worker. OFF by default.
applyPwaState();

// Initialize offline sync engine (IndexedDB-based; independent of the SW).
initSyncEngine();

// Detect stale/zombie connections on resume (Android sleep) and recover fast —
// probes /api/health, drives the "Reconnecting…" banner, refetches on recovery.
initConnectivity();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
