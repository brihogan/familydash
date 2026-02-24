import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBroom } from '@fortawesome/free-solid-svg-icons';
import { choresApi } from '../api/chores.api.js';
import { activityApi } from '../api/activity.api.js';
import { familyApi } from '../api/family.api.js';
import ChoreHistoryList from '../components/chores/ChoreHistoryList.jsx';
import ChoreList from '../components/chores/ChoreList.jsx';
import ChoreProgress from '../components/chores/ChoreProgress.jsx';
import DateNav from '../components/shared/DateNav.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import { todayISO } from '../utils/formatDate.js';
import { relativeTime } from '../utils/relativeTime.js';

const EVENT_ICONS = {
  chore_completed: '✅',
  chore_undone: '↩️',
  deposit: '💵',
  withdrawal: '💸',
  transfer_out: '➡️',
  transfer_in: '⬅️',
  allowance: '🎁',
  reward_redeemed: '🏆',
  tickets_added: '🎟',
  tickets_removed: '🎟',
};

const CHORE_EVENTS = new Set(['chore_completed', 'chore_undone']);

function DayActivityLog({ activity }) {
  // Split into chore vs. non-chore events
  const nonChoreEvents = activity.filter((a) => !CHORE_EVENTS.has(a.event_type));

  if (!nonChoreEvents.length) {
    return <p className="text-sm text-gray-400 italic">No bank or ticket activity on this day.</p>;
  }

  return (
    <div className="space-y-2">
      {nonChoreEvents.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-lg"
        >
          <span className="text-base shrink-0 pt-0.5">{EVENT_ICONS[item.event_type] || '📌'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800">{item.description}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              by{' '}
              <span className={`font-medium ${item.actor_role === 'parent' ? 'text-brand-600' : 'text-gray-600'}`}>
                {item.actor_name}
              </span>
              {' '}({item.actor_role})
              {' · '}
              {relativeTime(item.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ParentChoreHistoryPage() {
  const { userId } = useParams();
  const [date, setDate] = useState(todayISO());
  const [logs, setLogs] = useState([]);
  const [activity, setActivity] = useState([]);
  const pending   = logs.filter((l) => !l.completed_at);
  const completed = logs.filter((l) =>  l.completed_at);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    familyApi.getFamily().then(({ members }) => {
      const m = members.find((mem) => mem.id === parseInt(userId, 10));
      if (m) setMemberName(m.name);
    });
  }, [userId]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [choreData, activityData] = await Promise.all([
        choresApi.getChores(userId, date),
        activityApi.getUserActivityByDate(userId, date),
      ]);
      setLogs(choreData.logs);
      setActivity(activityData.activity);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [userId, date]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleToggle = async (log, completing) => {
    setActionLoading(true);
    try {
      if (completing) {
        await choresApi.completeChore(userId, log.id, date);
      } else {
        await choresApi.uncompleteChore(userId, log.id, date);
      }
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          <FontAwesomeIcon icon={faBroom} className="mr-2 text-brand-500" />
          {memberName ? `${memberName}'s History` : 'History'}
        </h1>
        <DateNav date={date} onChange={setDate} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <div className="space-y-8">

          {/* Chores section */}
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-3">Chores</h2>

            {logs.length > 0 && (
              <div className="mb-4">
                <ChoreProgress done={completed.length} total={logs.length} />
              </div>
            )}

            {pending.length > 0 ? (
              <ChoreList logs={pending} onToggle={handleToggle} disabled={actionLoading} />
            ) : logs.length > 0 ? (
              <p className="text-sm text-green-600 font-medium text-center py-3">All done for today! 🎉</p>
            ) : (
              <ChoreList logs={[]} onToggle={handleToggle} disabled={actionLoading} />
            )}

            {completed.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Completed</h3>
                <ChoreHistoryList
                  logs={logs}
                  onUndo={(log) => handleToggle(log, false)}
                  disabled={actionLoading}
                />
              </div>
            )}
          </section>

          {/* Bank & tickets section */}
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-3">Bank & Ticket Activity</h2>
            <DayActivityLog activity={activity} />
          </section>

        </div>
      )}
    </div>
  );
}
