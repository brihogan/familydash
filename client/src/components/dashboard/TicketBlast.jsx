import { useState, useCallback, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faFloppyDisk, faTicket } from '@fortawesome/free-solid-svg-icons';
import Avatar from '../shared/Avatar.jsx';
import { ticketsApi } from '../../api/tickets.api.js';
import db from '../../offline/db.js';
import { enqueue } from '../../offline/mutationQueue.js';
import { showToast } from '../shared/Toast.jsx';

// ── Draggable ticket token ───────────────────────────────────────────────────

function DraggableTicket({ id, source }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { source },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`w-10 h-10 rounded-full bg-amber-400 dark:bg-amber-500 flex items-center justify-center text-white text-lg shadow-md cursor-grab active:cursor-grabbing select-none touch-none transition-opacity ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      🎟
    </div>
  );
}

// ── Floating overlay ticket (follows pointer) ────────────────────────────────

function TicketOverlay() {
  return (
    <div className="w-12 h-12 rounded-full bg-amber-400 dark:bg-amber-500 flex items-center justify-center text-white text-xl shadow-xl scale-110">
      🎟
    </div>
  );
}

// ── Animated ticket that flies to the bucket ─────────────────────────────────

function FlyingTicket({ from, to, onDone }) {
  return (
    <div
      className="fixed z-[200] pointer-events-none"
      style={{
        left: from.x,
        top: from.y,
        animation: 'fly-to-bucket 400ms ease-in forwards',
        '--fly-dx': `${to.x - from.x}px`,
        '--fly-dy': `${to.y - from.y}px`,
      }}
      onAnimationEnd={onDone}
    >
      <div className="w-10 h-10 rounded-full bg-amber-400 dark:bg-amber-500 flex items-center justify-center text-white text-lg shadow-lg">
        🎟
      </div>
    </div>
  );
}

// ── Kid card (droppable) ─────────────────────────────────────────────────────

function KidCard({ member, delta }) {
  const { isOver, setNodeRef } = useDroppable({ id: `kid-${member.id}` });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border-2 transition-all select-none ${
        isOver
          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 scale-[1.03]'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      }`}
    >
      <Avatar name={member.name} color={member.avatarColor} emoji={member.avatarEmoji} size="sm" />
      <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate w-full text-center">{member.name}</span>

      {/* Delta display */}
      <span
        className={`text-xl font-bold tabular-nums leading-none ${
          delta > 0
            ? 'text-green-600 dark:text-green-400'
            : delta < 0
              ? 'text-red-500 dark:text-red-400'
              : 'text-gray-400 dark:text-gray-500'
        }`}
      >
        {delta > 0 ? `+${delta}` : delta}
      </span>

      {/* Always show a draggable token so user can remove tickets */}
      <DraggableTicket id={`kid-${member.id}-remove`} source={member.id} />
    </div>
  );
}

// ── Bucket (droppable + contains draggable tickets) ──────────────────────────

const Bucket = ({ bucketRef }) => {
  const { isOver, setNodeRef } = useDroppable({ id: 'bucket' });

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        bucketRef.current = node;
      }}
      className={`flex items-center justify-center gap-3 px-6 py-4 rounded-2xl border-2 border-dashed transition-all ${
        isOver
          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
          : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50'
      }`}
    >
      {/* Infinite supply of draggable tickets */}
      {Array.from({ length: 6 }, (_, i) => (
        <DraggableTicket key={`bucket-t-${i}`} id={`bucket-t-${i}`} source="bucket" />
      ))}
    </div>
  );
};

// ── CSS keyframes (injected once) ────────────────────────────────────────────

const styleId = 'ticket-blast-fly';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes fly-to-bucket {
      0%   { transform: translate(0, 0) scale(1); opacity: 1; }
      100% { transform: translate(var(--fly-dx), var(--fly-dy)) scale(0.5); opacity: 0.3; }
    }
  `;
  document.head.appendChild(style);
}

// ── Main component ───────────────────────────────────────────────────────────

export default function TicketBlast({ members, onDone, onRefresh }) {
  const kids = members.filter((m) => m.role === 'kid');
  const [deltas, setDeltas] = useState(() =>
    Object.fromEntries(kids.map((k) => [k.id, 0])),
  );
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [flyingTickets, setFlyingTickets] = useState([]);
  const bucketRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } }),
  );

  const spawnFlyingTicket = useCallback((dropX, dropY) => {
    if (!bucketRef.current) return;
    const rect = bucketRef.current.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2 - 20; // center of 40px token
    const targetY = rect.top + rect.height / 2 - 20;
    const id = Date.now() + Math.random();
    setFlyingTickets((prev) => [...prev, { id, from: { x: dropX - 20, y: dropY - 20 }, to: { x: targetX, y: targetY } }]);
  }, []);

  const removeFlyingTicket = useCallback((id) => {
    setFlyingTickets((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback((event) => {
    setActiveId(null);
    const { active, over } = event;
    const sourceId = active.data.current?.source;

    // Figure out drop position for animation
    // activatorEvent is the pointer event that started the drag;
    // dnd-kit doesn't expose the final pointer pos directly,
    // but we can compute it from the initial rect + delta.
    const initialRect = active.rect.current.translated;
    const dropX = initialRect ? initialRect.left + initialRect.width / 2 : 0;
    const dropY = initialRect ? initialRect.top + initialRect.height / 2 : 0;

    if (sourceId === 'bucket') {
      // From bucket → kid card: increment that kid
      if (over && typeof over.id === 'string' && over.id.startsWith('kid-')) {
        const kidId = Number(over.id.replace('kid-', ''));
        setDeltas((prev) => ({ ...prev, [kidId]: prev[kidId] + 1 }));
      }
      // Dropped on bucket or nowhere: no-op
    } else {
      // From a kid card → anywhere except same card = remove ticket
      const fromKidId = sourceId;
      const droppedOnSameCard = over && over.id === `kid-${fromKidId}`;

      if (!droppedOnSameCard) {
        setDeltas((prev) => ({ ...prev, [fromKidId]: prev[fromKidId] - 1 }));
        // Animate ticket flying to bucket
        spawnFlyingTicket(dropX, dropY);
      }
    }
  }, [spawnFlyingTicket]);

  const hasChanges = Object.values(deltas).some((d) => d !== 0);

  const handleSave = async () => {
    setSaving(true);
    const description = 'Ticket Blast';
    try {
      const adjustments = Object.entries(deltas).filter(([, d]) => d !== 0);
      for (const [kidId, amount] of adjustments) {
        const uid = Number(kidId);
        // Optimistic Dexie update
        await db.dashboardMembers.where('id').equals(uid).modify((member) => {
          member.ticketBalance = (member.ticketBalance || 0) + amount;
        });
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
        await db.ticketLedger.add({
          odxId: -Date.now() - uid, userId: uid, user_id: uid,
          amount, type: 'manual', description,
          reference_id: null, reference_type: null, created_at: now,
        });

        if (navigator.onLine) {
          try {
            await ticketsApi.adjustTickets(uid, { amount, description });
          } catch (err) {
            if (!err.response || err.response.status >= 500) {
              await enqueue('ADJUST_TICKETS', { userId: uid, amount, description });
            }
          }
        } else {
          await enqueue('ADJUST_TICKETS', { userId: uid, amount, description });
        }
      }

      if (!navigator.onLine) {
        showToast('Saved locally — will sync when online');
      } else {
        showToast('Tickets blasted! 🎟');
        const { tryFlush } = await import('../../offline/syncEngine.js');
        tryFlush();
      }

      onRefresh();
      onDone();
    } catch (err) {
      showToast('Error saving tickets');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
          <FontAwesomeIcon icon={faTicket} className="mr-2 text-amber-500" />
          Ticket Blast
        </h2>
        <button
          onClick={onDone}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Close"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        Drag tickets from the bucket onto a kid. Drag off a kid to remove.
      </p>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Kid cards — 2-col grid on mobile, 3+ on wider */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {kids.map((kid) => (
            <KidCard key={kid.id} member={kid} delta={deltas[kid.id]} />
          ))}
        </div>

        {/* Bucket */}
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 text-center">
            Ticket Bucket
          </p>
          <Bucket bucketRef={bucketRef} />
        </div>

        <DragOverlay dropAnimation={null}>
          {activeId ? <TicketOverlay /> : null}
        </DragOverlay>
      </DndContext>

      {/* Flying ticket animations */}
      {flyingTickets.map((ft) => (
        <FlyingTicket key={ft.id} from={ft.from} to={ft.to} onDone={() => removeFlyingTicket(ft.id)} />
      ))}

      {/* Save / Cancel */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <FontAwesomeIcon icon={faFloppyDisk} className="mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          onClick={onDone}
          className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
