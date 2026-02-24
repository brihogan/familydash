import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBroom } from '@fortawesome/free-solid-svg-icons';
import { choresApi } from '../api/chores.api.js';
import { familyApi } from '../api/family.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import ChoreList from '../components/chores/ChoreList.jsx';
import ChoreHistoryList from '../components/chores/ChoreHistoryList.jsx';
import ChoreProgress from '../components/chores/ChoreProgress.jsx';
import DateNav from '../components/shared/DateNav.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import Fireworks from '../components/shared/Fireworks.jsx';
import { todayISO } from '../utils/formatDate.js';
import { playVictory } from '../utils/sounds.js';

export default function KidChoresPage() {
  const { userId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isParent = user?.role === 'parent';
  const [date, setDate] = useState(todayISO());
  const [kids, setKids] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const prevDoneCountRef = useRef(null);

  useEffect(() => {
    if (!isParent) return;
    familyApi.getFamily()
      .then(({ members }) => setKids(members.filter((m) => m.role === 'kid' && m.is_active)))
      .catch(() => {});
  }, [isParent]);

  const fetchChores = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await choresApi.getChores(userId, date);
      setLogs(data.logs);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load chores.');
    } finally {
      setLoading(false);
    }
  }, [userId, date]);

  useEffect(() => { fetchChores(); }, [fetchChores]);

  // Reset the done-count tracker whenever the user navigates to a different date
  useEffect(() => { prevDoneCountRef.current = null; }, [date]);

  // Detect the moment the last chore is checked off → confetti + victory sound
  useEffect(() => {
    if (!logs.length) { prevDoneCountRef.current = 0; return; }
    const doneCount = logs.filter((l) => l.completed_at).length;
    const prev = prevDoneCountRef.current;
    if (prev !== null && doneCount > prev && doneCount === logs.length) {
      setShowConfetti(true);
      playVictory();
    }
    prevDoneCountRef.current = doneCount;
  }, [logs]);

  const handleToggle = async (log, completing) => {
    setActionLoading(true);
    try {
      if (completing) {
        await choresApi.completeChore(userId, log.id, date);
      } else {
        await choresApi.uncompleteChore(userId, log.id, date);
      }
      await fetchChores();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const pending   = logs.filter((l) => !l.completed_at);
  const completed = logs.filter((l) =>  l.completed_at);

  return (
    <div>
      {showConfetti && <Fireworks onDone={() => setShowConfetti(false)} />}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <FontAwesomeIcon icon={faBroom} className="mr-2 text-brand-500" />
            {isParent
              ? `${kids.find((k) => String(k.id) === userId)?.name ?? '…'}'s Chores`
              : 'My Chores'}
          </h1>
          {isParent && kids.length > 1 && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-xs text-gray-400">Switch to:</span>
              <select
                value={userId}
                onChange={(e) => navigate(`/chores/${e.target.value}`)}
                className="text-sm font-medium text-brand-600 border border-brand-200 rounded-lg px-2.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300 cursor-pointer hover:border-brand-400 transition-colors"
              >
                {kids.map((k) => (
                  <option key={k.id} value={String(k.id)}>{k.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <DateNav date={date} onChange={setDate} />
      </div>

      {!loading && logs.length > 0 && (
        <div className="mb-4">
          <ChoreProgress done={completed.length} total={logs.length} />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <div className="space-y-6">
          {/* Pending */}
          {pending.length > 0 ? (
            <ChoreList logs={pending} onToggle={handleToggle} disabled={actionLoading} />
          ) : logs.length > 0 ? (
            <p className="text-sm text-green-600 font-medium text-center py-3">All done for today! 🎉</p>
          ) : (
            <ChoreList logs={[]} onToggle={handleToggle} disabled={actionLoading} />
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Completed</h3>
              <ChoreHistoryList
                logs={logs}
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
