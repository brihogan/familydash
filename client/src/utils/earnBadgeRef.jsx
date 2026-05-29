// Detect & decorate "Earn the {Name} badge" cross-references in requirement /
// optional text. Mirrors the server's EARN_BADGE_RE in
// services/badgeRefLink.js. When the server resolved the phrase to a real
// badge (linkedBadgeId present), the matched phrase gets a dotted underline so
// the reader can see it points at another badge.
const EARN_BADGE_RE = /\bearn\s+(?:the|a|an|your)\s+(.+?)\s+badges?\b/i;

export function renderEarnBadgeRef(text, linkedBadgeId, linkedBadgeName) {
  if (!linkedBadgeId || !text) return text;
  const m = EARN_BADGE_RE.exec(text);
  if (!m) return text;
  const start = m.index;
  const end   = start + m[0].length;
  return (
    <>
      {text.slice(0, start)}
      <span
        className="underline decoration-dotted decoration-2 underline-offset-2 decoration-brand-400"
        title={`Links to the ${linkedBadgeName} badge`}
      >
        {text.slice(start, end)}
      </span>
      {text.slice(end)}
    </>
  );
}
