/**
 * One-time AI description generator for badges.
 *
 * Reads each badge's name + a few representative requirements from the DB and
 * asks Claude Haiku for a 1-2 sentence kid-friendly description. Uses prompt
 * caching on the system prompt (~1¢ saved per call). Resumable — skips badges
 * that already have a non-empty description.
 *
 * Usage:
 *   node --env-file=../.env server/scripts/generateBadgeDescriptions.js
 *
 * Optional flags:
 *   --limit=N       only process the first N pending badges (testing)
 *   --concurrency=N parallel requests (default 8, max recommended 20)
 *   --force         regenerate even for badges that already have a description
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { runMigrations } from '../src/db/migrations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Force-load .env (overrides empty shell vars). node --env-file doesn't
// override pre-existing vars, so we do it explicitly here.
const envPath = join(__dirname, '../../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    const v = vRaw.replace(/^["']|["']$/g, '').trim();
    if (v) process.env[k] = v;
  }
}

// ─── Args ─────────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const limit       = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]       || '0',  10) || null;
const concurrency = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '8',  10);
const force       = args.includes('--force');

// ─── Setup ────────────────────────────────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set. Add it to .env.');
  process.exit(1);
}

const DB_PATH = process.env.DATABASE_PATH || join(__dirname, '../../data/family.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
runMigrations(db);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5-20251001';

// ─── Style guide / cached system prompt ──────────────────────────────────────
const SYSTEM_PROMPT = `You write short, friendly descriptions of homeschool achievement badges for kids ages 5-18.

Rules:
- Output EXACTLY 1-2 sentences. Max 180 characters total.
- Plain conversational language a curious kid would enjoy.
- Describe the SUBJECT of the badge, not the mechanics. Don't say "earn this badge", "complete the requirements", "kids will", etc.
- Don't start with "Learn about" or "Discover" — the badge categories already say those.
- Don't start with the badge's name (it's shown right above your description).
- No emojis. No quotes around the output. No prefix or label.
- Treat it like the back-of-the-box blurb on a kit.

Example badge: "Beekeeping"
Good: "Bees are tiny pollinators that make honey, build wax combs, and live in busy colonies of thousands. Get to know how hives work and how beekeepers care for them safely."
Bad: "In this badge, kids will learn about bees..."

Example badge: "Origami"
Good: "Folding paper into birds, frogs, and flowers turns a flat square into something that can stand, fly, or hop. A patient hobby with surprising results."
Bad: "Learn about origami and earn this badge by completing requirements."`;

// ─── Fetch pending badges ─────────────────────────────────────────────────────
const pending = db.prepare(`
  SELECT id, name, category, slug
  FROM badges
  WHERE is_active = 1
    ${force ? '' : 'AND (description IS NULL OR description = \'\')'}
  ORDER BY name ASC
  ${limit ? `LIMIT ${limit}` : ''}
`).all();

console.log(`Pending badges to describe: ${pending.length}`);
if (pending.length === 0) {
  console.log('Nothing to do. (Use --force to regenerate.)');
  db.close();
  process.exit(0);
}

const getReqs = db.prepare(`
  SELECT text FROM badge_level_requirements
  WHERE badge_id = ? AND level IN ('preschool','level1','level2')
  ORDER BY sort_order ASC LIMIT 5
`);

const updateDesc = db.prepare(`UPDATE badges SET description = ? WHERE id = ?`);

// ─── Per-badge prompt + API call ──────────────────────────────────────────────
async function describeBadge(badge) {
  const reqs = getReqs.all(badge.id).map(r => `- ${r.text}`).join('\n');

  const userMsg = `Badge: ${badge.name}\nArea: ${badge.category || 'Discover'}\n\nWhat the badge involves (a few of the early requirements):\n${reqs || '(no extra details available)'}\n\nWrite the description now.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMsg }],
  });

  const text = resp.content.find(b => b.type === 'text')?.text?.trim() || '';
  // Strip surrounding quotes if the model added any
  return text.replace(/^["'‘’“”]+/, '').replace(/["'‘’“”]+$/, '').trim();
}

// ─── Concurrent batch runner with progress ───────────────────────────────────
let done = 0;
let failed = 0;
let cacheReadTokens = 0;
let cacheWriteTokens = 0;
let inputTokens = 0;
let outputTokens = 0;

async function worker(queue) {
  while (queue.length > 0) {
    const badge = queue.shift();
    if (!badge) return;
    try {
      const start = Date.now();
      const desc = await describeBadgeWithUsage(badge);
      updateDesc.run(desc.text, badge.id);
      done++;
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      if (done % 10 === 0 || done === pending.length) {
        console.log(`  [${done}/${pending.length}] ${badge.name.slice(0, 35).padEnd(35)} (${elapsed}s)`);
      }
    } catch (err) {
      failed++;
      console.error(`  ! ${badge.name}: ${err.message?.slice(0, 100) || err}`);
      // Backoff on rate limits
      if (err.status === 429) await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function describeBadgeWithUsage(badge) {
  const reqs = getReqs.all(badge.id).map(r => `- ${r.text}`).join('\n');
  const userMsg = `Badge: ${badge.name}\nArea: ${badge.category || 'Discover'}\n\nWhat the badge involves (a few of the early requirements):\n${reqs || '(no extra details available)'}\n\nWrite the description now.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMsg }],
  });

  if (resp.usage) {
    cacheReadTokens  += resp.usage.cache_read_input_tokens  || 0;
    cacheWriteTokens += resp.usage.cache_creation_input_tokens || 0;
    inputTokens      += resp.usage.input_tokens || 0;
    outputTokens     += resp.usage.output_tokens || 0;
  }

  const text = resp.content.find(b => b.type === 'text')?.text?.trim() || '';
  const cleaned = text.replace(/^["'‘’“”]+/, '').replace(/["'‘’“”]+$/, '').trim();
  return { text: cleaned };
}

console.log(`Concurrency: ${concurrency}, Model: ${MODEL}`);
console.log('---');

const queue = [...pending];
const workers = Array.from({ length: concurrency }, () => worker(queue));
await Promise.all(workers);

console.log('---');
console.log(`Done: ${done}   Failed: ${failed}`);
console.log(`Tokens — fresh input: ${inputTokens}  cache write: ${cacheWriteTokens}  cache read: ${cacheReadTokens}  output: ${outputTokens}`);

// Haiku 4.5 pricing (approx): $1/M input, $0.10/M cache read, $1.25/M cache write, $5/M output
const cost = (inputTokens * 1.0 + cacheReadTokens * 0.10 + cacheWriteTokens * 1.25 + outputTokens * 5.0) / 1_000_000;
console.log(`Approx cost: $${cost.toFixed(4)}`);

db.close();
