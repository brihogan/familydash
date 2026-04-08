import { relativeTime } from '../../utils/relativeTime.js';
import EmptyState from '../shared/EmptyState.jsx';
import { useFamilySettings } from '../../context/FamilySettingsContext.jsx';

export default function TicketLedger({ ledger }) {
  const { choreLabel, choresLabelLower } = useFamilySettings();
  const typeLabels = {
    chore_reward: choreLabel,
    redemption: 'Redemption',
    manual: 'Manual',
  };
  if (!ledger.length) {
    return <EmptyState title="No ticket history" description={`Complete ${choresLabelLower} to earn tickets!`} />;
  }
  return (
    <div className="space-y-1">
      {ledger.map((entry) => (
        <div key={entry.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg">
          <span className={`text-lg ${entry.amount > 0 ? 'text-green-500' : 'text-red-500'}`}>
            {entry.amount > 0 ? '↑' : '↓'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{entry.description || typeLabels[entry.type]}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{typeLabels[entry.type]} · {relativeTime(entry.created_at)}</p>
          </div>
          <span className={`text-sm font-bold ${entry.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {entry.amount > 0 ? '+' : ''}{entry.amount}
          </span>
        </div>
      ))}
    </div>
  );
}
