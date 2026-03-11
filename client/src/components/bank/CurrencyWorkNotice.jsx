/**
 * Shared notice + sub-account allocation splits for "Require Working with Currency" kids.
 * Used in UnifiedBankDialog and RecurringRuleForm.
 *
 * Props:
 *   subAccounts   - array of non-main accounts for the kid
 *   allocations   - { [accountId]: { enabled, type, value } }
 *   onAllocationsChange - setter for allocations state
 *   bypass        - whether bypass mode is active
 *   onBypassChange - setter for bypass state (if provided, shows the toggle)
 */
export default function CurrencyWorkNotice({ subAccounts, allocations, onAllocationsChange, bypass = false, onBypassChange }) {
  return (
    <>
      {/* ── Receive / Bypass toggle ── */}
      {onBypassChange && (
        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => onBypassChange(false)}
            className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
              !bypass
                ? 'bg-amber-500 text-white'
                : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
            }`}
          >
            Receive
          </button>
          <button
            type="button"
            onClick={() => onBypassChange(true)}
            className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
              bypass
                ? 'bg-green-500 text-white'
                : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
            }`}
          >
            Bypass
          </button>
        </div>
      )}

      {/* ── Warning / info banner ── */}
      {bypass ? (
        <div className="px-3 py-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 text-xs leading-relaxed break-words">
          &#x2714; The deposit will go directly to the account — the kid will receive it immediately.
        </div>
      ) : (
        <div className="px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs leading-relaxed break-words">
          &#x26A0; This kid has <strong>Require Working with Currency</strong> enabled. The deposit will be held as pending until they count and receive it.
        </div>
      )}

      {/* ── Sub-account allocation splits (hidden when bypass) ── */}
      {!bypass && subAccounts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Sub-account splits</p>
          <div className="space-y-2">
            {subAccounts.map((a) => {
              const alloc = allocations[a.id] || { enabled: false, type: 'percent', value: 10 };
              return (
                <div key={a.id} className="flex items-center gap-2">
                  <label className="flex items-center gap-2 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={alloc.enabled}
                      onChange={(e) => onAllocationsChange((prev) => ({
                        ...prev,
                        [a.id]: { ...alloc, enabled: e.target.checked },
                      }))}
                      className="rounded border-gray-300 text-brand-500 focus:ring-brand-400"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate capitalize">{a.name}</span>
                  </label>
                  {alloc.enabled && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min="1"
                        value={alloc.value}
                        onChange={(e) => onAllocationsChange((prev) => ({
                          ...prev,
                          [a.id]: { ...alloc, value: parseFloat(e.target.value) || 0 },
                        }))}
                        className="w-16 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200"
                      />
                      <select
                        value={alloc.type}
                        onChange={(e) => onAllocationsChange((prev) => ({
                          ...prev,
                          [a.id]: { ...alloc, type: e.target.value },
                        }))}
                        className="border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200"
                      >
                        <option value="percent">%</option>
                        <option value="flat">$</option>
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Build default allocations object: each sub-account gets 10%, enabled.
 */
export function buildDefaultAllocations(subAccounts) {
  const allocs = {};
  for (const a of subAccounts) {
    allocs[a.id] = { enabled: true, type: 'percent', value: 10 };
  }
  return allocs;
}
