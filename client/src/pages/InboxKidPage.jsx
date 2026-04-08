import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import { inboxApi } from '../api/inbox.api.js';
import useOfflineInbox from '../offline/hooks/useOfflineInbox.js';
import Avatar from '../components/shared/Avatar.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import { relativeTime } from '../utils/relativeTime.js';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';

export default function InboxKidPage() {
  const { kidId } = useParams();
  const navigate  = useNavigate();
  const { choresLabel } = useFamilySettings();

  const { kids, loading, refresh: fetchKidInbox } = useOfflineInbox();
  const kid = kids.find((k) => String(k.id) === kidId) || null;
  const [error,         setError]         = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [selectMode,    setSelectMode]    = useState(false);
  const [selected,      setSelected]      = useState(new Set());

  if (loading) return (
    <div>
      <button onClick={() => navigate('/inbox')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 transition-colors">
        <FontAwesomeIcon icon={faChevronLeft} className="text-xs" /> Back to Inbox
      </button>
      <LoadingSkeleton rows={4} />
    </div>
  );

  if (!kid) return (
    <div>
      <button onClick={() => navigate('/inbox')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 transition-colors">
        <FontAwesomeIcon icon={faChevronLeft} className="text-xs" /> Back to Inbox
      </button>
      <p className="text-sm text-gray-500 dark:text-gray-400">No pending items for this kid.</p>
    </div>
  );

  const allChoreIds = kid.chores.map((c) => c.id);
  const allStepIds  = kid.steps.map((s) => s.id);
  const notifications = kid.notifications || [];
  const totalCount  = allChoreIds.length + allStepIds.length + notifications.length;

  // Group steps by task_set_id
  const stepsByTaskSet = kid.steps.reduce((acc, step) => {
    if (!acc[step.task_set_id]) acc[step.task_set_id] = { name: step.task_set_name, emoji: step.task_set_emoji, steps: [] };
    acc[step.task_set_id].steps.push(step);
    return acc;
  }, {});

  const handleApproveAll = async () => {
    setActionLoading(true);
    try {
      await inboxApi.approve({ chore_log_ids: allChoreIds, step_completion_ids: allStepIds });
      navigate('/inbox');
    } catch { setError('Failed to approve.'); setActionLoading(false); }
  };

  const handleDenyAll = async () => {
    setActionLoading(true);
    try {
      await inboxApi.deny({ chore_log_ids: allChoreIds, step_completion_ids: allStepIds });
      navigate('/inbox');
    } catch { setError('Failed to deny.'); setActionLoading(false); }
  };

  const handleApproveSelected = async () => {
    const choreIds = [], stepIds = [];
    for (const key of selected) {
      const [type, id] = key.split(':');
      if (type === 'chore') choreIds.push(Number(id)); else stepIds.push(Number(id));
    }
    setActionLoading(true);
    try {
      await inboxApi.approve({ chore_log_ids: choreIds, step_completion_ids: stepIds });
      await fetchKidInbox();
      setSelected(new Set());
    } catch { setError('Failed to approve.'); } finally { setActionLoading(false); }
  };

  const handleDenySelected = async () => {
    const choreIds = [], stepIds = [];
    for (const key of selected) {
      const [type, id] = key.split(':');
      if (type === 'chore') choreIds.push(Number(id)); else stepIds.push(Number(id));
    }
    setActionLoading(true);
    try {
      await inboxApi.deny({ chore_log_ids: choreIds, step_completion_ids: stepIds });
      await fetchKidInbox();
      setSelected(new Set());
    } catch { setError('Failed to deny.'); } finally { setActionLoading(false); }
  };

  const handleApproveItem = async (type, id) => {
    setActionLoading(true);
    try {
      const body = type === 'chore'
        ? { chore_log_ids: [id], step_completion_ids: [] }
        : { chore_log_ids: [], step_completion_ids: [id] };
      await inboxApi.approve(body);
      await fetchKidInbox();
    } catch { setError('Failed to approve.'); } finally { setActionLoading(false); }
  };

  const handleDismissNotification = async (id) => {
    setActionLoading(true);
    try {
      await inboxApi.dismissNotifications([id]);
      await fetchKidInbox();
    } catch { setError('Failed to dismiss.'); } finally { setActionLoading(false); }
  };

  const handleUndoItem = async (type, id) => {
    setActionLoading(true);
    try {
      const body = type === 'chore'
        ? { chore_log_ids: [id], step_completion_ids: [] }
        : { chore_log_ids: [], step_completion_ids: [id] };
      await inboxApi.deny(body);
      await fetchKidInbox();
    } catch { setError('Failed to undo.'); } finally { setActionLoading(false); }
  };

  const toggleSelect = (key) =>
    setSelected((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });

  const itemRow = (type, id, title, subtitle, key) => {
    const isSelected = selected.has(key);
    return (
    <div
      key={id}
      onClick={selectMode ? () => toggleSelect(key) : undefined}
      className={`flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg transition-colors ${selectMode ? 'cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {!selectMode && (
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); handleApproveItem(type, id); }} disabled={actionLoading}
            className="text-xs text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700 px-2 py-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50 transition-colors">
            Approve
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleUndoItem(type, id); }} disabled={actionLoading}
            className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors">
            Undo
          </button>
        </div>
      )}
      {selectMode && (
        <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
          isSelected
            ? 'bg-brand-600 border-brand-600'
            : 'border-gray-300 dark:border-gray-500'
        }`}>
          {isSelected && (
            <svg viewBox="0 0 12 10" className="w-2.5 h-2.5" fill="none">
              <polyline points="1,5 4,8 11,1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
  };

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/inbox')}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <Avatar name={kid.name} color={kid.avatar_color} emoji={kid.avatar_emoji} size="sm" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{kid.name}</h1>
          <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 rounded-full">{totalCount}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!selectMode ? (
            <>
              <button onClick={handleApproveAll} disabled={actionLoading}
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                Approve All
              </button>
              <button onClick={handleDenyAll} disabled={actionLoading}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                Deny All
              </button>
              <button onClick={() => setSelectMode(true)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Select
              </button>
            </>
          ) : (
            <>
              <button onClick={handleApproveSelected} disabled={actionLoading || selected.size === 0}
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                Approve ({selected.size})
              </button>
              <button onClick={handleDenySelected} disabled={actionLoading || selected.size === 0}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                Deny ({selected.size})
              </button>
              <button onClick={() => { setSelectMode(false); setSelected(new Set()); }}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      <div className="space-y-6">
        {/* Chores grouped by day */}
        {kid.chores.length > 0 && (() => {
          const choresByDay = kid.chores.reduce((acc, c) => {
            const day = c.log_date;
            if (!acc[day]) acc[day] = [];
            acc[day].push(c);
            return acc;
          }, {});
          const formatDayLabel = (dateStr) => {
            const today = new Date(); today.setHours(0,0,0,0);
            const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
            const [y, m, d] = dateStr.split('-').map(Number);
            const date = new Date(y, m - 1, d);
            if (date.getTime() === today.getTime()) return 'Today';
            if (date.getTime() === yesterday.getTime()) return 'Yesterday';
            return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
          };
          const sortedDays = Object.keys(choresByDay).sort((a, b) => b.localeCompare(a));
          return sortedDays.map((day) => (
            <div key={day}>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                {choresLabel} — {formatDayLabel(day)}
              </h3>
              <div className="space-y-2">
                {choresByDay[day].map((chore) =>
                  itemRow('chore', chore.id, chore.chore_name, relativeTime(chore.completed_at), `chore:${chore.id}`)
                )}
              </div>
            </div>
          ));
        })()}

        {/* Steps grouped by task set */}
        {Object.entries(stepsByTaskSet).map(([tsId, group]) => (
          <div key={tsId}>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              {group.emoji || '📋'} {group.name}
            </h3>
            <div className="space-y-2">
              {group.steps.map((step) =>
                itemRow('step', step.id, step.step_name, relativeTime(step.completed_at), `step:${step.id}`)
              )}
            </div>
          </div>
        ))}

        {notifications.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notifications</h3>
            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={`notif-${n.id}`}
                  className="flex items-center gap-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{n.body}</p>}
                  </div>
                  <button
                    onClick={() => handleDismissNotification(n.id)}
                    disabled={actionLoading}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
