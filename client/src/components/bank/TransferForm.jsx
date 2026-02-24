import { useState, useEffect } from 'react';
import { familyApi } from '../../api/family.api.js';

export default function TransferForm({ sourceAccountId, onSubmit, loading }) {
  const [allAccounts, setAllAccounts] = useState([]);
  const [toAccountId, setToAccountId] = useState('');
  const [dollars, setDollars] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    familyApi.getFamilyAccounts().then(({ accounts }) => {
      const destinations = accounts.filter((a) => a.id !== sourceAccountId);
      setAllAccounts(destinations);
      if (destinations.length) setToAccountId(String(destinations[0].id));
    });
  }, [sourceAccountId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(dollars);
    if (!amount || amount <= 0) { setError('Enter a valid amount.'); return; }
    if (!toAccountId) { setError('Select a destination account.'); return; }
    setError('');
    await onSubmit({
      type: 'transfer_out',
      amount_cents: Math.round(amount * 100),
      description,
      to_account_id: parseInt(toAccountId, 10),
    });
  };

  // Group accounts by owner for a cleaner dropdown
  const grouped = allAccounts.reduce((acc, a) => {
    const key = a.owner_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">To Account</label>
        {allAccounts.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No other accounts available.</p>
        ) : (
          <select
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {Object.entries(grouped).map(([ownerName, accs]) => (
              <optgroup key={ownerName} label={ownerName}>
                {accs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </div>
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
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          maxLength={200}
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading || !allAccounts.length}
        className="w-full bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
      >
        {loading ? 'Transferring…' : 'Transfer'}
      </button>
    </form>
  );
}
