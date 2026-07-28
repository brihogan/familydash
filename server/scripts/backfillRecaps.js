/**
 * Write recaps for every conversation that doesn't have one yet.
 *
 * The lazy path (server/src/services/aiRecap.js) only recaps three threads per
 * request, so on a database full of history it would take a lot of page visits
 * to catch up — and a thread nobody ever opens again would never be written up
 * at all. This does the whole backlog in one go. Run it once after deploying
 * the recap feature.
 *
 * Usage:
 *   node server/scripts/backfillRecaps.js              # every eligible thread
 *   node server/scripts/backfillRecaps.js --limit 20   # stop after 20
 *   node server/scripts/backfillRecaps.js --dry-run    # just count them
 *
 * In production this has to run inside the container, where the database and
 * ANTHROPIC_API_KEY live:
 *   docker compose exec app node server/scripts/backfillRecaps.js
 *
 * Safe to re-run: threads that already have a current recap are skipped, so a
 * second pass only picks up conversations that have moved on since. Failures
 * are logged and skipped rather than aborting the run — a thread that fails is
 * simply still eligible next time.
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = join(__dirname, '../..');

const envPath = join(repo, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[2].replace(/^["']|["']$/g, '').trim();
    if (v) process.env[m[1]] = v;
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : null;

const { default: db } = await import(join(repo, 'server/src/db/db.js'));
const { recapOneThread } = await import(join(repo, 'server/src/services/aiRecap.js'));
const { aiTutorConfigured } = await import(join(repo, 'server/src/services/aiTutor.js'));

if (!aiTutorConfigured()) {
  console.error('ANTHROPIC_API_KEY is not set — nothing to do.');
  process.exit(1);
}

// Same eligibility as the lazy sweep, minus the quiet period: a backfill is
// deliberate, and anything mid-conversation right now will be rewritten by the
// normal path once it settles anyway.
const rows = db.prepare(`
  SELECT t.id, t.message_count, u.name AS who, ts.name AS badge
    FROM ai_threads t
    JOIN users u    ON u.id = t.user_id
    JOIN families f ON f.id = u.family_id
    JOIN task_sets ts ON ts.id = t.task_set_id
   WHERE u.ai_tutor_enabled = 1 AND f.ai_tutor_access = 1
     AND t.message_count > 1
     AND (t.recap IS NULL OR t.recap_at IS NULL OR t.recap_at < t.last_message_at)
   ORDER BY t.last_message_at DESC
   ${limit ? `LIMIT ${limit}` : ''}
`).all();

console.log(`${rows.length} conversation${rows.length === 1 ? '' : 's'} to write up.`);
if (dryRun || !rows.length) process.exit(0);

let done = 0;
let failed = 0;

for (const [i, r] of rows.entries()) {
  const label = `[${i + 1}/${rows.length}] ${r.who} · ${r.badge} (${r.message_count} msgs)`;
  try {
    const recap = await recapOneThread(r.id);
    if (recap) {
      done += 1;
      console.log(`${label}\n    ${recap}`);
    } else {
      failed += 1;
      console.warn(`${label}\n    (no recap returned)`);
    }
  } catch (err) {
    failed += 1;
    console.warn(`${label}\n    FAILED: ${err.message}`);
  }
}

console.log(`\nDone. ${done} written, ${failed} skipped.`);
