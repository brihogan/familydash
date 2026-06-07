import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserGroup, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import KidProfilePicker from '../components/shared/KidProfilePicker.jsx';
import Avatar from '../components/shared/Avatar.jsx';
import { IconDisplay } from '../components/shared/IconPicker.jsx';
import { StepMatrixModal } from './UserTaskDetailPage.jsx';
import { familyApi } from '../api/family.api.js';
import { useAuth } from '../context/AuthContext.jsx';

// Parent view of task sets that 2+ family members are doing (regardless of
// level). Each row shows the badge/set + who's enrolled; tapping opens the
// "who's done what" progress grid for that set — as a modal OVER this list, so
// closing/back leaves you right here.
export default function SharedTaskSetsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isParent = user?.role === 'parent';

  const [items,   setItems]   = useState([]);
  const [kids,    setKids]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  // Reopen the grid if we came back here from a user's page (via that page's
  // back chevron, which carries `reopenMatrix`).
  const [matrixTarget, setMatrixTarget] = useState(() => location.state?.reopenMatrix || null);

  const load = useCallback(async () => {
    try {
      const [shared, family] = await Promise.all([
        familyApi.getSharedTaskSets(),
        familyApi.getFamily(),
      ]);
      setItems(shared.taskSets || []);
      setKids((family.members || []).filter((m) => (m.role === 'kid' || !!m.chores_enabled) && m.is_active));
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load shared task sets.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => { setLoading(true); await load(); if (!cancelled) setLoading(false); })();
    return () => { cancelled = true; };
  }, [load]);

  // Browser Back closes the matrix (instead of leaving the page): push a
  // throwaway entry when it opens, pop it on close.
  useEffect(() => {
    if (!matrixTarget) return;
    window.history.pushState({ matrix: true }, '');
    const onPop = () => setMatrixTarget(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [matrixTarget]);

  const openGrid = (item) => setMatrixTarget({ userId: item.repUserId, taskSetId: item.repTaskSetId });
  const closeMatrix = () => window.history.back(); // pops the pushed entry → popstate → close

  const kindLabel = (item) => (item.is_award ? 'Award' : item.kind === 'badge' ? 'Badge' : 'Task set');

  if (!isParent) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
        This view is for parents.
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-2xl sm:text-3xl shrink-0 bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400">
          <FontAwesomeIcon icon={faUserGroup} />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            Shared
            <span className="ml-1 text-gray-400 dark:text-gray-500 font-medium">· {items.length} set{items.length === 1 ? '' : 's'}</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Task sets 2+ family members are doing</p>
        </div>
      </div>

      {kids.length > 1 && (
        <div className="mb-5">
          <KidProfilePicker
            kids={kids}
            currentId={null}
            routePrefix="/tasks"
            sharedRoute="/tasks/shared"
            sharedSelected
            className="flex items-center gap-2 p-1 overflow-x-auto scrollbar-hide min-w-0"
          />
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
          No task sets are shared by 2 or more people yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={() => openGrid(item)}
              className="flex items-center gap-3 w-full text-left p-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-500/50 shadow-sm hover:shadow transition-all"
            >
              {/* Medallion */}
              <div
                className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0 shadow-inner"
                style={item.kind === 'badge' && !item.image_file ? { background: 'radial-gradient(circle at center, #FFFCF0 0%, #F5E6C8 100%)' } : { backgroundColor: '#6366f11A' }}
              >
                {item.kind === 'badge' && item.image_file ? (
                  <img
                    src={`/api/uploads/badges/${item.image_file}`}
                    alt=""
                    className="w-full h-full object-cover dark:brightness-90"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <span className="text-2xl leading-none">
                    <IconDisplay value={item.emoji} fallback={item.is_award ? '🏆' : item.kind === 'badge' ? '🏅' : '📋'} />
                  </span>
                )}
              </div>

              {/* Title + kind */}
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{kindLabel(item)} · {item.memberCount} people</p>
              </div>

              {/* Member avatar stack */}
              <div className="flex items-center -space-x-2 shrink-0">
                {item.members.slice(0, 4).map((m) => (
                  <div key={m.id} className="ring-2 ring-white dark:ring-gray-800 rounded-full" title={m.name}>
                    <Avatar name={m.name} color={m.avatar_color || '#6366f1'} emoji={m.avatar_emoji} size="xs" />
                  </div>
                ))}
                {item.members.length > 4 && (
                  <span className="ring-2 ring-white dark:ring-gray-800 w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 text-[10px] font-semibold text-gray-600 dark:text-gray-200 flex items-center justify-center">
                    +{item.members.length - 4}
                  </span>
                )}
              </div>

              <FontAwesomeIcon icon={faChevronRight} className="text-gray-300 dark:text-gray-600 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {matrixTarget && (
        <StepMatrixModal
          userId={matrixTarget.userId}
          taskSetId={matrixTarget.taskSetId}
          onClose={closeMatrix}
          onChanged={load}
          onNavigateUser={(u) => {
            const target = matrixTarget; // so the back chevron can reopen this grid
            setMatrixTarget(null);
            navigate(`/tasks/${u.id}/${u.taskSetId}`, { state: { backToShared: target } });
          }}
        />
      )}
    </div>
  );
}
