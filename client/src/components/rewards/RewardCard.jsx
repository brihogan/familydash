function toQ(n) { return Math.max(0.25, Math.round(n * 4) / 4); }

function fmtQ(n) {
  const whole = Math.floor(n);
  const frac  = n - whole;
  const f = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
  return whole > 0 ? `${whole}${f}` : f;
}

function daysLabel(ticketCost, kids) {
  if (!kids.length) return null;
  const days = kids.map((k) => toQ(ticketCost / k.daily_ticket_potential));
  const min = Math.min(...days);
  const max = Math.max(...days);
  const unit = max === 1 ? 'day' : 'days';
  return min === max ? `${fmtQ(min)} ${unit}` : `${fmtQ(min)}–${fmtQ(max)} days`;
}

export default function RewardCard({ reward, ticketBalance, onRedeem, onEdit, onDelete, loading, isParent, kidsWithEarning = [] }) {
  const canAfford = ticketBalance >= reward.ticket_cost;
  const label = isParent ? daysLabel(reward.ticket_cost, kidsWithEarning) : null;

  return (
    <div className={`bg-white rounded-xl border p-4 shadow-sm flex flex-col gap-3 transition-all ${
      isParent || canAfford ? 'border-gray-200 hover:border-brand-300' : 'border-gray-100 opacity-70'
    }`}>
      <div>
        {reward.emoji && <div className="text-3xl mb-2 leading-none">{reward.emoji}</div>}
        <h3 className="font-semibold text-gray-800">{reward.name}</h3>
        {reward.description && (
          <p className="text-sm text-gray-500 mt-0.5">{reward.description}</p>
        )}
      </div>
      <div className="flex items-center justify-between mt-auto">
        <span className="text-sm font-bold text-brand-600">
          🎟 {reward.ticket_cost} tickets
          {label && <span className="ml-1 text-xs font-normal text-gray-400">({label})</span>}
        </span>
        {isParent ? (
          <div className="flex gap-3">
            <button
              onClick={() => onEdit(reward)}
              className="text-sm text-blue-500 hover:underline"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(reward.id)}
              className="text-sm text-red-500 hover:underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            onClick={() => onRedeem(reward.id)}
            disabled={!canAfford || loading}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              canAfford
                ? 'bg-brand-500 hover:bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            } disabled:opacity-60`}
          >
            {loading ? '…' : canAfford ? 'Redeem' : 'Not enough'}
          </button>
        )}
      </div>
    </div>
  );
}
