#!/usr/bin/env node
/**
 * Merge a scraped-badges JSON dump (produced by the in-browser scraper into
 * /tmp/cu-scrape-*.json) into the canonical CuriosityUntamed/badges.json +
 * download images + run the standard importer.
 *
 *   node server/scripts/mergeScrapedBadges.js /tmp/cu-scrape-missing-all.json
 *
 * What it does:
 *   1. Reads the scrape dump (array of badge objects).
 *   2. For each entry whose slug isn't already in badges.json, appends it.
 *      Existing slugs get any new fields backfilled (image URL, levels) but
 *      good existing data is never overwritten.
 *   3. Downloads each badge image to CuriosityUntamed/images/{slug}.{ext}
 *      (public assets — no auth needed) and writes imageFile on the entry.
 *   4. Updates CuriosityUntamed/badge_images.json so future re-runs have the
 *      URL mapping too.
 *   5. Updates badges.json metadata (totalBadges, lastScrape block).
 *
 * After this, run `node server/scripts/importBadges.js` to push into the DB —
 * the importer's INSERT OR IGNORE leaves existing rows alone and stamps
 * scraped_at on the new ones, which is what powers the "New" filter pill.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const CU_DIR       = join(__dirname, '../../../CuriosityUntamed');
const BADGES_JSON  = join(CU_DIR, 'badges.json');
const IMAGES_JSON  = join(CU_DIR, 'badge_images.json');
const IMAGES_DIR   = join(CU_DIR, 'images');

const scrapeFile = process.argv[2];
if (!scrapeFile) {
  console.error('usage: node mergeScrapedBadges.js <path-to-scrape.json>');
  process.exit(1);
}

if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true });

const scraped = JSON.parse(readFileSync(scrapeFile, 'utf8'));
const cu      = JSON.parse(readFileSync(BADGES_JSON, 'utf8'));
const images  = existsSync(IMAGES_JSON) ? JSON.parse(readFileSync(IMAGES_JSON, 'utf8')) : {};

const bySlug = new Map(cu.badges.map(b => [b.slug, b]));

let added = 0, updated = 0, skipped = 0, downloaded = 0, imgFailed = 0;

async function downloadImage(slug, imageUrl) {
  if (!imageUrl) return null;
  const extMatch = imageUrl.match(/\.(jpe?g|png)(?:\?|$)/i);
  const ext = (extMatch?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const target = join(IMAGES_DIR, `${slug}.${ext}`);
  if (existsSync(target)) return `images/${slug}.${ext}`;
  try {
    const r = await fetch(imageUrl);
    if (!r.ok) { imgFailed++; console.warn(`  ! ${slug}: image HTTP ${r.status}`); return null; }
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(target, buf);
    downloaded++;
    return `images/${slug}.${ext}`;
  } catch (e) {
    imgFailed++;
    console.warn(`  ! ${slug}: image fetch ${e.message}`);
    return null;
  }
}

for (const incoming of scraped) {
  if (!incoming.slug) { skipped++; continue; }
  const existing = bySlug.get(incoming.slug);
  const imageFile = await downloadImage(incoming.slug, incoming.imageUrl);
  if (imageFile) incoming.imageFile = imageFile;
  if (incoming.imageUrl) images[incoming.slug] = incoming.imageUrl;

  if (existing) {
    // Only fill in *missing* fields; never overwrite good data.
    let touched = 0;
    for (const k of ['name','category','author','imageUrl','imageFile','isSpecific','note','disclaimer']) {
      if (!existing[k] && incoming[k]) { existing[k] = incoming[k]; touched++; }
    }
    if (Object.keys(existing.levels || {}).length === 0 && Object.keys(incoming.levels || {}).length > 0) {
      existing.levels = incoming.levels;
      touched++;
    }
    if ((!existing.optionalRequirements || existing.optionalRequirements.length === 0) && incoming.optionalRequirements?.length) {
      existing.optionalRequirements = incoming.optionalRequirements;
      touched++;
    }
    if (touched) updated++; else skipped++;
  } else {
    cu.badges.push(incoming);
    bySlug.set(incoming.slug, incoming);
    added++;
  }
}

cu.metadata = cu.metadata || {};
cu.metadata.lastScrape = {
  date: new Date().toISOString().slice(0, 10),
  source: scrapeFile,
  attempted: scraped.length,
  added,
  updated,
  skipped,
};
cu.metadata.totalBadges = cu.badges.length;

writeFileSync(BADGES_JSON, JSON.stringify(cu, null, 2));
writeFileSync(IMAGES_JSON, JSON.stringify(images, null, 2));

console.log(`Merge complete:`);
console.log(`  added:      ${added}`);
console.log(`  updated:    ${updated}`);
console.log(`  skipped:    ${skipped}`);
console.log(`  downloaded: ${downloaded}`);
console.log(`  img failed: ${imgFailed}`);
console.log(`  badges.json total: ${cu.badges.length}`);
console.log(`\nNext: node server/scripts/importBadges.js`);
