import { useConnectivity, checkConnectivity, ConnState } from '../../offline/connectivity.js';

/**
 * Thin top banner shown when the app can't reach the server. On Android the
 * service worker renders the cached shell instantly while /api fetches hang on
 * a stale connection — without this, that reads as a silently-empty screen.
 * The connectivity manager flips us to "reconnecting" only if recovery is slow,
 * so a healthy resume never flashes anything.
 */
export default function ConnectivityBanner() {
  const status = useConnectivity();
  if (status === ConnState.OK) return null;

  const offline = status === ConnState.OFFLINE;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[120] flex justify-center pointer-events-none"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div
        className={`pointer-events-auto mt-2 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-sm font-medium text-white ${
          offline ? 'bg-gray-700' : 'bg-amber-500'
        }`}
        style={{ animation: 'toast-in 200ms ease-out' }}
      >
        {!offline && (
          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
        )}
        <span>{offline ? "You're offline" : 'Reconnecting…'}</span>
        {!offline && (
          <button
            type="button"
            onClick={() => checkConnectivity()}
            className="ml-1 underline underline-offset-2 decoration-white/60"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
