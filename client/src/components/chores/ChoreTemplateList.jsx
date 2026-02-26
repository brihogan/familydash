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
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faTrash } from '@fortawesome/free-solid-svg-icons';

function SortableChoreRow({ template, onEdit, onDelete, selectMode, selected, onToggleSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: template.id,
    disabled: selectMode,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={selectMode ? () => onToggleSelect(template.id) : undefined}
      className={`flex items-center gap-3 bg-white dark:bg-gray-800 border rounded-lg p-3 shadow-sm transition-colors ${
        selected ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 dark:border-gray-700'
      } ${selectMode ? 'cursor-pointer' : ''}`}
    >
      {/* Drag handle — hidden in select mode */}
      {!selectMode && (
        <button
          {...attributes}
          {...listeners}
          className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0"
        >
          ⠿
        </button>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{template.name}</p>
        {template.description && (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{template.description}</p>
        )}
      </div>

      <span className="text-xs font-medium text-amber-600 dark:text-amber-300 shrink-0">
        🎟 {template.ticket_reward}
      </span>

      {!selectMode && (
        <>
          <button
            onClick={() => onEdit(template)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors shrink-0"
            title="Edit chore"
          >
            <FontAwesomeIcon icon={faPen} className="text-xs" />
          </button>
          <button
            onClick={() => onDelete(template.id)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-red-200 dark:border-red-800 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
            title="Delete chore"
          >
            <FontAwesomeIcon icon={faTrash} className="text-xs" />
          </button>
        </>
      )}

      {selectMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(template.id)}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-500 accent-brand-500 cursor-pointer shrink-0"
        />
      )}
    </div>
  );
}

export default function ChoreTemplateList({
  templates,
  onReorder,
  onEdit,
  onDelete,
  selectMode = false,
  selectedIds = new Set(),
  onToggleSelect,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = templates.findIndex((t) => t.id === active.id);
    const newIndex = templates.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(templates, oldIndex, newIndex);
    onReorder(reordered.map((t, i) => ({ id: t.id, sort_order: i })));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={templates.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {templates.map((t) => (
            <SortableChoreRow
              key={t.id}
              template={t}
              onEdit={onEdit}
              onDelete={onDelete}
              selectMode={selectMode}
              selected={selectedIds.has(t.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
