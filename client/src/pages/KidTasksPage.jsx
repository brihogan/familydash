import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMedal } from '@fortawesome/free-solid-svg-icons';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import KidProfilePicker from '../components/shared/KidProfilePicker.jsx';
import { IconDisplay } from '../components/shared/IconPicker.jsx';
import { taskSetsApi } from '../api/taskSets.api.js';
import { familyApi } from '../api/family.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';

export default function KidTasksPage() {
  const { userId } = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const { useTickets } = useFamilySettings();
  const isParent   = user?.role === 'parent';

  const [taskSets,   setTaskSets]   = useState([]);
  const [memberName, setMemberName] = useState('');
  const [kids,       setKids]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const [taskData, familyData] = await Promise.all([
        taskSetsApi.getUserTaskSets(userId),
        familyApi.getFamily(),
      ]);
      setTaskSets(taskData.taskSets);
      const member = familyData.members.find((m) => m.id === parseInt(userId, 10));
      if (member) setMemberName(member.name);
      if (isParent) setKids(familyData.members.filter((m) => (m.role === 'kid' || !!m.chores_enabled) && m.is_active));
    } catch {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [userId, isParent]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Filter: keep incomplete sets, completed Projects (stay for the day),
  // and completed Awards earned today (visible until end of day, then only on Trophy Shelf)
  const isToday = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr.replace(' ', 'T') + 'Z');
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth()    === now.getMonth()    &&
           d.getDate()     === now.getDate();
  };

  const sortedSets = taskSets
    .filter((ts) => {
      const done = ts.step_count > 0 && ts.completed_count === ts.step_count;
      if (!done) return true;
      if (ts.type === 'Project') return true;
      // Keep pending-approval sets visible
      if (ts.completion_status === 'pending' || (ts.pending_step_count ?? 0) > 0) return true;
      return isToday(ts.earned_at);
    })
    .sort((a, b) => {
      const typeOrder = (t) => (t === 'Project' ? 0 : 1);
      if (typeOrder(a.type) !== typeOrder(b.type)) return typeOrder(a.type) - typeOrder(b.type);
      return a.name.localeCompare(b.name);
    });

  const renderCard = (ts) => {
    const pct  = ts.step_count > 0 ? Math.round((ts.completed_count / ts.step_count) * 100) : 0;
    const done = ts.step_count > 0 && ts.completed_count === ts.step_count;
    const size = 80;
    const sw   = 4;
    const r    = (size - sw * 2) / 2;
    const circ = 2 * Math.PI * r;
    return (
      <div
        key={ts.id}
        onClick={() => navigate(`/tasks/${userId}/${ts.id}`)}
        className={`flex flex-col items-center p-4 bg-white dark:bg-gray-800 border rounded-xl shadow-sm cursor-pointer transition-colors ${
          done
            ? 'border-green-300 dark:border-green-700'
            : 'border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-500/50'
        }`}
      >
        {/* Progress ring + emoji */}
        <div className="relative mb-3 flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke="currentColor" strokeWidth={sw}
              className="text-gray-200 dark:text-gray-600"
            />
            {ts.step_count > 0 && (
              <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke="currentColor" strokeWidth={sw}
                strokeDasharray={circ}
                strokeDashoffset={circ - (pct / 100) * circ}
                strokeLinecap="round"
                className={done ? 'text-green-500' : 'text-brand-500'}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-3xl leading-none">
            <IconDisplay value={ts.emoji} fallback="📋" />
          </div>
        </div>

        {/* Name */}
        <p className="font-medium text-sm text-gray-900 dark:text-gray-100 text-center leading-snug line-clamp-2">
          {ts.name}
        </p>

        {/* Type + category pills */}
        <div className="flex flex-wrap items-center justify-center gap-1 mt-1.5">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            ts.type === 'Project'
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          }`}>
            {ts.type}
          </span>
          {ts.category && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              {ts.category}
            </span>
          )}
        </div>

        {/* Completion / progress */}
        {done && (ts.completion_status === 'pending' || (ts.pending_step_count ?? 0) > 0) && (
          <span className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">⏳ Awaiting approval</span>
        )}
        {done && ts.completion_status !== 'pending' && !(ts.pending_step_count > 0) && (
          <span className="mt-1.5 text-xs font-medium text-green-600 dark:text-green-400">Completed today!</span>
        )}
        {ts.description && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 text-center line-clamp-2">{ts.description}</p>
        )}
        {ts.step_count > 0 && !done && (
          <span className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
            {ts.completed_count}/{ts.step_count}
            {useTickets && ts.ticket_reward > 0 && <span className="text-amber-600 dark:text-amber-400">🎟 {ts.ticket_reward}</span>}
          </span>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 min-w-0">
        <FontAwesomeIcon icon={faMedal} className="text-brand-500 text-2xl shrink-0" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
          {isParent ? `${memberName || '…'}'s Sets` : 'My Sets'}
        </h1>
      </div>
      {isParent && kids.length > 1 && (
        <KidProfilePicker kids={kids} currentId={userId} routePrefix="/tasks" />
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : sortedSets.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">No tasks assigned yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {sortedSets.map(renderCard)}
        </div>
      )}
    </div>
  );
}
