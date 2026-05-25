// Pick the most-relevant N task sets to show on tight summary rings
// (DashboardTable, KidOverviewPage). In-progress sets come first sorted
// by completion % desc; if there are fewer than N, the remaining slots
// fill with completed sets so the kid still sees their wins.
//
// "In progress" = any set with stepCount > 0 that isn't 100% complete.
// Completed sets are sorted by % desc too (ties broken by stepCount).
export function pickTopTaskSets(taskSets, limit = 6) {
  if (!Array.isArray(taskSets) || taskSets.length === 0) return [];
  const withPct = taskSets.map((ts) => {
    const pct = ts.stepCount > 0 ? (ts.completedCount / ts.stepCount) * 100 : 0;
    return { ts, pct };
  });
  const inProgress = withPct
    .filter(({ pct, ts }) => ts.stepCount > 0 && pct < 100)
    .sort((a, b) => b.pct - a.pct || (b.ts.stepCount - a.ts.stepCount));
  const done = withPct
    .filter(({ pct }) => pct >= 100)
    .sort((a, b) => b.pct - a.pct || (b.ts.stepCount - a.ts.stepCount));
  const notStarted = withPct
    .filter(({ ts }) => !ts.stepCount)
    .map((x) => x);
  const ordered = [...inProgress, ...done, ...notStarted];
  return ordered.slice(0, limit).map(({ ts }) => ts);
}
