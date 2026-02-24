import RewardCard from './RewardCard.jsx';
import EmptyState from '../shared/EmptyState.jsx';

export default function RewardCatalog({ rewards, ticketBalance, onRedeem, onEdit, onDelete, loading, isParent, kidsWithEarning = [] }) {
  if (!rewards.length) {
    return (
      <EmptyState
        title="No rewards yet"
        description={isParent ? 'Add rewards for kids to redeem.' : 'Check back later for rewards to redeem!'}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {rewards.map((reward) => (
        <RewardCard
          key={reward.id}
          reward={reward}
          ticketBalance={ticketBalance}
          onRedeem={onRedeem}
          onEdit={onEdit}
          onDelete={onDelete}
          loading={loading}
          isParent={isParent}
          kidsWithEarning={kidsWithEarning}
        />
      ))}
    </div>
  );
}
