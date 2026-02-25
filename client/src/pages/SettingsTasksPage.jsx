import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboardCheck, faPen, faTrash, faChevronDown, faUserPlus } from '@fortawesome/free-solid-svg-icons';
import Modal from '../components/shared/Modal.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import IconPicker, { IconDisplay } from '../components/shared/IconPicker.jsx';
import { taskSetsApi } from '../api/taskSets.api.js';
import { familyApi } from '../api/family.api.js';

const TYPE_OPTIONS = ['Project', 'Award'];

const EMPTY_FORM = { name: '', type: 'Project', emoji: '', description: '', category: '', ticket_reward: 0 };

const INPUT_CLS = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

export default function SettingsTasksPage() {
  const navigate = useNavigate();
  const [taskSets,   setTaskSets]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  // Edit modal state
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const triggerRef = useRef(null);

  // Assign modal state
  const [assignTarget,      setAssignTarget]      = useState(null);
  const [assignOpen,        setAssignOpen]        = useState(false);
  const [allUsers,          setAllUsers]          = useState([]);
  const [assignedIds,       setAssignedIds]       = useState(new Set());
  const [completionCounts,  setCompletionCounts]  = useState({});
  const [confirmUnassign,   setConfirmUnassign]   = useState(null); // { user, count }
  const [assignLoading,     setAssignLoading]     = useState(false);
  const [assignSaving,      setAssignSaving]      = useState(false);
  const [assignError,       setAssignError]       = useState('');

  // Delete confirm modal state
  const [deleteTarget,    setDeleteTarget]    = useState(null);
  const [deleteOpen,      setDeleteOpen]      = useState(false);
  const [deleteAssignees, setDeleteAssignees] = useState([]);
  const [deleteLoading,   setDeleteLoading]   = useState(false);
  const [deleting,        setDeleting]        = useState(false);

  // Close picker whenever the edit modal closes
  useEffect(() => { if (!modalOpen) setPickerOpen(false); }, [modalOpen]);

  const fetchTaskSets = useCallback(async () => {
    try {
      const data = await taskSetsApi.getTaskSets();
      setTaskSets(data.taskSets);
    } catch {
      setError('Failed to load task sets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTaskSets(); }, [fetchTaskSets]);

  // ── Edit modal ────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setPickerOpen(false);
    setModalOpen(true);
  };

  const openEdit = (ts) => {
    setEditTarget(ts);
    setForm({ name: ts.name, type: ts.type, emoji: ts.emoji || '', description: ts.description || '', category: ts.category || '', ticket_reward: ts.ticket_reward ?? 0 });
    setFormError('');
    setPickerOpen(false);
    setModalOpen(true);
  };

  const handleClose = () => { if (!saving) setModalOpen(false); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name:          form.name.trim(),
        type:          form.type,
        emoji:         form.emoji.trim() || null,
        description:   form.description.trim(),
        category:      form.category.trim(),
        ticket_reward: Number(form.ticket_reward) || 0,
      };
      if (editTarget) {
        await taskSetsApi.updateTaskSet(editTarget.id, payload);
      } else {
        await taskSetsApi.createTaskSet(payload);
      }
      setModalOpen(false);
      fetchTaskSets();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirm = async (ts) => {
    setDeleteTarget(ts);
    setDeleteAssignees([]);
    setDeleteLoading(true);
    setDeleteOpen(true);
    try {
      const [familyData, assignData] = await Promise.all([
        familyApi.getFamily(),
        taskSetsApi.getAssignments(ts.id),
      ]);
      const assignedSet = new Set(assignData.assignedUserIds);
      setDeleteAssignees(familyData.members.filter((u) => assignedSet.has(u.id)));
    } catch {
      // non-critical — modal still shows without the list
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await taskSetsApi.deleteTaskSet(deleteTarget.id);
      setTaskSets((prev) => prev.filter((ts) => ts.id !== deleteTarget.id));
      setDeleteOpen(false);
    } catch {
      setError('Failed to delete task set.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Assign modal ──────────────────────────────────────────────────────────

  const openAssign = async (ts) => {
    setAssignTarget(ts);
    setAssignError('');
    setAssignLoading(true);
    setAssignOpen(true);
    try {
      const [familyData, assignData] = await Promise.all([
        familyApi.getFamily(),
        taskSetsApi.getAssignments(ts.id),
      ]);
      setAllUsers(familyData.members.filter((u) => u.is_active));
      setAssignedIds(new Set(assignData.assignedUserIds));
      setCompletionCounts(assignData.completionCounts ?? {});
      setConfirmUnassign(null);
    } catch {
      setAssignError('Failed to load assignment data.');
    } finally {
      setAssignLoading(false);
    }
  };

  const toggleUser = (u) => {
    const isSelected = assignedIds.has(u.id);
    const count = completionCounts[u.id] ?? 0;
    if (isSelected && count > 0) {
      setConfirmUnassign({ user: u, count });
      return;
    }
    setAssignedIds((prev) => {
      const next = new Set(prev);
      next.has(u.id) ? next.delete(u.id) : next.add(u.id);
      return next;
    });
  };

  const confirmUnassignUser = () => {
    setAssignedIds((prev) => { const next = new Set(prev); next.delete(confirmUnassign.user.id); return next; });
    setConfirmUnassign(null);
  };

  const handleSaveAssign = async () => {
    setAssignSaving(true);
    setAssignError('');
    try {
      await taskSetsApi.setAssignments(assignTarget.id, [...assignedIds]);
      const newCount = assignedIds.size;
      setTaskSets((prev) =>
        prev.map((ts) => ts.id === assignTarget.id ? { ...ts, assignment_count: newCount } : ts)
      );
      setAssignOpen(false);
    } catch (err) {
      setAssignError(err.response?.data?.error || 'Failed to save assignments.');
    } finally {
      setAssignSaving(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const allCategories = [...new Set(taskSets.map((ts) => ts.category).filter(Boolean))].sort();

  const grouped = (() => {
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
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            <FontAwesomeIcon icon={faClipboardCheck} className="mr-2 text-brand-500" />
            Sets &amp; Steps
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            Create and manage task sets for kids.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg font-medium transition-colors"
        >
          + Add Set
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
          No task sets yet. Click "+ Add Set" to create one.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ label, subGroups }) => {
            const renderRow = (ts) => (
              <div
                key={ts.id}
                onClick={() => navigate(`/task/${ts.id}`)}
                className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm cursor-pointer hover:border-brand-300 dark:hover:border-brand-500/50 transition-colors"
              >
                <span className="w-8 text-center flex-shrink-0 text-xl leading-none text-gray-700 dark:text-gray-300">
                  <IconDisplay value={ts.emoji} fallback="📋" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{ts.name}</p>
                    {ts.step_count > 0 && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {ts.step_count} {ts.step_count === 1 ? 'step' : 'steps'}
                      </span>
                    )}
                    {ts.ticket_reward > 0 && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0">🎟 {ts.ticket_reward}</span>
                    )}
                  </div>
                  {ts.description && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{ts.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); openAssign(ts); }}
                    disabled={!ts.step_count}
                    title={!ts.step_count ? 'Add steps before assigning' : undefined}
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors ${
                      ts.step_count
                        ? 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600'
                        : 'border-gray-100 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    <FontAwesomeIcon icon={faUserPlus} />
                    Assign
                    {ts.assignment_count > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-gray-400">
                        {ts.assignment_count}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(ts); }}
                    className="text-xs px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors"
                  >
                    <FontAwesomeIcon icon={faPen} className="mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openDeleteConfirm(ts); }}
                    className="text-xs px-2.5 py-1 rounded-md border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <FontAwesomeIcon icon={faTrash} className="mr-1" />
                    Delete
                  </button>
                </div>
              </div>
            );

            return (
              <div key={label}>
                <div className="pb-2 px-1">
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {label}
                  </span>
                </div>
                {subGroups.length === 1 ? (
                  <div className="space-y-2">{subGroups[0].items.map(renderRow)}</div>
                ) : (
                  <div className="space-y-4">
                    {subGroups.map(({ label: catLabel, items }) => (
                      <div key={catLabel}>
                        <div className="pb-1.5 pl-2 mb-2 border-l-2 border-gray-200 dark:border-gray-700">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {catLabel}
                          </span>
                        </div>
                        <div className="space-y-2">{items.map(renderRow)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit / Create Modal ─────────────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={handleClose} title={editTarget ? 'Edit Set' : 'Add Set'}>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Emoji / Name row */}
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Emoji / Icon
              </label>
              <button
                ref={triggerRef}
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className={`w-16 h-[38px] flex items-center justify-center gap-1 border rounded-lg text-xl transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                  pickerOpen
                    ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10'
                    : 'border-gray-300 dark:border-gray-600 dark:bg-gray-700 hover:border-brand-400'
                }`}
              >
                {form.emoji
                  ? <IconDisplay value={form.emoji} />
                  : <span className="text-gray-300 dark:text-gray-500 text-lg">+</span>
                }
                <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] text-gray-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Morning Routine"
                maxLength={200}
                required
                className={INPUT_CLS}
              />
            </div>
          </div>

          {pickerOpen && (
            <IconPicker
              anchorRef={triggerRef}
              value={form.emoji}
              onChange={(v) => setForm((f) => ({ ...f, emoji: v }))}
              onSelect={(v) => { setForm((f) => ({ ...f, emoji: v })); setPickerOpen(false); }}
              onClose={() => setPickerOpen(false)}
            />
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    form.type === t
                      ? 'bg-brand-500 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              {form.type === 'Project'
                ? <><strong className="text-gray-700 dark:text-gray-300">Project:</strong> Can be assigned repeatedly — once all steps are finished it stays on the kid's list for the rest of the day, then resets overnight so it can be assigned again. Great for complicated chores or multi-step routines.</>
                : <><strong className="text-gray-700 dark:text-gray-300">Award:</strong> Assigned once. When completed it moves to the kid's Trophy Shelf permanently. Great for badges, achievements, scavenger hunts, and one-time milestones.</>
              }
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description <span className="text-xs text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Briefly describe this task set…"
              maxLength={1000}
              rows={3}
              className={`${INPUT_CLS} resize-none`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category <span className="text-xs text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Morning Routine"
              maxLength={100}
              list="category-suggestions-settings"
              className={INPUT_CLS}
            />
            <datalist id="category-suggestions-settings">
              {allCategories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ticket Reward <span className="text-xs text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <input
              type="number"
              value={form.ticket_reward}
              onChange={(e) => setForm((f) => ({ ...f, ticket_reward: e.target.value }))}
              min="0"
              className={INPUT_CLS}
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Tickets awarded when all steps are completed.</p>
          </div>

          {formError && <p className="text-sm text-red-500">{formError}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Set'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirm Modal ────────────────────────────────────────────── */}
      <Modal
        open={deleteOpen}
        onClose={() => { if (!deleting) setDeleteOpen(false); }}
        title="Delete Task Set"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
          </p>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5 text-sm text-red-700 dark:text-red-400">
            This will permanently delete the task set and remove it from every family member it's currently assigned to.
          </div>

          {deleteLoading ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">Checking assignments…</p>
          ) : deleteAssignees.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Currently assigned to
              </p>
              <div className="space-y-1.5">
                {deleteAssignees.map((u) => (
                  <div key={u.id} className="flex items-center gap-2.5">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: u.avatar_color }}
                    >
                      {u.avatar_emoji || u.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{u.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{u.role}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button
              onClick={confirmDelete}
              disabled={deleting || deleteLoading}
              className="flex-1 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Assign Modal ────────────────────────────────────────────────────── */}
      <Modal
        open={assignOpen}
        onClose={() => { if (!assignSaving) setAssignOpen(false); }}
        title={assignTarget ? `Assign — ${assignTarget.name}` : 'Assign'}
      >
        {assignLoading ? (
          <LoadingSkeleton rows={3} />
        ) : (
          <div className="space-y-3">
            {assignError && (
              <p className="text-sm text-red-500">{assignError}</p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Toggle family members to assign or un-assign this task set.
            </p>
            {confirmUnassign && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Are you sure? This will clear {confirmUnassign.count} completed step{confirmUnassign.count !== 1 ? 's' : ''} for {confirmUnassign.user.name}.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={confirmUnassignUser}
                    className="flex-1 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Yes, unassign
                  </button>
                  <button
                    onClick={() => setConfirmUnassign(null)}
                    className="flex-1 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {allUsers.map((u) => {
                const selected = assignedIds.has(u.id);
                const count = completionCounts[u.id] ?? 0;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUser(u)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      selected
                        ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10'
                        : 'border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-500/50'
                    }`}
                  >
                    {/* Avatar */}
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: u.avatar_color }}
                    >
                      {u.avatar_emoji || u.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{u.name}</span>
                      <span className="block text-xs text-gray-400 dark:text-gray-500 capitalize">{u.role}</span>
                    </span>
                    {/* Step completion count */}
                    {count > 0 && (
                      <span className="text-xs text-brand-600 dark:text-brand-400 font-medium flex-shrink-0">
                        {count} step{count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {/* Checkbox indicator */}
                    <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      selected
                        ? 'bg-brand-500 border-brand-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {selected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveAssign}
                disabled={assignSaving}
                className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {assignSaving ? 'Saving…' : 'Save Assignments'}
              </button>
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                disabled={assignSaving}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
