import { offsetDate, formatDate, todayISO, yesterdayISO } from '../../utils/formatDate.js';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * Date navigation with prev/next arrows and a kid-safe guard.
 */
export default function DateNav({ date, onChange }) {
  const { user } = useAuth();
  const today = todayISO();
  const yesterday = yesterdayISO();

  const canGoBack = user?.role === 'parent' || date > yesterday;
  const canGoForward = date < today;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(offsetDate(date, -1))}
        disabled={!canGoBack}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-lg"
      >
        ‹
      </button>
      <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[120px] text-center">
        {date === today ? 'Today' : date === yesterday ? 'Yesterday' : formatDate(date)}
      </span>
      <button
        onClick={() => onChange(offsetDate(date, 1))}
        disabled={!canGoForward}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-lg"
      >
        ›
      </button>
    </div>
  );
}
