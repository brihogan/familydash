import { offsetDate, formatDate, todayISO, yesterdayISO } from '../../utils/formatDate.js';
import { useAuth } from '../../context/AuthContext.jsx';

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Date navigation with prev/next arrows and a kid-safe guard.
 * compact: show only day-of-week abbreviation, tight spacing, click label → today.
 */
export default function DateNav({ date, onChange, compact = false }) {
  const { user } = useAuth();
  const today = todayISO();
  const yesterday = yesterdayISO();

  const canGoBack = user?.role === 'parent' || date > yesterday;
  const canGoForward = date < today;

  const label = compact
    ? DOW_SHORT[new Date(date + 'T12:00:00').getDay()]
    : date === today ? 'Today' : date === yesterday ? 'Yesterday' : formatDate(date);

  return (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-3'}`}>
      <button
        onClick={() => onChange(offsetDate(date, -1))}
        disabled={!canGoBack}
        className={`rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-lg ${compact ? 'px-1.5 py-1' : 'p-1'}`}
      >
        ‹
      </button>
      <span
        className={`font-medium text-center ${compact ? `text-sm transition-colors ${date === today ? 'bg-brand-500 text-white rounded-md px-2 py-0.5' : 'text-gray-700 dark:text-gray-300 cursor-pointer hover:text-brand-500'}` : 'text-gray-700 dark:text-gray-300 min-w-[120px]'}`}
        onClick={compact && date !== today ? () => onChange(today) : undefined}
        title={compact ? 'Go to today' : undefined}
      >
        {label}
      </span>
      <button
        onClick={() => onChange(offsetDate(date, 1))}
        disabled={!canGoForward}
        className={`rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-lg ${compact ? 'px-1.5 py-1' : 'p-1'}`}
      >
        ›
      </button>
    </div>
  );
}
