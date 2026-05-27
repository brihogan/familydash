#!/usr/bin/env node
/**
 * Re-parse every cached badge HTML in CuriosityUntamed/raw/ with the
 * CURRENT parser and report (or apply) improvements over CuriosityUntamed/
 * badges.json. Useful after parser bugfixes — recovers content from
 * already-fetched pages with no network calls.
 *
 *   node server/scripts/reparseFromCache.js          # dry-run report
 *   node server/scripts/reparseFromCache.js --apply  # mutate badges.json
 *
 * Improvement = "new parse produced more content than current":
 *   • Optional pool grew (more entries OR longer total text)
 *   • A level's requirement text got longer (truncation recovered)
 *   • A previously-empty level gained reqs
 *
 * Regressions (new has less) are NEVER applied. badges.json wins those
 * — preserves any manual fixes that the parser can't reconstruct.
 *
 * After applying: run importBadges.js + exportBadgeLibrary.js to push
 * the recovered content into the DB and update the prod snapshot.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseBadgeHtml } from './scrapeCuBadges.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const CU_DIR       = join(__dirname, '../../../CuriosityUntamed');
const RAW_DIR      = join(CU_DIR, 'raw');
const BADGES_JSON  = join(CU_DIR, 'badges.json');
const APPLY        = process.argv.includes('--apply');

if (!existsSync(RAW_DIR))    { console.error(`raw dir missing: ${RAW_DIR}`); process.exit(1); }
if (!existsSync(BADGES_JSON)){ console.error(`badges.json missing: ${BADGES_JSON}`); process.exit(1); }

const badgesData = JSON.parse(readFileSync(BADGES_JSON, 'utf8'));
const bySlug     = new Map(badgesData.badges.map(b => [b.slug, b]));

const files = readdirSync(RAW_DIR).filter(f => f.endsWith('.html'));
console.log(`Re-parsing ${files.length} cached HTML files. apply=${APPLY}\n`);

const improvements = [];   // { slug, name, changes:[{kind, before, after}] }

function totalReqLen(levels) {
  let n = 0;
  for (const lv of Object.values(levels || {})) {
    for (const r of lv.requirements || []) n += (r.text || '').length;
  }
  return n;
}
function totalOptLen(opts) {
  return (opts || []).reduce((n, o) => n + (o.text || '').length, 0);
}

for (const file of files) {
  const slug = file.replace(/\.html$/, '');
  const html = readFileSync(join(RAW_DIR, file), 'utf8');
  const parsed = parseBadgeHtml(slug, html);
  const existing = bySlug.get(slug);
  if (!existing) {
    // Slug in raw/ but not in badges.json — would be a new badge to add.
    // Out of scope for this cleanup pass; log and skip.
    console.log(`  [new]  ${slug} (in raw/ but missing from badges.json)`);
    continue;
  }

  const changes = [];

  // Compare optional pools — total text length is a reasonable proxy for
  // "more content recovered". Count growth also counts.
  const oldOptCount = existing.optionalRequirements?.length || 0;
  const newOptCount = parsed.optionalRequirements?.length || 0;
  const oldOptLen   = totalOptLen(existing.optionalRequirements);
  const newOptLen   = totalOptLen(parsed.optionalRequirements);
  if (newOptCount > oldOptCount || (newOptCount === oldOptCount && newOptLen > oldOptLen + 20)) {
    changes.push({
      kind: 'opt',
      before: `${oldOptCount} items, ${oldOptLen} chars`,
      after:  `${newOptCount} items, ${newOptLen} chars`,
    });
  }

  // Per-level requirement comparison
  for (const level of ['preschool', 'level1', 'level2', 'level3', 'level4', 'level5']) {
    const oldReqs = existing.levels?.[level]?.requirements || [];
    const newReqs = parsed.levels?.[level]?.requirements   || [];
    if (newReqs.length > oldReqs.length) {
      changes.push({
        kind: `level-${level}-count`,
        before: `${oldReqs.length} reqs`,
        after:  `${newReqs.length} reqs`,
      });
    } else if (newReqs.length === oldReqs.length && newReqs.length > 0) {
      // Same count — check if individual texts got longer (truncation recovered)
      let longerCount = 0;
      let exampleBefore = '', exampleAfter = '';
      for (let i = 0; i < oldReqs.length; i++) {
        const oLen = (oldReqs[i].text || '').length;
        const nLen = (newReqs[i].text || '').length;
        if (nLen > oLen + 20) {
          longerCount++;
          if (!exampleBefore) {
            exampleBefore = oldReqs[i].text.slice(-50);
            exampleAfter  = newReqs[i].text.slice(-50);
          }
        }
      }
      if (longerCount > 0) {
        changes.push({
          kind: `level-${level}-len`,
          before: `${longerCount} req${longerCount === 1 ? '' : 's'} truncated, e.g. "…${exampleBefore}"`,
          after:  `"…${exampleAfter}"`,
        });
      }
    }
  }

  if (changes.length > 0) {
    improvements.push({ slug, name: existing.name, changes });
    if (APPLY) {
      // Apply only the improvements we detected, level by level
      for (const c of changes) {
        if (c.kind === 'opt') {
          existing.optionalRequirements = parsed.optionalRequirements;
        } else if (c.kind.startsWith('level-')) {
          const level = c.kind.split('-')[1];
          existing.levels[level] = parsed.levels[level];
        }
      }
    }
  }
}

// Report
for (const imp of improvements) {
  console.log(`${imp.name} (${imp.slug})`);
  for (const c of imp.changes) {
    console.log(`  ${c.kind}: ${c.before}  →  ${c.after}`);
  }
}
console.log(`\n${improvements.length} badges with improvements${APPLY ? ' — applied.' : ' (run with --apply to write).'}`);

if (APPLY) {
  writeFileSync(BADGES_JSON, JSON.stringify(badgesData, null, 2));
  console.log(`Wrote ${BADGES_JSON}. Now run:\n  node server/scripts/importBadges.js\n  node server/scripts/exportBadgeLibrary.js`);
}
