import { useState } from 'react';
import Avatar from '../shared/Avatar.jsx';
import { relativeTime } from '../../utils/relativeTime.js';
import EmptyState from '../shared/EmptyState.jsx';
import { rewardsApi } from '../../api/rewards.api.js';

export default function RedemptionHistory({ redemptions, isParent = true, onUndone }) {
  const [undoneIds, setUndoneIds] = useState(new Set());
  const [undoingId, setUndoingId] = useState(null);

  const handleUndo = async (r) => {
    setUndoingId(r.id);
    try {
      await rewardsApi.undoRedemption(r.user_id, r.id);
      setUndoneIds((prev) => new Set(prev).add(r.id));
      onUndone?.();
    } catch {
      // silently ignore
    } finally {
      setUndoingId(null);
    }
  };

  if (!redemptions.length) {
    return <EmptyState title="No redemptions yet" />;
  }
  return (
    <div className="space-y-2">
      {redemptions.map((r) => (
        <div key={r.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg">
          {isParent && <Avatar name={r.user_name} color={r.avatar_color || '#6366f1'} size="sm" />}
          <div className="flex-1 min-w-0">
            {isParent ? (
              <p className="text-sm font-medium dark:text-gray-200">{r.user_name} redeemed <strong>{r.reward_name_at_time}</strong></p>
            ) : (
              <p className="text-sm font-medium dark:text-gray-200">{r.reward_name_at_time}</p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500">{relativeTime(r.created_at)}</p>
          </div>
          <span className="text-xs font-medium text-brand-600">−🎟 {r.ticket_cost_at_time}</span>
          {isParent && (
            undoneIds.has(r.id) ? (
              <span className="text-xs text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 px-2 py-1 rounded">
                Undone
              </span>
            ) : (
              <button
                onClick={() => handleUndo(r)}
                disabled={undoingId === r.id}
                className="text-xs text-red-500 hover:text-red-700 border border-red-200 dark:border-red-500 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
              >
                {undoingId === r.id ? '…' : 'Undo'}
              </button>
            )
          )}
        </div>
      ))}
    </div>
  );
}
