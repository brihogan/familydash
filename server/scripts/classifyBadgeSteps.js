/**
 * Phase 2a — offline classification of every Curiosity Untamed requirement.
 *
 * What the tutor should DO depends on what the step actually asks for, and that
 * varies within a single badge (Bowling has steps in five different modes). This
 * pass stores an `ai_mode` and an opening question per requirement so the panel
 * opens with something specific instead of a generic greeting, and so the
 * runtime never has to re-derive it.
 *
 * Modes, and roughly what a regex sweep of the 19,624 requirements suggests:
 *   know   (~53%)  learn / research / a question in the text
 *   make   (~28%)  build, draw, write, cook
 *   social (~10%)  teach, interview, volunteer, with family
 *   do      (~6%)  practise, demonstrate, memorise
 *   go      (~6%)  visit, attend, tour
 *   media   (~5%)  read, watch, listen
 *   meta           "earn the X badge first" — no tutor
 *
 * Batched 25 requirements per call to keep the cost sane. Resumable: rows that
 * already have an ai_mode are skipped unless --force.
 *
 * Usage:
 *   node --env-file=.env server/scripts/classifyBadgeSteps.js --limit=100
 *   node --env-file=.env server/scripts/classifyBadgeSteps.js          # all
 *
 * Flags:
 *   --limit=N        stop after N requirements (testing)
 *   --batch=N        requirements per model call (default 25)
 *   --concurrency=N  parallel calls (default 4)
 *   --force          re-classify rows that already have an ai_mode
 *   --dry            print the first batch's results, write nothing
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { runMigrations } from '../src/db/migrations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// node --env-file doesn't override pre-existing (possibly empty) shell vars.
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
const flag        = (n, d) => parseInt(args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] || d, 10);
const limit       = flag('limit', '0') || null;
const batchSize   = flag('batch', '25');
const concurrency = flag('concurrency', '4');
const force       = args.includes('--force');
const dry         = args.includes('--dry');

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

const MODES = ['know', 'make', 'go', 'do', 'social', 'media', 'meta'];

const TOOL = {
  name: 'classify',
  description: 'Classify each badge requirement.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            n:      { type: 'integer', description: 'The number of the requirement you are classifying.' },
            mode:   { type: 'string', enum: MODES },
            opener: {
              type: 'string',
              description:
                'One short question, in the CHILD\'S voice, that this requirement makes them want to ask. ' +
                'It should be the first thing a tutor offers them. Empty string for mode "meta".',
            },
          },
          required: ['n', 'mode', 'opener'],
        },
      },
    },
    required: ['items'],
  },
};

const SYSTEM = `
You classify requirements from Curiosity Untamed achievement badges, so a tutor built into a
family app knows how to help with each one.

Modes:
- know   Learning or finding something out. Questions in the text, "learn about", "research".
- make   Producing something: build, draw, write, cook, sew, design.
- go     Going somewhere: visit, attend, tour, a museum or a farm.
- do     Practising a physical or performed skill: demonstrate, memorise, play a round.
- social Involving other people: teach someone, interview, volunteer, host.
- media  Reading, watching or listening to something.
- meta   Bookkeeping, not an activity: "Earn the X badge first", "Choose 4 of the following".

Many requirements do more than one thing. Pick the mode describing the ACTION the child must
take. "Make two paper airplanes. How do they differ? Which flies better?" is make, not know.

The opener is the important part, and it is the one most people get wrong.

It is NOT a restatement of the task. "Can I create a timeline showing when each Wonder was
built?" is useless — the child already knows that's the task, and a yes/no answer ends the
conversation. The opener is a question about the WORLD that this requirement makes interesting,
phrased the way a curious child would blurt it out. It should be impossible to answer in one
word, and answering it should leave them wanting the next question.

  Requirement: "Create a timeline that shows the years each of the Wonders was constructed."
  Bad:  "Can I create a timeline showing when each Wonder was built?"
  Good: "Which Wonder came first, and how much older is it than the rest?"

  Requirement: "Make at least two different types of paper airplane. Which one flies better? Why?"
  Bad:  "Can I make two paper airplanes?"
  Good: "Why does one paper airplane fly further than another?"

  Requirement: "Visit a bowling alley, take a tour, speak with someone involved with bowling."
  Bad:  "Can I visit a bowling alley?"
  Good: "What happens to the pins after they get knocked down?"

For mode "meta", the opener is an empty string.
`.trim();

// ── Load work ────────────────────────────────────────────────────────────────

const where = force ? '' : 'WHERE ai_mode IS NULL';
const rows = db.prepare(`
  SELECT 'level' AS src, rowid AS rid, text FROM badge_level_requirements ${where}
  UNION ALL
  SELECT 'opt'   AS src, rowid AS rid, text FROM badge_optional_requirements ${where}
`).all().filter((r) => r.text && r.text.trim().length > 3);

const work = limit ? rows.slice(0, limit) : rows;
console.log(`${rows.length} requirement(s) pending; processing ${work.length}.`);
if (!work.length) process.exit(0);

const batches = [];
for (let i = 0; i < work.length; i += batchSize) batches.push(work.slice(i, i + batchSize));
console.log(`${batches.length} batch(es) of up to ${batchSize}, concurrency ${concurrency}.`);

const updateLevel = db.prepare(
  `UPDATE badge_level_requirements SET ai_mode=?, ai_opener=?, ai_classified_at=datetime('now') WHERE rowid=?`,
);
const updateOpt = db.prepare(
  `UPDATE badge_optional_requirements SET ai_mode=?, ai_opener=?, ai_classified_at=datetime('now') WHERE rowid=?`,
);

let done = 0, failed = 0, usageIn = 0, usageOut = 0;
const modeTally = Object.fromEntries(MODES.map((m) => [m, 0]));

async function runBatch(batch, idx) {
  const listing = batch
    .map((r, i) => `${i + 1}. ${r.text.replace(/\s+/g, ' ').trim().slice(0, 600)}`)
    .join('\n');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Classify all ${batch.length} requirements:\n\n${listing}` }],
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'classify' },
      });

      usageIn  += res.usage?.input_tokens  || 0;
      usageOut += res.usage?.output_tokens || 0;

      const items = res.content.find((c) => c.type === 'tool_use')?.input?.items || [];
      const write = db.transaction((list) => {
        for (const item of list) {
          const row = batch[item.n - 1];
          if (!row || !MODES.includes(item.mode)) continue;
          const opener = (item.opener || '').trim().slice(0, 200);
          (row.src === 'level' ? updateLevel : updateOpt).run(item.mode, opener, row.rid);
          modeTally[item.mode] += 1;
          done += 1;
        }
      });

      if (dry) {
        console.log(`\n--- batch ${idx + 1} (dry run, nothing written) ---`);
        for (const item of items.slice(0, 10)) {
          console.log(`  [${item.mode}] ${batch[item.n - 1]?.text.slice(0, 90)}`);
          console.log(`      → "${item.opener}"`);
        }
        return;
      }

      write(items);
      if ((idx + 1) % 5 === 0 || idx === batches.length - 1) {
        console.log(`  batch ${idx + 1}/${batches.length} — ${done} classified, ${failed} failed`);
      }
      return;
    } catch (err) {
      if (attempt === 2) {
        failed += batch.length;
        console.error(`  batch ${idx + 1} failed after 3 attempts: ${err.message}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

// Simple worker pool.
let cursor = 0;
async function worker() {
  while (cursor < batches.length) {
    const i = cursor;
    cursor += 1;
    await runBatch(batches[i], i);
    if (dry) return;
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));

// Haiku 4.5 list pricing, for a rough running total.
const cost = (usageIn / 1e6) * 1.0 + (usageOut / 1e6) * 5.0;
console.log(`\nClassified ${done}, failed ${failed}.`);
console.log('Modes:', Object.entries(modeTally).filter(([, n]) => n).map(([m, n]) => `${m}=${n}`).join(' '));
console.log(`Tokens: ${usageIn} in / ${usageOut} out  ≈ $${cost.toFixed(3)}`);
if (work.length < rows.length) {
  const projected = cost * (rows.length / work.length);
  console.log(`Projected for all ${rows.length} requirements: ≈ $${projected.toFixed(2)}`);
}
