import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

// Credit types available when depositing (parent only)
const DEPOSIT_TYPES = [
  { value: 'deposit',           label: 'Deposit' },
  { value: 'allowance',         label: 'Allowance' },
  { value: 'manual_adjustment', label: 'Manual adjustment' },
];

/**
 * @param {{ mode: 'deposit' | 'withdraw', onSubmit: Function, loading: boolean }} props
 * `mode` is required — determines which type is used and whether a type selector is shown.
 */
export default function TransactionForm({ mode, onSubmit, loading }) {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';

  // For withdraw, type is always fixed. For deposit (parent), user can pick the sub-type.
  const isWithdraw = mode === 'withdraw';
  const [depositType, setDepositType] = useState('deposit');
  const type = isWithdraw ? 'withdraw' : depositType;

  const [dollars,     setDollars]     = useState('');
  const [description, setDescription] = useState('');
  const [error,       setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(dollars);
    if (!amount || amount <= 0) { setError('Enter a valid amount.'); return; }
    if (isWithdraw && !description.trim()) { setError('Description required for withdrawals.'); return; }
    setError('');
    await onSubmit({ type, amount_cents: Math.round(amount * 100), description });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Deposit sub-type selector — parent only, deposit mode only */}
      {isParent && !isWithdraw && (
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
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description {isWithdraw && <span className="text-red-500">*</span>}
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          placeholder="What is this for?"
          maxLength={500}
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
      >
        {loading ? 'Processing…' : 'Submit'}
      </button>
    </form>
  );
}
