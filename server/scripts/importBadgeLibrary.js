#!/usr/bin/env node
/**
 * Import a badge/award library snapshot (produced by `exportBadgeLibrary.js`)
 * into the current environment's DB. Idempotent: safe to re-run.
 *
 *   node server/scripts/importBadgeLibrary.js [--in=seed/badge-library.json]
 *
 * Strategy:
 *   • badges → INSERT OR REPLACE by id (preserves the same ids across envs
 *     so award_config's references stay valid and existing task_sets'
 *     badge_id pointers keep working).
 *   • badge_level_requirements + badge_optional_requirements → DELETE all
 *     and re-insert. These are derivative content of the badge library —
 *     no user data lives here, and the importer is the source of truth.
 *
 * User-specific tables (users, task_sets, task_assignments,
 * task_step_completions, etc.) are NEVER touched. Existing kid
 * enrollments + completions are preserved.
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const inArg = args.find((a) => a.startsWith('--in='))?.split('=')[1];
const IN    = inArg || join(__dirname, '../../seed/badge-library.json');

// DB path: prefer the env var that the server uses, otherwise repo-relative.
const DB_PATH = process.env.DATABASE_PATH
  || (existsSync('/data/family.db') ? '/data/family.db' : join(__dirname, '../../data/family.db'));

if (!existsSync(IN)) {
  console.error(`Snapshot not found at ${IN}`);
  process.exit(1);
}
if (!existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}`);
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(IN, 'utf8'));
console.log(`Loading snapshot from ${IN}`);
console.log(`  badges:     ${snapshot.badges?.length || 0}`);
console.log(`  levelReqs:  ${snapshot.levelReqs?.length || 0}`);
console.log(`  optReqs:    ${snapshot.optReqs?.length || 0}`);
console.log(`  exportedAt: ${snapshot.metadata?.exportedAt || '?'}`);

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const upsertBadge = db.prepare(`
  INSERT INTO badges (
    id, name, slug, category, author, image_file, is_specific, note,
    source_url, level_opt_counts, is_active, created_at, description, emoji,
    is_award, award_type, award_config, scraped_at
  ) VALUES (
    @id, @name, @slug, @category, @author, @image_file, @is_specific, @note,
    @source_url, @level_opt_counts, @is_active, @created_at, @description, @emoji,
    @is_award, @award_type, @award_config, @scraped_at
  )
  ON CONFLICT(id) DO UPDATE SET
    name             = excluded.name,
    slug             = excluded.slug,
    category         = excluded.category,
    author           = excluded.author,
    image_file       = excluded.image_file,
    is_specific      = excluded.is_specific,
    note             = excluded.note,
    source_url       = excluded.source_url,
    level_opt_counts = excluded.level_opt_counts,
    is_active        = excluded.is_active,
    description      = excluded.description,
    emoji            = excluded.emoji,
    is_award         = excluded.is_award,
    award_type       = excluded.award_type,
    award_config     = excluded.award_config,
    scraped_at       = excluded.scraped_at
`);

const clearLevelReqs = db.prepare('DELETE FROM badge_level_requirements');
const clearOptReqs   = db.prepare('DELETE FROM badge_optional_requirements');
const insertLevelReq = db.prepare(
  'INSERT INTO badge_level_requirements (badge_id, level, sort_order, text) VALUES (?, ?, ?, ?)'
);
const insertOptReq = db.prepare(
  'INSERT INTO badge_optional_requirements (badge_id, req_number, text, level) VALUES (?, ?, ?, ?)'
);

const run = db.transaction(() => {
  let upserts = 0;
  for (const b of snapshot.badges || []) {
    upsertBadge.run(b);
    upserts++;
  }

  clearLevelReqs.run();
  let lrCount = 0;
  for (const r of snapshot.levelReqs || []) {
    insertLevelReq.run(r.badge_id, r.level, r.sort_order, r.text);
    lrCount++;
  }

  clearOptReqs.run();
  let orCount = 0;
  for (const o of snapshot.optReqs || []) {
    insertOptReq.run(o.badge_id, o.req_number, o.text, o.level || null);
    orCount++;
  }

  console.log(`Upserted ${upserts} badges`);
  console.log(`Inserted ${lrCount} level requirements`);
  console.log(`Inserted ${orCount} optional requirements`);
});

run();

// Final sanity counts post-import
const counts = {
  badges: db.prepare('SELECT COUNT(*) AS n FROM badges').get().n,
  active: db.prepare('SELECT COUNT(*) AS n FROM badges WHERE is_active = 1').get().n,
  awards: db.prepare('SELECT COUNT(*) AS n FROM badges WHERE is_award = 1').get().n,
  reqs:   db.prepare('SELECT COUNT(*) AS n FROM badge_level_requirements').get().n,
  opts:   db.prepare('SELECT COUNT(*) AS n FROM badge_optional_requirements').get().n,
};
console.log('\nFinal DB counts:', counts);
console.log('Import complete.');
