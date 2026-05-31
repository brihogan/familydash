#!/usr/bin/env node
/**
 * Backfill EXISTING enrollments so in-progress Curiosity badges show the new
 * one-line titles. Derives entirely from the library's short_text (set by the
 * AI sweep / importBadgeLibrary), so it's safe to run on dev AND prod.
 *
 * For each active, non-award badge task_step whose name still equals the full
 * requirement/optional text and whose library row has a short_text:
 *   • name        := library short_text  (the glanceable title)
 *   • description := full text            (shown in focus mode / details)
 *
 * Matching:
 *   • optionals → by badge_opt_req_id (exact FK)
 *   • required  → by exact text within the same badge
 *
 * Safe + idempotent:
 *   • Only rewrites rows whose name STILL equals the full text (re-runnable).
 *   • Never touches completions (keyed off task_step_id) or award steps
 *     (those have linked_badge_id / linked_badge_category).
 *   • Reversible by re-running importBadgeLibrary + re-enroll, or by hand.
 *
 *   node server/scripts/backfillStepShortText.mjs            # apply
 *   node server/scripts/backfillStepShortText.mjs --dry-run  # report only
 */
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const DRY = process.argv.includes('--dry-run');
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || join(__dirname, '../../data/family.db');
const db = new Database(DB_PATH);

// Relink orphaned optional picks. Older enrollments have is_optional=1 steps
// with badge_opt_req_id = NULL (the FK was lost / never set), which breaks
// swap/optional features AND the short_text backfill below. Re-derive the FK by
// matching the step name to this badge's optional text. Only fills NULLs.
const relinkOptSql = `
  UPDATE task_steps
  SET badge_opt_req_id = (
    SELECT MIN(o.id) FROM badge_optional_requirements o
    JOIN task_sets ts ON ts.id = task_steps.task_set_id
    WHERE o.badge_id = ts.badge_id AND o.text = task_steps.name
  )
  WHERE is_active = 1
    AND is_optional = 1
    AND badge_opt_req_id IS NULL
    AND linked_badge_id IS NULL AND linked_badge_category IS NULL
    AND EXISTS (
      SELECT 1 FROM badge_optional_requirements o
      JOIN task_sets ts ON ts.id = task_steps.task_set_id
      WHERE o.badge_id = ts.badge_id AND o.text = task_steps.name
    )`;

const optSql = `
  UPDATE task_steps
  SET name = (SELECT short_text FROM badge_optional_requirements WHERE id = task_steps.badge_opt_req_id),
      description = (SELECT text  FROM badge_optional_requirements WHERE id = task_steps.badge_opt_req_id)
  WHERE is_active = 1
    AND badge_opt_req_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM badge_optional_requirements o
                WHERE o.id = task_steps.badge_opt_req_id
                  AND o.short_text IS NOT NULL
                  AND o.text = task_steps.name)`;

const reqSql = `
  UPDATE task_steps
  SET description = name,
      name = (
        SELECT r.short_text FROM badge_level_requirements r
        JOIN task_sets ts ON ts.id = task_steps.task_set_id
        WHERE r.badge_id = ts.badge_id AND r.text = task_steps.name AND r.short_text IS NOT NULL
        LIMIT 1
      )
  WHERE is_active = 1
    AND badge_opt_req_id IS NULL
    AND linked_badge_id IS NULL AND linked_badge_category IS NULL
    AND EXISTS (
      SELECT 1 FROM badge_level_requirements r
      JOIN task_sets ts ON ts.id = task_steps.task_set_id
      WHERE r.badge_id = ts.badge_id AND r.text = task_steps.name AND r.short_text IS NOT NULL
    )`;

if (DRY) {
  const optN = db.prepare(`SELECT COUNT(*) n FROM task_steps
    WHERE is_active=1 AND badge_opt_req_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM badge_optional_requirements o WHERE o.id=task_steps.badge_opt_req_id AND o.short_text IS NOT NULL AND o.text=task_steps.name)`).get().n;
  const reqN = db.prepare(`SELECT COUNT(*) n FROM task_steps
    WHERE is_active=1 AND badge_opt_req_id IS NULL AND linked_badge_id IS NULL AND linked_badge_category IS NULL
      AND EXISTS (SELECT 1 FROM badge_level_requirements r JOIN task_sets ts ON ts.id=task_steps.task_set_id
                  WHERE r.badge_id=ts.badge_id AND r.text=task_steps.name AND r.short_text IS NOT NULL)`).get().n;
  console.log(`(dry run) would update: ${reqN} required steps, ${optN} optional steps.`);
  db.close();
  process.exit(0);
}

const tx = db.transaction(() => {
  const relinked = db.prepare(relinkOptSql).run().changes; // fix orphaned FKs first
  const opt = db.prepare(optSql).run().changes;            // then name/description
  const req = db.prepare(reqSql).run().changes;
  return { relinked, opt, req };
});
const { relinked, opt, req } = tx();
console.log(`Relinked ${relinked} orphaned optional picks.`);
console.log(`Backfilled existing enrollments: ${req} required steps, ${opt} optional steps.`);
db.close();
