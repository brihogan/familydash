import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMedal } from '@fortawesome/free-solid-svg-icons';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import { IconDisplay } from '../components/shared/IconPicker.jsx';
import { taskSetsApi } from '../api/taskSets.api.js';
import { familyApi } from '../api/family.api.js';
import { useAuth } from '../context/AuthContext.jsx';

const TYPE_OPTIONS = ['Project', 'Award'];

function makeGroups(taskSets) {
  const sorted = (arr) => [...arr].sort((a, b) => a.name.localeCompare(b.name));
  const result = [];
  for (const type of TYPE_OPTIONS) {
    const typeItems = taskSets.filter((ts) => ts.type === type);
    if (typeItems.length === 0) continue;
    const cats = [...new Set(typeItems.map((ts) => ts.category).filter(Boolean))].sort();
    const subGroups = cats.map((cat) => ({
      label: cat,
      items: sorted(typeItems.filter((ts) => ts.category === cat)),
    }));
    const uncategorized = sorted(typeItems.filter((ts) => !ts.category));
    if (uncategorized.length > 0) subGroups.push({ label: 'Uncategorized', items: uncategorized });
    result.push({ label: type, subGroups });
  }
  return result;
}

export default function KidTasksPage() {
  const { userId } = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();
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
      if (isParent) setKids(familyData.members.filter((m) => m.role === 'kid' && m.is_active));
    } catch {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [userId, isParent]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const activeSets = taskSets.filter((ts) => {
    const done = ts.step_count > 0 && ts.completed_count === ts.step_count;
    return !done || ts.type === 'Project';
  });
  const grouped    = makeGroups(activeSets);

  // ── Standard card (with circular progress ring) ───────────────────────────
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

        <p className="font-medium text-sm text-gray-900 dark:text-gray-100 text-center leading-snug line-clamp-2">
          {ts.name}
        </p>
        {done && (
          <span className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">Complete!</span>
        )}
        {ts.description && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 text-center line-clamp-2">{ts.description}</p>
        )}
        {ts.step_count > 0 && !done && (
          <span className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
            {ts.completed_count}/{ts.step_count}
            {ts.ticket_reward > 0 && <span className="text-amber-600 dark:text-amber-400">🎟 {ts.ticket_reward}</span>}
          </span>
        )}
      </div>
    );
  };

  // ── Grouped grid renderer ──────────────────────────────────────────────────
  const renderGroups = (groups) => (
    <div className="space-y-6">
      {groups.map(({ label, subGroups }) => (
        <div key={label}>
          <div className="pb-2 px-1">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {label}
            </span>
          </div>
          {subGroups.length === 1 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {subGroups[0].items.map(renderCard)}
            </div>
          ) : (
            <div className="space-y-4">
              {subGroups.map(({ label: catLabel, items }) => (
                <div key={catLabel}>
                  <div className="pb-1.5 pl-2 mb-2 border-l-2 border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {catLabel}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {items.map(renderCard)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          <FontAwesomeIcon icon={faMedal} className="mr-2 text-brand-500" />
          {isParent ? `${memberName || '…'}'s Tasks` : 'My Tasks'}
        </h1>
        {isParent && kids.length > 1 && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">Switch to:</span>
            <select
              value={userId}
              onChange={(e) => navigate(`/tasks/${e.target.value}`)}
              className="text-sm font-medium text-brand-600 border border-brand-200 rounded-lg px-2.5 py-1 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300 cursor-pointer hover:border-brand-400 transition-colors"
            >
              {kids.map((k) => (
                <option key={k.id} value={String(k.id)}>{k.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">No tasks assigned yet.</div>
      ) : (
        renderGroups(grouped)
      )}
    </div>
  );
}
