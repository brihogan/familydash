import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../api/baseUrl.js';

// ── Connectivity manager ────────────────────────────────────────────────────
//
// The problem this solves (Android, esp. Samsung One UI): after the phone
// sleeps, the installed PWA's network sockets go stale. On resume the service
// worker serves the cached app shell instantly — so the app *looks* loaded —
// but every /api fetch hangs on the dead connection until the OS finally kills
// it (~1-2 min later). Screens sit empty and it reads as "the server is down".
// navigator.onLine still reports `true` through all of this, so we can't trust
// it as a signal.
//
// On every resume signal (tab becomes visible, `online` event, bfcache restore)
// we fire a short, abortable probe at /api/health:
//   • a fast 2xx  → the connection is alive: trigger a data refetch, no banner.
//   • slow/failed → the socket is dead: show a "Reconnecting…" banner and retry
//                    with backoff. Each retry is a fresh request, which nudges
//                    the browser off the zombie connection onto a live one.
// Net effect: "empty for two minutes" becomes "blink and it's back", with
// visible state instead of a silently-empty screen.

export const ConnState = { OK: 'ok', RECONNECTING: 'reconnecting', OFFLINE: 'offline' };

const PROBE_TIMEOUT_MS = 4000;   // abort a probe after 4s — a live network answers in ms
const BANNER_GRACE_MS = 1200;    // don't flash the banner if we recover faster than this
const WATCHDOG_MS = 6000;        // while down, re-probe this often so it self-heals silently
const HEALTH_URL = `${API_BASE_URL}/health`;

const isNavigatorOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

let status = isNavigatorOffline() ? ConnState.OFFLINE : ConnState.OK;
let probing = false;
const listeners = new Set();

function setStatus(next) {
  if (next === status) return;
  status = next;
  listeners.forEach((cb) => cb(status));
}

export function getConnectivityStatus() { return status; }

/** Subscribe to status changes. Returns an unsubscribe fn. */
export function subscribeConnectivity(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** One abortable health probe. Resolves true only on a fast HTTP 2xx. */
async function probe() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    // Bypass HTTP + service-worker caches; the cache-buster keeps intermediaries
    // from answering with a stale 200 while the real connection is dead.
    const res = await fetch(`${HEALTH_URL}?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false; // abort (timeout) or network error — treat as not-connected
  } finally {
    clearTimeout(timer);
  }
}

/**
 * syncEngine pulls dashboard/family/etc. into IndexedDB; mounted useOfflineQuery
 * instances re-pull their own screen's data. Both listen for this event, so a
 * single dispatch refreshes whatever the user is currently looking at.
 */
function triggerRefetch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('fd-reconnected'));
}

/**
 * One probe + recover. Idempotent — if a probe is already in flight, later
 * callers just return. A fast success flips us to OK and refetches; a slow or
 * failed probe flips us to RECONNECTING (the watchdog keeps trying from there).
 */
export async function checkConnectivity() {
  if (probing) return;
  if (isNavigatorOffline()) { setStatus(ConnState.OFFLINE); return; }

  probing = true;
  // Grace timer: a fast recovery never flashes the banner.
  const graceTimer = setTimeout(() => {
    if (probing) setStatus(ConnState.RECONNECTING);
  }, BANNER_GRACE_MS);

  try {
    if (await probe()) {
      setStatus(ConnState.OK);
      triggerRefetch();
    } else {
      setStatus(ConnState.RECONNECTING);
    }
  } finally {
    clearTimeout(graceTimer);
    probing = false;
  }
}

/** Wire resume signals + a watchdog. Call once at app startup (after sync engine). */
export function initConnectivity() {
  if (typeof window === 'undefined') return;

  // Resume signals — probe immediately when the app comes back to the user.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkConnectivity();
  });
  window.addEventListener('online', () => {
    setStatus(ConnState.RECONNECTING);
    checkConnectivity();
  });
  window.addEventListener('offline', () => setStatus(ConnState.OFFLINE));
  // Android PWAs frequently restore from bfcache rather than reloading.
  window.addEventListener('pageshow', (e) => { if (e.persisted) checkConnectivity(); });

  // Watchdog — while we believe we're down (but the OS says we have a network),
  // keep re-probing so the banner self-clears the moment the connection silently
  // returns, with no tap required. No-ops when healthy or truly offline.
  setInterval(() => {
    if (status !== ConnState.OK && !isNavigatorOffline()) checkConnectivity();
  }, WATCHDOG_MS);
}

/** React hook — returns the current connectivity status string. */
export function useConnectivity() {
  const [s, setS] = useState(getConnectivityStatus());
  useEffect(() => subscribeConnectivity(setS), []);
  return s;
}
