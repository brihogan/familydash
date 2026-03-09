import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import { IconDisplay } from '../components/shared/IconPicker.jsx';
import { taskSetsApi } from '../api/taskSets.api.js';
import { familyApi } from '../api/family.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDate } from '../utils/formatDate.js';

const TYPE_OPTIONS = ['Project', 'Award'];

// Preserves pre-sorted order (no alpha sort within groups)
function makeGroups(taskSets) {
  const result = [];
  for (const type of TYPE_OPTIONS) {
    const typeItems = taskSets.filter((ts) => ts.type === type);
    if (typeItems.length === 0) continue;
    const cats = [...new Set(typeItems.map((ts) => ts.category).filter(Boolean))].sort();
    const subGroups = cats.map((cat) => ({
      label: cat,
      items: typeItems.filter((ts) => ts.category === cat),
    }));
    const uncategorized = typeItems.filter((ts) => !ts.category);
    if (uncategorized.length > 0) subGroups.push({ label: 'Uncategorized', items: uncategorized });
    result.push({ label: type, subGroups });
  }
  return result;
}

export default function KidTrophiesPage() {
  const { userId } = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const isParent   = user?.role === 'parent';

  const [trophies,    setTrophies]    = useState([]);
  const [memberName,  setMemberName]  = useState('');
  const [kids,        setKids]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  const fetchTrophies = useCallback(async () => {
    setLoading(true);
    try {
      const [taskData, familyData] = await Promise.all([
        taskSetsApi.getUserTaskSets(userId),
        familyApi.getFamily(),
      ]);
      const completed = taskData.taskSets
        .filter((ts) => ts.type === 'Award' && ts.step_count > 0 && ts.completed_count === ts.step_count)
        .sort((a, b) => {
          if (!a.earned_at && !b.earned_at) return 0;
          if (!a.earned_at) return 1;
          if (!b.earned_at) return -1;
          return b.earned_at.localeCompare(a.earned_at);
        });
      setTrophies(completed);
      const member = familyData.members.find((m) => m.id === parseInt(userId, 10));
      if (member) setMemberName(member.name);
      if (isParent) setKids(familyData.members.filter((m) => (m.role === 'kid' || !!m.chores_enabled) && m.is_active));
    } catch {
      setError('Failed to load trophies.');
    } finally {
      setLoading(false);
    }
  }, [userId, isParent]);

  useEffect(() => { fetchTrophies(); }, [fetchTrophies]);

  const SPARKLE_POSITIONS = [
    { top: '6%',  left: '10%', delay: '0s',   dur: '1.4s' },
    { top: '4%',  left: '72%', delay: '0.5s', dur: '1.1s' },
    { top: '25%', left: '88%', delay: '0.9s', dur: '1.6s' },
    { top: '14%', left: '48%', delay: '0.3s', dur: '1.2s' },
  ];

  const renderBadgeCard = (ts) => {
    const earnedDate = ts.earned_at ? formatDate(ts.earned_at.slice(0, 10)) : null;
    const shimmerDelay    = `${((ts.id * 1_234_567) % 5000) / 1000}s`;
    const shimmerDuration = `${9 + ((ts.id * 9_876_543) % 5000) / 1000}s`;
    const isRecent = !!ts.earned_at && (() => {
      const d = new Date(ts.earned_at.replace(' ', 'T') + 'Z');
      return Date.now() - d.getTime() < 60 * 60 * 1000;
    })();
    return (
      <div
        key={ts.id}
        className={`relative flex flex-col items-center p-2.5 bg-gradient-to-b from-amber-50 to-white dark:from-amber-900/20 dark:to-gray-800 border-2 rounded-xl shadow-sm ${
          isRecent ? 'border-amber-400 dark:border-amber-400/70' : 'border-amber-300 dark:border-amber-500/40'
        }`}
        style={isRecent ? { animation: 'trophy-glow 2s ease-in-out infinite' } : undefined}
      >
        {isRecent && SPARKLE_POSITIONS.map((sp, i) => (
          <span
            key={i}
            className="absolute text-yellow-400 text-[9px] leading-none pointer-events-none select-none"
            style={{ top: sp.top, left: sp.left, animation: `trophy-sparkle-dot ${sp.dur} ease-in-out ${sp.delay} infinite` }}
            aria-hidden="true"
          >✦</span>
        ))}
        <div
          className="relative mb-2 flex-shrink-0"
          style={{ width: 56, height: 56 }}
        >
          <div className="absolute -inset-1 rounded-full bg-amber-400 opacity-30 blur-md pointer-events-none" />
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 shadow-lg" />
          <div className="absolute inset-[4px] rounded-full bg-gradient-to-br from-yellow-50 via-yellow-100 to-amber-200 dark:from-yellow-200 dark:via-amber-200 dark:to-amber-300 flex items-center justify-center text-xl leading-none overflow-hidden">
            <IconDisplay value={ts.emoji} fallback="🏆" />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(105deg, transparent 25%, rgba(255,255,255,0.90) 50%, transparent 75%)',
                animation: `badge-shimmer ${shimmerDuration} ease-in-out ${shimmerDelay} infinite`,
              }}
            />
          </div>
        </div>
        <p className="font-medium text-xs text-gray-900 dark:text-gray-100 text-center leading-snug line-clamp-2">
          {ts.name}
        </p>
        {earnedDate && (
          <span className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 leading-tight">
            {earnedDate}
          </span>
        )}
      </div>
    );
  };

  const grouped = makeGroups(trophies);

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
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {subGroups[0].items.map(renderBadgeCard)}
            </div>
          ) : (
            <div className="space-y-4">
              {subGroups.map(({ label: catLabel, items }) => (
                <div key={catLabel}>
                  <div className="pb-1.5 pl-2 mb-2 border-l-2 border-gray-200 dark:border-gray-700 flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {catLabel}
                    </span>
                    <span className="text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-1.5 py-0.5 leading-none">
                      {items.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {items.map(renderBadgeCard)}
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
        <div className="flex items-center gap-2 pb-3 border-b border-amber-200 dark:border-amber-700/40">
          <span className="text-lg">🏆</span>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-xl text-amber-700 dark:text-amber-400 leading-tight">
              {isParent ? `${memberName || '…'}'s Trophy Shelf` : 'My Trophy Shelf'}
            </h1>
            {!loading && (
              <p className="text-xs text-amber-600/70 dark:text-amber-500/70">
                {trophies.length} {trophies.length === 1 ? 'achievement' : 'achievements'} earned
              </p>
            )}
          </div>
        </div>
        {isParent && kids.length > 1 && (
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">Switch to:</span>
            <select
              value={userId}
              onChange={(e) => navigate(`/trophies/${e.target.value}`)}
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
      ) : trophies.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
          No achievements yet. Keep completing tasks!
        </div>
      ) : (
        renderGroups(grouped)
      )}
    </div>
  );
}
