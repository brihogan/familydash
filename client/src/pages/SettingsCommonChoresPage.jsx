import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBroom, faChevronLeft, faPen, faTrash } from '@fortawesome/free-solid-svg-icons';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { commonChoresApi } from '../api/commonChores.api.js';
import { familyApi } from '../api/family.api.js';
import ChoreTemplateForm from '../components/chores/ChoreTemplateForm.jsx';
import Modal from '../components/shared/Modal.jsx';
import Avatar from '../components/shared/Avatar.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';

function SortableRow({ template, kids, assigningCell, onToggleAssign, isAssigned, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: template.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0 touch-none"
            aria-label="Drag to reorder"
          >
            ⠿
          </button>
          <div className="min-w-0">
            <p className="font-medium text-gray-800 dark:text-gray-200">{template.name}</p>
            {template.description && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[240px]">{template.description}</p>
            )}
            <span className="text-xs text-amber-600 dark:text-amber-300">🎟 {template.ticket_reward}</span>
          </div>
        </div>
      </td>
      {kids.map((k) => {
        const assigned = isAssigned(template, k.id);
        const cellKey = `${template.id}-${k.id}`;
        const isToggling = assigningCell === cellKey;
        return (
          <td key={k.id} className="px-3 py-3 text-center">
            <input
              type="checkbox"
              checked={assigned}
              disabled={isToggling}
              onChange={() => onToggleAssign(template.id, k.id, assigned)}
              className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-brand-500 accent-brand-500 cursor-pointer disabled:opacity-50"
            />
          </td>
        );
      })}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5 justify-end">
          <button
            onClick={() => onEdit(template)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
            title="Edit chore"
          >
            <FontAwesomeIcon icon={faPen} className="text-xs" />
          </button>
          <button
            onClick={() => onDelete(template.id)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-red-200 dark:border-red-800 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Delete chore"
          >
            <FontAwesomeIcon icon={faTrash} className="text-xs" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function SettingsCommonChoresPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');
  const [assigningCell, setAssigningCell] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchData = async () => {
    try {
      const [choresData, familyData] = await Promise.all([
        commonChoresApi.getAll(),
        familyApi.getFamily(),
      ]);
      setTemplates(choresData.templates);
      const activeKids = (familyData.members || []).filter(
        (m) => (m.role === 'kid' || !!m.chores_enabled) && m.is_active !== 0
      );
      setKids(activeKids);
    } catch {
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAdd = async ({ copyToAll, ...choreData }) => {
    setFormLoading(true);
    try {
      await commonChoresApi.create(choreData);
      setAddModal(false);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add chore.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (data) => {
    setFormLoading(true);
    try {
      await commonChoresApi.update(editTemplate.id, data);
      setEditTemplate(null);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update chore.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this common chore? It will be removed from all kids.')) return;
    try {
      await commonChoresApi.remove(id);
      fetchData();
    } catch {
      setError('Failed to delete chore.');
    }
  };

  const handleToggleAssign = async (commonId, userId, currentlyAssigned) => {
    const cellKey = `${commonId}-${userId}`;
    setAssigningCell(cellKey);
    try {
      await commonChoresApi.assign(commonId, userId, !currentlyAssigned);
      setTemplates((prev) =>
        prev.map((t) => {
          if (t.id !== commonId) return t;
          const assignments = currentlyAssigned
            ? t.assignments.filter((a) => a.userId !== userId)
            : [...t.assignments, { userId, choreTemplateId: null }];
          return { ...t, assignments };
        })
      );
    } catch {
      setError('Failed to update assignment.');
    } finally {
      setAssigningCell(null);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = templates.findIndex((t) => t.id === active.id);
    const newIndex = templates.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(templates, oldIndex, newIndex);
    setTemplates(reordered);
    try {
      await commonChoresApi.reorder(reordered.map((t, i) => ({ id: t.id, sort_order: i })));
    } catch {
      setError('Failed to save order.');
      fetchData();
    }
  };

  const isAssigned = (template, userId) =>
    template.assignments.some((a) => a.userId === userId);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/settings/users')}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Back"
            >
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              <FontAwesomeIcon icon={faBroom} className="mr-2 text-brand-500" />
              Common Chores
            </h1>
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 ml-10">
            Shared chores assigned to multiple kids at once. Drag to reorder.
          </p>
        </div>
        <button
          onClick={() => setAddModal(true)}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg font-medium transition-colors"
        >
          + Add Chore
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <FontAwesomeIcon icon={faBroom} className="text-4xl mb-3 opacity-30" />
          <p className="text-sm">No common chores yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-clip">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white dark:bg-gray-800">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[180px]">
                    Chore
                  </th>
                  {kids.map((k) => (
                    <th key={k.id} className="px-3 py-3 text-center min-w-[80px]">
                      <Link to={`/settings/chores/${k.id}`} className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity">
                        <Avatar name={k.name} color={k.avatar_color} emoji={k.avatar_emoji} size="sm" />
                        <span className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">{k.name}</span>
                      </Link>
                    </th>
                  ))}
                  <th className="px-3 py-3 w-20" />
                </tr>
              </thead>
              <SortableContext items={templates.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {templates.map((t) => (
                    <SortableRow
                      key={t.id}
                      template={t}
                      kids={kids}
                      assigningCell={assigningCell}
                      onToggleAssign={handleToggleAssign}
                      isAssigned={isAssigned}
                      onEdit={setEditTemplate}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </table>
          </DndContext>
        </div>
      )}

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Common Chore">
        <ChoreTemplateForm
          onSave={handleAdd}
          onCancel={() => setAddModal(false)}
          loading={formLoading}
        />
      </Modal>

      <Modal open={!!editTemplate} onClose={() => setEditTemplate(null)} title="Edit Common Chore">
        <ChoreTemplateForm
          initial={editTemplate}
          onSave={handleEdit}
          onCancel={() => setEditTemplate(null)}
          loading={formLoading}
        />
      </Modal>
    </div>
  );
}
