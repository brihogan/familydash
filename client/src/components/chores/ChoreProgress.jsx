export default function ChoreProgress({ done, total }) {
  if (total === 0) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-100 rounded-full h-3">
        <div
          className="bg-brand-500 h-3 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-medium text-gray-600 whitespace-nowrap">
        {done}/{total}
      </span>
      {done === total && total > 0 && (
        <span className="text-sm text-green-600 font-semibold">All done!</span>
      )}
    </div>
  );
}
