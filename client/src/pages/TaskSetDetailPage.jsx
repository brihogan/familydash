import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronDown, faPen, faTrash, faUserPlus, faGripVertical } from '@fortawesome/free-solid-svg-icons';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../context/AuthContext.jsx';
import Modal from '../components/shared/Modal.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import IconPicker, { IconDisplay } from '../components/shared/IconPicker.jsx';
import { taskSetsApi } from '../api/taskSets.api.js';
import { familyApi } from '../api/family.api.js';
import { relativeTime } from '../utils/relativeTime.js';

const TYPE_OPTIONS = ['Project', 'Award'];
const INPUT_CLS = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

const EMPTY_SET_FORM  = { name: '', type: 'Project', emoji: '', description: '', category: '', ticket_reward: 0 };
const EMPTY_STEP_FORM = { name: '', description: '' };

// ── Sortable step row ─────────────────────────────────────────────────────────
function SortableStep({ step, index, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-start gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing mt-0.5 touch-none"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <FontAwesomeIcon icon={faGripVertical} className="text-sm" />
      </button>
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 text-xs font-bold flex items-center justify-center mt-0.5">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{step.name}</p>
        {step.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{step.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onEdit(step)}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
          title="Edit step"
        >
          <FontAwesomeIcon icon={faPen} className="text-xs" />
        </button>
        <button
          onClick={() => onDelete(step.id)}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-red-200 dark:border-red-800 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          title="Delete step"
        >
          <FontAwesomeIcon icon={faTrash} className="text-xs" />
        </button>
      </div>
    </div>
  );
}

export default function TaskSetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isParent = user?.role === 'parent';

  // ── Data ──────────────────────────────────────────────────────────────────
  const [taskSet, setTaskSet] = useState(null);
  const [steps,   setSteps]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // ── History ───────────────────────────────────────────────────────────────
  const [history,       setHistory]       = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all');

  // ── Task-set edit modal ───────────────────────────────────────────────────
  const [setModal,       setSetModal]       = useState(false);
  const [setForm,        setSetForm]        = useState(EMPTY_SET_FORM);
  const [setSaving,      setSetSaving]      = useState(false);
  const [setFormErr,     setSetFormErr]     = useState('');
  const [pickerOpen,     setPickerOpen]     = useState(false);
  const [allCategories,  setAllCategories]  = useState([]);
  const triggerRef = useRef(null);

  // ── Assign modal ──────────────────────────────────────────────────────────
  const [assignees,         setAssignees]         = useState([]);
  const [allUsers,          setAllUsers]          = useState([]);
  const [assignedIds,       setAssignedIds]       = useState(new Set());
  const [completionCounts,  setCompletionCounts]  = useState({});
  const [confirmUnassign,   setConfirmUnassign]   = useState(null); // { user, count }
  const [assignOpen,        setAssignOpen]        = useState(false);
  const [assignSaving,      setAssignSaving]      = useState(false);
  const [assignError,       setAssignError]       = useState('');

  // ── Step modal ────────────────────────────────────────────────────────────
  const [stepModal,  setStepModal]  = useState(false);
  const [editStep,   setEditStep]   = useState(null);
  const [stepForm,   setStepForm]   = useState(EMPTY_STEP_FORM);
  const [stepSaving, setStepSaving] = useState(false);
  const [stepError,  setStepError]  = useState('');

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(steps, oldIndex, newIndex);
    setSteps(reordered); // optimistic
    try {
      await taskSetsApi.reorderSteps(id, reordered.map((s, i) => ({ id: s.id, sort_order: i + 1 })));
    } catch {
      setSteps(steps); // revert on failure
    }
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchTaskSet = useCallback(async () => {
    try {
      const fetches = [
        taskSetsApi.getTaskSet(id),
        familyApi.getFamily(),
        taskSetsApi.getAssignments(id),
      ];
      if (isParent) fetches.push(taskSetsApi.getHistory(id));
      const [data, familyData, assignData, histData] = await Promise.all(fetches);
      setTaskSet(data.taskSet);
      setSteps(data.steps);
      const members = familyData.members.filter((m) => m.is_active);
      setAllUsers(members);
      const ids = new Set(assignData.assignedUserIds);
      setAssignedIds(ids);
      setAssignees(members.filter((m) => ids.has(m.id)));
      setCompletionCounts(assignData.completionCounts ?? {});
      setConfirmUnassign(null);
      if (histData) setHistory(histData.history ?? []);
    } catch {
      setError('Failed to load task set.');
    } finally {
      setLoading(false);
    }
  }, [id, isParent]);

  useEffect(() => { fetchTaskSet(); }, [fetchTaskSet]);
  useEffect(() => { if (!setModal) setPickerOpen(false); }, [setModal]);

  // ── Task-set edit ─────────────────────────────────────────────────────────
  const openEditSet = async () => {
    setSetForm({
      name:          taskSet.name,
      type:          taskSet.type,
      emoji:         taskSet.emoji  || '',
      description:   taskSet.description || '',
      category:      taskSet.category || '',
      ticket_reward: taskSet.ticket_reward ?? 0,
    });
    setSetFormErr('');
    setPickerOpen(false);
    setSetModal(true);
    try {
      const data = await taskSetsApi.getTaskSets();
      setAllCategories([...new Set(data.taskSets.map((ts) => ts.category).filter(Boolean))].sort());
    } catch { /* suggestions are optional */ }
  };

  const handleSetSubmit = async (e) => {
    e.preventDefault();
    if (!setForm.name.trim()) { setSetFormErr('Name is required.'); return; }
    setSetSaving(true);
    setSetFormErr('');
    try {
      const updated = await taskSetsApi.updateTaskSet(id, {
        name:          setForm.name.trim(),
        type:          setForm.type,
        emoji:         setForm.emoji.trim() || null,
        description:   setForm.description.trim(),
        category:      setForm.category.trim(),
        ticket_reward: Number(setForm.ticket_reward) || 0,
      });
      setTaskSet(updated);
      setSetModal(false);
    } catch (err) {
      setSetFormErr(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSetSaving(false);
    }
  };

  // ── Steps ─────────────────────────────────────────────────────────────────
  const openAddStep = () => {
    setEditStep(null);
    setStepForm(EMPTY_STEP_FORM);
    setStepError('');
    setStepModal(true);
  };

  const openEditStep = (step) => {
    setEditStep(step);
    setStepForm({ name: step.name, description: step.description || '' });
    setStepError('');
    setStepModal(true);
  };

  const handleStepSubmit = async (e) => {
    e.preventDefault();
    if (!stepForm.name.trim()) { setStepError('Name is required.'); return; }
    setStepSaving(true);
    setStepError('');
    try {
      const payload = { name: stepForm.name.trim(), description: stepForm.description.trim() };
      if (editStep) {
        const updated = await taskSetsApi.updateStep(id, editStep.id, payload);
        setSteps((prev) => prev.map((s) => s.id === editStep.id ? updated : s));
      } else {
        const created = await taskSetsApi.createStep(id, payload);
        setSteps((prev) => [...prev, created]);
      }
      setStepModal(false);
    } catch (err) {
      setStepError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setStepSaving(false);
    }
  };

  const handleDeleteStep = async (stepId) => {
    if (!confirm('Delete this step?')) return;
    try {
      await taskSetsApi.deleteStep(id, stepId);
      setSteps((prev) => prev.filter((s) => s.id !== stepId));
    } catch {
      setError('Failed to delete step.');
    }
  };

  // ── Assign ────────────────────────────────────────────────────────────────
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
      await taskSetsApi.setAssignments(id, [...assignedIds]);
      setAssignees(allUsers.filter((u) => assignedIds.has(u.id)));
      setAssignOpen(false);
    } catch (err) {
      setAssignError(err.response?.data?.error || 'Failed to save assignments.');
    } finally {
      setAssignSaving(false);
    }
  };

  // ── History derived data ──────────────────────────────────────────────────
  const historyUsers = useMemo(() => {
    const seen = new Map();
    for (const h of history) {
      if (!seen.has(h.user_id)) {
        seen.set(h.user_id, { user_id: h.user_id, user_name: h.user_name, avatar_color: h.avatar_color, avatar_emoji: h.avatar_emoji });
      }
    }
    return [...seen.values()];
  }, [history]);

  const filteredHistory = historyFilter === 'all'
    ? history
    : history.filter((h) => String(h.user_id) === historyFilter);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <LoadingSkeleton rows={4} />;

  if (error || !taskSet) return (
    <div className="text-center py-12">
      <p className="text-red-500 text-sm mb-3">{error || 'Task set not found.'}</p>
      <button onClick={() => navigate(-1)} className="text-brand-600 text-sm hover:underline">
        ← Go back
      </button>
    </div>
  );

  return (
    <div>

      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">

          {/* Left: back + emoji + title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="flex-shrink-0 p-1 text-gray-400 dark:text-gray-500 hover:text-brand-600 transition-colors"
              title="Back"
            >
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <span className="text-2xl flex-shrink-0 text-gray-800 dark:text-gray-200">
              <IconDisplay value={taskSet.emoji} fallback="📋" />
            </span>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {taskSet.name}
            </h1>
          </div>

          {/* Right: category pill + edit button */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            {taskSet.category && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-100 border border-brand-200 dark:border-brand-500/30 rounded-full">
                {taskSet.category}
              </span>
            )}
            {isParent && (
              <button
                onClick={openEditSet}
                className="text-xs px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors"
              >
                <FontAwesomeIcon icon={faPen} className="mr-1" />
                Edit
              </button>
            )}
          </div>
        </div>

        {taskSet.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 ml-9">
            {taskSet.description}
          </p>
        )}
        {taskSet.ticket_reward > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 ml-9">
            🎟 {taskSet.ticket_reward} tickets on completion
          </p>
        )}
      </div>

      {/* ── Assignments bar ── */}
      {isParent && (
        <div className="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-gray-100 dark:border-gray-700">
          {/* Left: assigned users */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {assignees.length === 0 ? (
              <span className="text-xs text-gray-400 dark:text-gray-500">Not assigned to anyone</span>
            ) : (
              assignees.map((u) => {
                const count     = completionCounts[u.id] ?? 0;
                const total     = steps.length;
                const pct       = total > 0 ? Math.round((count / total) * 100) : 0;
                const isDone    = total > 0 && count >= total;
                return (
                  <div
                    key={u.id}
                    onClick={() => navigate(`/tasks/${u.id}/${id}`)}
                    className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: u.avatar_color }}
                    >
                      {u.avatar_emoji || u.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{u.name}</span>
                    {pct > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${
                        isDone
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300'
                      }`}>
                        {isDone ? '✓' : `${pct}%`}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {/* Right: Assign button */}
          <button
            onClick={() => { setAssignError(''); setAssignOpen(true); }}
            disabled={steps.length === 0}
            title={steps.length === 0 ? 'Add steps before assigning' : undefined}
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors flex-shrink-0 ${
              steps.length > 0
                ? 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600'
                : 'border-gray-100 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
            }`}
          >
            <FontAwesomeIcon icon={faUserPlus} />
            Assign
            {assignees.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-gray-400">
                {assignees.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── Steps header ── */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Steps
        </span>
        {isParent && (
          <button
            onClick={openAddStep}
            className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs rounded-lg font-medium transition-colors"
          >
            + Add Step
          </button>
        )}
      </div>

      {/* ── Steps list ── */}
      {steps.length === 0 ? (
        <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
          No steps yet.{isParent && ' Click "+ Add Step" to create one.'}
        </div>
      ) : isParent ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <SortableStep
                  key={step.id}
                  step={step}
                  index={i}
                  onEdit={openEditStep}
                  onDelete={handleDeleteStep}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div
              key={step.id}
              className="flex items-start gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm"
            >
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{step.name}</p>
                {step.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{step.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── History ── */}
      {isParent && history.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              History
            </span>
            {historyUsers.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setHistoryFilter('all')}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    historyFilter === 'all'
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400'
                  }`}
                >
                  All
                </button>
                {historyUsers.map((u) => (
                  <button
                    key={u.user_id}
                    onClick={() => setHistoryFilter(String(u.user_id))}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
                      historyFilter === String(u.user_id)
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: u.avatar_color || '#6366f1' }}
                    />
                    {u.user_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            {filteredHistory.map((item, i) => {
              const icon  = item.event_type === 'taskset_completed'   ? '🎯'
                          : item.event_type === 'taskset_uncompleted' ? '↩️'
                          : item.event_type === 'taskset_reset'       ? '🔄'
                          : '📍';
              const label = item.event_type === 'taskset_completed'   ? 'completed all steps'
                          : item.event_type === 'taskset_uncompleted' ? 'completion was reversed'
                          : item.event_type === 'taskset_reset'       ? 'was reset'
                          : 'was assigned';
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm">
                  <span className="text-base shrink-0 w-5 text-center">{icon}</span>
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: item.avatar_color || '#6366f1' }}
                  >
                    {item.avatar_emoji || item.user_name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{item.user_name}</span>
                    <span className="text-gray-500 dark:text-gray-400"> {label}</span>
                  </span>
                  {item.amount_cents != null && (
                    <span className={`text-xs font-medium tabular-nums flex-shrink-0 ${
                      item.amount_cents > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'
                    }`}>
                      {item.amount_cents > 0 ? '+' : ''}{item.amount_cents} 🎟
                    </span>
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                    {relativeTime(item.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Assign modal ── */}
      <Modal
        open={assignOpen}
        onClose={() => { if (!assignSaving) setAssignOpen(false); }}
        title={`Assign — ${taskSet.name}`}
      >
        <div className="space-y-3">
          {assignError && <p className="text-sm text-red-500">{assignError}</p>}
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
                  {count > 0 && (
                    <span className="text-xs text-brand-600 dark:text-brand-400 font-medium flex-shrink-0">
                      {count} step{count !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    selected ? 'bg-brand-500 border-brand-500' : 'border-gray-300 dark:border-gray-600'
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
      </Modal>

      {/* ── Task-set edit modal ── */}
      <Modal
        open={setModal}
        onClose={() => { if (!setSaving) setSetModal(false); }}
        title="Edit Task Set"
      >
        <form onSubmit={handleSetSubmit} className="space-y-4">
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
                {setForm.emoji
                  ? <IconDisplay value={setForm.emoji} />
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
                value={setForm.name}
                onChange={(e) => setSetForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={200}
                required
                className={INPUT_CLS}
              />
            </div>
          </div>

          {pickerOpen && (
            <IconPicker
              anchorRef={triggerRef}
              value={setForm.emoji}
              onChange={(v) => setSetForm((f) => ({ ...f, emoji: v }))}
              onSelect={(v) => { setSetForm((f) => ({ ...f, emoji: v })); setPickerOpen(false); }}
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
                  onClick={() => setSetForm((f) => ({ ...f, type: t }))}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    setForm.type === t
                      ? 'bg-brand-500 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              {setForm.type === 'Project'
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
              value={setForm.description}
              onChange={(e) => setSetForm((f) => ({ ...f, description: e.target.value }))}
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
              value={setForm.category}
              onChange={(e) => setSetForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Morning Routine"
              maxLength={100}
              list="category-suggestions-detail"
              className={INPUT_CLS}
            />
            <datalist id="category-suggestions-detail">
              {allCategories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ticket Reward <span className="text-xs text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <input
              type="number"
              value={setForm.ticket_reward}
              onChange={(e) => setSetForm((f) => ({ ...f, ticket_reward: e.target.value }))}
              min="0"
              className={INPUT_CLS}
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Tickets awarded when all steps are completed.</p>
          </div>

          {setFormErr && <p className="text-sm text-red-500">{setFormErr}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={setSaving}
              className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {setSaving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => { if (!setSaving) setSetModal(false); }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Step add / edit modal ── */}
      <Modal
        open={stepModal}
        onClose={() => { if (!stepSaving) setStepModal(false); }}
        title={editStep ? 'Edit Step' : 'Add Step'}
      >
        <form onSubmit={handleStepSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={stepForm.name}
              onChange={(e) => setStepForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Wake up by 7am"
              maxLength={200}
              required
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description <span className="text-xs text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <textarea
              value={stepForm.description}
              onChange={(e) => setStepForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="More details about this step…"
              maxLength={500}
              rows={3}
              className={`${INPUT_CLS} resize-none`}
            />
          </div>

          {stepError && <p className="text-sm text-red-500">{stepError}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={stepSaving}
              className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {stepSaving ? 'Saving…' : editStep ? 'Save Changes' : 'Add Step'}
            </button>
            <button
              type="button"
              onClick={() => { if (!stepSaving) setStepModal(false); }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
