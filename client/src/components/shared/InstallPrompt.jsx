import { useState, useEffect } from 'react';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isInStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  navigator.standalone === true;

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('pwa-install-dismissed') === '1',
  );

  useEffect(() => {
    if (dismissed || isInStandaloneMode()) return;

    // Chromium browsers (Android, desktop)
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari — no beforeinstallprompt, show manual instructions
    if (isIOS()) {
      setShowIOSPrompt(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [dismissed]);

  if (dismissed || isInStandaloneMode()) return null;
  if (!deferredPrompt && !showIOSPrompt) return null;

  const install = async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const dismiss = () => {
    localStorage.setItem('pwa-install-dismissed', '1');
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 rounded-xl bg-brand-600 px-4 py-3 text-white shadow-lg sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {showIOSPrompt
            ? 'Install this app: tap Share then "Add to Home Screen"'
            : 'Install Dashboard for quick access'}
        </span>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={dismiss} className="text-sm opacity-80 hover:opacity-100">
            {showIOSPrompt ? 'Got it' : 'Later'}
          </button>
          {deferredPrompt && (
            <button
              onClick={install}
              className="rounded-lg bg-white px-3 py-1 text-sm font-semibold text-brand-600 hover:bg-brand-50"
            >
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
