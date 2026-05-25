#!/usr/bin/env node
/**
 * Backfill image_file for the badges that were previously emoji-only.
 * Reads the Chrome-MCP scrape dump at /tmp/cu-scrape-emoji-images.json
 * (a `{images: {slug: imageUrl}, errors: [{slug, err}]}` blob),
 * downloads each image into both CuriosityUntamed/images/ and the
 * server's data/uploads/badges/ folder, then UPDATEs the badges row's
 * image_file + scraped_at so the "New" filter catches the batch.
 *
 *   node server/scripts/backfillEmojiImages.js [/tmp/cu-scrape-emoji-images.json]
 *
 * Idempotent: skips downloads when the file already exists. Stamps
 * scraped_at to NOW for every row touched, so they appear in the
 * latest-batch "New" filter alongside any newly-added missing badges.
 *
 * After this script, run `node server/scripts/cropBadgeImages.js` to
 * apply the standard alpha-flatten + trim + 70% crop to the new images.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const CU_DIR       = join(__dirname, '../../../CuriosityUntamed');
const CU_IMAGES    = join(CU_DIR, 'images');
const BADGE_IMAGES_JSON = join(CU_DIR, 'badge_images.json');
const DEST_DIR     = join(__dirname, '../../data/uploads/badges');
const DB_PATH      = join(__dirname, '../../data/family.db');

const inFile = process.argv[2] || '/tmp/cu-scrape-emoji-images.json';
const dump = JSON.parse(readFileSync(inFile, 'utf8'));
const images = dump.images || dump; // accept either {images: …} or flat map

if (!existsSync(CU_IMAGES)) mkdirSync(CU_IMAGES, { recursive: true });
if (!existsSync(DEST_DIR))  mkdirSync(DEST_DIR,  { recursive: true });

const badgeImages = existsSync(BADGE_IMAGES_JSON)
  ? JSON.parse(readFileSync(BADGE_IMAGES_JSON, 'utf8'))
  : {};

async function downloadImage(slug, url) {
  if (!url) return null;
  const extMatch = url.match(/\.(jpe?g|png)(?:\?|$)/i);
  const ext = (extMatch?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const cuPath  = join(CU_IMAGES, `${slug}.${ext}`);
  const destPath = join(DEST_DIR, `${slug}.${ext}`);
  if (existsSync(destPath)) return `${slug}.${ext}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(cuPath, buf);
    copyFileSync(cuPath, destPath);
    return `${slug}.${ext}`;
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
// Update image_file only — leave scraped_at as the row's original value.
// The "New" filter should surface newly-added badges, not badges whose
// image got swapped in. (Bumping scraped_at here would pollute "New"
// with every image-backfill run.)
const updateBadge = db.prepare(`
  UPDATE badges
  SET image_file = @image_file
  WHERE slug = @slug AND (image_file IS NULL OR image_file = '')
`);

let downloaded = 0, dbUpdated = 0, alreadyHad = 0, failed = 0;
const failures = [];

for (const [slug, url] of Object.entries(images)) {
  if (!url) continue;
  const result = await downloadImage(slug, url);
  if (typeof result === 'string') {
    const r = updateBadge.run({ image_file: result, slug });
    if (r.changes > 0) dbUpdated++; else alreadyHad++;
    downloaded++;
    badgeImages[slug] = url;
  } else if (result?.error) {
    failed++;
    failures.push({ slug, ...result });
  }
}

writeFileSync(BADGE_IMAGES_JSON, JSON.stringify(badgeImages, null, 2));

console.log(`Downloaded:    ${downloaded}`);
console.log(`DB updated:    ${dbUpdated}`);
console.log(`Already had:   ${alreadyHad}`);
console.log(`Failed:        ${failed}`);
if (failures.length) console.log('Failures:', failures);
console.log('\nNext: node server/scripts/cropBadgeImages.js');
