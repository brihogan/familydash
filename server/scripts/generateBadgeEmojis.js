/**
 * One-time AI emoji generator for badges that have no image.
 *
 * For each image-less badge, asks Claude Haiku to pick a single emoji that
 * best fits the name + description. Resumable — skips badges that already
 * have a non-empty emoji.
 *
 * Usage:
 *   node server/scripts/generateBadgeEmojis.js
 *
 * Flags:
 *   --limit=N        only process first N pending badges
 *   --concurrency=N  parallel requests (default 8)
 *   --force          regenerate emojis even if already set
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { runMigrations } from '../src/db/migrations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env explicitly (overrides empty shell vars)
const envPath = join(__dirname, '../../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[2].replace(/^["']|["']$/g, '').trim();
    if (v) process.env[m[1]] = v;
  }
}

const args        = process.argv.slice(2);
const limit       = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]       || '0',  10) || null;
const concurrency = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '8',  10);
const force       = args.includes('--force');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set in .env.');
  process.exit(1);
}

const DB_PATH = process.env.DATABASE_PATH || join(__dirname, '../../data/family.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
runMigrations(db);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You pick a single emoji that best represents a homeschool achievement badge.

Rules:
- Output EXACTLY ONE emoji character. Nothing else — no words, no quotes, no spaces.
- Pick something kid-friendly that visually evokes the badge's subject.
- Prefer specific over generic: a "Beekeeping" badge gets 🐝, not 🏅.
- For abstract concepts (Character, Knowledge), pick a metaphor: ⭐ honesty, 📚 learning, etc.
- Never output 🏅 or 📋 (those are our defaults).

Examples:
- "Beekeeping" → 🐝
- "Knot Tying" → 🪢
- "Origami" → 🦢
- "Accountability" → ✋
- "Volcanoes" → 🌋
- "Whales" → 🐋`;

const pending = db.prepare(`
  SELECT id, name, category, description
  FROM badges
  WHERE is_active = 1
    AND (image_file IS NULL OR image_file = '')
    ${force ? '' : "AND (emoji IS NULL OR emoji = '')"}
  ORDER BY name ASC
  ${limit ? `LIMIT ${limit}` : ''}
`).all();

console.log(`Pending image-less badges to assign emoji: ${pending.length}`);
if (pending.length === 0) {
  console.log('Nothing to do. (Use --force to regenerate.)');
  db.close();
  process.exit(0);
}

const updateEmoji = db.prepare(`UPDATE badges SET emoji = ? WHERE id = ?`);

let done = 0;
let failed = 0;
let inputTokens = 0;
let outputTokens = 0;

// Pull just the first character of a string, handling multi-codepoint emoji
function firstEmoji(s) {
  const trimmed = s.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  // Take only up to the first whitespace/period/newline
  const cleaned = trimmed.split(/[\s.,]/)[0] || trimmed;
  return cleaned;
}

async function describeBadge(badge) {
  const userMsg = `Badge: ${badge.name}\nArea: ${badge.category || 'Discover'}\n${
    badge.description ? `About: ${badge.description}` : ''
  }\n\nReturn the single best emoji.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 20,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMsg }],
  });

  if (resp.usage) {
    inputTokens  += resp.usage.input_tokens  || 0;
    outputTokens += resp.usage.output_tokens || 0;
  }

  const text = resp.content.find(b => b.type === 'text')?.text?.trim() || '';
  return firstEmoji(text);
}

async function worker(queue) {
  while (queue.length > 0) {
    const badge = queue.shift();
    if (!badge) return;
    try {
      const emoji = await describeBadge(badge);
      if (!emoji) {
        console.error(`  ! ${badge.name}: empty response`);
        failed++;
        continue;
      }
      updateEmoji.run(emoji, badge.id);
      done++;
      if (done % 10 === 0 || done === pending.length) {
        console.log(`  [${done}/${pending.length}] ${emoji}  ${badge.name.slice(0, 35)}`);
      }
    } catch (err) {
      failed++;
      console.error(`  ! ${badge.name}: ${err.message?.slice(0, 100) || err}`);
      if (err.status === 429) await new Promise(r => setTimeout(r, 5000));
    }
  }
}

console.log(`Concurrency: ${concurrency}, Model: ${MODEL}`);
console.log('---');

const queue = [...pending];
await Promise.all(Array.from({ length: concurrency }, () => worker(queue)));

console.log('---');
console.log(`Done: ${done}   Failed: ${failed}`);
const cost = (inputTokens * 1.0 + outputTokens * 5.0) / 1_000_000;
console.log(`Tokens — input: ${inputTokens}  output: ${outputTokens}   Approx cost: $${cost.toFixed(4)}`);

db.close();
