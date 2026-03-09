import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoneyBills, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import Modal from '../shared/Modal.jsx';
import MoneyPopover from './MoneyPopover.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { accountsApi } from '../../api/accounts.api.js';
import { familyApi } from '../../api/family.api.js';
import CurrencyWorkNotice, { buildDefaultAllocations } from './CurrencyWorkNotice.jsx';

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

// ── Custom account picker dropdown ───────────────────────────────────────────

function renderAvatar(acct) {
  if (acct.owner_avatar_emoji) return <span className="text-base leading-none shrink-0">{acct.owner_avatar_emoji}</span>;
  const initials = (acct.owner_name || '').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
      style={{ backgroundColor: acct.owner_avatar_color || '#6b7280' }}
    >{initials}</span>
  );
}

function AccountPicker({ accounts, value, onChange, currentUser, isParent }) {
  const [open, setOpen]           = useState(false);
  const [drillOwner, setDrillOwner] = useState(null); // parent drill-in: user_id
  const [pos, setPos]             = useState({ top: 0, left: 0, width: 0 });
  const ref      = useRef(null);
  const trigRef  = useRef(null);
  const panelRef = useRef(null);

  // Close on click outside (check both trigger and portal panel)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (trigRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  // Reset drill when closing
  useEffect(() => { if (!open) setDrillOwner(null); }, [open]);

  const selected = accounts.find((a) => String(a.id) === value);

  // ── Trigger label ──────────────────────────────────────────────────────
  let selectedLabel;
  if (!selected) {
    selectedLabel = <span className="text-gray-400 dark:text-gray-500">Select account…</span>;
  } else if (isParent) {
    selectedLabel = <span className="flex items-center gap-2 truncate">{renderAvatar(selected)} <span className="truncate">{selected.owner_name} — {selected.name}</span></span>;
  } else if (selected.user_id === currentUser?.id) {
    selectedLabel = <span className="truncate">{selected.name}</span>;
  } else {
    selectedLabel = <span className="flex items-center gap-2 truncate">{renderAvatar(selected)} <span className="truncate">{selected.owner_name}</span></span>;
  }

  // ── Group data ─────────────────────────────────────────────────────────
  // Parent: { user_id → { name, emoji, color, accounts[] } }
  const ownerMap = {};
  for (const a of accounts) {
    if (!ownerMap[a.user_id]) ownerMap[a.user_id] = { userId: a.user_id, name: a.owner_name, emoji: a.owner_avatar_emoji, color: a.owner_avatar_color, accounts: [] };
    ownerMap[a.user_id].accounts.push(a);
  }
  const owners = Object.values(ownerMap);

  // Kid view grouping
  const ownAccts   = accounts.filter((a) => a.user_id === currentUser?.id);
  const otherAccts = accounts.filter((a) => a.user_id !== currentUser?.id);

  // Drilled-in owner for parent
  const drilledOwner = drillOwner != null ? ownerMap[drillOwner] : null;

  const handleOpen = () => {
    if (!open && trigRef.current) {
      const r = trigRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen((o) => !o);
  };

  const dropdownPanel = open ? (
    <div
      ref={panelRef}
      style={{ position: 'fixed', zIndex: 9999, top: pos.top, left: pos.left, width: pos.width }}
      className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg overflow-hidden"
    >
          {isParent ? (
            /* ── Parent: two-panel slide ────────────────────────────── */
            <div className="overflow-hidden">
              <div
                className="flex transition-transform duration-200 ease-in-out"
                style={{ transform: drilledOwner ? 'translateX(-50%)' : 'translateX(0)', width: '200%' }}
              >
                {/* Panel 1: list of kids */}
                <div className="w-1/2 max-h-60 overflow-y-auto">
                  {owners.map((o) => (
                    <button
                      key={o.userId}
                      type="button"
                      onClick={() => {
                        if (o.accounts.length === 1) {
                          onChange(String(o.accounts[0].id));
                          setOpen(false);
                        } else {
                          setDrillOwner(o.userId);
                        }
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      {o.emoji
                        ? <span className="text-base leading-none shrink-0">{o.emoji}</span>
                        : <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0" style={{ backgroundColor: o.color || '#6b7280' }}>
                            {o.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                          </span>
                      }
                      <span className="truncate font-medium">{o.name}</span>
                      {o.accounts.length > 1 && (
                        <FontAwesomeIcon icon={faChevronDown} className="ml-auto text-[10px] text-gray-300 dark:text-gray-500 -rotate-90" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Panel 2: accounts for the drilled-in kid */}
                <div className="w-1/2 max-h-60 overflow-y-auto">
                  {/* Back button + kid header */}
                  <button
                    type="button"
                    onClick={() => setDrillOwner(null)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-600"
                  >
                    <span className="text-xs">←</span>
                    <span className="text-gray-500 dark:text-gray-400">Back</span>
                  </button>
                  {drilledOwner && (
                    <>
                      {/* Kid identity header */}
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
                        {drilledOwner.emoji
                          ? <span className="text-lg leading-none">{drilledOwner.emoji}</span>
                          : <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0" style={{ backgroundColor: drilledOwner.color || '#6b7280' }}>
                              {drilledOwner.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                            </span>
                        }
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{drilledOwner.name}</span>
                      </div>
                      {/* Account list */}
                      {drilledOwner.accounts.map((a) => {
                        const isSelected = String(a.id) === value;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => { onChange(String(a.id)); setOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors ${
                              isSelected
                                ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-300 font-medium'
                                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            {a.name}
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ── Kid: flat list with sections ──────────────────────── */
            <div className="max-h-60 overflow-y-auto">
              {ownAccts.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-750">
                    My accounts
                  </div>
                  {ownAccts.map((a) => {
                    const isSelected = String(a.id) === value;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => { onChange(String(a.id)); setOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${
                          isSelected
                            ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-300 font-medium'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {a.name}
                      </button>
                    );
                  })}
                </>
              )}
              {ownAccts.length > 0 && otherAccts.length > 0 && (
                <hr className="border-gray-200 dark:border-gray-600 mx-3" />
              )}
              {otherAccts.length > 0 && otherAccts.map((a) => {
                const isSelected = String(a.id) === value;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { onChange(String(a.id)); setOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${
                      isSelected
                        ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-300 font-medium'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {renderAvatar(a)}
                    <span className="truncate">{a.owner_name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null;

  return (
    <div ref={ref}>
      {/* Trigger */}
      <button
        ref={trigRef}
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        {selectedLabel}
        <FontAwesomeIcon icon={faChevronDown} className={`text-xs text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {dropdownPanel && createPortal(dropdownPanel, document.body)}
    </div>
  );
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
  requireCurrencyWork = false,
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
  const [showMoneyPopover, setShowMoneyPopover] = useState(false);
  // Allocation state: { [accountId]: { enabled, type: 'percent'|'flat', value } }
  const [allocations, setAllocations] = useState({});

  // Sub-accounts for the current source account (non-main accounts owned by this user)
  const subAccounts = (userAccounts || ownAccounts).filter(
    (a) => a.user_id === parseInt(userId, 10) && a.type !== 'main'
  );

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
    // Default allocations: 10% per sub-account (only if accounts already loaded)
    const subs = (userAccounts || []).filter(
      (a) => a.user_id === parseInt(userId, 10) && a.type !== 'main'
    );
    setAllocations(buildDefaultAllocations(subs));
  }, [open, initialMode, userId]);

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
          // Initialize allocations for async-loaded accounts
          const subs = accs.filter((a) => a.user_id === parseInt(userId, 10) && a.type !== 'main');
          if (subs.length) setAllocations(buildDefaultAllocations(subs));
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
      // Default to first own account if available, otherwise first in list
      const ownFirst = filtered.find((a) => a.user_id === user.id);
      setToAccountId(filtered.length ? String((ownFirst || filtered[0]).id) : '');
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
      // Attach allocations for currency-work kids
      if (isParent && requireCurrencyWork) {
        const activeAllocs = subAccounts
          .filter((a) => allocations[a.id]?.enabled)
          .map((a) => ({
            account_id: a.id,
            account_name: a.name,
            type: allocations[a.id].type,
            value: allocations[a.id].value,
          }));
        if (activeAllocs.length) data.allocations = activeAllocs;
      }
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
  const effectiveSrcAccount = sourceAccount || ownAccounts.find((a) => a.id === parseInt(srcId, 10)) || null;

  return (
    <Modal open={open} onClose={() => { if (!submitting) onClose(); }} title="Bank Transaction">
      <form onSubmit={handleSubmit} className="space-y-4 min-w-0">

        {/* ── Recent transactions (parent only) ── */}
        {isParent && visibleRecent.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Recent</p>
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
                      : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400'
                  }`}
                >
                  {recentLabel(r)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Mode toggle ── */}
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">New Transaction</p>
        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                mode === m ? MODE_STYLES[m] : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Dashboard: account selector (withdraw only — deposits always go to main) ── */}
        {dashboardMode && mode === 'withdraw' && ownAccounts.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From account</label>
            <select
              value={srcId}
              onChange={(e) => setSrcId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200"
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From account</label>
                <select
                  value={srcId}
                  onChange={(e) => setSrcId(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200"
                >
                  {ownAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To account</label>
              {destAccounts.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">No other accounts available.</p>
              ) : (
                <AccountPicker
                  accounts={destAccounts}
                  value={toAccountId}
                  onChange={setToAccountId}
                  currentUser={user}
                  isParent={isParent}
                />
              )}
            </div>
          </>
        )}

        {/* ── Deposit sub-type (parent only) ── */}
        {mode === 'deposit' && isParent && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select
              value={depositType}
              onChange={(e) => setDepositType(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200"
            >
              {DEPOSIT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Amount ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount ($)</label>
          {(mode === 'transfer' || mode === 'withdraw') && requireCurrencyWork && !isParent ? (
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                {dollars ? `$${parseFloat(dollars).toFixed(2)}` : '$0.00'}
              </span>
              <button
                type="button"
                onClick={() => setShowMoneyPopover(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 text-sm font-medium hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                title="Pick amount with money"
              >
                <FontAwesomeIcon icon={faMoneyBills} className="text-sm" />
                Count It
              </button>
            </div>
          ) : (
            <div className={`flex items-center ${(mode === 'transfer' || mode === 'withdraw') ? 'gap-2' : ''}`}>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={dollars}
                onChange={(e) => setDollars(e.target.value)}
                className={`${(mode === 'transfer' || mode === 'withdraw') ? 'w-32' : 'w-full'} border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200`}
                placeholder="0.00"
              />
              {(mode === 'transfer' || mode === 'withdraw') && (
                <button
                  type="button"
                  onClick={() => setShowMoneyPopover(true)}
                  className="w-9 h-9 flex items-center justify-center text-green-500 dark:text-green-400 hover:text-green-600 dark:hover:text-green-300 transition-colors border border-green-300 dark:border-green-700 rounded-lg hover:border-green-400 dark:hover:border-green-500"
                  title="Pick amount with money"
                >
                  <FontAwesomeIcon icon={faMoneyBills} className="text-sm" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Currency work notice + sub-account splits ── */}
        {mode === 'deposit' && isParent && requireCurrencyWork && (
          <CurrencyWorkNotice
            subAccounts={subAccounts}
            allocations={allocations}
            onAllocationsChange={setAllocations}
          />
        )}

        {/* ── Description ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {mode === 'transfer' ? 'Note' : 'Description'}
            {mode === 'withdraw' && <span className="text-red-500 ml-1">*</span>}
            {mode === 'transfer' && <span className="text-gray-400 dark:text-gray-500 ml-1">(optional)</span>}
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200"
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
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </form>

      {effectiveSrcAccount && (
        <MoneyPopover
          open={showMoneyPopover}
          onClose={() => setShowMoneyPopover(false)}
          account={effectiveSrcAccount}
          onSetAmount={(cents) => setDollars((cents / 100).toFixed(2))}
        />
      )}
    </Modal>
  );
}
