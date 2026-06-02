import { registerSW } from 'virtual:pwa-register';

// The service worker is OFF by default. It only registers when the user opts in
// (a checkbox on the login screen). This keeps the PWA install + offline asset
// caching available for those who want it (mainly Android) while keeping it off
// for everyone else — notably iOS in-app browsers where it may misbehave.
const KEY = 'pwaEnabled';

export function isPwaEnabled() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let updateSW;

function doRegister() {
  // autoUpdate: silently refresh when a new worker is ready.
  updateSW = registerSW({ immediate: true });
}

async function removeServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* best effort */
  }
}

/**
 * Run once on boot. Registers the worker if the user opted in; otherwise
 * actively removes any worker left over from a previous build so existing
 * devices self-heal back to no-SW without needing a reinstall.
 */
export function applyPwaState() {
  if (isPwaEnabled()) {
    doRegister();
  } else {
    removeServiceWorkers();
  }
}

/** Toggle the preference. Registers immediately on enable; unregisters + reloads on disable. */
export async function setPwaEnabled(enabled) {
  try {
    localStorage.setItem(KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (enabled) {
    doRegister();
  } else {
    await removeServiceWorkers();
    window.location.reload();
  }
}
