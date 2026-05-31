#!/usr/bin/env node
/**
 * Apply AI-generated one-line summaries (short_text) to the badge library.
 *
 * Reads the per-batch source files (/tmp/longsteps/batch_NNN.json — produced by
 * the export step) and the AI result files (/tmp/longsteps/result_NNN.json —
 * produced by the summarize-badge-steps workflow), joins them by index to get
 * (full text → short_text), then writes short_text onto EVERY matching row in
 * badge_level_requirements + badge_optional_requirements (a given text may be
 * shared across many badges/levels).
 *
 * Safe + idempotent:
 *   • Only sets short_text where it's currently NULL (re-runnable).
 *   • Skips a summary if it's empty, longer than the original, or >120 chars
 *     (a runaway "summary" — better to leave the full text inline).
 *   • Never touches `text`. Reversible: UPDATE ... SET short_text = NULL.
 *
 *   node server/scripts/applyShortText.mjs            # apply
 *   node server/scripts/applyShortText.mjs --dry-run  # report only
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const DRY = process.argv.includes('--dry-run');
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || join(__dirname, '../../data/family.db');
const DIR = '/tmp/longsteps';

const db = new Database(DB_PATH);

// Build text → short_text map from the batch + result file pairs.
const map = new Map();
let batchesSeen = 0, missingResults = 0, countMismatch = 0, rawPairs = 0;
for (let b = 0; b < 200; b++) {
  const bb = String(b).padStart(3, '0');
  const batchPath = join(DIR, `batch_${bb}.json`);
  if (!existsSync(batchPath)) continue;        // ran past the last batch
  batchesSeen++;
  const resultPath = join(DIR, `result_${bb}.json`);
  if (!existsSync(resultPath)) { missingResults++; console.warn(`  ! missing ${resultPath}`); continue; }

  let src, res;
  try { src = JSON.parse(readFileSync(batchPath, 'utf8')); } catch { console.warn(`  ! bad JSON ${batchPath}`); continue; }
  try { res = JSON.parse(readFileSync(resultPath, 'utf8')); } catch { console.warn(`  ! bad JSON ${resultPath}`); continue; }

  const byI = new Map(src.map((o) => [o.i, o.text]));
  if (res.length !== src.length) countMismatch++;
  for (const r of res) {
    const text = byI.get(r.i);
    const short = (r.short_text || '').trim();
    if (!text || !short) continue;
    rawPairs++;
    map.set(text, short);
  }
}

// Quality gate.
let skippedTooLong = 0, skippedNotShorter = 0;
const clean = new Map();
for (const [text, short] of map) {
  if (short.length > 120) { skippedTooLong++; continue; }
  if (short.length >= text.length) { skippedNotShorter++; continue; }
  clean.set(text, short);
}

console.log(`batches=${batchesSeen} missingResults=${missingResults} countMismatch=${countMismatch}`);
console.log(`rawPairs=${rawPairs} usable=${clean.size} (skipped tooLong=${skippedTooLong} notShorter=${skippedNotShorter})`);

if (DRY) {
  let i = 0;
  for (const [text, short] of clean) {
    if (i++ >= 8) break;
    console.log(`\n  FULL:  ${text.slice(0, 90)}`);
    console.log(`  SHORT: ${short}`);
  }
  console.log('\n(dry run — no writes)');
  db.close();
  process.exit(0);
}

const updBlr = db.prepare(`UPDATE badge_level_requirements    SET short_text = ? WHERE text = ? AND short_text IS NULL`);
const updBor = db.prepare(`UPDATE badge_optional_requirements SET short_text = ? WHERE text = ? AND short_text IS NULL`);
let rowsBlr = 0, rowsBor = 0;
const tx = db.transaction(() => {
  for (const [text, short] of clean) {
    rowsBlr += updBlr.run(short, text).changes;
    rowsBor += updBor.run(short, text).changes;
  }
});
tx();

console.log(`\nApplied: ${rowsBlr} requirement rows, ${rowsBor} optional rows updated with short_text.`);
console.log(`Remaining long rows still NULL:`);
console.log(`  reqs:  ${db.prepare(`SELECT COUNT(*) n FROM badge_level_requirements    WHERE short_text IS NULL AND length(text)-length(replace(text,' ','')) >= 20`).get().n}`);
console.log(`  opts:  ${db.prepare(`SELECT COUNT(*) n FROM badge_optional_requirements WHERE short_text IS NULL AND length(text)-length(replace(text,' ','')) >= 20`).get().n}`);
db.close();
