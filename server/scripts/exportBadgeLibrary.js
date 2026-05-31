#!/usr/bin/env node
/**
 * Export the badge + award library to a JSON snapshot for re-importing
 * into another environment (typically dev → prod). Captures three
 * tables — `badges`, `badge_level_requirements`,
 * `badge_optional_requirements` — and nothing user-specific.
 *
 *   node server/scripts/exportBadgeLibrary.js [--out=seed/badge-library.json]
 *
 * Run this on the source environment (dev) when the library is in the
 * shape you want prod to mirror. Commit the resulting JSON to the repo,
 * pull on the target, then run `importBadgeLibrary.js` inside the
 * target's container to replay it.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH   = join(__dirname, '../../data/family.db');

const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith('--out='))?.split('=')[1];
const OUT    = outArg || join(__dirname, '../../seed/badge-library.json');

if (!existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

const badges = db.prepare(`
  SELECT id, name, slug, category, author, image_file, is_specific, note,
         source_url, level_opt_counts, is_active, created_at, description, emoji,
         is_award, award_type, award_config, scraped_at
  FROM badges
  ORDER BY id ASC
`).all();

const levelReqs = db.prepare(`
  SELECT badge_id, level, sort_order, text, short_text
  FROM badge_level_requirements
  ORDER BY badge_id, level, sort_order
`).all();

const optReqs = db.prepare(`
  SELECT badge_id, req_number, text, level, short_text
  FROM badge_optional_requirements
  ORDER BY badge_id, req_number
`).all();

const out = {
  metadata: {
    exportedAt: new Date().toISOString(),
    badgeCount: badges.length,
    levelReqCount: levelReqs.length,
    optReqCount: optReqs.length,
  },
  badges,
  levelReqs,
  optReqs,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`Exported ${badges.length} badges, ${levelReqs.length} level reqs, ${optReqs.length} optional reqs.`);
console.log(`Snapshot written to ${OUT}`);
