import ActivityItem from './ActivityItem.jsx';
import EmptyState from '../shared/EmptyState.jsx';

export default function ActivityFeed({ activity }) {
  if (!activity.length) {
    return <EmptyState title="No activity yet" description="Actions will appear here." />;
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 shadow-sm">
      {activity.map((item) => (
        <ActivityItem key={item.id} item={item} />
      ))}
    </div>
  );
}
