#!/usr/bin/env node
/**
 * Audit our badge library against the curiosityuntamed.com XML sitemap.
 *
 *   node server/scripts/auditBadgeSitemap.js
 *
 * Background: our initial scrape (CuriosityUntamed/badges.json) was sourced
 * from the public badge-list page, which doesn't link every individual badge
 * post. The Yoast SEO sitemap *does*, so it's a better source of truth for
 * "what badges actually exist on the site." This script pulls the badge URLs
 * out of the sitemap and prints two diffs:
 *   • IN sitemap, NOT in our JSON (probably real badges we missed)
 *   • IN our JSON, NOT in sitemap   (probably renamed/retired slugs)
 *
 * It's read-only — it doesn't touch the DB or badges.json. Use the printed
 * "missing" slugs as input to a follow-up scraper that adds them properly.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BADGES_JSON = join(__dirname, '../../../CuriosityUntamed/badges.json');

const SITEMAP_URLS = [
  'https://curiosityuntamed.com/page-sitemap.xml',
  'https://curiosityuntamed.com/page-sitemap2.xml',
];

async function fetchSitemap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

function extractBadgeSlugs(xml) {
  const slugs = new Set();
  for (const m of xml.matchAll(/\/badges\/([a-z0-9-]+)\/?/g)) slugs.add(m[1]);
  return slugs;
}

async function main() {
  console.log('Fetching sitemaps…');
  const sitemapSlugs = new Set();
  for (const url of SITEMAP_URLS) {
    const xml = await fetchSitemap(url);
    for (const s of extractBadgeSlugs(xml)) sitemapSlugs.add(s);
  }

  const json = JSON.parse(readFileSync(BADGES_JSON, 'utf8'));
  const known = new Set(json.badges.map((b) => b.slug));

  const missing  = [...sitemapSlugs].filter((s) => !known.has(s)).sort();
  const obsolete = [...known].filter((s) => !sitemapSlugs.has(s)).sort();

  console.log(`\nSitemap badge slugs: ${sitemapSlugs.size}`);
  console.log(`Local badges.json:   ${known.size}`);
  console.log(`\nIN sitemap, NOT in our JSON (likely missed badges): ${missing.length}`);
  for (const s of missing) console.log(`  https://curiosityuntamed.com/badges/${s}/`);

  console.log(`\nIN our JSON, NOT in sitemap (renamed/retired?): ${obsolete.length}`);
  for (const s of obsolete) console.log(`  ${s}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
