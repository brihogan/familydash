export default function LastActivityCell({ display }) {
  if (!display) {
    return <span className="text-gray-400 text-sm italic">No activity</span>;
  }
  return <span className="text-sm text-gray-600 dark:text-gray-400 truncate block w-full" title={display}>{display}</span>;
}
