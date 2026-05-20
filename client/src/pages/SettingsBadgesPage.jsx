import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { badgesApi } from '../api/badges.api.js';
import { BADGE_LEVELS } from '../constants/badgeLevels.js';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import useOfflineFamily from '../offline/hooks/useOfflineFamily.js';

const CATEGORIES = [
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

function BadgeImage({ imageFile, emoji, name, size = 48 }) {
  const [errored, setErrored] = useState(false);
  if (!imageFile || errored) {
    return (
      <div
        className="rounded-full flex items-center justify-center shrink-0"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.55,
          background: 'radial-gradient(circle at center, #FFFCF0 0%, #F5E6C8 100%)',
        }}
      >
        {emoji || '🏅'}
      </div>
    );
  }
  return (
    <img
      src={`/api/uploads/badges/${imageFile}`}
      alt={name}
      onError={() => setErrored(true)}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

export default function SettingsBadgesPage() {
  const navigate = useNavigate();
  const { members } = useOfflineFamily();
  // Anyone in the family with a badge level set — kids and parents alike
  const badgeMembers = members.filter((m) => m.is_active);

  const [search,   setSearch]   = useState('');
  const [category, setCategory] = useState('');
  const [page,     setPage]     = useState(1);
  const [badges,   setBadges]   = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Toast-style feedback after assign
  const [toast, setToast] = useState('');
  const [assigning, setAssigning] = useState(false);

  const searchTimeout = useRef(null);
  const LIMIT = 48;

  const fetchBadges = useCallback(async (s, cat, pg, onlyInactive) => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: LIMIT, page: pg };
      if (s)   params.search   = s;
      if (cat) params.category = cat;
      if (onlyInactive) params.onlyInactive = 'true';
      const data = await badgesApi.getBadges(params);
      setBadges(data.badges || []);
      setTotal(data.total  || 0);
    } catch {
      setError('Could not load badges.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBadges(search, category, page, showInactive);
  }, [category, page, showInactive, fetchBadges]);

  const handleSearch = (val) => {
    setSearch(val);
    setPage(1);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchBadges(val, category, 1, showInactive), 350);
  };

  const handleCategory = (cat) => {
    setCategory(cat === category ? '' : cat);
    setPage(1);
  };

  const totalPages = Math.ceil(total / LIMIT);

  const membersWithLevel = badgeMembers.filter((m) => m.badge_level);

  const handleAssign = async (badge, memberId) => {
    const member = badgeMembers.find((m) => m.id === memberId);
    if (!member) return;
    setAssigning(true);
    try {
      await badgesApi.enroll(memberId, badge.id, []);
      setToast(`Assigned "${badge.name}" to ${member.name}. They'll pick optional tasks when they open it.`);
      setTimeout(() => setToast(''), 4000);
    } catch (e) {
      setToast(e?.response?.data?.error || 'Could not assign badge.');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Badge Library</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        Browse all {total || ''} badges and assign them to your kids.
      </p>

      {membersWithLevel.length === 0 && (
        <div className="mb-5 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-700 dark:text-amber-400">
          No family member has a badge level set yet. Go to{' '}
          <button className="underline" onClick={() => navigate('/settings/users')}>Settings → Family</button>{' '}
          and set a Badge Level for each person who wants to earn badges.
        </div>
      )}

      {/* Search */}
      <div className="mb-3">
        <input
          type="search"
          placeholder="Search badges…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-brand-400 focus:border-brand-400 outline-none text-sm"
        />
      </div>

      {/* Show inactive (parent-only toggle) */}
      <label className="flex items-center gap-2 mb-4 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => { setShowInactive(e.target.checked); setPage(1); }}
          className="accent-brand-500"
        />
        Show only disabled badges (those with no required steps)
      </label>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <button
          onClick={() => handleCategory('')}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            !category
              ? 'bg-brand-500 text-white border-brand-500'
              : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400'
          }`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategory(cat)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              category === cat
                ? 'bg-brand-500 text-white border-brand-500'
                : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400'
            }`}
          >
            {cat.replace('Discover ', '').replace('the ', '')}
          </button>
        ))}
      </div>

      {!loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          {total} badge{total === 1 ? '' : 's'}
          {search ? ` matching "${search}"` : ''}
          {category ? ` in ${category}` : ''}
        </p>
      )}

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* Badge list (table-style for parent: image + name + assign dropdown) */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <LoadingSkeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {badges.map((badge) => {
            const optCounts = badge.level_opt_counts ? JSON.parse(badge.level_opt_counts) : {};
            return (
              <div
                key={badge.id}
                className={`flex items-center gap-3 p-3 border rounded-xl ${
                  badge.is_active === 0
                    ? 'bg-gray-50 dark:bg-gray-800/50 border-dashed border-gray-300 dark:border-gray-700 opacity-70'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
              >
                <BadgeImage imageFile={badge.image_file} emoji={badge.emoji} name={badge.name} size={44} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate flex items-center gap-2">
                    {badge.name}
                    {badge.is_active === 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">Disabled</span>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                    {badge.category.replace('Discover ', '').replace('the ', '')}
                  </p>
                </div>
                {membersWithLevel.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      defaultValue=""
                      disabled={assigning}
                      onChange={(e) => {
                        const memberId = parseInt(e.target.value, 10);
                        if (!isNaN(memberId)) handleAssign(badge, memberId);
                        e.target.value = '';
                      }}
                      className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-brand-400 outline-none disabled:opacity-50"
                    >
                      <option value="" disabled>Assign to…</option>
                      {membersWithLevel.map((m) => {
                        const lvlLabel = BADGE_LEVELS[m.badge_level]?.label ?? m.badge_level;
                        return (
                          <option key={m.id} value={m.id}>
                            {m.name} ({lvlLabel})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {page} / {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Next →
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-gray-900 dark:bg-gray-700 text-white text-sm shadow-lg max-w-md">
          {toast}
        </div>
      )}
    </div>
  );
}
