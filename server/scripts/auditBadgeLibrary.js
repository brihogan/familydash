#!/usr/bin/env node
/**
 * Audit the badge library for known data-quality issues.
 *
 *   node server/scripts/auditBadgeLibrary.js [--json]
 *
 * Flags categories:
 *   - EMPTY_OPT_POOL   badge expects optional picks at L5 but has zero opts
 *   - SHORT_OPT_POOL   opt pool has fewer entries than the highest required pick count
 *   - MISSING_LEVEL    a level row is missing entirely when surrounding levels exist
 *   - NO_STARRED_LVL5  level5 exists but has zero starred reqs (the Bowling pattern)
 *   - INACTIVE         is_active=0 (was the Boating Safety symptom)
 *   - TRUNCATED_TEXT   a req text ends mid-sentence (no terminal punctuation,
 *                      or ends with a comma / open paren / dangling fragment)
 *   - DANGLING_FRAGMENT a req text starts with a conjunction ("but X",
 *                      "and Y") suggesting a cross-ref strip went too far
 *
 * Use --json to get machine-readable output, otherwise human-readable grouping.
 *
 * Safe to run repeatedly. Read-only — touches nothing.
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH   = join(__dirname, '../../data/family.db');
const AS_JSON   = process.argv.includes('--json');

const db = new Database(DB_PATH, { readonly: true });

const findings = [];
function flag(slug, name, category, detail) {
  findings.push({ slug, name, category, detail });
}

// ─── Load badges + computed stats ───────────────────────────────────────
const badges = db.prepare(`
  SELECT b.id, b.slug, b.name, b.is_active, b.is_award, b.level_opt_counts,
    (SELECT COUNT(*) FROM badge_optional_requirements WHERE badge_id = b.id) AS opt_count
  FROM badges b
  WHERE b.is_award = 0
`).all();

const reqsStmt = db.prepare(`
  SELECT level, text FROM badge_level_requirements WHERE badge_id = ? ORDER BY level, sort_order
`);
const optsStmt = db.prepare(`
  SELECT text FROM badge_optional_requirements WHERE badge_id = ?
`);

const LEVELS = ['preschool', 'level1', 'level2', 'level3', 'level4', 'level5'];

// Heuristics for "truncated mid-sentence":
//   - ends without `.`, `?`, `!`, `)`, `"`, `'`, `:`, digit (for "Level 5)" type endings)
//   - or ends with a comma
function looksTruncated(text) {
  const t = (text || '').trim();
  if (t.length < 8) return false;          // very short reqs are often fine ("Yoga.")
  const last = t.slice(-1);
  if (',' === last) return true;
  if (/[.?!)\]"'…0-9]$/.test(t)) return false;
  // No terminal punctuation at all → suspicious
  return true;
}

// Cross-ref fragment that escaped the strip
function looksLikeDanglingFragment(text) {
  return /^\s*(but|and|or|&)\s+(?!#?\d)/i.test(text || '');
}

// ─── Run checks ────────────────────────────────────────────────────────
for (const b of badges) {
  if (!b.is_active) {
    flag(b.slug, b.name, 'INACTIVE', null);
  }

  let optCounts = {};
  try { optCounts = JSON.parse(b.level_opt_counts || '{}'); } catch (_) {}
  const maxOptCount = Math.max(0, ...Object.values(optCounts).filter(n => typeof n === 'number'));

  if (maxOptCount > 0 && b.opt_count === 0) {
    flag(b.slug, b.name, 'EMPTY_OPT_POOL', `expects up to ${maxOptCount} optional picks, has 0`);
  } else if (maxOptCount > 0 && b.opt_count < maxOptCount) {
    flag(b.slug, b.name, 'SHORT_OPT_POOL', `expects up to ${maxOptCount} picks, only has ${b.opt_count}`);
  }

  const reqs = reqsStmt.all(b.id);
  const reqsByLevel = {};
  for (const r of reqs) {
    (reqsByLevel[r.level] ??= []).push(r);
  }
  const populatedLevels = Object.keys(reqsByLevel);
  if (populatedLevels.length > 0) {
    // Detect gaps: e.g. preschool + level1 + level3 + level5 (missing level2 and level4)
    const idxs = populatedLevels.map((l) => LEVELS.indexOf(l)).filter((i) => i >= 0).sort((a, b) => a - b);
    if (idxs.length > 0) {
      for (let i = idxs[0]; i < idxs[idxs.length - 1]; i++) {
        if (!populatedLevels.includes(LEVELS[i])) {
          flag(b.slug, b.name, 'MISSING_LEVEL', `${LEVELS[i]} has 0 reqs but ${LEVELS[idxs[0]]}…${LEVELS[idxs[idxs.length - 1]]} are populated`);
        }
      }
    }
  }
  // Level 5 with no starred reqs is suspect (Bowling pattern — CU page bug
  // or our import missed something). Only flag if the badge has reqs at
  // any other level (so we don't false-flag truly Level 5-only badges).
  if (Object.keys(reqsByLevel).length > 1 && (reqsByLevel.level5?.length ?? 0) === 0) {
    flag(b.slug, b.name, 'NO_STARRED_LVL5', null);
  }

  // Text-quality checks across required + optional
  for (const r of reqs) {
    if (looksLikeDanglingFragment(r.text)) {
      flag(b.slug, b.name, 'DANGLING_FRAGMENT', `[${r.level}] "${r.text.slice(0, 60)}…"`);
    } else if (looksTruncated(r.text)) {
      flag(b.slug, b.name, 'TRUNCATED_TEXT', `[${r.level}] "${r.text.slice(-60)}"`);
    }
  }
  for (const o of optsStmt.all(b.id)) {
    if (looksLikeDanglingFragment(o.text)) {
      flag(b.slug, b.name, 'DANGLING_FRAGMENT', `[opt] "${o.text.slice(0, 60)}…"`);
    } else if (looksTruncated(o.text)) {
      flag(b.slug, b.name, 'TRUNCATED_TEXT', `[opt] "${o.text.slice(-60)}"`);
    }
  }
}

// ─── Output ────────────────────────────────────────────────────────────
if (AS_JSON) {
  process.stdout.write(JSON.stringify(findings, null, 2));
  process.exit(0);
}

const byCategory = {};
for (const f of findings) (byCategory[f.category] ??= []).push(f);

const order = ['EMPTY_OPT_POOL', 'SHORT_OPT_POOL', 'MISSING_LEVEL', 'NO_STARRED_LVL5', 'INACTIVE', 'TRUNCATED_TEXT', 'DANGLING_FRAGMENT'];
console.log(`\nAudit: ${badges.length} badges scanned, ${findings.length} findings\n`);
for (const cat of order) {
  const items = byCategory[cat] || [];
  if (items.length === 0) continue;
  console.log(`── ${cat} (${items.length}) ──`);
  // Dedupe by slug+category — multiple truncated texts in one badge collapse
  const seen = new Set();
  for (const f of items) {
    const key = `${f.slug}|${cat}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const detail = f.detail ? `  — ${f.detail}` : '';
    console.log(`  ${f.name.padEnd(36)} (${f.slug})${detail}`);
    const extras = items.filter(x => x.slug === f.slug).slice(1, 3);
    for (const e of extras) console.log(`    + ${e.detail}`);
    if (items.filter(x => x.slug === f.slug).length > 3) {
      console.log(`    + …and ${items.filter(x => x.slug === f.slug).length - 3} more`);
    }
  }
  console.log('');
}

// Summary counts at the bottom for quick at-a-glance triage
const summary = order
  .filter((c) => byCategory[c])
  .map((c) => `${c}=${new Set(byCategory[c].map(f => f.slug)).size}`)
  .join('  ');
console.log(`Summary (unique slugs per category): ${summary}`);
