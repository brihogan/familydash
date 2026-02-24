import { relativeTime } from '../../utils/relativeTime.js';
import EmptyState from '../shared/EmptyState.jsx';

const TYPE_LABELS = {
  chore_reward: 'Chore',
  redemption: 'Redemption',
  manual: 'Manual',
};

export default function TicketLedger({ ledger }) {
  if (!ledger.length) {
    return <EmptyState title="No ticket history" description="Complete chores to earn tickets!" />;
  }
  return (
    <div className="space-y-1">
      {ledger.map((entry) => (
        <div key={entry.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-lg">
          <span className={`text-lg ${entry.amount > 0 ? 'text-green-500' : 'text-red-500'}`}>
            {entry.amount > 0 ? '↑' : '↓'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">{entry.description || TYPE_LABELS[entry.type]}</p>
            <p className="text-xs text-gray-400">{TYPE_LABELS[entry.type]} · {relativeTime(entry.created_at)}</p>
          </div>
          <span className={`text-sm font-bold ${entry.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {entry.amount > 0 ? '+' : ''}{entry.amount}
          </span>
        </div>
      ))}
    </div>
  );
}
