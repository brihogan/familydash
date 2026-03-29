import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBroom, faCrown } from '@fortawesome/free-solid-svg-icons';
import { inboxApi } from '../api/inbox.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import useOfflineChores from '../offline/hooks/useOfflineChores.js';
import useOfflineFamily from '../offline/hooks/useOfflineFamily.js';
import useOfflineTickets from '../offline/hooks/useOfflineTickets.js';
import ChoreList from '../components/chores/ChoreList.jsx';
import ChoreHistoryList from '../components/chores/ChoreHistoryList.jsx';
import ChoreProgress from '../components/chores/ChoreProgress.jsx';
import DateNav from '../components/shared/DateNav.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import Fireworks from '../components/shared/Fireworks.jsx';
import KidProfilePicker from '../components/shared/KidProfilePicker.jsx';
import RollingNumber from '../components/shared/RollingNumber.jsx';
import { todayISO } from '../utils/formatDate.js';
import { playVictory } from '../utils/sounds.js';
import useScrollLock from '../hooks/useScrollLock.js';

// ── Chores completion modal ────────────────────────────────────────────────────

function ChoresCompletionModal({ choreCount, onClose }) {
  useScrollLock(true);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative z-10 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs p-6 flex flex-col items-center text-center"
        style={{ animation: 'award-pop 420ms cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mb-0.5">Congrats!</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">You've completed all your chores!</p>

        {/* Broom icon in dimmed circle */}
        <div className="w-28 h-28 rounded-full bg-gray-200/70 dark:bg-gray-700/70 flex items-center justify-center mb-6">
          <FontAwesomeIcon icon={faBroom} className="text-5xl text-brand-500" />
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400">Chores completed: {choreCount}</p>

        <button
          onClick={onClose}
          className="mt-5 w-full py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function KidChoresPage() {
  const { userId } = useParams();
  const { user } = useAuth();
  const isParent = user?.role === 'parent';
  const [date, setDate] = useState(todayISO());
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfetti,     setShowConfetti]     = useState(false);
  const [showChoresModal,  setShowChoresModal]  = useState(false);
  const prevDoneCountRef = useRef(null);
  const [animateTickets, setAnimateTickets] = useState(false);

  // Offline-first hooks
  const { kids } = useOfflineFamily();
  const { logs, loading, completeChore, uncompleteChore } = useOfflineChores(userId, date);
  const { ticketBalance } = useOfflineTickets(userId);

  // Reset the done-count tracker and disable animation whenever the user or date changes
  useEffect(() => { prevDoneCountRef.current = null; setAnimateTickets(false); }, [userId, date]);

  // Detect the moment the last chore is checked off → confetti + victory sound
  useEffect(() => {
    if (!logs.length) return;
    const doneCount = logs.filter((l) => l.completed_at).length;
    const prev = prevDoneCountRef.current;
    if (prev !== null && doneCount > prev && doneCount === logs.length) {
      setShowConfetti(true);
      setShowChoresModal(true);
      playVictory();
    }
    prevDoneCountRef.current = doneCount;
  }, [logs]);

  const handleToggle = async (log, completing) => {
    setActionLoading(true);
    setAnimateTickets(true);
    try {
      if (completing) {
        await completeChore(log.id);
      } else {
        await uncompleteChore(log.id);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const pending        = logs.filter((l) => !l.completed_at);
  const waitingApproval = logs.filter((l) => l.completed_at && l.approval_status === 'pending');
  const completed      = logs.filter((l) => l.completed_at && l.approval_status !== 'pending');

  return (
    <div>
      {showConfetti && <Fireworks onDone={() => setShowConfetti(false)} />}
      {showChoresModal && (
        <ChoresCompletionModal
          choreCount={logs.length}
          onClose={() => setShowChoresModal(false)}
        />
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <FontAwesomeIcon icon={faBroom} className="text-brand-500 text-2xl shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
            {isParent ? `${kids.find((k) => String(k.id) === userId)?.name ?? '...'}'s Chores` : 'My Chores'}
          </h1>
        </div>
        <DateNav date={date} onChange={setDate} compact />
      </div>
      {isParent && kids.length > 1 && (
        <div className="flex items-center gap-3 mb-5">
          <KidProfilePicker kids={kids} currentId={userId} routePrefix="/chores" className="flex items-center gap-2 p-1 overflow-x-auto scrollbar-hide min-w-0 flex-1" />
          <Link to={`/tickets/${userId}`} className="text-2xl font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap shrink-0 hover:opacity-70 transition-opacity">
            <RollingNumber value={ticketBalance} animate={animateTickets} /> 🎟
          </Link>
        </div>
      )}

      {!loading && logs.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <ChoreProgress done={completed.length + waitingApproval.length} total={logs.length} className="flex-1 min-w-0" />
          {!isParent && (
            <>
              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 shrink-0" />
              <Link to={`/tickets/${userId}`} className="text-2xl font-semibold text-gray-800 dark:text-gray-200 shrink-0 whitespace-nowrap hover:opacity-70 transition-opacity">
                <RollingNumber value={ticketBalance} animate={animateTickets} /> 🎟
              </Link>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <div className="space-y-6">
          {/* Pending (todo) */}
          {pending.length > 0 ? (
            <ChoreList logs={pending} onToggle={handleToggle} disabled={actionLoading} />
          ) : logs.length > 0 && waitingApproval.length === 0 ? (
            <p className="text-sm text-green-600 font-medium text-center py-3">
              All done for today! <FontAwesomeIcon icon={faCrown} className="text-yellow-400 ml-1" />
            </p>
          ) : logs.length === 0 ? (
            <ChoreList logs={[]} onToggle={handleToggle} disabled={actionLoading} />
          ) : null}

          {/* Waiting for Approval */}
          {waitingApproval.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-amber-600 dark:text-amber-400">Waiting for Approval</h3>
                {isParent && waitingApproval.length > 1 && (
                  <button
                    onClick={async () => {
                      setActionLoading(true);
                      try {
                        await inboxApi.approve({ chore_log_ids: waitingApproval.map((l) => l.id), step_completion_ids: [] });
                        window.dispatchEvent(new CustomEvent('kid-stats-updated'));
                        window.dispatchEvent(new CustomEvent('inbox-updated'));
                      } catch { setError('Failed to approve.'); }
                      finally { setActionLoading(false); }
                    }}
                    disabled={actionLoading}
                    className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    Approve All
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {waitingApproval.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg"
                  >
                    <span className="text-amber-500 text-sm shrink-0">&#x23F3;</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{log.name}</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">Waiting for parent to approve</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isParent && (
                        <button
                          onClick={async () => {
                            setActionLoading(true);
                            try {
                              await inboxApi.approve({ chore_log_ids: [log.id], step_completion_ids: [] });
                              window.dispatchEvent(new CustomEvent('kid-stats-updated'));
                              window.dispatchEvent(new CustomEvent('inbox-updated'));
                            } catch { setError('Failed to approve.'); }
                            finally { setActionLoading(false); }
                          }}
                          disabled={actionLoading}
                          className="text-xs text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700 px-2 py-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50 transition-colors"
                        >
                          Approve
                        </button>
                      )}
                      <button
                        onClick={() => handleToggle(log, false)}
                        disabled={actionLoading}
                        className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                      >
                        Undo
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Completed</h3>
              <ChoreHistoryList
                logs={completed}
                onUndo={(log) => handleToggle(log, false)}
                disabled={actionLoading}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
