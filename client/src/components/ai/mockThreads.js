// Phase 1 stand-in for the AI tutor backend.
//
// Holds threads in a module-level Map (so they survive closing and reopening a
// step within a tab, which is what makes "resume, don't restart" reviewable)
// and returns canned replies after a fake delay.
//
// Two things in here are prototypes, not throwaway:
//
//   1. `detectMode()` is the heuristic version of the Phase 2a classification
//      pass. Across all 19,624 Curiosity Untamed requirements: ~53% carry a
//      knowledge hook, 28% make something, 10% social, 6% do, 6% go, 5% media.
//      Haiku will do this properly and store the result per requirement; this
//      shows what mode-specific openers feel like in the meantime.
//   2. `OPENERS` / `CHIPS` are the shape the real prompt has to return:
//      one reply plus 2-4 short follow-ups, optionally a cross-badge pointer.
//
// Nothing here survives a page reload, and nothing here talks to a server.

// ── Thread store ──────────────────────────────────────────────────────────────

const STORE = new Map(); // stepId -> thread

let seq = 0;
const nextId = () => `m${++seq}`;

export function getThread(stepId) {
  return STORE.get(stepId) || null;
}

export function threadCount(stepId) {
  return STORE.get(stepId)?.messages.length || 0;
}

// Newest first — powers the Wonders page and the resume pill.
export function allThreads() {
  return [...STORE.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function resetThreads() {
  STORE.clear();
}

// Create the thread (with its opening message) if this step has never been
// opened. `meta` carries what the real system prompt will get: badge, step,
// level/tier, kid's first name.
export function ensureThread(meta) {
  const existing = STORE.get(meta.stepId);
  if (existing) return existing;

  const mode = detectMode(meta.stepText);
  const thread = {
    stepId: meta.stepId,
    taskSetId: meta.taskSetId,
    userId: meta.userId,
    badgeName: meta.badgeName,
    badgeEmoji: meta.badgeEmoji,
    badgeImageFile: meta.badgeImageFile,
    levelLabel: meta.levelLabel,
    stepText: meta.stepText,
    mode,
    trail: [], // topics touched, in order — the rabbit-hole breadcrumb
    updatedAt: Date.now(),
    messages: [
      {
        id: nextId(),
        role: 'ai',
        kind: 'chat',
        text: opener(meta, mode),
        chips: openingChips(meta, mode),
      },
    ],
  };
  STORE.set(meta.stepId, thread);
  return thread;
}

export function appendMessage(stepId, msg) {
  const thread = STORE.get(stepId);
  if (!thread) return null;
  thread.messages.push({ id: nextId(), ...msg });
  thread.updatedAt = Date.now();
  return thread;
}

export function pushTrail(stepId, topic) {
  const thread = STORE.get(stepId);
  if (!thread || !topic) return;
  if (thread.trail[thread.trail.length - 1] !== topic) thread.trail.push(topic);
}

// ── Step mode detection (prototype of the Phase 2a classifier) ────────────────

const MODE_PATTERNS = [
  ['go',     /\b(visit|go to|attend|take a tour|tour a|field trip|museum|planetarium|aquarium|zoo|observatory|nature center)\b/i],
  ['media',  /\b(read a|read the|read at least|watch a|watch the|listen to|documentary|biography)\b/i],
  ['social', /\b(teach (someone|a|your|others|kids)|interview|talk (to|with)|volunteer|host|donate)\b/i],
  ['make',   /\b(make|create|draw|design|build|write|bake|cook|sew|paint|sculpt|compose|craft|invent|illustrate)\b/i],
  ['do',     /\b(practice|demonstrate|play a|play at least|perform|memorize|hike|keep a (log|journal))\b/i],
  ['know',   /\?|\b(learn about|learn the|learn how|research|find out|study|what is|why|how does|history of|understand|explain|identify|compare|discuss)\b/i],
];

export function detectMode(stepText = '') {
  for (const [mode, re] of MODE_PATTERNS) if (re.test(stepText)) return mode;
  return 'know';
}

export const MODE_LABELS = {
  know:   'Learn about it',
  make:   'Make something',
  go:     'Go somewhere',
  do:     'Practice it',
  social: 'With other people',
  media:  'Read or watch',
};

// ── Topic extraction ─────────────────────────────────────────────────────────

// Pull a short subject phrase out of a requirement so the mock can sound like
// it read the step. "Learn about the Kardashev Scale and its classification…"
// → "the Kardashev Scale".
function topicOf(stepText = '') {
  let t = String(stepText).trim().split(/[.?!\n]/)[0] || '';
  t = t.replace(
    /^(learn about|learn how to|learn how|learn the|learn|research and analyze|research|find out about|find out|discuss the|discuss|understand the|understand|explore the|explore|identify the|identify|study the|study|make a|make|create a|create|draw a|draw|design a|design|build a|build|visit a|visit|go to a|go to|attend a|attend|read a|read the|read|watch a|watch the|watch|play a|play|practice|teach someone about|teach someone|interview an|interview a|interview)\s+/i,
    '',
  );
  t = t.replace(/\s+and\s+.*$/i, '').replace(/\s+such as\s+.*$/i, '');
  const words = t.split(/\s+/).filter(Boolean).slice(0, 7);
  return words.join(' ').replace(/[,;:]$/, '') || 'this';
}

// ── Openers ──────────────────────────────────────────────────────────────────

function opener(meta, mode) {
  const topic = topicOf(meta.stepText);
  const hi = meta.kidName ? `Hey ${meta.kidName} — ` : '';

  // The Alien Life / Fermi step is written out in full so there's at least one
  // path through the UI with real content rather than scaffolding.
  if (/fermi/i.test(meta.stepText)) {
    return `${hi}this step has two halves. The scale of the universe — which is genuinely hard to hold in your head — and the Fermi Paradox, which is the question "if space is that big, where is everybody?"\n\nWhich end do you want to start from?`;
  }

  switch (mode) {
    case 'make':
      return `${hi}before you make anything: the interesting part of ${topic} is the choices you make before you start. Want me to throw some at you, or do you already have a picture in your head?`;
    case 'go':
      return `${hi}I can't see what's actually near you — that's a job for you and a grown-up with a map. What I can do is tell you what kind of place to look for, and what's worth asking when you get there.`;
    case 'do':
      return `${hi}${topic} is the sort of thing that's mostly technique. Want the "do this, not that" version, or the story of where it came from first?`;
    case 'social':
      return `${hi}the tricky bit here isn't the topic, it's knowing what to ask. Want to build a list of questions together before you go?`;
    case 'media':
      return `${hi}I can suggest a few options and then we can talk about it afterwards — the talking-about-it part is usually where it gets good. What are you in the mood for?`;
    default:
      return `${hi}okay: ${topic}. Where do you want to start?`;
  }
}

function openingChips(meta, mode) {
  const topic = topicOf(meta.stepText);

  if (/fermi/i.test(meta.stepText)) {
    return ['How big is the universe, really?', 'Who was Fermi?', 'Just tell me the paradox'];
  }

  switch (mode) {
    case 'make':  return ['Give me three wild ideas', `Why does ${topic} work?`, 'What do I need?'];
    case 'go':    return ['What kind of place?', 'What should I look for?', 'What do I ask someone there?'];
    case 'do':    return ['Show me the technique', 'What do people get wrong?', 'Where did it come from?'];
    case 'social':return ['Help me write questions', 'What if I get stuck?', 'How do I explain it?'];
    case 'media': return ['Give me options', 'Something short', 'Something weird'];
    default:
      // Requirement text is often already phrased as a question ("Discuss why
      // there are so many car types"), and "What is why there are…?" is
      // nonsense. Echo the phrasing back instead of wrapping it.
      return [
        /^(why|how|what|who|when|where)\b/i.test(topic)
          ? `${topic.charAt(0).toUpperCase()}${topic.slice(1)}?`
          : `What is ${topic}?`,
        'Why does it matter?',
        'Tell me something surprising',
      ];
  }
}

// ── Canned replies ───────────────────────────────────────────────────────────

// Real content for the Fermi thread, so the rabbit hole can be walked end to
// end. Everything else gets a structurally-correct placeholder.
const SCRIPTED = [
  {
    match: /who was fermi|fermi\?$/i,
    topic: 'Enrico Fermi',
    text:
      'Enrico Fermi was a physicist — he built the first nuclear reactor, under a football stadium in Chicago, in 1942.\n\nBut the paradox came from lunch. In 1950 he was eating with some colleagues, they were joking about flying saucers, and Fermi suddenly asked: "But where is everybody?" He\'d done the arithmetic in his head and realised the numbers didn\'t add up.',
    chips: ['What arithmetic?', 'So where IS everybody?', 'Did anyone answer him?'],
  },
  {
    match: /how big is the universe|scale of the universe|what arithmetic/i,
    topic: 'the scale of the universe',
    text:
      'Our galaxy has something like 100 billion stars. And there are around 2 trillion galaxies.\n\nHere\'s the part that bothered Fermi: the galaxy is about 10 billion years old, but even with slow ships — no warp drive, nothing clever — a civilisation could spread across the whole thing in a few million years. That\'s a rounding error compared to 10 billion.\n\nSo somebody should have arrived a long time ago. Nobody has.',
    chips: ['So where IS everybody?', "What if we're the first ones?", 'Are we even looking the right way?'],
  },
  {
    match: /where is everybody|where are they|the paradox|tell me the paradox/i,
    topic: 'the Fermi Paradox',
    text:
      'That\'s the paradox — there\'s no agreed answer, just a pile of candidates:\n\n• They\'re out there and we haven\'t looked hard enough or long enough.\n• Life starts easily but almost never gets complicated.\n• Civilisations reliably wipe themselves out before they can travel.\n• They\'re deliberately staying quiet, and maybe we should be too.\n• We really are first.\n\nYour step asks which you think is most likely. Genuinely — which one bothers you least?',
    chips: ['The wipe-themselves-out one', "What if we're the first ones?", "What's the Great Filter?", 'Are we even looking the right way?'],
  },
  {
    match: /great filter|wipe themselves out|wipe-themselves/i,
    topic: 'the Great Filter',
    text:
      'The Great Filter is the idea that somewhere between "dead rock" and "civilisation spanning the galaxy" there\'s a step almost nothing gets past.\n\nThe unsettling part is that we don\'t know whether it\'s behind us or in front of us. If it\'s behind — if the hard step was single cells becoming complex cells — then we\'re through it and the galaxy is ours. If it\'s ahead, then something reliably stops civilisations at roughly our stage, and we\'re walking towards it.\n\nThis is why some scientists think finding simple life on Mars would be *bad* news. Can you work out why?',
    chips: ['Why would that be bad news?', 'Which side do you think it\'s on?', "What if we're the first ones?"],
  },
  {
    match: /why would that be bad|bad news/i,
    topic: 'the Great Filter',
    text:
      'Because it would mean life starting isn\'t the hard step.\n\nIf life pops up twice in one solar system, it must be easy — so the filter can\'t be behind us at the "getting started" stage. And if it\'s not behind us, the odds shift towards it being ahead of us.\n\nEmpty sky, empty Mars: we might just be early. Life everywhere but nobody talking: something is stopping them.',
    chips: ['So should we stop looking?', "What if we're the first ones?", 'Are we even looking the right way?'],
  },
  {
    match: /first ones|are we first|we're the first/i,
    topic: 'whether we are first',
    text:
      'It\'s allowed! The universe is 13.8 billion years old, which sounds like plenty — but the era when stars can support life runs for trillions of years. We\'re barely out of the starting blocks.\n\nSome cosmologists have argued that if you picked a random civilisation from all of time, it would almost certainly appear much later than us. Which makes "we\'re early" less of a coincidence than it first sounds.\n\nIt also means the quiet sky might not be a warning. Just an empty room, before the party.',
    chips: ['That\'s kind of lonely', "What's the Drake Equation?", 'Are we even looking the right way?'],
  },
  {
    match: /looking the right way|how do we look|listening|radio|telescope|seti/i,
    topic: 'how we search',
    text:
      'Mostly we listen for radio. SETI points dishes at stars and looks for a signal too narrow and too regular to be natural.\n\nBut there\'s an assumption buried in that: it only works if they\'re broadcasting, in radio, in our direction, right now, in a window we happen to be watching. We\'ve only had the technology for about a century — a blink. Newer searches look for other things entirely, like starlight filtered through a planet\'s atmosphere.',
    chips: ['What would a signal look like?', 'What if they use something else?', 'Has anything ever come close?'],
    crossBadge: {
      badge: 'Astronomy',
      emoji: '🔭',
      stepLabel: 'step 4',
      blurb: 'How radio telescopes actually listen',
    },
  },
  {
    match: /drake equation/i,
    topic: 'the Drake Equation',
    text:
      'It\'s a chain of guesses multiplied together to estimate how many civilisations we could talk to: how many stars form, how many have planets, how many of those could hold life, how often life appears, how often it gets smart, how often it broadcasts — and how long it lasts before it stops.\n\nThe first few terms we now actually know. The last few are pure guesswork, and the final one — how long a civilisation lasts — swings the answer from millions down to one.\n\nThat last term is really a question about us.',
    chips: ['Let me pick the numbers', 'Which terms do we know?', 'What did Drake get?'],
  },
];

// ── The mock "model call" ────────────────────────────────────────────────────

export function mockReply({ thread, input, tier }) {
  const hit = SCRIPTED.find((s) => s.match.test(input));
  if (hit) {
    return { text: hit.text, chips: hit.chips, crossBadge: hit.crossBadge || null, topic: hit.topic };
  }

  const topic = topicOf(input.length > 12 ? input : thread.stepText);
  const words = AI_TIER_WORDS[tier?.label] || 90;
  return {
    text:
      `*(Preview build — this reply is canned. Phase 2 sends the step, the badge, ` +
      `your level (${tier?.ages || 'unknown'}) and this conversation to Haiku, which ` +
      `answers in about ${words} words.)*\n\n` +
      `You asked about “${topic}”. The real answer lands here, pitched at ${tier?.label || 'this'} ` +
      `level — then two or three follow-ups appear below, and tapping one keeps going.`,
    chips: ['Tell me more', 'Why does that happen?', 'Something surprising'],
    crossBadge: null,
    topic,
  };
}

const AI_TIER_WORDS = {
  'Read-aloud': 40, 'Early reader': 60, 'Middle reader': 90, Tween: 130, Teen: 180, Adult: 220,
};

// The answer coach. Never returns answer-shaped prose — see ANSWER_REVIEW_RULES.
export function mockAnswerReview({ draft, tier, thread }) {
  if (/fermi/i.test(thread.stepText) && /star/i.test(draft)) {
    return {
      text:
        'You got the strongest part of the real argument on your own — "so many stars" is literally the first term of the Drake Equation. Scientists start in exactly the same place you did.\n\nOne thing to chew on: "too far away" is one of the genuine proposed answers, so you\'re in good company. But some people argue distance isn\'t enough on its own, because even slow ships would cross the galaxy in a few million years — and the galaxy is far older than that.\n\nDoes that change your answer, or do you want to argue back?',
      chips: ['I want to argue back', 'What ARE the other answers?', "Nope, I'm happy with mine"],
    };
  }
  return {
    text:
      `*(Preview build — canned. Phase 2 sends your draft to Haiku with one rule above ` +
      `all others: never hand back a sentence you could paste in as your answer.)*\n\n` +
      `Here it names something you got right and the real idea behind it, then raises ` +
      `exactly one thing to think about and ends on a question. It never says whether ` +
      `your answer is good enough — finishing the step stays your call.`,
    chips: ['I want to argue back', 'What am I missing?', "I'm happy with mine"],
  };
}

// Fake network latency so pacing can be judged.
export const MOCK_LATENCY_MS = 550;
