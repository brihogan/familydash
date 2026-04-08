import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { inboxApi } from '../api/inbox.api.js';
import useOfflineInbox from '../offline/hooks/useOfflineInbox.js';
import Avatar from '../components/shared/Avatar.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import { relativeTime } from '../utils/relativeTime.js';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';

export default function InboxPage() {
  const navigate = useNavigate();
  const { choresLabel } = useFamilySettings();
  const { kids, loading, refresh: fetchInbox } = useOfflineInbox();
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set()); // "chore:id" or "step:id"

  const allChoreIds = kids.flatMap((k) => k.chores.map((c) => c.id));
  const allStepIds  = kids.flatMap((k) => k.steps.map((s) => s.id));
  const allSetIds   = kids.flatMap((k) => (k.setCompletions || []).map((s) => s.id));
  const totalCount  = allChoreIds.length + allStepIds.length + allSetIds.length;

  const handleApproveAll = async () => {
    setActionLoading(true);
    try {
      await inboxApi.approve({ chore_log_ids: allChoreIds, step_completion_ids: allStepIds, set_completion_ids: allSetIds });
      await fetchInbox();
      setSelectMode(false);
      setSelected(new Set());
    } catch { setError('Failed to approve.'); } finally { setActionLoading(false); }
  };

  const handleDenyAll = async () => {
    setActionLoading(true);
    try {
      await inboxApi.deny({ chore_log_ids: allChoreIds, step_completion_ids: allStepIds, set_completion_ids: allSetIds });
      await fetchInbox();
      setSelectMode(false);
      setSelected(new Set());
    } catch { setError('Failed to deny.'); } finally { setActionLoading(false); }
  };

  const handleApproveSelected = async () => {
    const choreIds = [], stepIds = [], setIds = [];
    for (const key of selected) {
      const [type, id] = key.split(':');
      if (type === 'chore') choreIds.push(Number(id));
      else if (type === 'step') stepIds.push(Number(id));
      else if (type === 'set') setIds.push(Number(id));
    }
    setActionLoading(true);
    try {
      await inboxApi.approve({ chore_log_ids: choreIds, step_completion_ids: stepIds, set_completion_ids: setIds });
      await fetchInbox();
      setSelected(new Set());
    } catch { setError('Failed to approve.'); } finally { setActionLoading(false); }
  };

  const handleDenySelected = async () => {
    const choreIds = [], stepIds = [], setIds = [];
    for (const key of selected) {
      const [type, id] = key.split(':');
      if (type === 'chore') choreIds.push(Number(id));
      else if (type === 'step') stepIds.push(Number(id));
      else if (type === 'set') setIds.push(Number(id));
    }
    setActionLoading(true);
    try {
      await inboxApi.deny({ chore_log_ids: choreIds, step_completion_ids: stepIds, set_completion_ids: setIds });
      await fetchInbox();
      setSelected(new Set());
    } catch { setError('Failed to deny.'); } finally { setActionLoading(false); }
  };

  const handleApproveItem = async (type, id) => {
    setActionLoading(true);
    try {
      const body = { chore_log_ids: [], step_completion_ids: [], set_completion_ids: [] };
      if (type === 'chore') body.chore_log_ids = [id];
      else if (type === 'step') body.step_completion_ids = [id];
      else if (type === 'set') body.set_completion_ids = [id];
      await inboxApi.approve(body);
      await fetchInbox();
    } catch { setError('Failed to approve.'); } finally { setActionLoading(false); }
  };

  const handleUndoItem = async (type, id) => {
    setActionLoading(true);
    try {
      const body = { chore_log_ids: [], step_completion_ids: [], set_completion_ids: [] };
      if (type === 'chore') body.chore_log_ids = [id];
      else if (type === 'step') body.step_completion_ids = [id];
      else if (type === 'set') body.set_completion_ids = [id];
      await inboxApi.deny(body);
      await fetchInbox();
    } catch { setError('Failed to undo.'); } finally { setActionLoading(false); }
  };

  const handleDismissNotification = async (id) => {
    setActionLoading(true);
    try {
      await inboxApi.dismissNotifications([id]);
      await fetchInbox();
    } catch { setError('Failed to dismiss.'); } finally { setActionLoading(false); }
  };

  const toggleSelect = (key) =>
    setSelected((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });

  if (loading) return <LoadingSkeleton rows={4} />;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Inbox</h1>
          {totalCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 rounded-full">
              {totalCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {totalCount > 0 && !selectMode && (
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
          )}
          {selectMode && (
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

      {/* ── Empty state ── */}
      {kids.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <p className="text-5xl mb-4">✅</p>
          <p className="text-lg font-medium">All caught up!</p>
          <p className="text-sm mt-1">No items waiting for approval.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {kids.map((kid) => {
            const notifications = kid.notifications || [];
            const pendingCount  = kid.chores.length + kid.steps.length + (kid.setCompletions || []).length;
            const itemCount     = pendingCount + notifications.length;
            const showInline = kids.length <= 1 || itemCount <= 5;

            return (
              <div key={kid.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                {/* Kid header */}
                <div className="flex items-center gap-3 mb-3">
                  <Avatar name={kid.name} color={kid.avatar_color} emoji={kid.avatar_emoji} size="sm" />
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{kid.name}</span>
                  <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                    {itemCount} item{itemCount !== 1 ? 's' : ''}
                  </span>
                </div>

                {showInline ? (() => {
                  const stepsBySet = kid.steps.reduce((acc, s) => {
                    if (!acc[s.task_set_id]) acc[s.task_set_id] = { name: s.task_set_name, emoji: s.task_set_emoji, steps: [] };
                    acc[s.task_set_id].steps.push(s);
                    return acc;
                  }, {});

                  const renderItem = (type, id, title, subtitle, key) => {
                    const isSelected = selected.has(key);
                    return (
                      <div
                        key={id}
                        onClick={selectMode ? () => toggleSelect(key) : undefined}
                        className={`flex items-center gap-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg transition-colors ${selectMode ? 'cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30' : ''}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{title}</p>
                          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
                        </div>
                        {!selectMode && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => handleApproveItem(type, id)} disabled={actionLoading}
                              className="text-xs text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700 px-2 py-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50 transition-colors">
                              Approve
                            </button>
                            <button onClick={() => handleUndoItem(type, id)} disabled={actionLoading}
                              className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors">
                              Undo
                            </button>
                          </div>
                        )}
                        {selectMode && (
                          <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${isSelected ? 'bg-brand-600 border-brand-600' : 'border-gray-300 dark:border-gray-500'}`}>
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

                  return (
                    <div className="space-y-4">
                      {sortedDays.length > 0 && sortedDays.map((day) => (
                        <div key={day}>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            {choresLabel} — {formatDayLabel(day)}
                          </p>
                          <div className="space-y-2">
                            {choresByDay[day].map((chore) => renderItem('chore', chore.id, chore.chore_name, relativeTime(chore.completed_at), `chore:${chore.id}`))}
                          </div>
                        </div>
                      ))}
                      {Object.entries(stepsBySet).map(([tsId, group]) => {
                        const s0 = group.steps[0];
                        const willComplete = s0.approved_step_count + group.steps.length >= s0.total_step_count;
                        const isLastStep = group.steps.length === 1 && willComplete;
                        const reward = s0.task_set_ticket_reward || 0;
                        return (
                          <div key={tsId}>
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{group.emoji || '📋'} {group.name}</p>
                            {willComplete && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                                {isLastStep ? 'Final step — ' : 'Approving all steps '}completes this set{reward > 0 ? ` (+${reward} 🎟)` : ''}
                              </p>
                            )}
                            <div className="space-y-2">
                              {group.steps.map((step) => renderItem('step', step.id, step.step_name, null, `step:${step.id}`))}
                            </div>
                          </div>
                        );
                      })}
                      {(kid.setCompletions || []).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Completed Sets</p>
                          <div className="space-y-2">
                            {kid.setCompletions.map((sc) => renderItem('set', sc.id, `${sc.task_set_emoji || '📋'} ${sc.task_set_name}`, `All steps completed — awaiting approval${sc.ticket_reward > 0 ? ` (+${sc.ticket_reward} 🎟)` : ''}`, `set:${sc.id}`))}
                          </div>
                        </div>
                      )}
                      {notifications.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notifications</p>
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
                  );
                })() : (
                  /* ── Collapsed row (>3) ── */
                  <button
                    onClick={() => navigate(`/inbox/${kid.id}`)}
                    className="w-full flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                  >
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      {itemCount} items pending review
                    </span>
                    <span className="text-amber-500 dark:text-amber-400">→</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
