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
      className={`flex items-center gap-3 bg-white border rounded-lg p-3 shadow-sm transition-colors ${
        selected ? 'border-brand-400 bg-brand-50' : 'border-gray-200'
      } ${selectMode ? 'cursor-pointer' : ''}`}
    >
      {/* Drag handle — hidden in select mode */}
      {!selectMode && (
        <button
          {...attributes}
          {...listeners}
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
        >
          ⠿
        </button>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{template.name}</p>
        {template.description && (
          <p className="text-xs text-gray-400 truncate">{template.description}</p>
        )}
      </div>

      <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full shrink-0">
        🎟 {template.ticket_reward}
      </span>

      {!selectMode && (
        <>
          <button
            onClick={() => onEdit(template)}
            className="text-xs text-blue-500 hover:underline shrink-0"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(template.id)}
            className="text-xs text-red-500 hover:underline shrink-0"
          >
            Delete
          </button>
        </>
      )}

      {selectMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(template.id)}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-gray-300 text-brand-500 accent-brand-500 cursor-pointer shrink-0"
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
