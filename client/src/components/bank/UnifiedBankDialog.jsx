import { useState, useEffect } from 'react';
import Modal from '../shared/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { accountsApi } from '../../api/accounts.api.js';
import { familyApi } from '../../api/family.api.js';

// Frontend deposit sub-types — all map to 'deposit' or 'allowance' / 'manual_adjustment' on the API
const DEPOSIT_TYPES = [
  { value: 'deposit',           label: 'Deposit',           apiType: 'deposit' },
  { value: 'allowance',         label: 'Allowance',         apiType: 'allowance' },
  { value: 'gift',              label: 'Gift',              apiType: 'deposit' },
  { value: 'work_done',         label: 'Work done',         apiType: 'deposit' },
  { value: 'manual_adjustment', label: 'Manual adjustment', apiType: 'manual_adjustment' },
];

// ── Recent-transaction helpers ─────────────────────────────────────────────────
const STORAGE_KEY = 'bank_recent_transactions';
const MAX_RECENT  = 5;

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveRecent(entry) {
  const deduped = loadRecent().filter(
    (r) => !(r.mode === entry.mode && r.depositType === entry.depositType &&
             r.amount === entry.amount && r.description === entry.description)
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...deduped].slice(0, MAX_RECENT)));
}

function recentLabel(r) {
  const sign = r.mode === 'deposit' ? '+' : '−';
  const amt  = `$${Math.round(r.amount)}`;
  if (r.description) return `${sign}${amt} ${r.description}`;
  if (r.mode === 'deposit') {
    const typeInfo = DEPOSIT_TYPES.find((t) => t.value === r.depositType);
    return `${sign}${amt} ${typeInfo?.label || 'Deposit'}`;
  }
  return `${sign}${amt} Withdraw`;
}

// ── Transfer helpers ───────────────────────────────────────────────────────────
function filterDestAccounts(allAccounts, sourceAccountId, currentUser) {
  const withoutSource = allAccounts.filter((a) => a.id !== sourceAccountId);
  if (currentUser.role === 'parent') return withoutSource;
  // Kid: own sub-accounts (non-main) + siblings' main accounts only
  return withoutSource.filter((a) => {
    if (a.user_id === currentUser.id) return a.type !== 'main';
    return a.type === 'main' && a.owner_role === 'kid';
  });
}

function groupByOwner(accounts) {
  return accounts.reduce((acc, a) => {
    if (!acc[a.owner_name]) acc[a.owner_name] = [];
    acc[a.owner_name].push(a);
    return acc;
  }, {});
}

const MODE_STYLES = {
  deposit:  'bg-green-500 text-white',
  withdraw: 'bg-red-500 text-white',
  transfer: 'bg-brand-500 text-white',
};

/**
 * Unified Deposit / Withdraw / Transfer dialog.
 *
 * Bank-page usage  — pass sourceAccount + userAccounts (already loaded).
 * Dashboard usage  — pass only userId; dialog fetches accounts itself.
 */
export default function UnifiedBankDialog({
  open,
  onClose,
  userId,
  initialMode    = 'deposit',
  sourceAccount  = null,   // pre-selected account (bank page)
  userAccounts   = null,   // pre-loaded (bank page)
  onSuccess,
}) {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';

  // Kids can't deposit — only withdraw + transfer
  const MODES = isParent ? ['deposit', 'withdraw', 'transfer'] : ['withdraw', 'transfer'];

  const [mode,         setMode]         = useState(initialMode);
  const [ownAccounts,  setOwnAccounts]  = useState(userAccounts || []);
  const [srcId,        setSrcId]        = useState('');
  const [destAccounts, setDestAccounts] = useState([]);
  const [toAccountId,  setToAccountId]  = useState('');
  const [depositType,  setDepositType]  = useState('deposit');
  const [dollars,      setDollars]      = useState('');
  const [description,  setDescription]  = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState('');
  const [recent,       setRecent]       = useState([]);

  // Reset form each time the dialog opens
  useEffect(() => {
    if (!open) return;
    // Guard: kids cannot deposit — fall back to withdraw
    const safeMode = (!isParent && initialMode === 'deposit') ? 'withdraw' : initialMode;
    setMode(safeMode);
    setDepositType('deposit');
    setDollars('');
    setDescription('');
    setError('');
    setToAccountId('');
    setRecent(loadRecent());
  }, [open, initialMode]);

  // Load kid's own accounts when dialog opens (dashboard mode)
  useEffect(() => {
    if (!open) return;
    if (userAccounts) {
      setOwnAccounts(userAccounts);
      if (!sourceAccount && userAccounts.length) setSrcId(String(userAccounts[0].id));
    } else {
      accountsApi.getAccounts(userId)
        .then(({ accounts: accs }) => {
          setOwnAccounts(accs);
          if (!sourceAccount && accs.length) setSrcId(String(accs[0].id));
        })
        .catch(() => {});
    }
  }, [open, userId]);

  // Effective source account ID (prefer prop; fall back to selector state)
  const effectiveSrcId = sourceAccount?.id ?? parseInt(srcId, 10) ?? null;

  // Load family accounts for transfer destinations whenever source changes
  useEffect(() => {
    if (!open || mode !== 'transfer' || !effectiveSrcId) return;
    familyApi.getFamilyAccounts().then(({ accounts: all }) => {
      const filtered = filterDestAccounts(all, effectiveSrcId, user);
      setDestAccounts(filtered);
      setToAccountId(filtered.length ? String(filtered[0].id) : '');
    }).catch(() => {});
  }, [open, mode, effectiveSrcId]);

  // ── Recent helpers ────────────────────────────────────────────────────────
  const applyRecent = (r) => {
    setMode(r.mode);
    if (r.depositType) setDepositType(r.depositType);
    setDollars(String(r.amount));
    setDescription(r.description);
  };

  const isActiveRecent = (r) =>
    r.mode === mode &&
    (r.mode !== 'deposit' || r.depositType === depositType) &&
    r.amount === parseFloat(dollars) &&
    r.description === description;

  // Hide deposit recents from kids
  const visibleRecent = recent.filter((r) => isParent || r.mode !== 'deposit');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(dollars);
    if (!amount || amount <= 0) { setError('Enter a valid amount.'); return; }
    if (mode === 'withdraw' && !description.trim()) { setError('Description required for withdrawals.'); return; }
    if (mode === 'transfer' && !toAccountId) { setError('Select a destination account.'); return; }
    if (!effectiveSrcId) { setError('Select an account.'); return; }

    let data;
    if (mode === 'deposit') {
      const typeInfo = DEPOSIT_TYPES.find((t) => t.value === depositType);
      data = { type: typeInfo.apiType, amount_cents: Math.round(amount * 100), description };
    } else if (mode === 'withdraw') {
      data = { type: 'withdraw', amount_cents: Math.round(amount * 100), description };
    } else {
      data = { type: 'transfer_out', amount_cents: Math.round(amount * 100), description, to_account_id: parseInt(toAccountId, 10) };
    }

    setSubmitting(true);
    setError('');
    try {
      await accountsApi.createTransaction(userId, effectiveSrcId, data);
      // Save to recents for deposit and withdraw (not transfer)
      if (mode !== 'transfer') {
        saveRecent({
          mode,
          depositType: mode === 'deposit' ? depositType : undefined,
          amount,
          description: description.trim(),
        });
      }
      onClose();
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Transaction failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const groupedDest = groupByOwner(destAccounts);
  const dashboardMode = !sourceAccount; // no pre-selected account → show account selector

  return (
    <Modal open={open} onClose={() => { if (!submitting) onClose(); }} title="Bank Transaction">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Recent transactions (deposit / withdraw only) ── */}
        {visibleRecent.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent</p>
            <div className="flex flex-wrap gap-1.5">
              {visibleRecent.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applyRecent(r)}
                  className={`px-2.5 py-1 rounded-full text-xs border font-medium transition-colors ${
                    isActiveRecent(r)
                      ? r.mode === 'deposit'
                        ? 'bg-green-100 border-green-400 text-green-700'
                        : 'bg-red-100 border-red-400 text-red-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {recentLabel(r)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Mode toggle ── */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">New Transaction</p>
        <div className="flex rounded-lg overflow-hidden border border-gray-200">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                mode === m ? MODE_STYLES[m] : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Dashboard: account selector (deposit / withdraw) ── */}
        {dashboardMode && mode !== 'transfer' && ownAccounts.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {mode === 'deposit' ? 'Into account' : 'From account'}
            </label>
            <select
              value={srcId}
              onChange={(e) => setSrcId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {ownAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Transfer: from account (dashboard) then to account ── */}
        {mode === 'transfer' && (
          <>
            {dashboardMode && ownAccounts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From account</label>
                <select
                  value={srcId}
                  onChange={(e) => setSrcId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {ownAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To account</label>
              {destAccounts.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No other accounts available.</p>
              ) : (
                <select
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {Object.entries(groupedDest).map(([owner, accs]) => (
                    <optgroup key={owner} label={owner}>
                      {accs.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>
          </>
        )}

        {/* ── Deposit sub-type (parent only) ── */}
        {mode === 'deposit' && isParent && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={depositType}
              onChange={(e) => setDepositType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {DEPOSIT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Amount ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            placeholder="0.00"
          />
        </div>

        {/* ── Description ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {mode === 'transfer' ? 'Note' : 'Description'}
            {mode === 'withdraw' && <span className="text-red-500 ml-1">*</span>}
            {mode === 'transfer' && <span className="text-gray-400 ml-1">(optional)</span>}
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            placeholder={
              mode === 'deposit'  ? 'What is this for?' :
              mode === 'withdraw' ? 'What are you spending this on?' :
              'Optional note'
            }
            maxLength={500}
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={submitting || (mode === 'transfer' && !destAccounts.length)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${
              mode === 'deposit'  ? 'bg-green-500 hover:bg-green-600'  :
              mode === 'withdraw' ? 'bg-red-500   hover:bg-red-600'   :
              'bg-brand-500 hover:bg-brand-600'
            }`}
          >
            {submitting ? 'Processing…' :
              mode === 'deposit'  ? 'Deposit'  :
              mode === 'withdraw' ? 'Withdraw' : 'Transfer'}
          </button>
          <button
            type="button"
            onClick={() => { if (!submitting) onClose(); }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
