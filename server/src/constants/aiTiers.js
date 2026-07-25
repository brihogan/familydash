// Server mirror of client/src/constants/aiTiers.js.
//
// Curiosity Untamed ties each badge level to an age band, and the level is set
// per enrollment (`task_sets.badge_level`) — so the level IS the age signal and
// nothing has to be configured per kid.
//
// Keep this in sync with the client copy; the client uses it to label the panel
// and the server uses it to build the system prompt.

export const AI_TIERS = {
  'read-aloud': {
    key: 'read-aloud', label: 'Read-aloud', ages: 'Ages 3-5', enabled: false,
    maxWords: 40, chipWords: 3, maxTokens: 300,
    guidance:
      'You are talking to a grown-up who will read this out loud to a 3-5 year old. ' +
      'Two or three short sentences. Concrete nouns only, no abstractions, no numbers over ten.',
  },
  early: {
    key: 'early', label: 'Early reader', ages: 'Ages 5-8', enabled: true,
    maxWords: 60, chipWords: 5, maxTokens: 400,
    guidance:
      'The reader is 5-8. Use short sentences a first or second grader can read alone. ' +
      'Concrete and physical — things they can see or touch. No analogies that need other ' +
      'knowledge, no big numbers, no jargon. Never more than about 60 words.',
  },
  middle: {
    key: 'middle', label: 'Middle reader', ages: 'Ages 8-11', enabled: true,
    maxWords: 90, chipWords: 6, maxTokens: 500,
    guidance:
      'The reader is 8-11. Fourth-to-fifth-grade reading level. One analogy is allowed and ' +
      'usually helps. You may introduce ONE piece of real terminology per answer if you define ' +
      'it in the same breath. Around 90 words.',
  },
  tween: {
    key: 'tween', label: 'Tween', ages: 'Ages 11-14', enabled: true,
    maxWords: 130, chipWords: 7, maxTokens: 650,
    guidance:
      'The reader is 11-14. Middle-school level. They can handle named theories, simple ' +
      'equations, and competing explanations. Do not water things down — being treated as ' +
      'capable is the point. Around 130 words.',
  },
  teen: {
    key: 'teen', label: 'Teen', ages: 'Ages 14-18', enabled: true,
    maxWords: 180, chipWords: 8, maxTokens: 800,
    guidance:
      'The reader is 14-18. Use real terminology without apologising for it. You may disagree ' +
      'with them and defend a position. Around 180 words.',
  },
  adult: {
    key: 'adult', label: 'Adult', ages: 'Adults 18+', enabled: true,
    maxWords: 220, chipWords: 8, maxTokens: 900,
    guidance:
      'The reader is an adult earning this badge themselves. Talk to them as a peer. No ' +
      'encouragement scaffolding, no "great question!". Around 220 words.',
  },
};

const LEVEL_TO_TIER = {
  preschool: 'read-aloud',
  level1:    'early',
  level2:    'middle',
  level3:    'tween',
  level4:    'teen',
  level5:    'adult',
};

export const DEFAULT_TIER = 'middle';

export function tierForLevel(levelKey) {
  return AI_TIERS[LEVEL_TO_TIER[levelKey]] || AI_TIERS[DEFAULT_TIER];
}

// What the tutor does depends on what the step actually asks for. Filled in per
// requirement by the offline classification pass; these strings tell the model
// how to behave for each.
export const MODE_GUIDANCE = {
  know:
    'This step asks them to learn something. Answer the question the step is really asking, ' +
    'then make the next question irresistible.',
  make:
    'This step asks them to make something. Do NOT design it for them and do not give ' +
    'step-by-step instructions unless asked. Ask about their choices, and where you can, ' +
    'smuggle a real idea into a creative prompt (if the star is red, what colour are the plants?).',
  go:
    'This step asks them to go somewhere. You do NOT know what is near them and must never ' +
    'name a specific local business, address, or opening time — inventing one sends a family ' +
    'on a wasted trip. Describe the KIND of place to look for, what to notice once there, and ' +
    'what to ask a member of staff. Searching is a job for them and a grown-up.',
  do:
    'This step asks them to practise something. Give technique, the common mistake, and a way ' +
    'to check themselves.',
  social:
    'This step involves other people. Help them prepare — questions to ask, how to explain ' +
    'what they learned — rather than doing the talking for them.',
  media:
    'This step asks them to read or watch something. Suggest age-appropriate options, and ' +
    'offer to talk about it afterwards.',
};

// ── The answer coach ─────────────────────────────────────────────────────────
// The kid writes their own answer. The tutor may react to it; it must never
// supply it.
export const ANSWER_REVIEW_RULES = [
  'Never write a sentence the kid could paste in as their answer.',
  'Do not rewrite, reword, or summarise their draft back to them.',
  'Find something genuinely right first, and name the real concept behind it.',
  'Raise exactly one thing to think about, and end on a question.',
  'Never say whether the answer is good enough — completing the step is theirs to decide.',
];

export const ANSWER_REVIEW_MIN_CHARS = 15;
