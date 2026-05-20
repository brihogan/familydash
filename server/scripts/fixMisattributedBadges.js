/**
 * Fix the original badges.json parser bug where some badges had all of their
 * requirements wrongly attributed to level5, leaving preschool→level4 empty.
 *
 * For each affected badge in the source data:
 *   - Take starred reqs from level5 → promote to preschool (flattens to all levels)
 *   - Take unstarred reqs from level5 → append to optionalRequirements pool
 *     (those were dropped on original import since only starred reqs were kept)
 *
 * Idempotent: detects already-fixed badges (preschool has reqs) and skips.
 *
 * Usage:
 *   node server/scripts/fixMisattributedBadges.js [--dry]
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/db/migrations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun    = process.argv.includes('--dry');

const BADGES_JSON = join(__dirname, '../../../CuriosityUntamed/badges.json');
const DB_PATH     = process.env.DATABASE_PATH || join(__dirname, '../../data/family.db');

const STRIP_RE = /^Do\s+(Preschool|Level\s+\d+)\s+requirements?\s+[\d\s,&]+\.?\s*/i;
const strip = (s) => (s || '').replace(STRIP_RE, '').trim();

console.log('Reading badges.json…');
const data = JSON.parse(readFileSync(BADGES_JSON, 'utf8'));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
runMigrations(db);

const getBadgeBySlug    = db.prepare(`SELECT id FROM badges WHERE slug = ?`);
const countPreschool    = db.prepare(`SELECT COUNT(*) AS n FROM badge_level_requirements WHERE badge_id = ? AND level = 'preschool'`);
const countLevel5Only   = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM badge_level_requirements WHERE badge_id = ? AND level != 'level5') AS lower,
    (SELECT COUNT(*) FROM badge_level_requirements WHERE badge_id = ? AND level = 'level5')  AS top
`);

const deleteReqs        = db.prepare(`DELETE FROM badge_level_requirements WHERE badge_id = ?`);
const insertReq         = db.prepare(`INSERT INTO badge_level_requirements (badge_id, level, sort_order, text) VALUES (?, ?, ?, ?)`);
const maxOptReq         = db.prepare(`SELECT COALESCE(MAX(req_number), 0) AS m FROM badge_optional_requirements WHERE badge_id = ?`);
const optExists         = db.prepare(`SELECT 1 FROM badge_optional_requirements WHERE badge_id = ? AND text = ?`);
const insertOpt         = db.prepare(`INSERT INTO badge_optional_requirements (badge_id, req_number, text) VALUES (?, ?, ?)`);

let fixed = 0;
let promotedReqs = 0;
let recoveredOpts = 0;
let skipped = 0;

const tx = db.transaction(() => {
  for (const badge of data.badges) {
    if (!badge.slug) continue;
    const row = getBadgeBySlug.get(badge.slug);
    if (!row) continue;
    const badgeId = row.id;

    const { lower, top } = countLevel5Only.get(badgeId, badgeId);
    const levels = badge.levels || {};
    const lvl5 = levels.level5 || {};
    const lvl5Reqs = lvl5.requirements || [];
    const lowerEmpty = ['preschool','level1','level2','level3','level4'].every(
      (lv) => !(levels[lv]?.requirements?.length)
    );

    const starred   = lvl5Reqs.filter((r) => r.starred);
    const unstarred = lvl5Reqs.filter((r) => !r.starred);

    // Two separate bugs handled in one pass:
    //   A) All reqs misattributed to level5 (lowerEmpty + level5 has starred)
    //      → promote starred to preschool so they flatten through every level
    //   B) Unstarred items dumped into level5.requirements instead of
    //      optionalRequirements (regardless of bug A)
    //      → recover them into the optional pool
    const needsBugA = (lower === 0 && top > 0 && lowerEmpty && starred.length > 0);
    const dbOptCount = db.prepare('SELECT COUNT(*) AS n FROM badge_optional_requirements WHERE badge_id = ?').get(badgeId).n;
    const needsBugB = unstarred.length > 0 && dbOptCount < unstarred.length;

    if (!needsBugA && !needsBugB) { skipped++; continue; }

    if (dryRun) {
      const parts = [];
      if (needsBugA) parts.push(`promote ${starred.length} starred to preschool`);
      if (needsBugB) parts.push(`recover ${unstarred.length} optionals`);
      console.log(`  ${badge.name}: would ${parts.join(', ')}`);
      continue;
    }

    if (needsBugA) {
      // Wipe existing level reqs and re-insert as preschool
      deleteReqs.run(badgeId);
      let order = 0;
      for (const req of starred) {
        const text = strip(req.text);
        if (text.length > 5) {
          insertReq.run(badgeId, 'preschool', order++, text);
          promotedReqs++;
        }
      }
    }

    if (needsBugB) {
      let nextOptNum = maxOptReq.get(badgeId).m + 1;
      for (const opt of unstarred) {
        const text = (opt.text || '').trim();
        if (text.length < 5) continue;
        if (optExists.get(badgeId, text)) continue;
        insertOpt.run(badgeId, nextOptNum++, text);
        recoveredOpts++;
      }
    }

    fixed++;
  }
});

tx();

console.log('---');
console.log(`Badges fixed:       ${fixed}`);
console.log(`Reqs promoted:      ${promotedReqs}`);
console.log(`Optionals recovered: ${recoveredOpts}`);
console.log(`Skipped:            ${skipped}`);
if (dryRun) console.log('(DRY RUN — no DB changes)');

db.close();
