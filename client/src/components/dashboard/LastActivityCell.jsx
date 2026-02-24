export default function LastActivityCell({ display }) {
  if (!display) {
    return <span className="text-gray-400 text-sm italic">No activity</span>;
  }
  return <span className="text-sm text-gray-600 truncate max-w-xs block" title={display}>{display}</span>;
}
