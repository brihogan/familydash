import CurrencyDisplay from '../shared/CurrencyDisplay.jsx';
import { relativeTime } from '../../utils/relativeTime.js';
import EmptyState from '../shared/EmptyState.jsx';

const TYPE_LABELS = {
  deposit: 'Deposit',
  withdraw: 'Withdrawal',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  allowance: 'Allowance',
  manual_adjustment: 'Adjustment',
};

function transferLabel(tx, viewingUserId) {
  if (!tx.linked_account_name) return TYPE_LABELS[tx.type];
  // Include the owner name only when the linked account belongs to a different user
  const sameOwner = tx.linked_account_owner_id === (viewingUserId ? Number(viewingUserId) : null);
  const accountLabel = sameOwner
    ? tx.linked_account_name
    : `${tx.linked_account_owner_name}'s ${tx.linked_account_name}`;
  return tx.type === 'transfer_out'
    ? `Transfer to ${accountLabel}`
    : `Transfer from ${accountLabel}`;
}

export default function TransactionList({ transactions, viewingUserId }) {
  if (!transactions.length) {
    return <EmptyState title="No transactions yet" description="Your first transaction will appear here." />;
  }
  return (
    <div className="space-y-1">
      {transactions.map((tx) => {
        const isTransfer = tx.type === 'transfer_in' || tx.type === 'transfer_out';
        const label = isTransfer ? transferLabel(tx, viewingUserId) : (TYPE_LABELS[tx.type] || tx.type);

        return (
          <div
            key={tx.id}
            className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{label}</p>
              <p className="text-xs text-gray-400 truncate">
                {[tx.description, tx.created_by_name && `by ${tx.created_by_name}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="text-right shrink-0">
              <CurrencyDisplay cents={tx.amount_cents} />
              <p className="text-xs text-gray-400">{relativeTime(tx.created_at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
