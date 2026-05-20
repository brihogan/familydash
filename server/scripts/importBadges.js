/**
 * One-time import of CuriosityUntamed badges into FamilyDash.
 * Idempotent: uses INSERT OR IGNORE on the slug UNIQUE constraint.
 *
 * Usage:
 *   node --env-file=../../.env server/scripts/importBadges.js
 *
 * Run from the repo root, or adjust paths as needed.
 */

import { readFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/db/migrations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Paths ────────────────────────────────────────────────────────────────────

const BADGES_JSON   = join(__dirname, '../../../CuriosityUntamed/badges.json');
const IMAGES_SRC    = join(__dirname, '../../../CuriosityUntamed/images');
const DB_PATH       = process.env.DATABASE_PATH || join(__dirname, '../../data/family.db');
const IMAGES_DEST   = join(dirname(DB_PATH), 'uploads', 'badges');

// ─── Category normalization ───────────────────────────────────────────────────

const CATEGORY_MAP = [
  ['Agriculture',          'Discover Agriculture'],
  ['Art',                  'Discover Art'],
  ['Character',            'Discover Character'],
  ['Health',               'Discover Health & Safety'],
  ['Safety',               'Discover Health & Safety'],
  ['Home',                 'Discover the Home'],
  ['Knowledge',            'Discover Knowledge'],
  ['Outdoor',              'Discover the Outdoors'],
  ['Science',              'Discover Science & Technology'],
  ['Technology',           'Discover Science & Technology'],
  ['World',                'Discover the World'],
];

function normalizeCategory(raw) {
  if (!raw) return '';
  const upper = raw.trim();
  for (const [keyword, canonical] of CATEGORY_MAP) {
    if (upper.includes(keyword)) return canonical;
  }
  return upper;
}

// ─── Requirement stripping ────────────────────────────────────────────────────
// Removes "Do Preschool requirement 1." / "Do Level 1 requirements 1 & 2." etc.
// leaving only the new content that follows (if any).

const STRIP_RE = /^Do\s+(Preschool|Level\s+\d+)\s+requirements?\s+[\d\s,&]+\.?\s*/i;

function stripLevelRef(text) {
  return text.replace(STRIP_RE, '').trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('Reading badges.json…');
const data   = JSON.parse(readFileSync(BADGES_JSON, 'utf8'));
const badges = data.badges;
console.log(`  Found ${badges.length} badges.`);

// Ensure DB and image destination exist
mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(IMAGES_DEST, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
runMigrations(db);

const LEVELS = ['preschool', 'level1', 'level2', 'level3', 'level4', 'level5'];

const insertBadge = db.prepare(`
  INSERT OR IGNORE INTO badges (name, slug, category, author, image_file, is_specific, note, source_url, level_opt_counts)
  VALUES (@name, @slug, @category, @author, @image_file, @is_specific, @note, @source_url, @level_opt_counts)
`);

const insertReq = db.prepare(`
  INSERT INTO badge_level_requirements (badge_id, level, sort_order, text) VALUES (?, ?, ?, ?)
`);

const insertOpt = db.prepare(`
  INSERT INTO badge_optional_requirements (badge_id, req_number, text) VALUES (?, ?, ?)
`);

const getBadgeId = db.prepare(`SELECT id FROM badges WHERE slug = ?`);
const clearReqs  = db.prepare(`DELETE FROM badge_level_requirements WHERE badge_id = ?`);
const clearOpts  = db.prepare(`DELETE FROM badge_optional_requirements WHERE badge_id = ?`);

let imported = 0;
let skipped  = 0;

const doImport = db.transaction(() => {
  for (const badge of badges) {
    if (!badge.slug) { skipped++; continue; }

    // Build level_opt_counts JSON: how many optionals to pick per level
    const optCounts = {};
    for (const level of LEVELS) {
      const lv = badge.levels?.[level];
      if (lv) {
        optCounts[level] = Math.max(0, (lv.totalRequired ?? 0) - (lv.starredCount ?? 0));
      }
    }

    const imageFile = badge.imageFile ? badge.imageFile.replace('images/', '') : null;

    insertBadge.run({
      name:             badge.name,
      slug:             badge.slug,
      category:         normalizeCategory(badge.category),
      author:           badge.author || '',
      image_file:       imageFile,
      is_specific:      badge.isSpecific ? 1 : 0,
      note:             badge.note || null,
      source_url:       badge.url || null,
      level_opt_counts: JSON.stringify(optCounts),
    });

    const row = getBadgeId.get(badge.slug);
    if (!row) { skipped++; continue; } // slug conflict shouldn't happen with OR IGNORE but just in case

    const badgeId = row.id;

    // Re-import requirements (idempotent: clear then re-insert)
    clearReqs.run(badgeId);
    clearOpts.run(badgeId);

    // Flattened required steps: iterate levels in order, strip cross-references
    let sortOrder = 0;
    for (const level of LEVELS) {
      const lv = badge.levels?.[level];
      if (!lv) continue;
      for (const req of lv.requirements ?? []) {
        if (!req.starred) continue;
        const stripped = stripLevelRef(req.text ?? '');
        if (stripped.length > 5) {
          insertReq.run(badgeId, level, sortOrder++, stripped);
        }
      }
    }

    // Optional requirements pool (shared across all levels)
    for (const opt of badge.optionalRequirements ?? []) {
      if (opt.text?.trim()) {
        insertOpt.run(badgeId, opt.number, opt.text.trim());
      }
    }

    imported++;
  }
});

doImport();

console.log(`  Imported: ${imported}  Skipped: ${skipped}`);

// ─── Copy images ──────────────────────────────────────────────────────────────

if (existsSync(IMAGES_SRC)) {
  console.log(`Copying badge images to ${IMAGES_DEST}…`);
  cpSync(IMAGES_SRC, IMAGES_DEST, { recursive: true, force: false });
  console.log('  Done.');
  // Crop to remove shadow + colored level outline (idempotent: skips files ≤320px)
  console.log('Cropping images to 55% center to strip shadow + level outline…');
  try {
    const { spawnSync } = await import('child_process');
    const result = spawnSync('node', [join(__dirname, 'cropBadgeImages.js')], { stdio: 'inherit' });
    if (result.status !== 0) console.warn('  Crop step exited non-zero; continuing.');
  } catch (err) {
    console.warn(`  Crop step failed: ${err.message}. Run cropBadgeImages.js manually.`);
  }
} else {
  console.warn(`  Image source not found at ${IMAGES_SRC} — skipping image copy.`);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

const counts = {
  badges:   db.prepare(`SELECT COUNT(*) AS n FROM badges`).get().n,
  reqs:     db.prepare(`SELECT COUNT(*) AS n FROM badge_level_requirements`).get().n,
  opts:     db.prepare(`SELECT COUNT(*) AS n FROM badge_optional_requirements`).get().n,
};

console.log(`\nDatabase counts:`);
console.log(`  badges:                    ${counts.badges}`);
console.log(`  badge_level_requirements:  ${counts.reqs}`);
console.log(`  badge_optional_requirements: ${counts.opts}`);

db.close();
console.log('\nImport complete.');
