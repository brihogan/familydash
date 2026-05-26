import { useEffect, useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faTrophy } from '@fortawesome/free-solid-svg-icons';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import { taskSetsApi } from '../api/taskSets.api.js';
import { BADGE_LEVELS } from '../constants/badgeLevels.js';

// Big circular medallion identical in style to the TaskSetCard "minimal"
// variant — progress ring + level-tinted track + center disc with image or
// emoji. Used as both the root award node and each child badge/award node.
function Medallion({ size, taskSet, step, label, status, pct, onClick, refEl }) {
  const sw = Math.max(6, Math.round(size * 0.08));
  const r  = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const levelCfg = (taskSet?.badge_level && BADGE_LEVELS[taskSet.badge_level])
                || (step?.linked_badge_level && BADGE_LEVELS[step.linked_badge_level]);
  const trackColor    = levelCfg?.trackColor  || levelCfg?.color || '#E5E7EB';
  const progressColor = status === 'completed'
    ? '#22C55E'
    : (levelCfg?.borderColor || '#6366F1');
  const innerSize = Math.round(size * 0.78);
  const imageFile = taskSet?.badge_image_file || step?.linked_badge_image;
  const emoji     = taskSet?.emoji || step?.linked_badge_emoji || '🏅';
  return (
    <button
      ref={refEl}
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative flex flex-col items-center group ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      title={label}
    >
      <div
        className="relative shadow-md group-hover:shadow-lg transition-shadow rounded-full bg-white dark:bg-gray-800"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
          {pct > 0 && (
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={progressColor} strokeWidth={sw}
              strokeDasharray={circ}
              strokeDashoffset={circ - pct * circ}
              strokeLinecap="round"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {imageFile ? (
            <img
              src={`/api/uploads/badges/${imageFile}`}
              alt=""
              className="rounded-full object-cover"
              style={{ width: innerSize, height: innerSize }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <span
              className="rounded-full flex items-center justify-center leading-none"
              style={{
                width: innerSize, height: innerSize,
                fontSize: Math.round(innerSize * 0.5),
                background: 'radial-gradient(circle at center, #FFFCF0 0%, #F5E6C8 100%)',
              }}
            >
              {emoji}
            </span>
          )}
        </div>
      </div>
      <p
        className="mt-2 text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-200 text-center leading-tight max-w-[120px] line-clamp-2"
      >
        {label}
      </p>
    </button>
  );
}

export default function AwardTreePage() {
  const { userId, taskSetId } = useParams();
  const navigate = useNavigate();
  const [taskSet, setTaskSet]   = useState(null);
  const [steps, setSteps]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    taskSetsApi.getUserTaskSet(userId, taskSetId)
      .then((data) => {
        if (cancelled) return;
        setTaskSet(data.taskSet);
        setSteps(data.steps || []);
      })
      .catch(() => { if (!cancelled) setError('Failed to load award.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, taskSetId]);

  // One node per step with a linked badge / category / task_set. Steps that
  // resolve to an enrolled task set get progress; specific-badge steps with
  // no enrollment yet show 0%; pure category slots ("Earn any Art badge")
  // get a placeholder node that opens the parent step on click.
  const children = useMemo(() => {
    return steps
      .filter((s) => s.linked_task_set_id || s.linked_badge_id || s.linked_badge_category)
      .map((s) => {
        const completed = s.linked_completed_count || 0;
        const total     = s.linked_step_count || 0;
        const pct = total > 0 ? completed / total : 0;
        const status = total > 0 && completed >= total ? 'completed'
                     : completed > 0 ? 'in_progress'
                     : 'not_started';
        const label = s.linked_badge_name
                   || (s.linked_badge_category && !s.linked_badge_id
                       ? (s.linked_badge_category === '*'
                           ? 'Any badge'
                           : `Any ${s.linked_badge_category.replace(/^Discover (the )?/, '')} badge`)
                       : s.name);
        return { step: s, pct, status, completed, total, label };
      })
      .sort((a, b) => {
        const order = { in_progress: 0, not_started: 1, completed: 2 };
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        if (a.status === 'in_progress') return b.pct - a.pct;
        return (a.label || '').localeCompare(b.label || '');
      });
  }, [steps]);

  // Overall award progress for the central node
  const awardProgress = useMemo(() => {
    const total = steps.length;
    const done  = steps.reduce((n, s) => n + Math.min(s.completed_count || 0, s.repeat_count || 1), 0);
    const denom = steps.reduce((n, s) => n + (s.repeat_count || 1), 0) || total;
    const pct = denom > 0 ? done / denom : 0;
    const status = denom > 0 && done >= denom ? 'completed'
                 : done > 0 ? 'in_progress'
                 : 'not_started';
    return { pct, status };
  }, [steps]);

  // Measure positions and draw connector lines from the award medallion's
  // bottom-center to each child medallion's top-center. Re-measure on
  // resize (children wrap on narrow viewports) via ResizeObserver.
  const containerRef = useRef(null);
  const awardRef     = useRef(null);
  const childRefs    = useRef([]);
  const [paint, setPaint] = useState({ w: 0, h: 0, lines: [] });
  const measure = useCallback(() => {
    const cont = containerRef.current;
    const award = awardRef.current;
    if (!cont || !award) return;
    const cr = cont.getBoundingClientRect();
    const ar = award.getBoundingClientRect();
    const fromX = ar.left + ar.width / 2 - cr.left;
    const fromY = ar.bottom - cr.top;
    const lines = childRefs.current.map((el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x1: fromX, y1: fromY,
        x2: r.left + r.width / 2 - cr.left,
        y2: r.top - cr.top,
      };
    }).filter(Boolean);
    setPaint({ w: cr.width, h: cr.height, lines });
  }, []);

  useLayoutEffect(() => {
    measure();
    const cont = containerRef.current;
    if (!cont) return;
    const ro = new ResizeObserver(measure);
    ro.observe(cont);
    // Children's individual sizes can shift when images load; observe each.
    for (const el of childRefs.current) { if (el) ro.observe(el); }
    return () => ro.disconnect();
  }, [children, measure]);

  if (loading) {
    return (
      <div>
        <button
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 transition-colors"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="text-xs" /> Back
        </button>
        <LoadingSkeleton rows={4} />
      </div>
    );
  }

  if (error || !taskSet) {
    return (
      <div>
        <button
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 transition-colors"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="text-xs" /> Back
        </button>
        <p className="text-red-500 text-sm">{error || 'Award not found.'}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => navigate(`/tasks/${userId}/${taskSetId}`)}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Back to award"
        >
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <FontAwesomeIcon icon={faTrophy} className="text-amber-500 shrink-0" />
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
            {taskSet.name} <span className="text-gray-400 dark:text-gray-500 font-medium">· map</span>
          </h1>
        </div>
      </div>

      {children.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
          This award has no badge or sub-award steps to map yet.
        </div>
      ) : (
        <div ref={containerRef} className="relative pt-2 pb-8">
          {/* Connector lines overlay — drawn first so it sits behind the
              medallions. pointer-events-none so clicks pass through to the
              nodes underneath. */}
          <svg
            width={paint.w}
            height={paint.h}
            className="absolute inset-0 pointer-events-none"
          >
            {paint.lines.map((l, i) => (
              <line
                key={i}
                x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                stroke="#94A3B8"
                strokeWidth={2}
                strokeLinecap="round"
                className="dark:opacity-60"
              />
            ))}
          </svg>

          {/* Central award node */}
          <div className="flex justify-center mb-12">
            <Medallion
              size={140}
              taskSet={taskSet}
              label={taskSet.name}
              status={awardProgress.status}
              pct={awardProgress.pct}
              refEl={awardRef}
            />
          </div>

          {/* Children row — wraps on narrow viewports */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-8">
            {children.map((c, i) => (
              <Medallion
                key={c.step.id}
                size={104}
                step={c.step}
                label={c.label}
                status={c.status}
                pct={c.pct}
                refEl={(el) => { childRefs.current[i] = el; }}
                onClick={c.step.linked_task_set_id
                  ? () => navigate(`/tasks/${userId}/${c.step.linked_task_set_id}`)
                  : () => navigate(`/tasks/${userId}/${taskSetId}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
