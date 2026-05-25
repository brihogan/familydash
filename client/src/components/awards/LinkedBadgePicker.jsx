import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faMagnifyingGlass, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { badgesApi } from '../../api/badges.api.js';

const AREAS = [
  'Discover Agriculture',
  'Discover Art',
  'Discover Character',
  'Discover Health & Safety',
  'Discover the Home',
  'Discover Knowledge',
  'Discover the Outdoors',
  'Discover Science & Technology',
  'Discover the World',
];

/**
 * Admin picker for a task_step's linked_badge_id / linked_badge_category.
 * Either link to a single badge by name (typeahead) OR to an entire Area of
 * Discovery; mutually exclusive — picking one clears the other. Pass current
 * values via props; bubble changes up via onChange({ linked_badge_id, linked_badge_category }).
 */
export default function LinkedBadgePicker({
  linkedBadgeId,
  linkedBadgeName,    // current name for display when id is set
  linkedBadgeImage,   // current image_file for display
  linkedBadgeCategory,
  onChange,
}) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  // Live search /api/badges?search= as the user types.
  useEffect(() => {
    if (!open) return;
    if (query.trim().length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await badgesApi.getBadges({ search: query.trim(), type: 'all', limit: 10 });
        setResults(data.badges || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, open]);

  const handlePickBadge = (badge) => {
    onChange({
      linked_badge_id: badge.id,
      linked_badge_category: null,
      _linked_badge_name: badge.name,
      _linked_badge_image: badge.image_file,
    });
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const handlePickArea = (area) => {
    onChange({
      linked_badge_id: null,
      linked_badge_category: area,
      _linked_badge_name: null,
      _linked_badge_image: null,
    });
  };

  const handleClear = () => {
    onChange({
      linked_badge_id: null,
      linked_badge_category: null,
      _linked_badge_name: null,
      _linked_badge_image: null,
    });
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const hasLink = !!linkedBadgeId || !!linkedBadgeCategory;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/40">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <FontAwesomeIcon icon={faShieldHalved} className="text-brand-500 text-xs" />
          Linked badge / area
        </span>
        {hasLink && (
          <button type="button" onClick={handleClear}
            className="text-xs text-gray-500 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1">
            <FontAwesomeIcon icon={faXmark} className="text-[10px]" /> Clear
          </button>
        )}
      </div>

      {/* Current link display */}
      {linkedBadgeId && (
        <div className="flex items-center gap-3 mb-3 p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          {linkedBadgeImage ? (
            <img src={`/api/uploads/badges/${linkedBadgeImage}`} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-brand-200 dark:ring-brand-500/40" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-xl">🏅</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{linkedBadgeName || `Badge #${linkedBadgeId}`}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Step auto-resolves to this badge.</p>
          </div>
        </div>
      )}
      {linkedBadgeCategory && (
        <div className="flex items-center gap-3 mb-3 p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-xl">{linkedBadgeCategory === '*' ? '✨' : '🎯'}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {linkedBadgeCategory === '*' ? 'Any Area of Discovery' : linkedBadgeCategory}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {linkedBadgeCategory === '*'
                ? 'Any enrolled badge satisfies the step — the kid (or parent) picks which one.'
                : 'Any badge in this Area satisfies the step.'}
            </p>
          </div>
        </div>
      )}

      {/* Badge typeahead */}
      <div className="space-y-2">
        <div className="relative">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-xs" />
          <input
            type="text"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            placeholder={linkedBadgeId ? 'Search to change badge…' : 'Search to link a badge…'}
            className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {open && query.trim().length >= 2 && (
            <div className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
              {loading ? (
                <p className="px-3 py-2 text-xs text-gray-400">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">No matches.</p>
              ) : (
                results.map((b) => (
                  <button key={b.id} type="button" onClick={() => handlePickBadge(b)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
                    {b.image_file ? (
                      <img src={`/api/uploads/badges/${b.image_file}`} alt="" className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm">🏅</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">{b.name}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                        {b.is_award ? 'Award' : b.category}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Area shortcut */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">…or any badge in:</label>
          <select
            value={linkedBadgeCategory || ''}
            onChange={(e) => e.target.value ? handlePickArea(e.target.value) : handleClear()}
            className="flex-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="">— pick an Area —</option>
            <option value="*">✨ Any Area (cross-category pick)</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
