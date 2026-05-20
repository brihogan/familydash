import { useState, useEffect } from 'react';
import Modal from '../shared/Modal.jsx';
import { badgesApi } from '../../api/badges.api.js';
import { BADGE_LEVELS } from '../../constants/badgeLevels.js';

function LevelPill({ level }) {
  const cfg = BADGE_LEVELS[level];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border"
      style={{ backgroundColor: cfg.color, color: cfg.textColor, borderColor: cfg.borderColor }}
    >
      {cfg.label}
    </span>
  );
}

/**
 * Modal for enrolling a user in a badge.
 * Fetches badge detail (requirements + optional pool) then lets the user pick optionals.
 */
export default function BadgeEnrollModal({ badge, userId, userLevel, onClose, onEnrolled }) {
  const [detail,   setDetail]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [reqOpen,  setReqOpen]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    badgesApi.getBadge(badge.id, userLevel)
      .then(setDetail)
      .catch(() => setError('Could not load badge details.'))
      .finally(() => setLoading(false));
  }, [badge.id, userLevel]);

  const optCounts   = detail?.level_opt_counts ?? {};
  const pickCount   = optCounts[userLevel] ?? 0;
  const requirements = detail?.requirements ?? [];
  const optionals    = detail?.optionals    ?? [];

  const toggleOpt = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < pickCount) {
        next.add(id);
      }
      return next;
    });
  };

  const ready = selected.size === pickCount;

  const handleStart = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await badgesApi.enroll(userId, badge.id, [...selected]);
      onEnrolled(result.taskSetId);
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not start badge.');
      setSaving(false);
    }
  };

  return (
    <Modal open title={badge.name} onClose={onClose}>
      {/* Badge header */}
      <div className="flex items-start gap-3 mb-4">
        {badge.image_file ? (
          <img
            src={`/api/uploads/badges/${badge.image_file}`}
            alt={badge.name}
            className="w-14 h-14 rounded-full object-cover shrink-0"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-2xl shrink-0">
            🏅
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400">{badge.category}</p>
          <div className="mt-1">
            <LevelPill level={userLevel} />
          </div>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Loading requirements…</p>
      )}

      {!loading && (
        <>
          {/* Required steps collapsible */}
          <div className="mb-4">
            <button
              onClick={() => setReqOpen((o) => !o)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Required steps ({requirements.length})
              </span>
              <span className="text-gray-400 text-xs">{reqOpen ? '▲ hide' : '▼ show'}</span>
            </button>
            {reqOpen && (
              <ul className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {requirements.map((req) => (
                  <li key={req.id} className="flex gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <span className="mt-0.5 shrink-0 text-brand-500">•</span>
                    <span>{req.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Optional picker */}
          {pickCount > 0 && (
            <div className="mb-4">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Choose {pickCount} optional task{pickCount === 1 ? '' : 's'}
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({selected.size} of {pickCount} selected)
                </span>
              </p>
              <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {optionals.map((opt) => {
                  const isSelected = selected.has(opt.id);
                  const isDisabled = !isSelected && selected.size >= pickCount;
                  return (
                    <li key={opt.id}>
                      <label
                        className={`flex gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-500'
                            : isDisabled
                              ? 'border-gray-100 dark:border-gray-700 opacity-50 cursor-not-allowed'
                              : 'border-gray-200 dark:border-gray-600 hover:border-brand-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={() => toggleOpt(opt.id)}
                          className="mt-0.5 accent-brand-500 shrink-0"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                          {opt.text}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {pickCount === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              No optional tasks to pick — just complete all required steps.
            </p>
          )}

          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={!ready || saving}
              onClick={handleStart}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                ready && !saving
                  ? 'bg-brand-500 hover:bg-brand-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              {saving ? 'Starting…' : 'Start Badge'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
