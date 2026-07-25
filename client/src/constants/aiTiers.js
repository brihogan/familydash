// Voice rules for the badge-step AI tutor, keyed by the `aiTier` on each entry
// of BADGE_LEVELS (constants/badgeLevels.js).
//
// The badge level is set per enrollment (`task_sets.badge_level`), and Curiosity
// Untamed ties each level to an age band — so the level IS the age signal. We
// never ask the kid how old they are.
//
//   preschool → Ages 3-5   → read-aloud
//   Level 1   → Ages 5-8   → early
//   Level 2   → Ages 8-11  → middle
//   Level 3   → Ages 11-14 → tween
//   Level 4   → Ages 14-18 → teen
//   Level 5   → Adults 18+ → adult      (Curiosity Untamed's Level 5 is adults)
//
// Phase 2 mirrors this file server-side; `guidance` becomes part of the system
// prompt. Phase 1 uses it to pick mock copy so the tone can be reviewed per
// level without any API calls.

export const AI_TIERS = {
  'read-aloud': {
    label: 'Read-aloud',
    ages: 'Ages 3-5',
    // A 3-year-old can't type, and shouldn't be alone in a chat box. The panel
    // is hidden at this level; if we ever turn it on it becomes a card the
    // grown-up reads out, not a conversation.
    enabled: false,
    maxWords: 40,
    chipWords: 3,
    guidance:
      'You are talking to a grown-up who will read this out loud to a 3-5 year old. ' +
      'Two or three short sentences. Concrete nouns only, no abstractions, no numbers over ten.',
  },
  early: {
    label: 'Early reader',
    ages: 'Ages 5-8',
    enabled: true,
    maxWords: 60,
    chipWords: 5,
    guidance:
      'The reader is 5-8. Use short sentences a first or second grader can read alone. ' +
      'Concrete and physical — things they can see or touch. No analogies that need ' +
      'other knowledge, no big numbers, no jargon. Never more than about 60 words.',
  },
  middle: {
    label: 'Middle reader',
    ages: 'Ages 8-11',
    enabled: true,
    maxWords: 90,
    chipWords: 6,
    guidance:
      'The reader is 8-11. Fourth-to-fifth-grade reading level. One analogy is allowed ' +
      'and usually helps. You may introduce ONE piece of real terminology per answer if ' +
      'you define it in the same breath. Around 90 words.',
  },
  tween: {
    label: 'Tween',
    ages: 'Ages 11-14',
    enabled: true,
    maxWords: 130,
    chipWords: 7,
    guidance:
      'The reader is 11-14. Middle-school level. They can handle named theories, simple ' +
      'equations, and competing explanations. Do not water things down — being treated as ' +
      'capable is the point. Around 130 words.',
  },
  teen: {
    label: 'Teen',
    ages: 'Ages 14-18',
    enabled: true,
    maxWords: 180,
    chipWords: 8,
    guidance:
      'The reader is 14-18. Use real terminology without apologising for it. You may ' +
      'disagree with them and defend a position. Around 180 words.',
  },
  adult: {
    label: 'Adult',
    ages: 'Adults 18+',
    enabled: true,
    maxWords: 220,
    chipWords: 8,
    guidance:
      'The reader is an adult earning this badge themselves. Talk to them as a peer. ' +
      'No encouragement scaffolding, no "great question!". Around 220 words.',
  },
};

export const DEFAULT_TIER = 'middle';

// Resolve a badge level key ('level2') to its tier config. Falls back to the
// middle tier for task sets with no badge level (plain Projects).
export function tierForLevel(levelKey, levels) {
  const cfg = levelKey && levels ? levels[levelKey] : null;
  return AI_TIERS[cfg?.aiTier] || AI_TIERS[DEFAULT_TIER];
}

// ── Shared rules (Phase 1: documentation; Phase 2: system prompt) ─────────────

// The kid writes their own answer. The AI may react to it — never supply it.
export const ANSWER_REVIEW_RULES = [
  'Never write a sentence the kid could paste in as their answer.',
  'Find something genuinely right first, and name the real concept behind it.',
  'Raise exactly one thing to think about, and end on a question.',
  'Never say whether the answer is good enough — completing the step is theirs to decide.',
];

// "Read what I wrote" stays hidden until there's something to react to.
export const ANSWER_REVIEW_MIN_CHARS = 15;
