import { Capacitor } from '@capacitor/core';

/**
 * Determine the API base URL.
 * In the browser (dev or served from Express), relative '/api' works via proxy or same-origin.
 * In Capacitor (native app), we need the full production URL.
 *
 * Evaluated lazily via getter so Capacitor bridge is guaranteed to be ready.
 */
let _cached = null;

export function getApiBaseUrl() {
  if (_cached !== null) return _cached;
  _cached = Capacitor.isNativePlatform()
    ? 'https://dash.straychips.com/api'
    : '/api';
  return _cached;
}

// For backward compat with static imports
export const API_BASE_URL = Capacitor.isNativePlatform()
  ? 'https://dash.straychips.com/api'
  : '/api';
