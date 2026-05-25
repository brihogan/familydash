#!/usr/bin/env node
/**
 * Parse the raw text dumps captured by the Chrome-MCP scrape into structured
 * badge entries, matching the schema in CuriosityUntamed/badges.json.
 *
 *   node server/scripts/parseScrapedTexts.js /tmp/cu-scrape-raw-texts.json
 *
 * The browser's innerText extraction collapses line breaks unreliably (e.g.
 * "Preschool: Do three requirements..._____ 1.* …" appears without newline
 * between header and first requirement; "Discover the Homeby Kerry Cordy"
 * loses the space between category and author). This parser handles those
 * cases by:
 *   - Inserting synthetic newlines before each `_____` underscore-marker
 *   - Inserting newlines before each Level/Preschool/Optional section header
 *   - Matching star markers anywhere (before number `*N.`, after `N.*`,
 *     space-separated ` *N.`, etc.)
 *   - Accepting both "Do N requirements" and "Choose N requirements" header
 *     verbs (CU's authors use both)
 *
 * Output: writes /tmp/cu-parsed-badges.json with the same shape badges.json
 * expects, ready to feed into mergeScrapedBadges.js.
 */

import { readFileSync, writeFileSync } from 'fs';

const inFile  = process.argv[2] || '/tmp/cu-scrape-raw-texts.json';
const outFile = process.argv[3] || '/tmp/cu-parsed-badges.json';

const raws = JSON.parse(readFileSync(inFile, 'utf8'));

const LEVEL_KEY = {
  'Preschool': 'preschool',
  'Level 1':   'level1',
  'Level 2':   'level2',
  'Level 3':   'level3',
  'Level 4':   'level4',
  'Level 5':   'level5',
};
const WORD_TO_N = { one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12 };
function parseCount(w) {
  // Accept either a number word ("three") or a digit string ("3"). Returns
  // null on neither, so the caller falls back to actual.length.
  if (!w) return null;
  const k = String(w).toLowerCase();
  if (WORD_TO_N[k] != null) return WORD_TO_N[k];
  const n = parseInt(k, 10);
  return Number.isFinite(n) ? n : null;
}

// Categories CU uses; matched as standalone substring after the badge name.
const CATEGORIES = [
  'Discover Agriculture',
  'Discover Art',
  'Discover Character',
  'Discover Health & Safety',
  'Discover the Home',
  'Discover Knowledge',
  'Discover the Outdoors',
  'Discover Science & Technology',
  'Discover the World',
];

function normalize(text) {
  // The browser's innerText smashes together lines that should be separate.
  // Re-insert newlines before each structural marker so the parser can split
  // cleanly. Order matters: insert before headers + requirements + optional
  // section, then collapse runs of newlines.
  let t = text;
  // Newline before each `_____` (requirement marker). Lookbehind excludes
  // BOTH newline (already on its own line) AND underscore (so the regex
  // doesn't re-match starting from position N of a long run, which would
  // split `_____` into `_` + `\n____`).
  t = t.replace(/(?<![\n_])(_{3,})/g, '\n$1');
  // Newline before each level / preschool / optional section header. Headers
  // may use ":", " – ", " — ", " - ", or no separator before "_____" (Optional
  // sometimes has none). We just need to spot the section name so the line
  // parser can take it from there.
  t = t.replace(/(?<!\n)(\s)(Preschool\s*[:–—-]|Level\s*[1-5]\s*[:–—-]|Optional Requirements?\s*[:–—-]?(?=\s|_))/g, '\n$2');
  // Newline before each category mention so it stands alone
  for (const c of CATEGORIES) {
    const esc = c.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    t = t.replace(new RegExp(`(?<!\\n)(${esc})(?!\\n)`, 'g'), '\n$1\n');
  }
  // Collapse 3+ blank lines to 2
  t = t.replace(/\n{3,}/g, '\n\n');
  return t;
}

function parseRequirement(raw) {
  // Match patterns:
  //   *N. text     /  N.* text  /  N text (no period, no star — fallback)
  //   Sometimes the number/star pattern is `*1.` or `1*.` or `1.*` or ` *1`
  const m = raw.match(/^\s*\*?\s*(\d+)\s*\.?\s*\*?\s*(.+?)\s*$/);
  if (!m) return null;
  const number = parseInt(m[1], 10);
  // Starred if any '*' appears in the raw before the actual text content
  const starred = /^\s*\*?\s*\d+\s*\.?\s*\*/.test(raw) || /^\s*\*/.test(raw);
  return { number, starred, text: m[2].trim() };
}

function parseLevels(text) {
  // Walk the text and find each level section + the lines inside.
  //
  // Some badges (e.g. Marshmallow) use a "shared starred requirements"
  // layout where every level header appears in a row at the top, then a
  // single set of starred requirements applies to all of them, then the
  // optional pool. We detect that by remembering any level that opened
  // with zero requirements right before another level header arrives —
  // those get pushed into `sharedQueue` and every subsequent starred
  // requirement is duplicated into them until the optional section opens.
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out = { levels: {}, optionalRequirements: [] };
  let currentSection = null; // 'preschool' | 'level1' | … | '_optional'
  let currentTotal   = null;
  let currentStarred = null;
  const sharedQueue = [];   // sections that should receive subsequent reqs
  let pendingReq = null;    // current requirement still accumulating continuation lines

  // Flush the in-progress requirement into the current section (and any
  // shared sections). Used both inline (when the next req/header arrives)
  // and at end-of-loop.
  //
  // Non-starred items inside a LEVEL section get routed to the optional
  // pool instead. Some CU badges (Microsoft Office, Seven Teachings, Water
  // Games, …) list all their reqs under "Level 5" with the starred ones
  // intermixed with the optional ones — they just don't bother to add a
  // separate "Optional Requirements" header. Without this routing the
  // non-starred items would land as level reqs and the importer would drop
  // them (importBadges.js only persists starred reqs into the level table).
  function flushPending() {
    if (!pendingReq || !currentSection) { pendingReq = null; return; }
    if (currentSection === '_optional') {
      // Pool optionals (no level scoping) — shared across all the kid's levels.
      out.optionalRequirements.push({ ...pendingReq, level: null });
    } else if (!pendingReq.starred) {
      // Non-starred req inside a level section → treat as optional, but
      // tag it with the section's level so per-level optional UIs (Math)
      // can scope correctly.
      out.optionalRequirements.push({ ...pendingReq, level: currentSection });
    } else {
      // Starred req: fan out into shared sections + current section.
      for (const s of sharedQueue) out.levels[s].requirements.push({ ...pendingReq });
      out.levels[currentSection].requirements.push(pendingReq);
    }
    pendingReq = null;
  }

  for (const line of lines) {
    // Section header? Match the section name first; the count phrasing comes
    // in several flavors — we try a few alternatives against the rest of the
    // line. Supported phrases:
    //   "Do N requirements including the M starred"
    //   "Choose N requirements including the M starred"
    //   "Complete N requirements including the M starred"
    //   "Do the M starred requirements below plus N optional requirement(s)"
    //   "Do the M starred plus N optional"
    // Numbers may be words ("three") or digits ("3").
    const hdr = line.match(/^(Preschool|Level\s*[1-5]|Optional Requirements?)\s*[:–—-]?\s*(.*)$/i);
    if (hdr) {
      const rawName = hdr[1].replace(/\s+/g, ' ').replace(/level/i, 'Level').replace(/preschool/i, 'Preschool');
      const tail = hdr[2] || '';
      let totalCount = null;
      let starredCount = null;
      let matched = false;

      // Pattern A: "N requirements including the M starred"
      let m = tail.match(/(?:Do|Choose|Complete)\s+(?:the\s+)?(\w+)\s+requirements?(?:[\s,]*including\s+the\s+(\w+)\s+starred)?/i);
      if (m) {
        matched = true;
        totalCount   = parseCount(m[1]);
        starredCount = parseCount(m[2]);
      }
      // Pattern B: "the M starred requirements below plus N optional"
      // Apply this AFTER pattern A in case A only caught "starred" partially.
      const mB = tail.match(/(?:Do|Complete)\s+the\s+(\w+)\s+starred\s+requirements?(?:\s+below)?\s+plus\s+(\w+)\s+optional/i);
      if (mB) {
        matched = true;
        starredCount = parseCount(mB[1]);
        const extra  = parseCount(mB[2]);
        totalCount   = (starredCount != null && extra != null) ? starredCount + extra : totalCount;
      }
      // We need to distinguish "Level 1: …" with a proper count phrase from a
      // plain "Level 1:" line that just happens to start with a section name.
      // Only count this as a section header if the section name is followed
      // by either nothing meaningful OR a recognized count phrase.
      const looksLikeHeader = tail === '' || matched || /^\s*$/.test(tail) ||
                              /\b(Do|Choose|Complete)\b/i.test(tail.slice(0, 30));
      if (!looksLikeHeader) continue;

      // A new section header arrived — flush any in-progress requirement
      // before we switch contexts.
      flushPending();
      if (/Optional/i.test(rawName)) {
        // Optionals are global; the shared queue is irrelevant past here.
        sharedQueue.length = 0;
        currentSection = '_optional';
        currentTotal = null;
        currentStarred = null;
      } else {
        // If we're transitioning between level headers and the previous one
        // received zero requirements, treat it as "shared" — keep accruing
        // until reqs actually arrive (or until Optional starts).
        if (currentSection && currentSection !== '_optional' &&
            (out.levels[currentSection]?.requirements?.length ?? 0) === 0 &&
            !sharedQueue.includes(currentSection)) {
          sharedQueue.push(currentSection);
        }
        currentSection = LEVEL_KEY[rawName] || null;
        currentTotal   = totalCount;
        currentStarred = starredCount;
        if (currentSection) {
          out.levels[currentSection] = {
            totalRequired: currentTotal,
            starredCount: currentStarred,
            requirements: [],
          };
        }
      }
      continue;
    }

    // Requirement starter: line begins with at least two underscores. Flush
    // any in-progress req first, then start a new one.
    const reqMatch = line.match(/^_{2,}\s*(.+)$/);
    if (reqMatch && currentSection) {
      flushPending();
      pendingReq = parseRequirement(reqMatch[1]);
      continue;
    }

    // Continuation line: not a header, not a new requirement marker. If we
    // have a pending requirement, append this to its text. This catches the
    // common "URL on its own line right after the step text" pattern, plus
    // multi-line bodies (Math badge's number-scavenger-hunt step has sub-
    // bullets on separate lines that we want to preserve visually). We join
    // with newline rather than space so the UI can `whitespace-pre-line`
    // them; URLs on their own line still flow inline because the kid
    // page renders the field with proper text wrapping.
    if (pendingReq) {
      pendingReq.text = (pendingReq.text + '\n' + line).trim();
    }
  }
  // End of input — flush whatever was in progress.
  flushPending();

  // Backfill totalRequired/starredCount from observed counts if header didn't
  // supply them.
  for (const k of Object.keys(out.levels)) {
    const lv = out.levels[k];
    if (lv.totalRequired == null) lv.totalRequired = lv.requirements.length;
    if (lv.starredCount  == null) lv.starredCount  = lv.requirements.filter(r => r.starred).length;
  }
  return out;
}

function nameFromSlug(slug) {
  // Fallback for pages whose body text has no title row. Trim "-badge" suffix,
  // then title-case the remaining tokens. Handles "learn-about-goosebumps-badge"
  // → "Learn About Goosebumps" and "microwave-cooking-badge" → "Microwave
  // Cooking". "-specific" suffix becomes "(Specific)".
  let s = slug
    .replace(/-badge(-\d+)?$/i, '')
    .replace(/-specific$/i, '-(specific)');
  return s
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\(Specific\)/i, '(Specific)')
    .trim();
}

// Slugs whose CU pages don't have a proper title row — body text either has
// no heading or has a section heading we'd mistake for the title. Skip the
// body-text heuristics and use the slug-derived name straight away.
const SLUG_ALWAYS_USE_FALLBACK = new Set([
  'learn-about-goosebumps-badge',
  'religion-specific-badge',
  'junior-ranger-specific-badge',
]);

function parseBadge(slug, raw) {
  const text = normalize(raw.text || '');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Name detection. Heuristics in order of preference:
  //   1. First line that ends in "Badge" (e.g. "Charcuterie Badge",
  //      "Cuisine by Country (Specific) Badge") — most reliable.
  //   2. First line that is NOT: site chrome ("Skip to content"), an empty
  //      parenthetical ("(Badge sample.  …)"), a category line ("Discover X"),
  //      a "(Discover X)" parenthetical category, or a "by Author" byline.
  //   3. Slug-derived name (covers pages whose body lacks a title entirely —
  //      Learn About Goosebumps and Microwave Cooking both have only the
  //      category as the first text line, never the title).
  let name = null;
  if (SLUG_ALWAYS_USE_FALLBACK.has(slug)) {
    name = nameFromSlug(slug);
  }
  for (const l of name ? [] : lines) {
    if (/Skip to content/i.test(l)) continue;
    if (/^Curiosity Untamed$/i.test(l)) continue;
    if (l.length < 3) continue;
    // Match lines ending in "Badge" (with or without leading space — some
    // pages have "X)Badge" without separator). Don't match parenthetical
    // sample lines like "(Badge sample. …)".
    if (/Badge\s*$/i.test(l) && !/^\(/.test(l)) {
      name = l.replace(/\s*Badge\s*$/i, '').trim();
      break;
    }
  }
  if (!name) {
    for (const l of lines) {
      if (/Skip to content/i.test(l)) continue;
      if (/^Curiosity Untamed$/i.test(l)) continue;
      if (l.length < 3) continue;
      if (l.length > 80) continue;                   // too long — a paragraph, not a title (e.g. Goosebumps WARNING)
      if (/^\(/.test(l)) continue;                   // parenthetical aside / sample disclaimer
      if (/^Discover\s/i.test(l)) continue;          // category line
      if (/^by\s+[A-Z]/i.test(l)) continue;          // author byline
      if (/^(Preschool|Level\s*[1-5]|Optional)/i.test(l)) continue; // section header
      if (/^_/.test(l)) continue;                    // requirement
      if (/[–—]/.test(l)) continue;                  // subtitle ("Animal Category Badge – Birds") — defer to slug
      if (/:$/.test(l))  continue;                   // section label like "Resources:" or "Note:"
      if (/^(Note|Warning|Resources|Materials|Optional)/i.test(l)) continue; // common in-content labels
      name = l.replace(/\s+Badge\s*$/i, '').trim();
      break;
    }
  }
  if (!name) name = nameFromSlug(slug);

  // Category: scan for any CATEGORIES substring (case-sensitive)
  const category = CATEGORIES.find(c => text.includes(c)) || null;

  // Author: try patterns "by Name" or "By Name" — Chrome's PII filter
  // typically masks this in our pipeline so it's often missing.
  // We try anyway in case the local Node side sees it.
  // Author: "by Name" on its own line (after normalize, names sit alone).
  // Stop at newline or "Preschool"/"Level" so we don't suck up the next
  // section. Trim trailing punctuation.
  const authorMatch = text.match(/\bby\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,3})(?=\s*(?:\n|Preschool|Level|$))/i);

  const { levels, optionalRequirements } = parseLevels(text);

  return {
    name,
    slug,
    url: `https://curiosityuntamed.com/badges/${slug}/`,
    category,
    author: authorMatch?.[1] || null,
    isSpecific: /-specific/i.test(slug) || /Specific/.test(name || ''),
    note: null,
    disclaimer: null,
    levels,
    optionalRequirements,
    relatedBadges: [],
    imageUrl: raw.imageUrl || null,
    imageFile: null,
  };
}

const parsed = {};
for (const [slug, raw] of Object.entries(raws)) {
  if (raw.error) { parsed[slug] = { slug, error: raw.error }; continue; }
  parsed[slug] = parseBadge(slug, raw);
}

writeFileSync(outFile, JSON.stringify(Object.values(parsed), null, 2));

// Print a summary so we can see what the parser caught vs missed
const stats = {
  total:        Object.keys(parsed).length,
  withImage:    0,
  withCategory: 0,
  withAuthor:   0,
  withLevels:   0,
  withOptional: 0,
  levelCounts: { preschool: 0, level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 },
  noLevels: [],
};
for (const b of Object.values(parsed)) {
  if (b.error) continue;
  if (b.imageUrl)             stats.withImage++;
  if (b.category)             stats.withCategory++;
  if (b.author)               stats.withAuthor++;
  if (Object.keys(b.levels).length) stats.withLevels++; else stats.noLevels.push(b.slug);
  if (b.optionalRequirements?.length) stats.withOptional++;
  for (const k of Object.keys(b.levels || {})) stats.levelCounts[k]++;
}
console.log('Summary:');
console.log(JSON.stringify(stats, null, 2));
console.log(`Wrote ${outFile}`);
