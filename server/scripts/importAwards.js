/**
 * Import CuriosityUntamed Awards into FamilyDash.
 *
 * Awards live in the same `badges` table with is_award=1. They share the badge
 * image-serving and browser infrastructure but use `award_type` + `award_config`
 * to drive a different completion + detail-page UX.
 *
 * Idempotent: INSERT OR IGNORE on slug, image download skips files that exist.
 *
 * Usage (from repo root):
 *   node --env-file=.env server/scripts/importAwards.js
 */

import { mkdirSync, existsSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/db/migrations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH      = process.env.DATABASE_PATH || join(__dirname, '../../data/family.db');
const IMAGES_DEST  = join(dirname(DB_PATH), 'uploads', 'badges'); // shared bucket; same URL prefix as badges

// ─── Award definitions ────────────────────────────────────────────────────────
// One row per award. `image_url` is fetched and saved as `image_file` (basename).
//
// award_type values:
//   'specific_badges'   — fixed list of badge names earned at the kid's level
//   'area_coverage'     — at least one badge per area at the kid's level (Discovery)
//   'count_at_level'    — N badges at any single level (Wow)
//   'composite'         — N other awards earned (Gem)
//   'task_list'         — per-level checklist of tasks (Life Skills, Outdoors)
//                         steps may mix badge references and free-text activities
//   'manual'            — parent confirms (Servant's Heart, Make a Difference, etc.)
//
// award_config schema by type:
//   specific_badges:  {"badge_names": ["U.S. Constitution", "Elections", ...]}
//   area_coverage:    {} (areas are implicit — all 9 Areas of Discovery)
//   count_at_level:   {"min": 100}
//   composite:        {"award_slugs": ["servants-heart","make-a-difference",...]}
//   task_list:        {"per_level": {"preschool":[{type,text|badge_name|...}], "level1":[…]}}
//                     step types: "badge" (specific badge to earn), "activity" (text only)
//   manual:           {"hint": "Parent confirms when ..."}

const AWARDS = [
  {
    name: "Servant's Heart Award",
    slug: 'servants-heart',
    source_url: 'https://curiosityuntamed.com/servants-hearts/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/servants-heart-line.jpg',
    description: 'Earned by completing volunteer service hours at your level. A recognition of giving back to community and family.',
    award_type: 'manual',
    award_config: { hint: 'Parent confirms when the kid has met the required service hours at their level.' },
  },
  {
    name: 'Life Skills Achievement Award',
    slug: 'life-skills',
    source_url: 'https://curiosityuntamed.com/life-skills-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/life-skill-award.jpg',
    description: 'Master practical skills across household chores, personal grooming, physical skills, safety, finances, navigation, and basic living. The award emphasizes ongoing proficiency, not just one-time completion.',
    award_type: 'task_list',
    award_config: { per_level: {} }, // populated manually or from member sub-pages later
  },
  {
    name: 'Discovery Award',
    slug: 'discovery',
    source_url: 'https://curiosityuntamed.com/discovery-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2020/08/discovery-award-pink.jpg',
    description: 'Earn at least one badge from each of the nine Areas of Discovery, all at the same age level.',
    award_type: 'area_coverage',
    award_config: {},
  },
  {
    name: 'WOW! Award',
    slug: 'wow',
    source_url: 'https://curiosityuntamed.com/wow-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2020/08/wow-yellow-blank.jpg',
    description: 'Earn 100 or more badges at a single age level — a celebration of breadth and dedication.',
    award_type: 'count_at_level',
    award_config: { min: 100 },
  },
  {
    name: 'Fruit of the Spirit Award',
    slug: 'fruit-of-the-spirit',
    source_url: 'https://curiosityuntamed.com/fruit-of-the-spirit-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2020/08/fruit-spirit-blue.jpg',
    description: 'Earn all nine character badges from the Quest Club code of conduct: Love, Joy, Peace, Patience, Kindness, Faithfulness, Gentleness, Goodness, and Self Control. Can be re-earned at each level.',
    award_type: 'specific_badges',
    award_config: {
      badge_names: ['Love', 'Joy', 'Peace', 'Patience', 'Kindness', 'Faith/Faithfulness', 'Gentleness', 'Goodness', 'Self Control'],
    },
  },
  {
    name: 'Liberty Award',
    slug: 'liberty',
    source_url: 'https://curiosityuntamed.com/liberty-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/Liberty-Award-3.png',
    description: 'Build civic literacy by earning five badges focused on American liberty and history.',
    award_type: 'specific_badges',
    award_config: {
      badge_names: ['U.S. Constitution', 'Elections', 'U.S. Government', 'U.S. History', 'Patriotism'],
    },
  },
  {
    name: 'Major Award',
    slug: 'major',
    source_url: 'https://curiosityuntamed.com/major-in-and-area-of-discovery/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/major-stars.png',
    description: 'Specialize in a single Area of Discovery by earning a large number of badges within it. Awarded per area, per level.',
    award_type: 'manual',
    award_config: { hint: 'Parent confirms when the kid has majored in a chosen Area of Discovery at their level.' },
  },
  {
    name: 'Make a Difference Award',
    slug: 'make-a-difference',
    source_url: 'https://curiosityuntamed.com/make-a-difference-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/MAD-AWARD.jpg',
    description: 'Lead a community service project that makes a tangible difference. Required at each level except Preschool.',
    award_type: 'manual',
    award_config: { hint: 'Parent confirms when the kid has led a community service project at their level.' },
  },
  {
    name: 'Leadership Award',
    slug: 'leadership',
    source_url: 'https://curiosityuntamed.com/awards/leadership-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/LEADERSHIP-AWARD.jpg',
    description: 'Recognizes leadership positions held and the character traits that make a leader. Earned per level except Preschool.',
    award_type: 'manual',
    award_config: { hint: 'Parent confirms when the kid has held leadership positions at their level.' },
  },
  {
    name: 'Outdoors Award',
    slug: 'outdoors',
    source_url: 'https://curiosityuntamed.com/15243-2/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/outdoor-award.jpg',
    description: 'Develop age-appropriate outdoor skills across nature, safety, fire, navigation, and survival. Each level adds to the previous.',
    award_type: 'task_list',
    award_config: {
      // Curated from /15243-2/. Mix of specific badges and skill activities.
      per_level: {
        preschool: [
          { type: 'badge', name: 'Water Safety' },
          { type: 'badge', name: 'Outdoor Safety' },
          { type: 'badge', name: 'Camping' },
          { type: 'badge', name: 'Weather' },
          { type: 'badge', name: 'Fire Safety' },
          { type: 'badge', name: 'Leave No Trace' },
          { type: 'badge', name: 'First Aid' },
          { type: 'activity', text: 'Identify common plants, trees, and animals in your area.' },
          { type: 'activity', text: 'Go on a nature walk and notice 5 things you have not noticed before.' },
        ],
        level1: [
          { type: 'activity', text: 'Complete all Preschool requirements.' },
          { type: 'badge', name: 'Pocket Knife Safety' },
          { type: 'activity', text: 'Identify 3 cloud formations and what weather they predict.' },
          { type: 'activity', text: 'Take a 1-mile hike.' },
          { type: 'activity', text: 'Learn what to do if you get lost in the woods and how to use a whistle to signal for help.' },
        ],
        level2: [
          { type: 'activity', text: 'Complete all Level 1 requirements.' },
          { type: 'badge', name: 'Fire Building' },
          { type: 'badge', name: 'Outdoor Cooking' },
          { type: 'activity', text: 'Tie 5 useful knots and describe what each is used for.' },
          { type: 'activity', text: 'Learn the parts of a tent and help set one up.' },
          { type: 'activity', text: 'Assemble a basic survival bag.' },
          { type: 'activity', text: 'Demonstrate food-safety practices on a camping trip.' },
          { type: 'activity', text: 'Waterproof a pair of shoes or boots.' },
        ],
        level3: [
          { type: 'activity', text: 'Complete all Level 2 requirements.' },
          { type: 'activity', text: 'Start a fire without matches.' },
          { type: 'activity', text: 'Sharpen a knife.' },
          { type: 'activity', text: 'Prepare a backpack meal.' },
          { type: 'activity', text: 'Identify 10 edible vs. poisonous plants in your region.' },
          { type: 'activity', text: 'Take a 5+ mile hike.' },
          { type: 'activity', text: 'Camp 2 or more nights in a row.' },
          { type: 'activity', text: 'Use a compass to navigate a marked course.' },
          { type: 'activity', text: 'Identify and properly use 5 pieces of outdoor equipment.' },
          { type: 'activity', text: 'Learn and demonstrate 3 emergency signaling methods.' },
        ],
        level4: [
          { type: 'activity', text: 'Complete all Level 3 requirements.' },
          { type: 'activity', text: 'Sanitize water using 2 different methods.' },
          { type: 'activity', text: 'Describe step-by-step what to do for an injured hiker until help arrives.' },
        ],
        level5: [
          { type: 'activity', text: 'Complete all Level 4 requirements.' },
          { type: 'activity', text: 'Teach at least 6 outdoor skills to others (e.g. first aid, knot-tying, fire building, navigation).' },
        ],
      },
    },
  },
  {
    name: 'S.T.E.A.M. Award',
    slug: 'steam',
    source_url: 'https://curiosityuntamed.com/s-t-e-a-m-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/STEAM-AWARD.jpg',
    description: 'Explore Science, Technology, Engineering, Art, and Math through a curated mix of badges and creative projects. Complexity scales with age.',
    award_type: 'task_list',
    award_config: {
      // Steps apply at every level (complexity expectations scale with age).
      per_level: {
        all: [
          { type: 'badge', name: 'Math' },
          { type: 'activity', text: 'Earn 2 Life Science badges (e.g. Biology, Botany, Human Body).' },
          { type: 'activity', text: 'Earn 2 Physical Science badges (e.g. Physics, Electricity, Magnetism).' },
          { type: 'activity', text: 'Earn 2 Man Made Wonders badges.' },
          { type: 'activity', text: 'Earn 1 outdoor science badge.' },
          { type: 'activity', text: 'Earn 2 Art-area badges.' },
          { type: 'activity', text: 'Earn a Biography-type badge about a scientist, engineer, mathematician, or artist.' },
          { type: 'activity', text: 'Create a list of types of engineers and what they do.' },
          { type: 'activity', text: 'Create a list of types of scientists and what they do.' },
          { type: 'activity', text: 'Design a piece of technology that uses art to make it appealing.' },
          { type: 'activity', text: 'Analyze how the S.T.E.A.M. disciplines work together using 3 modern engineering examples (the older the participant, the deeper the analysis).' },
        ],
      },
    },
  },
  {
    name: 'Elizabeth Vicory Community Leadership Award',
    slug: 'elizabeth-vicory',
    source_url: 'https://curiosityuntamed.com/elizabeth-vicory-community-leadership-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/beth-award.jpg',
    description: 'Honors exceptional community leadership in memory of Elizabeth Vicory.',
    award_type: 'manual',
    award_config: { hint: 'Parent / leader confirms exceptional community leadership.' },
  },
  {
    name: 'Gem Award',
    slug: 'gem',
    source_url: 'https://curiosityuntamed.com/gem-awards/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/gem.jpg',
    description: 'The highest award at each level — earned by combining the Servant’s Heart, Make a Difference, Life Skills, Liberty, Fruit of the Spirit, Leadership, and Discovery awards.',
    award_type: 'composite',
    award_config: {
      award_slugs: ['servants-heart', 'make-a-difference', 'life-skills', 'liberty', 'fruit-of-the-spirit', 'leadership', 'discovery'],
    },
  },
  {
    name: 'Career Exploration Award',
    slug: 'career-exploration',
    source_url: 'https://curiosityuntamed.com/career-exploration-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2020/10/career-exploration-award-150x150-1.jpg',
    description: 'Explore career possibilities through structured research and reflection. Available at Levels 4 and 5 only.',
    award_type: 'manual',
    award_config: { hint: 'Parent confirms after the kid completes the career-exploration activities. Levels 4–5 only.' },
  },
  {
    name: 'Cassi Jensen Award',
    slug: 'cassi-jensen',
    source_url: 'https://curiosityuntamed.com/cassi-jensen-award-level-5-only/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/cassi-award.jpg',
    description: 'Awarded for earning every adult-level badge — the ultimate badge-library completion award. Level 5 only.',
    award_type: 'manual',
    award_config: { hint: 'Parent confirms when the kid has earned every adult-level badge. Level 5 only.' },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function basenameFromUrl(url) {
  const u = new URL(url);
  const path = u.pathname;
  const base = path.substring(path.lastIndexOf('/') + 1);
  // For award images we prefix with "award-" so they don't collide with badge images.
  return base.startsWith('award-') ? base : `award-${base}`;
}

async function downloadImage(url, destPath) {
  if (existsSync(destPath) && statSync(destPath).size > 0) return false; // already have it
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`Importing ${AWARDS.length} awards…`);

mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(IMAGES_DEST, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
runMigrations(db);

const insertAward = db.prepare(`
  INSERT INTO badges (
    name, slug, category, author, image_file, is_specific, note, source_url,
    level_opt_counts, description, is_award, award_type, award_config
  ) VALUES (
    @name, @slug, 'Award', '', @image_file, 0, NULL, @source_url,
    '{}', @description, 1, @award_type, @award_config
  )
  ON CONFLICT(slug) DO UPDATE SET
    name         = excluded.name,
    image_file   = excluded.image_file,
    source_url   = excluded.source_url,
    description  = excluded.description,
    is_award     = 1,
    award_type   = excluded.award_type,
    award_config = excluded.award_config
`);

let inserted = 0;
let imgDownloaded = 0;
let imgSkipped = 0;

for (const a of AWARDS) {
  let imageFile = null;
  if (a.image_url) {
    imageFile = basenameFromUrl(a.image_url);
    const destPath = join(IMAGES_DEST, imageFile);
    try {
      const downloaded = await downloadImage(a.image_url, destPath);
      if (downloaded) { imgDownloaded++; console.log(`  ↓ ${imageFile}`); }
      else { imgSkipped++; }
    } catch (err) {
      console.warn(`  ! Image fetch failed for ${a.slug}: ${err.message}`);
      imageFile = null;
    }
  }

  insertAward.run({
    name: a.name,
    slug: a.slug,
    image_file: imageFile,
    source_url: a.source_url,
    description: a.description,
    award_type: a.award_type,
    award_config: JSON.stringify(a.award_config || {}),
  });
  inserted++;
}

console.log(`\nUpserted ${inserted} awards. Images: ${imgDownloaded} new, ${imgSkipped} already on disk.`);

// (No cropping for awards — their images are already final and varied in
// aspect ratio; the badge cropper is tuned for 500x500 originals with a
// colored outline ring that awards don't have.)

// ─── Stats ────────────────────────────────────────────────────────────────────

const counts = {
  total:   db.prepare(`SELECT COUNT(*) AS n FROM badges`).get().n,
  badges:  db.prepare(`SELECT COUNT(*) AS n FROM badges WHERE is_award = 0`).get().n,
  awards:  db.prepare(`SELECT COUNT(*) AS n FROM badges WHERE is_award = 1`).get().n,
};

console.log(`\nDatabase counts:`);
console.log(`  total badges row:  ${counts.total}`);
console.log(`  badges (is_award=0): ${counts.badges}`);
console.log(`  awards (is_award=1): ${counts.awards}`);

db.close();
console.log('\nAwards import complete.');
