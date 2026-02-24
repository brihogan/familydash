import Avatar from '../shared/Avatar.jsx';
import { relativeTime } from '../../utils/relativeTime.js';
import EmptyState from '../shared/EmptyState.jsx';

export default function RedemptionHistory({ redemptions, isParent = true }) {
  if (!redemptions.length) {
    return <EmptyState title="No redemptions yet" />;
  }
  return (
    <div className="space-y-2">
      {redemptions.map((r) => (
        <div key={r.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-lg">
          {isParent && <Avatar name={r.user_name} color={r.avatar_color || '#6366f1'} size="sm" />}
          <div className="flex-1 min-w-0">
            {isParent ? (
              <p className="text-sm font-medium">{r.user_name} redeemed <strong>{r.reward_name_at_time}</strong></p>
            ) : (
              <p className="text-sm font-medium">{r.reward_name_at_time}</p>
            )}
            <p className="text-xs text-gray-400">{relativeTime(r.created_at)}</p>
          </div>
          <span className="text-xs font-medium text-brand-600">−🎟 {r.ticket_cost_at_time}</span>
        </div>
      ))}
    </div>
  );
}
