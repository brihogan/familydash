// Lightweight, opt-in diagnostic logger. Enable by visiting any URL with
// ?debug=1 (the flag persists in localStorage across reloads); disable with
// ?debug=0. Events are written SYNCHRONOUSLY to localStorage so they survive
// even a hard WebView crash — after the page reloads, the login screen renders
// the captured sequence so we can see what fired right before a reload (a JS
// error vs. a native crash with no error).
const FLAG_KEY = 'fd_debug';
const EVENTS_KEY = 'fd_debug_events';
const MAX = 40;

export function isDebugEnabled() {
  try {
    const q = new URLSearchParams(window.location.search).get('debug');
    if (q === '1') localStorage.setItem(FLAG_KEY, '1');
    if (q === '0') {
      localStorage.removeItem(FLAG_KEY);
      localStorage.removeItem(EVENTS_KEY);
    }
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function push(type, detail) {
  try {
    const arr = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');
    arr.push({ t: new Date().toISOString().slice(11, 23), type, detail });
    while (arr.length > MAX) arr.shift();
    localStorage.setItem(EVENTS_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function getDebugEvents() {
  try {
    return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearDebugEvents() {
  try {
    localStorage.removeItem(EVENTS_KEY);
  } catch {
    /* ignore */
  }
}

let started = false;

export function initEventLog() {
  if (started || !isDebugEnabled()) return;
  started = true;

  push('boot', {
    controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    standalone: window.navigator.standalone === true,
    ua: navigator.userAgent.slice(0, 90),
  });

  const el = (e) => (e && e.target && e.target.tagName ? { id: e.target.id, name: e.target.name, tag: e.target.tagName, type: e.target.type } : {});

  window.addEventListener('error', (e) => push('error', { msg: String(e.message), src: e.filename, line: e.lineno }), true);
  window.addEventListener('unhandledrejection', (e) => push('rejection', { reason: String((e.reason && (e.reason.message || e.reason)) || e.reason) }));
  window.addEventListener('focusin', (e) => push('focusin', el(e)), true);
  window.addEventListener('focusout', (e) => push('focusout', el(e)), true);
  window.addEventListener('pagehide', (e) => push('pagehide', { persisted: e.persisted }), true);
  window.addEventListener('beforeunload', () => push('beforeunload', {}), true);
  document.addEventListener('visibilitychange', () => push('visibility', { state: document.visibilityState }), true);
}
