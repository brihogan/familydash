import { useState } from 'react';
import EmptyState from '../shared/EmptyState.jsx';
import { formatCents } from '../../utils/formatCents.js';

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Formats SQLite localtime strings: "YYYY-MM-DD" → "Feb 25"
//                                   "YYYY-MM-DD HH:MM:SS" → "Today 1:35PM" / "Yesterday 1:35PM" / "Feb 25 1:35PM"
function formatLastRun(str) {
  if (!str) return null;
  const [datePart, timePart] = str.split(' ');
  const [yyyy, mm, dd] = datePart.split('-').map(Number);

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isToday     = yyyy === today.getFullYear()     && mm === today.getMonth() + 1     && dd === today.getDate();
  const isYesterday = yyyy === yesterday.getFullYear() && mm === yesterday.getMonth() + 1 && dd === yesterday.getDate();

  const base = isToday ? 'Today' : isYesterday ? 'Yesterday' : `${MONTHS[mm - 1]} ${dd}`;
  if (!timePart) return base;
  const [hh, min] = timePart.split(':').map(Number);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h = hh % 12 || 12;
  return `${base} ${h}:${String(min).padStart(2, '0')}${ampm}`;
}

export default function RecurringRuleList({ rules, onDelete }) {
  const [confirmId, setConfirmId] = useState(null);

  if (!rules.length) {
    return <EmptyState title="No recurring rules" description="Add allowance or auto-transfer rules." />;
  }
  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <div key={rule.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 p-3">
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
              <span className="text-xs text-gray-400 dark:text-gray-500">Last: {formatLastRun(rule.last_run_date)}</span>
            )}
            <button
              onClick={() => setConfirmId(confirmId === rule.id ? null : rule.id)}
              className="text-xs text-red-500 hover:underline"
            >
              Remove
            </button>
          </div>
          {confirmId === rule.id && (
            <div className="px-3 pb-3 border-t border-amber-100 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-between gap-3">
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">Remove this recurring rule?</p>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => { onDelete(rule.id); setConfirmId(null); }}
                  className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium transition-colors"
                >
                  Yes, remove
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  className="px-2.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
