import { useState, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faFloppyDisk, faTicket } from '@fortawesome/free-solid-svg-icons';
import Avatar from '../shared/Avatar.jsx';
import useScrollLock from '../../hooks/useScrollLock.js';
import { ticketsApi } from '../../api/tickets.api.js';
import db from '../../offline/db.js';
import { enqueue } from '../../offline/mutationQueue.js';
import { showToast } from '../shared/Toast.jsx';

// ── CSS keyframes (injected once) ────────────────────────────────────────────

const styleId = 'ticket-blast-anim';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes ticket-pop {
      0%   { transform: scale(1); }
      40%  { transform: scale(1.5); }
      100% { transform: scale(1); }
    }
    @keyframes ticket-shrink {
      0%   { transform: scale(1); }
      40%  { transform: scale(0.5); }
      100% { transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}

// ── Kid card ─────────────────────────────────────────────────────────────────

function KidCard({ member, delta, onIncrement, onDecrement }) {
  const ticketRef = useRef(null);

  const animate = (name) => {
    const el = ticketRef.current;
    if (!el) return;
    el.style.animation = 'none';
    // Force reflow to restart animation
    void el.offsetWidth;
    el.style.animation = `${name} 250ms ease-out`;
  };

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x >= rect.width / 2) {
      onIncrement();
      animate('ticket-pop');
    } else {
      onDecrement();
      animate('ticket-shrink');
    }
  };

  return (
    <div
      onClick={handleClick}
      className="relative flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-all select-none cursor-pointer active:scale-95"
    >
      {/* Tap zone hints */}
      <div className="absolute inset-0 flex pointer-events-none">
        <div className="flex-1 flex items-center justify-center rounded-l-[10px] text-red-300 dark:text-red-700 text-lg font-bold opacity-40">−</div>
        <div className="flex-1 flex items-center justify-center rounded-r-[10px] text-green-300 dark:text-green-700 text-lg font-bold opacity-40">+</div>
      </div>

      <Avatar name={member.name} color={member.avatarColor} emoji={member.avatarEmoji} size="sm" />
      <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate w-full text-center relative">{member.name}</span>

      {/* Ticket with animation */}
      <span ref={ticketRef} className="text-2xl leading-none relative">🎟</span>

      {/* Delta display */}
      <span
        className={`text-xl font-bold tabular-nums leading-none relative ${
          delta > 0
            ? 'text-green-600 dark:text-green-400'
            : delta < 0
              ? 'text-red-500 dark:text-red-400'
              : 'text-gray-400 dark:text-gray-500'
        }`}
      >
        {delta > 0 ? `+${delta}` : delta}
      </span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function TicketBlast({ members, onDone, onRefresh }) {
  useScrollLock(true);
  const kids = members.filter((m) => m.role === 'kid');
  const [deltas, setDeltas] = useState(() =>
    Object.fromEntries(kids.map((k) => [k.id, 0])),
  );
  const [saving, setSaving] = useState(false);

  const hasChanges = Object.values(deltas).some((d) => d !== 0);

  const handleSave = async () => {
    setSaving(true);
    const description = 'Ticket Blast';
    try {
      const adjustments = Object.entries(deltas).filter(([, d]) => d !== 0);
      for (const [kidId, amount] of adjustments) {
        const uid = Number(kidId);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full h-full md:w-[420px] md:max-h-[85vh] md:h-auto md:rounded-2xl bg-white dark:bg-gray-900 flex flex-col overflow-hidden md:shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
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

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tap right side to add, left side to remove.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 gap-2">
            {kids.map((kid) => (
              <KidCard
                key={kid.id}
                member={kid}
                delta={deltas[kid.id]}
                onIncrement={() => setDeltas((prev) => ({ ...prev, [kid.id]: prev[kid.id] + 1 }))}
                onDecrement={() => setDeltas((prev) => ({ ...prev, [kid.id]: prev[kid.id] - 1 }))}
              />
            ))}
          </div>

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
      </div>
    </div>
  );
}
