import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faTrophy } from '@fortawesome/free-solid-svg-icons';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import { taskSetsApi } from '../api/taskSets.api.js';
import { BADGE_LEVELS } from '../constants/badgeLevels.js';
import { useIsDark } from '../components/tasks/TaskSetCard.jsx';

// Circular medallion in the TaskSetCard "minimal" style: progress ring +
// level-tinted track + center disc with image or emoji. No label — the
// tree view leans on iconography (the badge images already carry the
// name on their artwork in the CU library).
function Medallion({ size, taskSet, step, status, pct, onClick, title, placeholderEmoji = '🏅', isGeneric = false }) {
  const isDark = useIsDark();
  const sw = Math.max(6, Math.round(size * 0.08));
  const r  = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const levelCfg = (taskSet?.badge_level && BADGE_LEVELS[taskSet.badge_level])
                || (step?.linked_badge_level && BADGE_LEVELS[step.linked_badge_level]);
  // Dark mode: pastel tracks are too bright; use a neutral gray-700 so the
  // progress arc reads as the accent.
  const trackColor    = isDark
    ? '#374151'
    : (levelCfg?.trackColor || levelCfg?.color || '#E5E7EB');
  const progressColor = status === 'completed'
    ? '#22C55E'
    : (levelCfg?.borderColor || '#6366F1');
  const innerSize = Math.round(size * 0.78);
  const imageFile = isGeneric ? null : (taskSet?.badge_image_file || step?.linked_badge_image);
  const emoji     = isGeneric
    ? placeholderEmoji
    : (taskSet?.emoji || step?.linked_badge_emoji || placeholderEmoji);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative rounded-full shadow-md hover:shadow-lg transition-shadow bg-white dark:bg-gray-800 ${onClick ? 'cursor-pointer hover:opacity-95' : 'cursor-default'}`}
      style={{ width: size, height: size }}
      title={title}
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
            className="rounded-full object-cover dark:brightness-75 dark:contrast-110"
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
    </button>
  );
}

export default function AwardTreePage() {
  const { userId, taskSetId } = useParams();
  const navigate = useNavigate();
  const [taskSet, setTaskSet] = useState(null);
  const [steps, setSteps]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // Viewport-driven layout: < 640px splits children into top/bottom arcs
  // because a full 360° ring won't fit in a phone's width; >= 640px fans
  // them out evenly around the parent.
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

  const children = useMemo(() => {
    const linked = steps.filter((s) => s.linked_task_set_id || s.linked_badge_id || s.linked_badge_category);
    const other  = steps.filter((s) => !(s.linked_task_set_id || s.linked_badge_id || s.linked_badge_category));

    const linkedNodes = linked.map((s) => {
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
      return { kind: 'linked', step: s, pct, status, completed, total, label };
    });

    // Aggregate every step that isn't tied to a sub-badge/award into one
    // "Other steps" node — checklist items the kid has to tick off as
    // part of this award but that don't have their own sub-progress.
    const nodes = [...linkedNodes];
    if (other.length > 0) {
      const completed = other.reduce((n, s) => n + Math.min(s.completed_count || 0, s.repeat_count || 1), 0);
      const total     = other.reduce((n, s) => n + (s.repeat_count || 1), 0);
      const pct = total > 0 ? completed / total : 0;
      const status = total > 0 && completed >= total ? 'completed'
                   : completed > 0 ? 'in_progress'
                   : 'not_started';
      nodes.push({
        kind: 'generic',
        pct, status, completed, total,
        label: `Other steps (${other.length})`,
      });
    }

    return nodes.sort((a, b) => {
      const order = { in_progress: 0, not_started: 1, completed: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      if (a.status === 'in_progress') return b.pct - a.pct;
      return (a.label || '').localeCompare(b.label || '');
    });
  }, [steps]);

  // Overall award progress for the central node — uses the same per-step
  // tally the detail page uses (counted_count / repeat_count fallback).
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

  // ── Radial layout ────────────────────────────────────────────────────
  // Polar coordinates with origin at the container center, y axis flipped
  // (screen y grows downward). Children are placed at (R·cosθ, −R·sinθ).
  // Two modes:
  //   • ring (>= 640px): θ spread evenly across the full 2π, starting at
  //     top (π/2) and going CCW.
  //   • split (< 640px): children split into two halves — first half on
  //     the top semicircle, second half on the bottom semicircle. Keeps
  //     the layout vertical on a narrow phone.
  const layout = useMemo(() => {
    const isMobile = vw < 640;
    const childSize  = isMobile ? 84 : 104;
    const parentSize = isMobile ? 110 : 140;
    const N = children.length;
    if (N === 0) {
      const size = parentSize + 32;
      return { isMobile, childSize, parentSize, positions: [], containerSize: size };
    }
    let radius;
    let positions = [];
    if (isMobile && N >= 3) {
      // Split — top arc: first ceil(N/2), bottom arc: rest.
      const splitAt = Math.ceil(N / 2);
      const topCount = splitAt;
      const botCount = N - splitAt;
      // Need each arc to clear the parent + leave room for the child.
      // 140 keeps the spacing reasonable on a 375-wide viewport.
      radius = 140;
      // Top semicircle: each child gets an "interior" slot so neither arc
      // places a child exactly on the horizontal axis (which would collide
      // with the corresponding slot in the bottom arc). theta_i = π −
      // (i+1)·π / (topCount+1) walks left-to-right strictly above the
      // horizontal — first child at upper-left, last at upper-right.
      for (let i = 0; i < topCount; i++) {
        const theta = Math.PI - (i + 1) * Math.PI / (topCount + 1);
        positions.push({ x: radius * Math.cos(theta), y: -radius * Math.sin(theta) });
      }
      // Bottom semicircle: mirror of the top, strictly below the axis.
      for (let i = 0; i < botCount; i++) {
        const theta = -Math.PI + (i + 1) * Math.PI / (botCount + 1);
        positions.push({ x: radius * Math.cos(theta), y: -radius * Math.sin(theta) });
      }
    } else {
      // Ring — pick a radius wide enough that adjacent child centers are
      // at least one childSize + 24px apart (chord length formula). Floor
      // at 160 so tiny awards (N=2,3) don't look squished into the parent.
      const minSpacing = childSize + 24;
      radius = N >= 2
        ? Math.max(160, minSpacing / (2 * Math.sin(Math.PI / N)))
        : 0;
      for (let i = 0; i < N; i++) {
        const theta = Math.PI / 2 - i * 2 * Math.PI / N;
        positions.push({ x: radius * Math.cos(theta), y: -radius * Math.sin(theta) });
      }
    }
    const containerSize = 2 * (radius + childSize / 2 + 16);
    return { isMobile, childSize, parentSize, positions, containerSize };
  }, [vw, children.length]);

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

  const { childSize, parentSize, positions, containerSize } = layout;
  const cx = containerSize / 2;
  const cy = containerSize / 2;

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
        <div
          className="relative mx-auto"
          style={{ width: containerSize, height: containerSize }}
        >
          {/* Connector lines — drawn from parent center to each child
              center. The medallion buttons sit on top of the SVG (later in
              DOM order) so the line ends are hidden under the badge,
              visually appearing to terminate at the badge edge. */}
          <svg
            width={containerSize} height={containerSize}
            className="absolute inset-0 pointer-events-none"
          >
            {positions.map((p, i) => (
              <line
                key={i}
                x1={cx} y1={cy}
                x2={cx + p.x} y2={cy + p.y}
                stroke="#94A3B8"
                strokeWidth={2}
                strokeLinecap="round"
                className="dark:opacity-60"
              />
            ))}
          </svg>

          {/* Parent at center */}
          <div
            className="absolute"
            style={{
              left: cx, top: cy,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <Medallion
              size={parentSize}
              taskSet={taskSet}
              status={awardProgress.status}
              pct={awardProgress.pct}
              title={taskSet.name}
            />
          </div>

          {/* Children fanned out */}
          {children.map((c, i) => {
            const isGeneric = c.kind === 'generic';
            // "?" placeholder for badge/award slots that aren't linked
            // yet (category slots with no specific badge picked, or
            // specific-badge steps the kid hasn't enrolled in). Linked
            // children fall back to the medal emoji only if their own
            // emoji is also missing.
            const unlinked = !isGeneric && !c.step.linked_task_set_id && !c.step.linked_badge_image;
            return (
              <div
                key={isGeneric ? 'generic-aggregate' : c.step.id}
                className="absolute"
                style={{
                  left: cx + positions[i].x,
                  top:  cy + positions[i].y,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <Medallion
                  size={childSize}
                  step={isGeneric ? undefined : c.step}
                  status={c.status}
                  pct={c.pct}
                  isGeneric={isGeneric}
                  placeholderEmoji={isGeneric ? '📝' : (unlinked ? '❓' : '🏅')}
                  title={`${c.label}${c.total > 0 ? ` — ${c.completed}/${c.total}` : ''}`}
                  onClick={isGeneric || !c.step.linked_task_set_id
                    ? () => navigate(`/tasks/${userId}/${taskSetId}`)
                    : () => navigate(`/tasks/${userId}/${c.step.linked_task_set_id}`)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
