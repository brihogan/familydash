import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import KidProfilePicker from '../components/shared/KidProfilePicker.jsx';
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
  const { user }   = useAuth();
  const isParent   = user?.role === 'parent';

  const [trophies,        setTrophies]        = useState([]);
  const [streaks,         setStreaks]         = useState({ current: 0, longest: 0 });
  const [savingsStreak,   setSavingsStreak]   = useState(null);
  const [crownStreak,     setCrownStreak]     = useState({ current: 0, longest: 0 });
  const [hasKingOfCrowns, setHasKingOfCrowns] = useState(false);
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
        .filter((ts) => ts.type === 'Award' && ts.step_count > 0 && ts.completed_count === ts.step_count
          && ts.completion_status !== 'pending' && !(ts.pending_step_count > 0))
        .sort((a, b) => {
          if (!a.earned_at && !b.earned_at) return 0;
          if (!a.earned_at) return 1;
          if (!b.earned_at) return -1;
          return b.earned_at.localeCompare(a.earned_at);
        });
      setTrophies(completed);
      setStreaks(taskData.streaks ?? { current: 0, longest: 0 });
      setSavingsStreak(taskData.savingsStreak ?? null);
      setCrownStreak(taskData.crownStreak ?? { current: 0, longest: 0 });
      setHasKingOfCrowns(taskData.hasKingOfCrowns ?? false);
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
      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-amber-200 dark:border-amber-700/40">
        <span className="text-lg shrink-0">🏆</span>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-xl text-amber-700 dark:text-amber-400 leading-tight truncate">
            {isParent ? `${memberName || '…'}'s Trophy Shelf` : 'My Trophy Shelf'}
          </h1>
          {!loading && (
            <p className="text-xs text-amber-600/70 dark:text-amber-500/70">
              {trophies.length + (hasKingOfCrowns ? 1 : 0)} {trophies.length + (hasKingOfCrowns ? 1 : 0) === 1 ? 'achievement' : 'achievements'} earned
            </p>
          )}
        </div>
      </div>
      {isParent && kids.length > 1 && (
        <KidProfilePicker kids={kids} currentId={userId} routePrefix="/trophies" />
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="space-y-6">
          {/* ── System Trophies ── */}
          <div>
            <div className="pb-2 px-1">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Special
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              <div className="relative flex flex-col items-center p-2.5 bg-gradient-to-b from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 border-2 rounded-xl shadow-sm border-blue-300 dark:border-blue-500/40">
                <div
                  className="relative mb-2 flex-shrink-0"
                  style={{ width: 56, height: 56 }}
                >
                  <div className="absolute -inset-1 rounded-full bg-blue-400 opacity-30 blur-md pointer-events-none" />
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-sky-300 via-blue-400 to-indigo-500 shadow-lg" />
                  <div className="absolute inset-[4px] rounded-full bg-gradient-to-br from-sky-50 via-blue-100 to-blue-200 dark:from-sky-200 dark:via-blue-200 dark:to-blue-300 flex items-center justify-center text-xl leading-none overflow-hidden">
                    🔥
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: 'linear-gradient(105deg, transparent 25%, rgba(255,255,255,0.90) 50%, transparent 75%)',
                        animation: 'badge-shimmer 10s ease-in-out infinite',
                      }}
                    />
                  </div>
                </div>
                <p className="font-bold text-lg tabular-nums text-blue-600 dark:text-blue-400 leading-tight">
                  {streaks.current}
                </p>
                <p className="font-medium text-[10px] text-gray-700 dark:text-gray-300 text-center leading-snug">
                  Daily Streak
                </p>
                {streaks.longest > 0 && (
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">
                    Best: {streaks.longest}
                  </p>
                )}
              </div>
              <div className="relative flex flex-col items-center p-2.5 bg-gradient-to-b from-purple-50 to-white dark:from-purple-900/20 dark:to-gray-800 border-2 rounded-xl shadow-sm border-purple-300 dark:border-purple-500/40">
                <div
                  className="relative mb-2 flex-shrink-0"
                  style={{ width: 56, height: 56 }}
                >
                  <div className="absolute -inset-1 rounded-full bg-purple-400 opacity-30 blur-md pointer-events-none" />
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-300 via-purple-400 to-purple-600 shadow-lg" />
                  <div className="absolute inset-[4px] rounded-full bg-gradient-to-br from-violet-50 via-purple-100 to-purple-200 dark:from-violet-200 dark:via-purple-200 dark:to-purple-300 flex items-center justify-center text-xl leading-none overflow-hidden">
                    👑
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: 'linear-gradient(105deg, transparent 25%, rgba(255,255,255,0.90) 50%, transparent 75%)',
                        animation: 'badge-shimmer 11s ease-in-out 1s infinite',
                      }}
                    />
                  </div>
                </div>
                <p className="font-bold text-lg tabular-nums text-purple-600 dark:text-purple-400 leading-tight">
                  {crownStreak.current}
                </p>
                <p className="font-medium text-[10px] text-gray-700 dark:text-gray-300 text-center leading-snug">
                  Crown Streak
                </p>
                {crownStreak.longest > 0 && (
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">
                    Best: {crownStreak.longest}
                  </p>
                )}
              </div>
              {savingsStreak && (
                <div className="relative flex flex-col items-center p-2.5 bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-900/20 dark:to-gray-800 border-2 rounded-xl shadow-sm border-emerald-300 dark:border-emerald-500/40">
                  <div
                    className="relative mb-2 flex-shrink-0"
                    style={{ width: 56, height: 56 }}
                  >
                    <div className="absolute -inset-1 rounded-full bg-emerald-400 opacity-30 blur-md pointer-events-none" />
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-green-300 via-emerald-400 to-teal-500 shadow-lg" />
                    <div className="absolute inset-[4px] rounded-full bg-gradient-to-br from-green-50 via-emerald-100 to-emerald-200 dark:from-green-200 dark:via-emerald-200 dark:to-emerald-300 flex items-center justify-center text-xl leading-none overflow-hidden">
                      🏦
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: 'linear-gradient(105deg, transparent 25%, rgba(255,255,255,0.90) 50%, transparent 75%)',
                          animation: 'badge-shimmer 12s ease-in-out 2s infinite',
                        }}
                      />
                    </div>
                  </div>
                  <p className="font-bold text-lg tabular-nums text-emerald-600 dark:text-emerald-400 leading-tight">
                    {savingsStreak.current}
                  </p>
                  <p className="font-medium text-[10px] text-gray-700 dark:text-gray-300 text-center leading-snug">
                    Savings Streak
                  </p>
                  {savingsStreak.longest > 0 && (
                    <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">
                      Best: {savingsStreak.longest}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Moving Trophies ── */}
          {hasKingOfCrowns && (
            <div>
              <div className="pb-2 px-1">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Moving Trophies
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {renderBadgeCard({ id: -1, emoji: '👑', name: 'King of Crowns', earned_at: null, category: null })}
              </div>
            </div>
          )}

          {/* ── Earned Awards ── */}
          {trophies.length === 0 && !hasKingOfCrowns ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
              No achievements yet. Keep completing tasks!
            </div>
          ) : trophies.length > 0 ? (
            renderGroups(grouped)
          ) : null}
        </div>
      )}
    </div>
  );
}
