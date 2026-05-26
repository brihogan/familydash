import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTag, faXmark, faTicket, faStar, faCheck } from '@fortawesome/free-solid-svg-icons';
import { IconDisplay } from '../shared/IconPicker.jsx';
import { BADGE_LEVELS } from '../../constants/badgeLevels.js';

// Helpers: kept inside the component file since the only consumer beyond
// KidTasksPage is the group sub-page (which doesn't need to customize them).

function primaryPillFor(ts) {
  if (Array.isArray(ts.tags)) {
    const area = ts.tags.find((t) => t.startsWith('Discover'));
    if (area) return { label: area, filterValue: `tag:${area}` };
  }
  if (ts.category) return { label: ts.category, filterValue: `category:${ts.category}` };
  return { label: ts.type, filterValue: `type:${ts.type}` };
}

function filterDotColor(value) {
  const [kind, ...rest] = value.split(':');
  const val = rest.join(':');
  if (kind === 'level' && BADGE_LEVELS[val]) return BADGE_LEVELS[val].borderColor;
  if (kind === 'type')  return val === 'Project' ? '#6366F1' : '#F59E0B';
  if (kind === 'category') {
    if (val === 'Curiosity') return '#F59E0B';
    return '#A78BFA';
  }
  if (kind === 'tag') {
    if (val === 'Badge') return '#A855F7';
    if (val === 'Award') return '#F59E0B';
    if (val.startsWith('Discover Health'))     return '#EF4444';
    if (val.startsWith('Discover Knowledge'))  return '#3B82F6';
    if (val.startsWith('Discover the World'))  return '#10B981';
    if (val.startsWith('Discover Art'))        return '#EC4899';
    if (val.startsWith('Discover the Home'))   return '#F97316';
    if (val.startsWith('Discover Science'))    return '#06B6D4';
    if (val.startsWith('Discover the Outdoors'))   return '#84CC16';
    if (val.startsWith('Discover Agriculture'))    return '#22C55E';
    if (val.startsWith('Discover Character'))      return '#FBBF24';
    return '#9CA3AF';
  }
  return '#9CA3AF';
}

/**
 * Big flippable task-set card used on /tasks/:userId and the group sub-pages.
 * Front: progress ring + name + counts. Back (chevron tag → flip): full
 * pill list (type, category, tags, level) clickable as filters when
 * `onPillFilter` is provided. The card's outer wrapper is always `h-full`
 * so it auto-fits inside an auto-rows-fr grid.
 *
 * Props:
 *   taskSet       - the row from /api/users/:id/task-assignments
 *   userId        - URL param for click-through navigation
 *   member        - the kid's row (used to tint Curiosity cards with their level)
 *   isFlipped     - bool driven by parent (so only one card is "flipped" at a time)
 *   onFlip(id)    - parent-owned setter for the flipped id set
 *   onPillFilter  - optional (value) => void; if absent the pills are inert
 *   useTickets    - whether to show the ticket reward chip on the bottom
 */
export default function TaskSetCard({ taskSet: ts, userId, member, isFlipped, onFlip, onPillFilter, useTickets, minimal = false }) {
  const navigate = useNavigate();
  const pct  = ts.step_count > 0 ? Math.round((ts.completed_count / ts.step_count) * 100) : 0;
  const done = ts.step_count > 0 && ts.completed_count === ts.step_count;
  const size = minimal ? 104 : 112;
  const sw   = 8;
  // Rich card keeps its old inset radius. Minimal pushes the stroke to the
  // button edge so there's no whitespace between the ring and the shadow.
  const r    = minimal ? (size - sw) / 2 : (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;

  // ── Minimal "circle only" variant: just the progress ring + badge image,
  // clickable to the task detail page. No card chrome / name / pills.
  // Border color = the set's badge level (when set), else white — so a
  // Curiosity badge or award reads its level at a glance.
  if (minimal) {
    const levelCfg = ts.badge_level && BADGE_LEVELS[ts.badge_level];
    // Ring colors: the "uncompleted" portion (track) is the lighter shade,
    // the "completed" portion (arc) is the saturated level color. Non-level
    // sets fall back to brand-blue track + brand-blue arc.
    const trackColor    = levelCfg?.trackColor  || levelCfg?.color || '#E5E7EB'; // gray-200 fallback
    const progressColor = levelCfg?.borderColor || '#6366F1';                    // brand fallback
    return (
      <button
        type="button"
        onClick={() => navigate(`/tasks/${userId}/${ts.id}`)}
        className="relative flex items-center justify-center rounded-full shadow-md hover:shadow-lg hover:opacity-90 transition-all"
        style={{ width: size, height: size }}
        title={`${ts.name}${levelCfg ? ` · ${levelCfg.label}` : ''}${ts.step_count ? ` · ${ts.completed_count}/${ts.step_count}` : ''}`}
      >
        <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
          {ts.step_count > 0 && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={progressColor} strokeWidth={sw}
              strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ} strokeLinecap="round" />
          )}
        </svg>
        {/* Curved title — sits inside the cream/beige inner circle (radius ~27
            from center, well inside the 32-radius cream disc) along a 120° top
            arc so letters never wrap down past the badge image area. Only
            shown for emoji-only badges and plain sets, since image-based
            badges already have the name on the artwork. */}
        {!ts.badge_image_file && ts.name && (() => {
          const cx = size / 2;
          const cy = size / 2;
          const textR = 30;
          // Top arc length (radius * π) approximated against UPPERCASE width
          // (~5px per char at 7px font + 0.2 letter-spacing). If the name
          // overflows, find the most balanced word break and overflow the
          // second half onto the bottom arc.
          const topArcChars = Math.floor((Math.PI * textR) / 5);
          const splitTitle = () => {
            const name = ts.name.trim();
            if (name.length <= topArcChars) return [name, ''];
            const words = name.split(/\s+/);
            if (words.length === 1) return [name, '']; // single long word — let it clip
            let bestI = 1, bestDiff = Infinity;
            for (let i = 1; i < words.length; i++) {
              const top = words.slice(0, i).join(' ');
              const bot = words.slice(i).join(' ');
              if (top.length > topArcChars || bot.length > topArcChars) continue;
              const d = Math.abs(top.length - bot.length);
              if (d < bestDiff) { bestI = i; bestDiff = d; }
            }
            return [words.slice(0, bestI).join(' '), words.slice(bestI).join(' ')];
          };
          const [topText, bottomText] = splitTitle();
          const topPathD    = `M ${cx - textR},${cy} A ${textR},${textR} 0 0 1 ${cx + textR},${cy}`;
          // Bottom arc: with side="right" the textPath is traversed in
          // reverse and letters end up on the opposite side of the path,
          // which for an SVG-y-down bottom arc places them inward (toward
          // the cream's bottom edge). Bumped to a slightly larger radius
          // than the top so the letter band lands ~2px above the cream
          // bottom edge, mirroring the top arc's position.
          const bottomR = textR + 4;
          const bottomPathD = `M ${cx - bottomR},${cy} A ${bottomR},${bottomR} 0 0 0 ${cx + bottomR},${cy}`;
          const topPathId    = `task-arc-top-${ts.id}`;
          const bottomPathId = `task-arc-bot-${ts.id}`;
          const textStyle = { fontSize: 7, fontWeight: 700, letterSpacing: '0.2px', textTransform: 'uppercase' };
          return (
            <svg width={size} height={size} className="absolute inset-0 pointer-events-none z-10">
              <defs>
                <path id={topPathId}    d={topPathD}    fill="none" />
                <path id={bottomPathId} d={bottomPathD} fill="none" />
              </defs>
              <text fill="#374151" style={textStyle}>
                <textPath href={`#${topPathId}`} startOffset="50%" textAnchor="middle">
                  {topText}
                </textPath>
              </text>
              {bottomText && (
                <text fill="#374151" style={textStyle}>
                  {/* side="right" flips text to the opposite side of the
                      arc AND reverses path direction, so letters stay
                      readable left-to-right at the bottom of the medallion
                      (SVG 2; Chrome 91+, Firefox 79+, Safari 16.4+). */}
                  <textPath href={`#${bottomPathId}`} startOffset="50%" textAnchor="middle" side="right">
                    {bottomText}
                  </textPath>
                </text>
              )}
            </svg>
          );
        })()}
        <div className="absolute inset-0 flex items-center justify-center text-3xl leading-none">
          {ts.badge_image_file ? (
            <img
              src={`/api/uploads/badges/${ts.badge_image_file}`}
              alt=""
              className="w-20 h-20 rounded-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : ts.badge_id ? (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: 'radial-gradient(circle at center, #FFFCF0 0%, #F5E6C8 100%)' }}
            >
              <IconDisplay value={ts.emoji} fallback="🏅" />
            </div>
          ) : (
            // Non-Curiosity set: same disc treatment as a badge but grayscale,
            // so the curved title has a clean background and the icon reads
            // against a consistent inner circle.
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: 'radial-gradient(circle at center, #F9FAFB 0%, #D1D5DB 100%)' }}
            >
              <IconDisplay value={ts.emoji} fallback="📋" />
            </div>
          )}
        </div>
        {done && ts.completion_status !== 'pending' && !(ts.pending_step_count > 0) && (
          <span className="absolute top-0 right-0 w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px] shadow ring-2 ring-white dark:ring-gray-800">
            <FontAwesomeIcon icon={faCheck} />
          </span>
        )}
        {/* Linked-award overlay — mini badges fan out around the badge's
            bottom-right, pivoting on the badge center. So multiple awards
            don't stack on top of each other; instead they form a small
            arc spreading from below-right toward right. Decorative only
            (parent button owns the click). */}
        {Array.isArray(ts.linked_awards) && ts.linked_awards.length > 0 && (() => {
          const miniSize  = 26;
          // Mini outer edge sits ~1px past the inner edge of the progress
          // ring (ring spans 52..60 from center on a 120px medallion, so
          // outer edge target = 53 → radius = 53 - miniSize/2 = 40).
          const radius    = (size / 2 - 8 + 1) - miniSize / 2;
          const cx        = size / 2;
          const cy        = size / 2;
          const N         = ts.linked_awards.length;
          // Fan centered on 45° (bottom-right diagonal). Angular step
          // chosen so adjacent minis overlap by exactly OVERLAP_PX along
          // the chord between their centers: chord = miniSize - OVERLAP
          // → step = 2·asin(chord / 2R).
          const OVERLAP_PX = 3;
          const stepDeg   = N >= 2
            ? (2 * Math.asin((miniSize - OVERLAP_PX) / (2 * radius))) * 180 / Math.PI
            : 0;
          const startDeg  = 45 - ((N - 1) * stepDeg) / 2;
          return (
            <div className="absolute inset-0 pointer-events-none">
              {ts.linked_awards.map((a, i) => {
                const angleRad = (startDeg + i * stepDeg) * Math.PI / 180;
                const x = cx + radius * Math.cos(angleRad);
                const y = cy + radius * Math.sin(angleRad);
                return (
                  <div
                    key={a.id}
                    className="absolute rounded-full bg-white dark:bg-gray-800 ring-[3px] ring-gray-400 dark:ring-gray-500 shadow-sm overflow-hidden flex items-center justify-center text-xs leading-none"
                    style={{
                      width: miniSize, height: miniSize,
                      left: x, top: y,
                      transform: 'translate(-50%, -50%)',
                    }}
                    title={`Counts toward ${a.name}`}
                  >
                    {a.image_file ? (
                      <img
                        src={`/api/uploads/badges/${a.image_file}`}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <span>{a.emoji || '🏆'}</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </button>
    );
  }

  const borderClass = done
    ? 'border-green-300/70 dark:border-green-700/60'
    : 'border-gray-200/70 dark:border-gray-700/60';

  // For Curiosity badges, tint the card's top gradient with the kid's current
  // badge level color so the level is felt at-a-glance.
  const kidLevelCfg = member?.badge_level && BADGE_LEVELS[member.badge_level];
  const useLevelTint = !!(ts.badge_id && kidLevelCfg);
  const cardStyle = useLevelTint
    ? { backgroundImage: `linear-gradient(to bottom, ${kidLevelCfg.color}33 0%, ${kidLevelCfg.color}10 35%, transparent 70%)` }
    : undefined;

  const handlePill = (value) => { if (onPillFilter) onPillFilter(value); };

  return (
    <div className="relative h-full" style={{ perspective: '1200px' }}>
      <div
        className="relative h-full transition-transform duration-500"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* ── FRONT ─────────────────────────────────────────── */}
        <div
          onClick={() => !isFlipped && navigate(`/tasks/${userId}/${ts.id}`)}
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', ...(cardStyle || {}) }}
          className={`relative h-full flex flex-col items-center p-4 pt-12 ${useLevelTint ? 'bg-white dark:bg-gray-800' : 'bg-gradient-to-b from-gray-50 to-white dark:from-gray-700/40 dark:to-gray-800'} border rounded-2xl shadow-md hover:shadow-lg cursor-pointer transition-all ${borderClass} hover:border-brand-300/70 dark:hover:border-brand-500/40`}
        >
          {/* Top-left: primary category/type pill (clickable as filter when onPillFilter is set) */}
          {(() => {
            const primary = primaryPillFor(ts);
            const dot     = filterDotColor(primary.filterValue);
            const isTruncCandidate = primary.label.length > 14;
            return (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handlePill(primary.filterValue); }}
                className="absolute top-2 left-2 max-w-[60%] text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 flex items-center gap-1.5 hover:ring-2 hover:ring-brand-300 transition-shadow"
                title={primary.label}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                <span className={`truncate ${isTruncCandidate ? 'max-w-[110px]' : ''}`}>{primary.label}</span>
              </button>
            );
          })()}

          {/* Top-right: tag icon to flip */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFlip?.(ts.id); }}
            className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-brand-500 transition-colors"
            aria-label="Show tags"
            title="Show tags"
          >
            <FontAwesomeIcon icon={faTag} className="text-sm" />
          </button>

          {/* Progress ring + badge image / emoji */}
          <div className="relative mb-3 flex-shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
              <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke="currentColor" strokeWidth={sw}
                className="text-gray-100 dark:text-gray-700"
              />
              {ts.step_count > 0 && (
                <circle
                  cx={size / 2} cy={size / 2} r={r}
                  fill="none" stroke="currentColor" strokeWidth={sw}
                  strokeDasharray={circ}
                  strokeDashoffset={circ - (pct / 100) * circ}
                  strokeLinecap="round"
                  className={done ? 'text-green-500' : 'text-brand-500'}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-4xl leading-none">
              {ts.badge_image_file ? (
                <img
                  src={`/api/uploads/badges/${ts.badge_image_file}`}
                  alt=""
                  className="w-20 h-20 rounded-full object-cover"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : ts.badge_id ? (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ background: 'radial-gradient(circle at center, #FFFCF0 0%, #F5E6C8 100%)' }}
                >
                  <IconDisplay value={ts.emoji} fallback="🏅" />
                </div>
              ) : (
                <IconDisplay value={ts.emoji} fallback="📋" />
              )}
            </div>
            {done && ts.completion_status !== 'pending' && !(ts.pending_step_count > 0) && (
              <span className="absolute -top-0.5 -right-0.5 w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs shadow ring-2 ring-white dark:ring-gray-800">
                <FontAwesomeIcon icon={faCheck} />
              </span>
            )}
          </div>

          <p className="font-medium text-sm text-gray-900 dark:text-gray-100 text-center leading-snug line-clamp-2">
            {ts.name}
          </p>

          {done && (ts.completion_status === 'pending' || (ts.pending_step_count ?? 0) > 0) && (
            <span className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">⏳ Awaiting approval</span>
          )}

          {done && ts.completion_status !== 'pending' && !(ts.pending_step_count > 0) && (
            <>
              <span className="mt-1.5 text-xs font-medium text-green-600 dark:text-green-400">Completed today!</span>
              <span className="mt-auto pt-2 text-sm font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
                <FontAwesomeIcon icon={faStar} />
                Done
              </span>
            </>
          )}

          {!done && ts.description && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 text-center line-clamp-2">{ts.description}</p>
          )}

          {ts.step_count > 0 && !done && (
            <span className="mt-auto pt-2 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 font-medium">
              {ts.completed_count}/{ts.step_count}
              {useTickets && ts.ticket_reward > 0 && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <FontAwesomeIcon icon={faTicket} className="text-xs" />
                    {ts.ticket_reward}
                  </span>
                </>
              )}
            </span>
          )}
        </div>

        {/* ── BACK ──────────────────────────────────────────── */}
        <div
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          className={`absolute inset-0 flex flex-col p-4 bg-gradient-to-b from-brand-50 to-white dark:from-brand-900/20 dark:to-gray-800 border rounded-xl shadow-sm ${borderClass}`}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFlip?.(ts.id); }}
            className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-brand-500 transition-colors"
            aria-label="Close tags"
            title="Back"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>

          <p className="font-medium text-sm text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 pr-7 mb-3">
            {ts.name}
          </p>

          <div className="flex flex-wrap items-center gap-1.5 p-1 -m-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handlePill(`type:${ts.type}`); }}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full hover:ring-2 hover:ring-brand-300 transition-shadow ${
                ts.type === 'Project'
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              }`}
            >
              {ts.type}
            </button>
            {ts.category && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handlePill(`category:${ts.category}`); }}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:ring-2 hover:ring-brand-300 transition-shadow"
              >
                {ts.category}
              </button>
            )}
            {Array.isArray(ts.tags) && ts.tags.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={(e) => { e.stopPropagation(); handlePill(`tag:${tag}`); }}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:ring-2 hover:ring-brand-300 transition-shadow"
              >
                {tag}
              </button>
            ))}
            {ts.badge_level && BADGE_LEVELS[ts.badge_level] && (() => {
              const lvl = BADGE_LEVELS[ts.badge_level];
              return (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handlePill(`level:${ts.badge_level}`); }}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border hover:ring-2 hover:ring-brand-300 transition-shadow"
                  style={{ backgroundColor: lvl.color, color: lvl.textColor, borderColor: lvl.borderColor }}
                >
                  {lvl.label}
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
