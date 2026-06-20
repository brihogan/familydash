import { useState, useEffect } from 'react';
import { familyApi } from '../../api/family.api.js';

// Integrations card: mint / list / revoke the read-only device tokens used by the
// Garmin "FamDash" watch app (GET /api/device/dashboard, X-Api-Key). The plaintext
// token is shown exactly once, right after it's created.
export default function DeviceTokensCard() {
  const [tokens, setTokens] = useState([]);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState(null); // plaintext, shown once
  const [copied, setCopied] = useState(false);

  const load = () => {
    familyApi.listDeviceTokens()
      .then((d) => setTokens((d.tokens || []).filter((t) => !t.revoked_at)))
      .catch(() => setTokens([]));
  };
  useEffect(load, []);

  const create = async () => {
    setCreating(true);
    try {
      const res = await familyApi.createDeviceToken({ label: label.trim() || 'Garmin watch' });
      setNewToken(res.token);
      setCopied(false);
      setLabel('');
      load();
    } catch { /* ignore */ }
    finally { setCreating(false); }
  };

  const revoke = async (id) => {
    try { await familyApi.revokeDeviceToken(id); load(); } catch { /* ignore */ }
  };

  const setWrite = async (id, write) => {
    try { await familyApi.setDeviceTokenWrite(id, write); load(); } catch { /* ignore */ }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const fmtDate = (s) => (s ? String(s).slice(0, 10) : '—');

  return (
    <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
      <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">Garmin Watch (FamDash)</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        Generate an API key for the FamDash watch app, then paste it into the
        watch's <span className="font-medium">Device API key</span> setting
        (Garmin Connect → FamDash). Keys are read-only by default — toggle
        <span className="font-medium"> Writes</span> on to let the watch change
        money / tickets. Keys are shown only once.
      </p>

      {/* Existing keys */}
      {tokens.length > 0 && (
        <ul className="mb-3 divide-y divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700 rounded-lg">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {t.label || 'Unnamed key'}
                  {t.user_name ? <span className="text-gray-400"> · {t.user_name}</span> : null}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t.scope === 'read' ? 'read-only' : t.scope} · added {fmtDate(t.created_at)}
                  {' · '}{t.last_used_at ? `last used ${fmtDate(t.last_used_at)}` : 'never used'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setWrite(t.id, !(t.scope || '').includes('write'))}
                  title="Allow this key to change money / tickets from the watch"
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                    (t.scope || '').includes('write')
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {(t.scope || '').includes('write') ? 'Writes on' : 'Writes off'}
                </button>
                <button
                  onClick={() => revoke(t.id)}
                  className="px-3 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg font-medium transition-colors"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Freshly-created token (shown once) */}
      {newToken && (
        <div className="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-2">
            Copy this key now — it won't be shown again.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={newToken}
              onFocus={(e) => e.target.select()}
              className="flex-1 font-mono text-xs border border-amber-300 dark:border-amber-500/40 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              onClick={copy}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg font-medium transition-colors shrink-0"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => setNewToken(null)}
              className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors shrink-0"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Create a new key */}
      <div className="flex gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Key name (e.g. Brian's Instinct 3)"
          maxLength={60}
          className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <button
          onClick={create}
          disabled={creating}
          className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors shrink-0"
        >
          {creating ? 'Generating…' : 'Generate key'}
        </button>
      </div>
    </div>
  );
}
