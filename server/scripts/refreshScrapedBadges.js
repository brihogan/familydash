#!/usr/bin/env node
/**
 * Refresh the badges.json + DB rows for slugs that we scraped previously
 * but with a buggy parser. Unlike `mergeScrapedBadges.js` (which is
 * additive — only fills in missing fields), this script OVERWRITES the
 * matching entries with the freshly-parsed data, then re-imports the
 * level requirements and optionals into the DB.
 *
 * Use after re-running `parseScrapedTexts.js` against the captured raw
 * texts in `/tmp/cu-scrape-raw-texts.json`.
 *
 *   node server/scripts/refreshScrapedBadges.js /tmp/cu-parsed-badges.json
 *
 * Touches:
 *   - CuriosityUntamed/badges.json (in place — replaces matching entries)
 *   - data/family.db badges table: UPDATEs category, author, level_opt_counts,
 *     image_file, source_url, scraped_at = now() for matched slugs
 *   - badge_level_requirements / badge_optional_requirements: cleared + re-
 *     inserted from the new JSON (same code path importBadges.js uses)
 *
 * The "New" filter pill continues to show these because we re-stamp
 * scraped_at to now() — they remain in the same batch as the original
 * import that added them.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const CU_DIR       = join(__dirname, '../../../CuriosityUntamed');
const BADGES_JSON  = join(CU_DIR, 'badges.json');
const DB_PATH      = join(__dirname, '../../data/family.db');

const LEVELS = ['preschool', 'level1', 'level2', 'level3', 'level4', 'level5'];

const inFile = process.argv[2] || '/tmp/cu-parsed-badges.json';
const parsed = JSON.parse(readFileSync(inFile, 'utf8'));

// Strip cross-references like "Do Preschool requirements 1 & 2" — mirrors
// importBadges.js (which has the canonical comment). Keep these two in sync
// when adjusting; we should probably hoist into a shared util eventually.
function stripLevelRef(text) {
  let t = (text || '').trim();
  t = t.replace(/^[.,;:]\s*/, '');
  t = t.replace(
    /^Do\s+(?:Preschool|Level\s*\d+)\s+requirements?\s*(?:#\s*|number\s+)?\d+(?:\s*(?:&|and|,)\s*#?\s*\d+)*\s*[,.]?\s*/i,
    ''
  );
  t = t.replace(/^(and|or|but|&)\s+#?\d+\s*[,.]?\s*/i, '');
  return t.trim();
}

function normalizeCategory(c) {
  if (!c) return null;
  return c.replace(/&amp;/g, '&').trim();
}

// --- badges.json patch ---
const cu = JSON.parse(readFileSync(BADGES_JSON, 'utf8'));
const bySlug = new Map(cu.badges.map((b, i) => [b.slug, i]));

let jsonUpdated = 0;
let jsonAdded   = 0;
for (const incoming of parsed) {
  if (incoming.error || !incoming.slug) continue;
  const idx = bySlug.get(incoming.slug);
  if (idx == null) {
    cu.badges.push(incoming);
    bySlug.set(incoming.slug, cu.badges.length - 1);
    jsonAdded++;
  } else {
    // Overwrite the entry but preserve imageFile if it's already set on disk
    const existing = cu.badges[idx];
    cu.badges[idx] = { ...incoming, imageFile: incoming.imageFile || existing.imageFile };
    jsonUpdated++;
  }
}

cu.metadata = cu.metadata || {};
cu.metadata.lastRefresh = {
  date: new Date().toISOString().slice(0, 10),
  source: inFile,
  updated: jsonUpdated,
  added: jsonAdded,
};
writeFileSync(BADGES_JSON, JSON.stringify(cu, null, 2));
console.log(`badges.json: updated=${jsonUpdated} added=${jsonAdded}`);

// --- DB refresh ---
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const findBadge   = db.prepare(`SELECT id FROM badges WHERE slug = ?`);
const updateBadge = db.prepare(`
  UPDATE badges
  SET name             = COALESCE(@name,        name),
      category         = COALESCE(@category,    category),
      author           = COALESCE(NULLIF(@author, ''), author),
      image_file       = COALESCE(@image_file,  image_file),
      source_url       = COALESCE(@source_url,  source_url),
      level_opt_counts = @level_opt_counts,
      scraped_at       = datetime('now')
  WHERE slug = @slug
`);
const insertReq = db.prepare(`INSERT INTO badge_level_requirements (badge_id, level, sort_order, text) VALUES (?, ?, ?, ?)`);
const insertOpt = db.prepare(`INSERT INTO badge_optional_requirements (badge_id, req_number, text, level) VALUES (?, ?, ?, ?)`);
const clearReqs = db.prepare(`DELETE FROM badge_level_requirements WHERE badge_id = ?`);
const clearOpts = db.prepare(`DELETE FROM badge_optional_requirements WHERE badge_id = ?`);

let dbUpdated = 0, dbMissed = 0;
const run = db.transaction(() => {
  for (const b of parsed) {
    if (b.error || !b.slug) continue;
    const row = findBadge.get(b.slug);
    if (!row) { dbMissed++; continue; }

    // level_opt_counts: per-level "pick this many extras"
    const optCounts = {};
    for (const lvl of LEVELS) {
      const lv = b.levels?.[lvl];
      if (lv) optCounts[lvl] = Math.max(0, (lv.totalRequired ?? 0) - (lv.starredCount ?? 0));
    }

    const imageFile = b.imageFile ? b.imageFile.replace('images/', '') : null;
    updateBadge.run({
      name:             b.name,
      category:         normalizeCategory(b.category),
      author:           b.author || '',
      image_file:       imageFile,
      source_url:       b.url || null,
      level_opt_counts: JSON.stringify(optCounts),
      slug:             b.slug,
    });

    clearReqs.run(row.id);
    clearOpts.run(row.id);

    // Required: every starred requirement, cross-refs stripped
    let order = 0;
    for (const lvl of LEVELS) {
      const lv = b.levels?.[lvl];
      if (!lv) continue;
      for (const req of lv.requirements ?? []) {
        if (!req.starred) continue;
        const t = stripLevelRef(req.text ?? '');
        if (t.length > 5) insertReq.run(row.id, lvl, order++, t);
      }
    }

    // Optional pool
    for (const opt of b.optionalRequirements ?? []) {
      if (opt.text?.trim()) insertOpt.run(row.id, opt.number, opt.text.trim(), opt.level || null);
    }

    dbUpdated++;
  }
});
run();

const total = db.prepare('SELECT COUNT(*) AS n FROM badges WHERE is_award=0').get().n;
const reqs  = db.prepare('SELECT COUNT(*) AS n FROM badge_level_requirements').get().n;
const opts  = db.prepare('SELECT COUNT(*) AS n FROM badge_optional_requirements').get().n;
console.log(`DB updated:  ${dbUpdated}   missed (slug not in DB): ${dbMissed}`);
console.log(`DB totals — badges:${total}  reqs:${reqs}  opts:${opts}`);
console.log('Refresh complete.');
