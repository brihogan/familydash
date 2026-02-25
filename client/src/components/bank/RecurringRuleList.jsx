import EmptyState from '../shared/EmptyState.jsx';
import { formatCents } from '../../utils/formatCents.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function RecurringRuleList({ rules, onDelete }) {
  if (!rules.length) {
    return <EmptyState title="No recurring rules" description="Add allowance or auto-transfer rules." />;
  }
  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <div key={rule.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {rule.type === 'deposit' ? 'Deposit' : 'Transfer'} {formatCents(rule.amount_cents)}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Every {DAYS[rule.day_of_week]}
              {rule.description && ` · ${rule.description}`}
              {rule.to_account_name && ` → ${rule.to_account_name}`}
            </p>
          </div>
          {rule.last_run_date && (
            <span className="text-xs text-gray-400 dark:text-gray-500">Last: {rule.last_run_date}</span>
          )}
          <button
            onClick={() => onDelete(rule.id)}
            className="text-xs text-red-500 hover:underline"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
