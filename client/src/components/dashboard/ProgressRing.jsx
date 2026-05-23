/**
 * Circular progress ring with an icon/emoji inside.
 *
 * Props:
 *   pct           - number 0–100
 *   done          - bool: ring turns green when true
 *   size          - diameter in px (default 32)
 *   light         - bool: white ring on a colored background (mobile card header)
 *   trackColor    - optional explicit CSS color for the track (undone portion)
 *   progressColor - optional explicit CSS color for the progress arc (done portion)
 *   bgColor       - optional fill color for a background circle drawn inside the SVG
 *   title         - tooltip text
 *   onClick       - optional click handler
 *   children      - icon or emoji rendered in the centre
 */
export default function ProgressRing({ pct, done = false, size = 32, light = false, trackColor, progressColor, bgColor, title, onClick, children }) {
  const sw   = 2.5;
  const r    = (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <div
      className={`relative flex-shrink-0 ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      style={{ width: size, height: size }}
      title={title}
      onClick={onClick}
    >
      {/* Background fill circle (behind the children) — separate SVG so the
          children/image sit on top of the bg but still below the ring strokes. */}
      {bgColor && (
        <svg width={size} height={size} className="absolute inset-0 pointer-events-none">
          <circle cx={size / 2} cy={size / 2} r={size / 2} fill={bgColor} />
        </svg>
      )}
      {/* Centre icon — inset so badge images sit inside the ring stroke */}
      <div
        className="absolute flex items-center justify-center leading-none pointer-events-none overflow-hidden rounded-full"
        style={{ fontSize: Math.round(size * 0.32), inset: Math.max(3, Math.round(size * 0.12)) }}
      >
        {children}
      </div>
      {/* Ring strokes (on top of children so the progress arc is always visible) */}
      <svg width={size} height={size} className="absolute inset-0 z-10 pointer-events-none" style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={trackColor ?? 'currentColor'}
          strokeWidth={sw}
          className={trackColor ? undefined : (light ? 'text-white/30' : 'text-gray-200 dark:text-gray-600')}
        />
        {/* Progress arc */}
        {pct > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={progressColor ?? 'currentColor'}
            strokeWidth={sw}
            strokeDasharray={circ}
            strokeDashoffset={circ - (pct / 100) * circ}
            strokeLinecap="round"
            className={progressColor ? undefined : (light ? 'text-white' : done ? 'text-green-500' : 'text-brand-500')}
          />
        )}
      </svg>
    </div>
  );
}
