import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { inboxApi } from '../api/inbox.api.js';
import Avatar from '../components/shared/Avatar.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import { relativeTime } from '../utils/relativeTime.js';

export default function InboxPage() {
  const navigate = useNavigate();
  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set()); // "chore:id" or "step:id"

  const fetchInbox = useCallback(async () => {
    setError('');
    try {
      const data = await inboxApi.getInbox();
      setKids(data.kids);
      window.dispatchEvent(new CustomEvent('inbox-updated'));
    } catch {
      setError('Failed to load inbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  const allChoreIds = kids.flatMap((k) => k.chores.map((c) => c.id));
  const allStepIds  = kids.flatMap((k) => k.steps.map((s) => s.id));
  const totalCount  = allChoreIds.length + allStepIds.length;

  const handleApproveAll = async () => {
    setActionLoading(true);
    try {
      await inboxApi.approve({ chore_log_ids: allChoreIds, step_completion_ids: allStepIds });
      await fetchInbox();
      setSelectMode(false);
      setSelected(new Set());
    } catch { setError('Failed to approve.'); } finally { setActionLoading(false); }
  };

  const handleDenyAll = async () => {
    setActionLoading(true);
    try {
      await inboxApi.deny({ chore_log_ids: allChoreIds, step_completion_ids: allStepIds });
      await fetchInbox();
      setSelectMode(false);
      setSelected(new Set());
    } catch { setError('Failed to deny.'); } finally { setActionLoading(false); }
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
      await fetchInbox();
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
      await fetchInbox();
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
      await fetchInbox();
    } catch { setError('Failed to approve.'); } finally { setActionLoading(false); }
  };

  const handleUndoItem = async (type, id) => {
    setActionLoading(true);
    try {
      const body = type === 'chore'
        ? { chore_log_ids: [id], step_completion_ids: [] }
        : { chore_log_ids: [], step_completion_ids: [id] };
      await inboxApi.deny(body);
      await fetchInbox();
    } catch { setError('Failed to undo.'); } finally { setActionLoading(false); }
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
            const itemCount  = kid.chores.length + kid.steps.length;
            const showInline = kids.length <= 1 || itemCount <= 5;

            return (
              <div key={kid.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                {/* Kid header */}
                <div className="flex items-center gap-3 mb-3">
                  <Avatar name={kid.name} color={kid.avatar_color} emoji={kid.avatar_emoji} size="sm" />
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{kid.name}</span>
                  <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                    {itemCount} item{itemCount !== 1 ? 's' : ''} pending
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
                            Chores — {formatDayLabel(day)}
                          </p>
                          <div className="space-y-2">
                            {choresByDay[day].map((chore) => renderItem('chore', chore.id, chore.chore_name, relativeTime(chore.completed_at), `chore:${chore.id}`))}
                          </div>
                        </div>
                      ))}
                      {Object.entries(stepsBySet).map(([tsId, group]) => (
                        <div key={tsId}>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{group.emoji || '📋'} {group.name}</p>
                          <div className="space-y-2">
                            {group.steps.map((step) => renderItem('step', step.id, step.step_name, null, `step:${step.id}`))}
                          </div>
                        </div>
                      ))}
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
