import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import CurrencyDisplay from './CurrencyDisplay.jsx';
import { relativeTime } from '../../utils/relativeTime.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFamilySettings } from '../../context/FamilySettingsContext.jsx';
import { choresApi } from '../../api/chores.api.js';
import { taskSetsApi } from '../../api/taskSets.api.js';
import { rewardsApi } from '../../api/rewards.api.js';

// Map each event type to the relevant page for that subject
export function getActivityPath(item) {
  switch (item.event_type) {
    case 'chore_completed':
    case 'chore_undone':
    case 'chores_all_done':
      return `/chores/${item.subject_user_id}`;
    case 'task_step_completed':
    case 'task_step_undone':
    case 'taskset_completed':
    case 'taskset_uncompleted':
    case 'taskset_reset':
      return `/tasks/${item.subject_user_id}/${item.reference_id}`;
    case 'deposit':
    case 'withdrawal':
    case 'transfer_out':
    case 'transfer_in':
    case 'allowance':
    case 'manual_adjustment':
      return `/bank/${item.subject_user_id}`;
    case 'tickets_added':
    case 'tickets_removed':
      return `/tickets/${item.subject_user_id}`;
    case 'reward_redeemed':
    case 'reward_undone':
      return `/rewards`;
    default:
      return null;
  }
}

export const EVENT_ICONS = {
  chore_completed:      '✅',
  chore_undone:         '↩️',
  chores_all_done:      '🌟',
  task_step_completed:  '☑️',
  task_step_undone:     '↩️',
  taskset_completed:    '🎯',
  taskset_uncompleted:  '↩️',
  taskset_reset:        '🔄',
  deposit:              '💵',
  withdrawal:           '💸',
  transfer_out:         '➡️',
  transfer_in:          '⬅️',
  allowance:            '🎁',
  manual_adjustment:    '🔧',
  reward_redeemed:      '🏆',
  reward_undone:        '↩️',
  tickets_added:        '🎟',
  tickets_removed:      '🎟',
};

const BANK_EVENTS   = new Set(['deposit', 'withdrawal', 'transfer_out', 'transfer_in', 'allowance', 'manual_adjustment']);
const TICKET_EVENTS = new Set(['tickets_added', 'tickets_removed', 'chore_completed', 'chore_undone', 'taskset_completed', 'taskset_uncompleted', 'reward_undone']);

/**
 * Single activity row used in both FamilyActivityPage and KidOverviewPage.
 *
 * @param {{ item: object, showAvatar?: boolean }} props
 *   showAvatar — whether to render the subject's avatar (default true)
 */
// ─── Day-grouped list ─────────────────────────────────────────────────────────

function toLocalDate(dateInput) {
  // SQLite sends "YYYY-MM-DD HH:MM:SS" with no timezone marker.
  // Browsers parse bare datetime strings as local time, so anything
  // after midnight UTC (e.g. 7 pm EST) lands on the next local day.
  // Append 'Z' to force UTC parsing, then use local date methods.
  let d;
  if (typeof dateInput === 'string' && !dateInput.endsWith('Z') && !dateInput.includes('+')) {
    d = new Date(dateInput.replace(' ', 'T') + 'Z');
  } else {
    d = new Date(dateInput);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(localDateStr) {
  const todayStr     = toLocalDate(new Date());
  const yesterdayStr = toLocalDate(new Date(Date.now() - 86_400_000));
  if (localDateStr === todayStr)     return 'Today';
  if (localDateStr === yesterdayStr) return 'Yesterday';
  const [y, m, d] = localDateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function GroupedActivityList({ activity, showAvatar = true, onUndone }) {
  // Collect reference_ids that have been undone so we hide the Undo button on the original row
  const undoneRefIds = new Set(
    activity.filter(a => a.event_type === 'reward_undone' && a.reference_id).map(a => a.reference_id)
  );

  const groups = [];
  for (const item of activity) {
    const day = toLocalDate(item.created_at);
    if (!groups.length || groups[groups.length - 1].day !== day) {
      groups.push({ day, label: dayLabel(day), items: [] });
    }
    groups[groups.length - 1].items.push(item);
  }
  return (
    <>
      {groups.map((group) => (
        <div key={group.day}>
          <div className="pt-3 pb-1 px-1">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{group.label}</span>
          </div>
          {group.items.map((item) => (
            <ActivityRow key={item.id} item={item} showAvatar={showAvatar} onUndone={onUndone} undoneRefIds={undoneRefIds} />
          ))}
        </div>
      ))}
    </>
  );
}

// ─── Single row ───────────────────────────────────────────────────────────────

export default function ActivityRow({ item, showAvatar = true, onUndone, undoneRefIds }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { useSets, useTickets } = useFamilySettings();
  const isParent = user?.role === 'parent';
  const [undoing, setUndoing] = useState(false);
  const [undone,  setUndone]  = useState(false);
  const path = getActivityPath(item);

  const handleUndo = async (e) => {
    e.stopPropagation();
    setUndoing(true);
    try {
      if (item.event_type === 'reward_redeemed') {
        await rewardsApi.undoRedemption(item.subject_user_id, item.reference_id);
      } else if (item.event_type === 'task_step_completed') {
        await taskSetsApi.toggleStep(item.subject_user_id, item.reference_id, item.amount_cents);
      } else {
        await choresApi.uncompleteChore(item.subject_user_id, item.reference_id);
      }
      setUndone(true);
      onUndone?.();
    } catch {
      // silently ignore — parent can retry
    } finally {
      setUndoing(false);
    }
  };

  const SETS_EVENTS = new Set(['task_step_completed', 'task_step_undone', 'taskset_completed', 'taskset_uncompleted', 'taskset_reset']);
  if (!useTickets && (item.event_type === 'tickets_added' || item.event_type === 'tickets_removed')) {
    return null;
  }
  if (!useSets && SETS_EVENTS.has(item.event_type)) {
    return null;
  }

  const showMoney   = BANK_EVENTS.has(item.event_type)   && item.amount_cents != null;
  const showTickets = useTickets && TICKET_EVENTS.has(item.event_type) && item.amount_cents != null;
  const ticketPos   = item.amount_cents > 0;

  const canUndo = isParent && (item.event_type === 'chore_completed' || item.event_type === 'task_step_completed' || (item.event_type === 'reward_redeemed' && !undoneRefIds?.has(item.reference_id))) && item.reference_id;

  const undoEl = canUndo ? (
    undone ? (
      <span className="text-xs text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 px-2 py-1 rounded">
        Undone
      </span>
    ) : (
      <button
        onClick={handleUndo}
        disabled={undoing}
        className="text-xs text-red-500 hover:text-red-700 border border-red-200 dark:border-red-500 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
      >
        {undoing ? '…' : 'Undo'}
      </button>
    )
  ) : null;

  return (
    <div
      onClick={path ? () => navigate(path) : undefined}
      className={`flex items-center gap-3 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 rounded-lg px-1 -mx-1 transition-colors ${
        path ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : ''
      }`}
    >
      {/* Left: icon + avatar — stacked on mobile, side-by-side on desktop */}
      <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 shrink-0">
        <span className="text-lg shrink-0">{EVENT_ICONS[item.event_type] || '📌'}</span>
        {showAvatar && (
          <Avatar
            name={item.subject_name}
            color={item.avatar_color || '#6366f1'}
            emoji={item.avatar_emoji}
            size="sm"
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 dark:text-gray-200">{item.description}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {showAvatar && (
            <>
              <span className="font-medium text-gray-600 dark:text-gray-400">{item.subject_name}</span>
              {' · '}
            </>
          )}
          {'by '}
          <span className={`font-medium ${item.actor_role === 'parent' ? 'text-brand-600' : 'text-gray-600 dark:text-gray-400'}`}>
            {item.actor_name}
          </span>
          {' '}({item.actor_role}){' on '}{relativeTime(item.created_at)}
        </p>
      </div>

      {/* Right: value + undo — stacked on mobile */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="flex items-center gap-2">
          {showMoney && <CurrencyDisplay cents={item.amount_cents} />}
          {showTickets && (
            <span className={`font-mono text-sm font-medium ${ticketPos ? 'text-green-700' : 'text-red-600'}`}>
              {ticketPos ? '+' : ''}{item.amount_cents} 🎟
            </span>
          )}
          {path && <span className="text-gray-300 dark:text-gray-600 text-xs">›</span>}
        </div>
        {undoEl}
      </div>
    </div>
  );
}
