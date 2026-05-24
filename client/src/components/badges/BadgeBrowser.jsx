import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHalved, faBookmark } from '@fortawesome/free-solid-svg-icons';
import { faBookmark as faBookmarkOutline } from '@fortawesome/free-regular-svg-icons';
import { useAuth } from '../../context/AuthContext.jsx';
import { badgesApi } from '../../api/badges.api.js';
import { BADGE_LEVELS } from '../../constants/badgeLevels.js';
import KidProfilePicker from '../shared/KidProfilePicker.jsx';
import LoadingSkeleton from '../shared/LoadingSkeleton.jsx';
import useOfflineFamily from '../../offline/hooks/useOfflineFamily.js';
import BadgePreviewModal from './BadgePreviewModal.jsx';

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

function LevelPill({ level, size = 'sm' }) {
  const cfg = BADGE_LEVELS[level];
  if (!cfg) return null;
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-full border ${pad}`}
      style={{ backgroundColor: cfg.color, color: cfg.textColor, borderColor: cfg.borderColor }}
    >
      {cfg.label}
    </span>
  );
}

function BadgeImage({ imageFile, emoji, name, size = 64 }) {
  const [errored, setErrored] = useState(false);
  if (!imageFile || errored) {
    return (
      <div
        className="rounded-full flex items-center justify-center shrink-0"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.5,
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

/**
 * Reusable badge browser. Used by the standalone /badges/:userId page and by
 * the "Browse Badges" modal on KidTasksPage.
 *
 * @param {{ userId: number, compact?: boolean, onEnrolled?: (taskSetId: number) => void }} props
 *   - compact: hide the page-level header + kid picker (modal already frames them).
 *   - onEnrolled: callback after successful enrollment. Defaults to navigating to the new task set.
 */
export default function BadgeBrowser({ userId, compact = false, onEnrolled, initialType = 'badge', initialCategory = '' }) {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const isParent    = user?.role === 'parent';
  const targetId    = typeof userId === 'string' ? parseInt(userId, 10) : userId;

  const { members } = useOfflineFamily();
  const targetMember = members.find((m) => m.id === targetId) ?? null;
  const memberName   = targetMember?.name || '';
  const isSelf       = user?.id === targetId;
  const badgeMembers = members.filter((m) => m.badge_level && m.is_active);

  const [search,   setSearch]   = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [type,     setType]     = useState(initialType); // 'badge' | 'award' | 'all'
  const [page,     setPage]     = useState(1);
  const [badges,   setBadges]   = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const [activeBadgeIds] = useState(new Set());
  const [previewBadge, setPreviewBadge] = useState(null);

  const searchTimeout = useRef(null);

  const LIMIT = 48;

  const fetchBadges = useCallback(async (s, cat, pg, t) => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: LIMIT, page: pg, type: t };
      if (s)        params.search        = s;
      if (cat)      params.category      = cat;
      if (targetId) params.bookmarksFor  = targetId;
      const data = await badgesApi.getBadges(params);
      setBadges(data.badges || []);
      setTotal(data.total  || 0);
    } catch {
      setError('Could not load badges.');
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  useEffect(() => {
    fetchBadges(search, category, page, type);
  }, [category, page, type, fetchBadges]); // search is debounced below

  const handleSearch = (val) => {
    setSearch(val);
    setPage(1);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchBadges(val, category, 1, type), 350);
  };

  const handleCategory = (cat) => {
    setCategory(cat === category ? '' : cat);
    setPage(1);
  };

  const handleType = (t) => {
    if (t === type) return;
    setType(t);
    setCategory(''); // category is badge-only; reset when crossing types
    setPage(1);
  };

  // Optimistic bookmark toggle. Flip in place first (so the icon visibly
  // changes), but defer the re-sort by 2s so the card doesn't jump away
  // immediately — gives the kid time to see what they bookmarked.
  const handleToggleBookmark = async (badge) => {
    if (!targetId) return;
    const nextBookmarked = !badge.is_bookmarked;
    setBadges((list) => list.map((b) => b.id === badge.id ? { ...b, is_bookmarked: nextBookmarked } : b));
    setTimeout(() => {
      setBadges((list) => [...list].sort((a, b) => {
        const ab = a.is_bookmarked ? 1 : 0;
        const bb = b.is_bookmarked ? 1 : 0;
        if (ab !== bb) return bb - ab;
        return a.name.localeCompare(b.name);
      }));
    }, 2000);
    try {
      if (nextBookmarked) await badgesApi.bookmark(targetId, badge.id);
      else                await badgesApi.unbookmark(targetId, badge.id);
    } catch {
      // Revert on failure
      setBadges((list) => list.map((b) => b.id === badge.id ? { ...b, is_bookmarked: !nextBookmarked } : b));
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const level      = targetMember?.badge_level;
  const maxBadges  = targetMember?.max_active_badges ?? 3;
  const levelCfg   = level ? BADGE_LEVELS[level] : null;

  const canEnroll  = !!level && activeBadgeIds.size < maxBadges;

  const handleEnrolled = (taskSetId) => {
    setPreviewBadge(null);
    if (onEnrolled) onEnrolled(taskSetId);
    else navigate(`/tasks/${targetId}/${taskSetId}`);
  };

  return (
    <div>
      {!compact && (
        <>
          <div className="flex items-center gap-2 mb-4 min-w-0">
            <FontAwesomeIcon icon={faShieldHalved} className="text-brand-500 text-2xl shrink-0" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {isSelf ? 'My Badges' : memberName ? `${memberName}'s Badges` : 'Badges'}
            </h1>
            {levelCfg && (
              <span className="ml-1 shrink-0">
                <LevelPill level={level} />
              </span>
            )}
          </div>
          {isParent && badgeMembers.length > 1 && (
            <KidProfilePicker
              kids={badgeMembers}
              currentId={targetId}
              routePrefix="/badges"
            />
          )}
        </>
      )}
      {compact && levelCfg && (
        <div className="mb-3">
          <LevelPill level={level} />
        </div>
      )}
      {!level && (
        <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
          {isParent && !isSelf
            ? 'Set a badge level for this person in Settings first.'
            : 'Set a badge level in your settings first.'}
        </p>
      )}

      {/* Type toggle: Badges / Awards / All */}
      <div className="flex items-center gap-1 mb-4 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
        {[
          { key: 'badge', label: 'Badges' },
          { key: 'award', label: 'Awards' },
          { key: 'all',   label: 'All'    },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleType(key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
              type === key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          placeholder={type === 'award' ? 'Search awards…' : 'Search badges…'}
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-brand-400 focus:border-brand-400 outline-none text-sm"
        />
      </div>

      {/* Category pills (hidden when viewing Awards — awards have no Area filter) */}
      {type !== 'award' && (
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
      )}

      {/* Results count */}
      {!loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          {total} {type === 'award' ? 'award' : 'badge'}{total === 1 ? '' : 's'}
          {search ? ` matching "${search}"` : ''}
          {category ? ` in ${category}` : ''}
        </p>
      )}

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* Badge grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <LoadingSkeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {badges.map((badge) => {
            const isActive = activeBadgeIds.has(badge.id);

            return (
              <button
                type="button"
                key={badge.id}
                onClick={() => setPreviewBadge(badge)}
                className="relative flex flex-col items-center p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md hover:border-brand-300 dark:hover:border-brand-500/50 hover:bg-brand-50/30 dark:hover:bg-brand-900/10 transition-all text-left cursor-pointer"
              >
                {/* Bookmark toggle — top-right of card; click bookmarks/unbookmarks
                    without opening the preview, and re-sorts bookmarked to the top. */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleToggleBookmark(badge); }}
                  className={`absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                    badge.is_bookmarked
                      ? 'text-amber-500 hover:text-amber-600'
                      : 'text-gray-300 dark:text-gray-600 hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                  }`}
                  aria-label={badge.is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
                  title={badge.is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
                >
                  <FontAwesomeIcon icon={badge.is_bookmarked ? faBookmark : faBookmarkOutline} className="text-sm" />
                </button>
                <BadgeImage imageFile={badge.image_file} emoji={badge.emoji} name={badge.name} size={56} />
                <p className="mt-2 text-xs font-semibold text-gray-800 dark:text-gray-100 text-center leading-snug line-clamp-2 min-h-[2.5rem] w-full">
                  {badge.name}
                </p>
                {badge.is_award ? (
                  <p className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold text-center mb-2 w-full">
                    Award
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mb-2 w-full">
                    {badge.category.replace('Discover ', '').replace('the ', '')}
                  </p>
                )}

                {isActive && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                    Active
                  </span>
                )}
              </button>
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

      {/* Preview modal */}
      {previewBadge && (
        <BadgePreviewModal
          badge={previewBadge}
          userId={targetId}
          userLevel={level}
          canEnroll={canEnroll}
          onClose={() => setPreviewBadge(null)}
          onEnrolled={handleEnrolled}
        />
      )}
    </div>
  );
}
