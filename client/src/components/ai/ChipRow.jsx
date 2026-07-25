// Tappable follow-ups under the most recent AI message.
//
// These are the whole rabbit-hole mechanic: "any other questions?" gets silence
// from a 9-year-old, but a button gets tapped. Each tap produces a new answer
// with new chips, and that chain is what we're trying to create.
//
// Styled deliberately quiet — plain background, italic, muted — so they read as
// things YOU might say rather than part of the tutor's answer. Loud chips pull
// the eye down the page and you end up skimming the reply to get to them.

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight } from '@fortawesome/free-solid-svg-icons';

export default function ChipRow({ chips = [], crossBadge = null, disabled, onTap, onCrossBadge }) {
  if (!chips.length && !crossBadge) return null;

  return (
    <div className="mt-2.5 flex flex-col gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          disabled={disabled}
          onClick={() => onTap(chip)}
          className="text-left px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm italic text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {chip}
        </button>
      ))}

      {/* Cross-badge pointer. With 846 badges in the library, a follow-up that
          wanders into another badge is a navigation opportunity — the app moves
          with the conversation instead of the conversation floating over it. */}
      {crossBadge && (
        <div className="mt-1 rounded-xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-900/15 p-3">
          <p className="text-sm text-amber-900 dark:text-amber-100 leading-snug">
            <span className="mr-1">{crossBadge.emoji}</span>
            {crossBadge.blurb} is also {crossBadge.stepLabel} of the{' '}
            <span className="font-semibold">{crossBadge.badge}</span> badge.
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onCrossBadge(crossBadge)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 transition-colors"
          >
            Go there
            <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
          </button>
        </div>
      )}
    </div>
  );
}
