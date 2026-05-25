#!/usr/bin/env node
/**
 * Scrape CuriosityUntamed badge detail pages and merge them into
 * CuriosityUntamed/badges.json + the image folder.
 *
 *   CU_COOKIE='wordpress_logged_in_xxx=…' node server/scripts/scrapeCuBadges.js [--mode=missing|emoji|slugs] [--slugs=a,b,c] [--dry]
 *
 * Modes
 *   missing  (default)  Fetch every slug in the sitemap that's not in our JSON
 *                       (i.e. the 96 the audit script surfaces).
 *   emoji               Re-fetch every badge in the DB that has no image_file
 *                       so we can backfill the 151 emoji-only rows.
 *   slugs               Fetch a comma-separated list of slugs (one-off use).
 *
 * Auth
 *   Badge detail pages are behind CU's member auth. Set CU_COOKIE to the full
 *   `Cookie:` header value from a logged-in browser session. The simplest way:
 *     1. Open any badge page logged in.
 *     2. DevTools → Network → click any /badges/… request.
 *     3. Copy the Cookie request header value (whole string).
 *     4. Export it: `export CU_COOKIE='…'`.
 *   The cookie usually lasts a few weeks. If scrapes start returning the
 *   "Unauthorized Access" title, refresh it the same way.
 *
 * What gets written
 *   - Raw HTML cached to CuriosityUntamed/raw/{slug}.html (so re-parsing is
 *     free and we don't re-hit the site).
 *   - Parsed badge merged into CuriosityUntamed/badges.json (idempotent — if
 *     the slug already exists, fields are updated).
 *   - Image downloaded to CuriosityUntamed/images/{slug}.{ext}.
 *
 * After it runs, follow up with `node server/scripts/importBadges.js` to push
 * the new entries into the dev DB. See WORK_LOG for the prod runbook.
 *
 * Throttle: ~1 req/sec by default. Override with REQUEST_DELAY_MS env.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CU_DIR       = join(__dirname, '../../../CuriosityUntamed');
const BADGES_JSON  = join(CU_DIR, 'badges.json');
const IMAGES_JSON  = join(CU_DIR, 'badge_images.json');
const IMAGES_DIR   = join(CU_DIR, 'images');
const RAW_DIR      = join(CU_DIR, 'raw');
const DB_PATH      = join(__dirname, '../../data/family.db');

const SITEMAP_URLS = [
  'https://curiosityuntamed.com/page-sitemap.xml',
  'https://curiosityuntamed.com/page-sitemap2.xml',
];

const REQUEST_DELAY_MS = parseInt(process.env.REQUEST_DELAY_MS || '1000', 10);

const args = process.argv.slice(2).reduce((m, a) => {
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=');
    m[k] = v === undefined ? true : v;
  }
  return m;
}, {});

const MODE     = args.mode || 'missing';
const DRY_RUN  = !!args.dry;
const SLUG_ARG = (args.slugs || '').split(',').map(s => s.trim()).filter(Boolean);

if (!process.env.CU_COOKIE && !DRY_RUN) {
  console.error('error: CU_COOKIE env var required (use --dry to test without it).');
  console.error("Hint: export CU_COOKIE='wordpress_logged_in_…=…; wp-…=…'");
  process.exit(1);
}

if (!existsSync(RAW_DIR))    mkdirSync(RAW_DIR,    { recursive: true });
if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchSitemapSlugs() {
  const slugs = new Set();
  for (const url of SITEMAP_URLS) {
    const r = await fetch(url);
    const xml = await r.text();
    for (const m of xml.matchAll(/\/badges\/([a-z0-9-]+)\/?/g)) slugs.add(m[1]);
  }
  return slugs;
}

async function fetchBadgeHtml(slug) {
  const cached = join(RAW_DIR, `${slug}.html`);
  if (existsSync(cached) && !args.refetch) {
    return readFileSync(cached, 'utf8');
  }
  const url = `https://curiosityuntamed.com/badges/${slug}/`;
  const res = await fetch(url, {
    headers: {
      Cookie: process.env.CU_COOKIE,
      'User-Agent': 'Mozilla/5.0 FamilyDash badge scraper',
      Accept: 'text/html',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const html = await res.text();
  if (/<title>Unauthorized Access/i.test(html)) {
    throw new Error(`${slug}: still hitting unauth — refresh CU_COOKIE`);
  }
  writeFileSync(cached, html);
  return html;
}

// ─── Parser ───────────────────────────────────────────────────────────────
// The exact CU markup isn't known until we see an authenticated page. This
// parser is structured so each field is independent — if a heuristic misses,
// the rest of the badge still imports usefully and we can refine later.
function parseBadgeHtml(slug, html) {
  const out = {
    name: null,
    slug,
    url: `https://curiosityuntamed.com/badges/${slug}/`,
    category: null,
    author: null,
    isSpecific: /-specific/.test(slug) || /Specific/.test(slug),
    note: null,
    disclaimer: null,
    levels: {},
    optionalRequirements: [],
    relatedBadges: [],
    imageUrl: null,
    imageFile: null,
  };

  // Name: prefer <h1 class="entry-title"> or first <h1>, then <title>
  const h1   = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)</i)?.[1]
            || html.match(/<h1[^>]*>([^<]+)</i)?.[1];
  const ogTitle = html.match(/<meta property="og:title"\s+content="([^"]+)"/i)?.[1];
  const docTitle = html.match(/<title>([^<]+)<\/title>/i)?.[1];
  out.name = (h1 || ogTitle || docTitle || '').replace(/\s*[-|]\s*Curiosity Untamed.*$/i, '').trim() || null;

  // Image: og:image is the most reliable place. Fall back to first image in
  // the post content that looks like a CU upload.
  const og = html.match(/<meta property="og:image"\s+content="([^"]+)"/i)?.[1];
  const inlineImg = html.match(/<img[^>]+src="(https:\/\/(?:www\.)?(?:curiosityuntamed|questclubs)\.com\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png))"/i)?.[1];
  out.imageUrl = og || inlineImg || null;

  // Category: usually breadcrumb "… › Discover X › Slug" or a sidebar tag.
  // Try several patterns; first match wins.
  const catPatterns = [
    /Area of Discovery[^<]*<[^>]*>\s*<[^>]*>\s*([^<]+)</i,
    />(Discover (?:Agriculture|Art|Character|Health[^<]*|the Home|Knowledge|the Outdoors|Science[^<]*|the World))</i,
  ];
  for (const p of catPatterns) {
    const m = html.match(p);
    if (m) { out.category = m[1].replace(/&amp;/g, '&').trim(); break; }
  }

  // Author byline: WordPress usually emits `<span class="author">` or
  // "Posted by Name".
  const author = html.match(/class="author[^"]*"[^>]*>\s*(?:<[^>]+>)?\s*([^<]+?)\s*</i)?.[1]
              || html.match(/Posted by[^>]*>\s*([^<]+)/i)?.[1];
  if (author) out.author = author.trim();

  // Levels: scan the entry-content for "Level 1:" / "Preschool:" headings
  // and capture the <ol> or <ul> that follows. This is the most likely place
  // for the parser to need a refinement once we see a real page.
  const contentMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/article>/i)
                    || html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  const content = contentMatch?.[1] || html;
  const levelHeadingPattern = /<(?:h[1-6]|strong|p)[^>]*>\s*(?:<[^>]+>)?\s*(Preschool|Level [1-5])\s*:?\s*(?:<\/[^>]+>)?\s*<\/(?:h[1-6]|strong|p)>([\s\S]*?)(?=<(?:h[1-6]|strong|p)[^>]*>\s*(?:<[^>]+>)?\s*(?:Preschool|Level [1-5])|<\/article>|$)/gi;
  const LEVEL_KEY = { 'Preschool': 'preschool', 'Level 1': 'level1', 'Level 2': 'level2', 'Level 3': 'level3', 'Level 4': 'level4', 'Level 5': 'level5' };
  for (const m of content.matchAll(levelHeadingPattern)) {
    const key  = LEVEL_KEY[m[1]];
    const body = m[2];
    if (!key) continue;
    const items = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(li => li[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    out.levels[key] = {
      totalRequired: items.length,
      starredCount:  items.length, // refine once we see how * markers render
      requirements: items.map((text, i) => ({ number: i + 1, starred: true, text })),
    };
  }

  return out;
}

async function downloadImage(slug, imageUrl) {
  if (!imageUrl) return null;
  const ext = (imageUrl.match(/\.(jpe?g|png)(?:\?|$)/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const target = join(IMAGES_DIR, `${slug}.${ext}`);
  if (existsSync(target)) return `images/${slug}.${ext}`;
  const r = await fetch(imageUrl);
  if (!r.ok) { console.warn(`  ! image ${imageUrl} → HTTP ${r.status}`); return null; }
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(target, buf);
  return `images/${slug}.${ext}`;
}

// ─── Slug source ──────────────────────────────────────────────────────────

async function resolveTargetSlugs() {
  if (MODE === 'slugs') {
    if (SLUG_ARG.length === 0) throw new Error('--mode=slugs requires --slugs=a,b,c');
    return SLUG_ARG;
  }
  const cu = JSON.parse(readFileSync(BADGES_JSON, 'utf8'));
  const known = new Set(cu.badges.map(b => b.slug));

  if (MODE === 'missing') {
    const sitemap = await fetchSitemapSlugs();
    return [...sitemap].filter(s => !known.has(s)).sort();
  }
  if (MODE === 'emoji') {
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(
      `SELECT slug FROM badges WHERE is_award = 0 AND (image_file IS NULL OR image_file = '')`
    ).all();
    db.close();
    return rows.map(r => r.slug);
  }
  throw new Error(`unknown --mode=${MODE}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`mode=${MODE}  dry=${DRY_RUN}`);
  const slugs = await resolveTargetSlugs();
  console.log(`targets: ${slugs.length}`);

  if (DRY_RUN) {
    slugs.slice(0, 20).forEach(s => console.log(`  ${s}`));
    if (slugs.length > 20) console.log(`  …and ${slugs.length - 20} more`);
    return;
  }

  const cu        = JSON.parse(readFileSync(BADGES_JSON, 'utf8'));
  const imageMap  = existsSync(IMAGES_JSON) ? JSON.parse(readFileSync(IMAGES_JSON, 'utf8')) : {};
  const bySlug    = new Map(cu.badges.map(b => [b.slug, b]));

  let ok = 0, fail = 0;
  for (const slug of slugs) {
    try {
      const html   = await fetchBadgeHtml(slug);
      const parsed = parseBadgeHtml(slug, html);
      const file   = await downloadImage(slug, parsed.imageUrl);
      if (file) parsed.imageFile = file;
      if (parsed.imageUrl) imageMap[slug] = parsed.imageUrl;

      const existing = bySlug.get(slug);
      if (existing) {
        // Backfill missing fields without clobbering good data
        for (const k of Object.keys(parsed)) {
          if (parsed[k] && !existing[k]) existing[k] = parsed[k];
        }
        if (parsed.imageFile) existing.imageFile = parsed.imageFile;
      } else {
        cu.badges.push(parsed);
        bySlug.set(slug, parsed);
      }
      ok++;
      process.stdout.write(`. ${slug}\n`);
    } catch (e) {
      fail++;
      console.warn(`  ✗ ${slug}: ${e.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  // Update metadata block + write
  cu.metadata = cu.metadata || {};
  cu.metadata.lastScrape = {
    date: new Date().toISOString().slice(0, 10),
    mode: MODE,
    attempted: slugs.length,
    succeeded: ok,
    failed: fail,
  };
  cu.metadata.totalBadges = cu.badges.length;
  writeFileSync(BADGES_JSON, JSON.stringify(cu, null, 2));
  writeFileSync(IMAGES_JSON, JSON.stringify(imageMap, null, 2));

  console.log(`\nDone. ok=${ok} fail=${fail}. Now run: node server/scripts/importBadges.js`);
}

main().catch((e) => { console.error(e); process.exit(1); });
