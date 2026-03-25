/**
 * Determine the API base URL.
 * In the browser (dev or served from Express), relative '/api' works via proxy or same-origin.
 * In Capacitor (native app), we need the full production URL.
 */
const isCapacitor = typeof window !== 'undefined' &&
  window.Capacitor?.isNativePlatform?.();

export const API_BASE_URL = isCapacitor
  ? 'https://dash.straychips.com/api'
  : '/api';
