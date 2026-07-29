import { useCallback, useEffect, useState } from 'react';
import ClaudeTerminal from '../claude/ClaudeTerminal.jsx';
import { guestAdminApi } from '../../api/guest.api.js';

const DURATIONS = [
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '4 hours', minutes: 240 },
];

function formatLeft(ms) {
  if (ms <= 0) return 'expired';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m left` : `${h}h left`;
}

/**
 * Guest workshop controls. Turns on a passcode-gated Claude Code terminal at
 * /apps/build for visiting kids, for a fixed window that closes itself.
 *
 * Two destructive-ish actions live here on purpose: the one-time Claude login
 * (a real shell into the shared container) and "Delete everything", which wipes
 * the workspace volume but deliberately leaves the login intact.
 */
export default function GuestWorkshopCard() {
  const [settings, setSettings] = useState(null);
  const [passcode, setPasscode] = useState('');
  const [minutes, setMinutes] = useState(120);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showTerminal, setShowTerminal] = useState(false);
  const [confirmNuke, setConfirmNuke] = useState(false);

  const load = useCallback(() => {
    guestAdminApi.getSettings()
      .then((data) => {
        setSettings(data);
        if (data.defaultDurationMinutes) setMinutes(data.defaultDurationMinutes);
      })
      .catch(() => setSettings(null));
  }, []);

  useEffect(load, [load]);

  // Drives the countdown, and flips the card back to "closed" on its own once
  // the window lapses — no reload needed.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const open = Boolean(settings?.enabled && settings?.expiresAt && settings.expiresAt > now);

  const save = async (enabled) => {
    setError('');
    setBusy(true);
    try {
      const body = { enabled };
      if (enabled) {
        body.durationMinutes = minutes;
        if (passcode.trim()) body.passcode = passcode.trim();
      }
      await guestAdminApi.saveSettings(body);
      setPasscode('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const nuke = async () => {
    setBusy(true);
    setError('');
    try {
      await guestAdminApi.nuke();
      setConfirmNuke(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete.');
    } finally {
      setBusy(false);
    }
  };

  const getAdminTicket = useCallback(() => guestAdminApi.getAdminTicket(), []);

  if (!settings) return null;

  const buildUrl = `${window.location.origin}/apps/build`;
  const canTurnOn = settings.hasPasscode || passcode.trim().length >= 4;

  return (
    <>
      <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
        <div className="flex items-start justify-between gap-4 mb-1">
          <p className="font-medium text-gray-900 dark:text-gray-100">Guest Workshop</p>
          {open && (
            <span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
              Open · {formatLeft(settings.expiresAt - now)}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Let visiting kids build apps with Claude Code at{' '}
          <span className="font-mono text-gray-700 dark:text-gray-300">{buildUrl}</span>{' '}
          using a passcode. Everyone shares one container and one Claude login, but each person
          gets their own folder and their own Claude session. Access ends automatically when the
          timer runs out.
        </p>

        {open ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => save(false)}
                disabled={busy}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Close now
              </button>
              <button
                onClick={() => save(true)}
                disabled={busy}
                className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Add more time
              </button>
              <select
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
              >
                {DURATIONS.map((d) => (
                  <option key={d.minutes} value={d.minutes}>{d.label}</option>
                ))}
              </select>
            </div>

            {settings.guests?.length > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Building now:{' '}
                <span className="text-gray-700 dark:text-gray-300">
                  {settings.guests.map((g) => g.name).join(', ')}
                </span>
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={settings.hasPasscode ? 'Passcode (leave blank to reuse)' : 'Set a passcode'}
                className="flex-1 min-w-[180px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <select
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
              >
                {DURATIONS.map((d) => (
                  <option key={d.minutes} value={d.minutes}>{d.label}</option>
                ))}
              </select>
              <button
                onClick={() => save(true)}
                disabled={busy || !canTurnOn}
                className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg font-medium transition-colors shrink-0 disabled:opacity-50"
              >
                Open workshop
              </button>
            </div>
            {!settings.hasPasscode && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Passcode must be at least 4 characters.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{error}</p>}

        {/* ── Setup + cleanup ── */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Claude login</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Do this once, before the first workshop: open a terminal, run{' '}
                <span className="font-mono">claude</span>, and finish the sign-in. Every guest
                shares it. It survives &quot;Delete everything&quot;.
              </p>
            </div>
            <button
              onClick={() => setShowTerminal(true)}
              className="shrink-0 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Open terminal
            </button>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Delete everything</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {settings.folders?.length
                  ? `Wipes all guest folders (${settings.folders.join(', ')}) and their apps. Can't be undone.`
                  : "Wipes every guest folder and the apps inside them. Can't be undone."}
              </p>
            </div>
            {confirmNuke ? (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setConfirmNuke(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={nuke}
                  disabled={busy}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Yes, delete
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmNuke(true)}
                className="shrink-0 px-3 py-1.5 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-sm rounded-lg font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {showTerminal && (
        <ClaudeTerminal
          title="Guest workshop (parent)"
          getTicket={getAdminTicket}
          onClose={() => { setShowTerminal(false); load(); }}
        />
      )}
    </>
  );
}
