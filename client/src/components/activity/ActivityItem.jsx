import { relativeTime } from '../../utils/relativeTime.js';
import Avatar from '../shared/Avatar.jsx';

const EVENT_ICONS = {
  chore_completed: '✅',
  chore_undone: '↩️',
  deposit: '💵',
  withdrawal: '💸',
  transfer_out: '➡️',
  transfer_in: '⬅️',
  allowance: '🎁',
  reward_redeemed: '🏆',
  tickets_added: '🎟+',
  tickets_removed: '🎟-',
};

export default function ActivityItem({ item }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="text-lg shrink-0 pt-0.5">{EVENT_ICONS[item.event_type] || '📌'}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800">{item.description}</p>
        <p className="text-xs text-gray-400">
          {item.subject_name && item.actor_name && item.subject_name !== item.actor_name
            ? `by ${item.actor_name} on ${relativeTime(item.created_at)}`
            : relativeTime(item.created_at)
          }
        </p>
      </div>
    </div>
  );
}
