import { useState, useMemo } from 'react';
import CurrencyWorkNotice, { buildDefaultAllocations } from './CurrencyWorkNotice.jsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const INPUT_CLS = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400';

export default function RecurringRuleForm({ accounts, onSave, onCancel, loading, requireCurrencyWork = false, userAccounts = [] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [type, setType] = useState('deposit');
  const [dollars, setDollars] = useState('');
  const [description, setDescription] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [toAccountId, setToAccountId] = useState('');
  const [error, setError] = useState('');
  const [allocations, setAllocations] = useState({});

  // Sub-accounts (non-main) for this user
  const subAccounts = useMemo(() => {
    const mainId = accounts[0]?.id;
    return userAccounts.filter((a) => a.id !== mainId);
  }, [accounts, userAccounts]);

  // Initialize default allocations (10% per sub-account)
  useState(() => {
    setAllocations(buildDefaultAllocations(subAccounts));
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(dollars);
    if (!amount || amount <= 0) { setError('Enter a valid amount.'); return; }
    if (type === 'transfer' && !toAccountId) { setError('Select destination account.'); return; }
    setError('');
    const ruleData = {
      account_id: parseInt(accountId, 10),
      type,
      amount_cents: Math.round(amount * 100),
      description,
      day_of_week: dayOfWeek,
      to_account_id: type === 'transfer' ? parseInt(toAccountId, 10) : undefined,
    };
    // Attach allocations for currency-work deposits
    if (type === 'deposit' && requireCurrencyWork) {
      const activeAllocs = subAccounts
        .filter((a) => allocations[a.id]?.enabled)
        .map((a) => ({
          account_id: a.id,
          account_name: a.name,
          type: allocations[a.id].type,
          value: allocations[a.id].value,
        }));
      if (activeAllocs.length) ruleData.allocations = activeAllocs;
    }
    await onSave(ruleData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{type === 'transfer' ? 'From Account' : 'To Account'}</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
            className={INPUT_CLS}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}
            className={INPUT_CLS}>
            <option value="deposit">Deposit</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Amount ($)</label>
          <input type="number" step="0.01" min="0.01" value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            className={INPUT_CLS} placeholder="0.00" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Day of Week</label>
          <select value={dayOfWeek} onChange={(e) => setDayOfWeek(parseInt(e.target.value, 10))}
            className={INPUT_CLS}>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      </div>
      {type === 'transfer' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">To Account</label>
          <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}
            className={INPUT_CLS}>
            <option value="">Select…</option>
            {accounts.filter((a) => a.id !== parseInt(accountId, 10)).map((a) =>
              <option key={a.id} value={a.id}>{a.name}</option>
            )}
          </select>
        </div>
      )}
      {/* ── Currency work notice + sub-account splits ── */}
      {type === 'deposit' && requireCurrencyWork && (
        <CurrencyWorkNotice
          subAccounts={subAccounts}
          allocations={allocations}
          onAllocationsChange={setAllocations}
        />
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
          className={INPUT_CLS} placeholder="Weekly allowance" maxLength={200} />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading}
          className="flex-1 bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? 'Saving…' : 'Add Rule'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
          Cancel
        </button>
      </div>
    </form>
  );
}
