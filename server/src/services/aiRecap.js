// When a step conversation is over, write down what it was about.
//
// "Over" is a guess — nothing tells us a kid has finished thinking. Two signals
// stand in for it:
//
//   * the thread has gone quiet for RECAP_QUIET_MINUTES, or
//   * they marked the step complete, which ends it whether or not it went quiet.
//
// Neither is final. If they come back and ask more, `recap_at` falls behind
// `last_message_at` and the recap is rewritten on the next pass — so a recap is
// always "what this conversation was about so far", never a closed book.
//
// Generation is fire-and-forget, off the back of requests that were happening
// anyway (opening a step, opening the Wonders page, ticking a step off). There
// is no scheduler: a thread nobody ever looks at again costs nothing.

import db from '../db/db.js';
import { recapThread as generateRecap, aiTutorConfigured } from './aiTutor.js';

export const RECAP_QUIET_MINUTES = 15;

// At most this many per triggering request. A kid coming back to the app after
// a fortnight shouldn't fire twenty model calls to render one page; the rest
// get picked up by the next request.
const RECAP_BATCH = 3;

// Both gates that govern the tutor itself. A family whose access was revoked,
// or a kid whose parent switched the tutor off, must not still be spending our
// key on recaps of old threads.
const ELIGIBLE = `
  FROM ai_threads t
  JOIN users u    ON u.id = t.user_id
  JOIN families f ON f.id = u.family_id
 WHERE u.ai_tutor_enabled = 1 AND f.ai_tutor_access = 1
   AND t.message_count > 1
   AND (t.recap IS NULL OR t.recap_at IS NULL OR t.recap_at < t.last_message_at)
`;

// The tutor's own turns are the substance; the kid's are what steered it. Both
// are needed — a recap built from the kid's questions alone reads as a list of
// things they didn't know.
function transcriptFor(threadId) {
  const rows = db.prepare(
    `SELECT role, kind, text FROM ai_messages
      WHERE thread_id = ? AND kind != 'handoff'
      ORDER BY id LIMIT 40`,
  ).all(threadId);

  return rows.map((m) => {
    const who = m.role === 'kid' ? (m.kind === 'answer_review' ? 'Their answer' : 'Them') : 'Tutor';
    return `${who}: ${m.text.replace(/\s+/g, ' ').slice(0, 400)}`;
  }).join('\n');
}

// Write (or rewrite) one thread's recap. Stamped with the time the recap was
// generated, so a conversation that continues afterwards is detected as stale.
export async function recapOneThread(threadId) {
  if (!aiTutorConfigured()) return null;

  const thread = db.prepare(`
    SELECT t.id, t.step_text, t.message_count, ts.name AS badge_name
      FROM ai_threads t
      JOIN task_sets ts ON ts.id = t.task_set_id
     WHERE t.id = ?
  `).get(threadId);
  if (!thread || thread.message_count < 2) return null;

  const recap = await generateRecap({
    badgeName: thread.badge_name,
    stepText:  thread.step_text,
    transcript: transcriptFor(thread.id),
  });
  if (!recap) return null;

  db.prepare(
    `UPDATE ai_threads SET recap = ?, recap_at = datetime('now') WHERE id = ?`,
  ).run(recap.slice(0, 600), thread.id);
  return recap;
}

// Threads that have gone quiet and still need writing up. Used by the Wonders
// page and by opening any step — both are moments when the kid is around and a
// background call is free.
export function pendingRecapCount(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS n ${ELIGIBLE}
       AND t.user_id = ?
       AND t.last_message_at < datetime('now', ?)
  `).get(userId, `-${RECAP_QUIET_MINUTES} minutes`).n;
}

function runInBackground(threadIds, label) {
  if (!threadIds.length) return;
  (async () => {
    for (const id of threadIds) {
      try {
        await recapOneThread(id);
      } catch (err) {
        console.warn(`[ai] recap failed for thread ${id} (${label}): ${err.message}`);
      }
    }
  })();
}

export function maybeRecapQuietThreads(userId) {
  try {
    if (!aiTutorConfigured()) return;
    const rows = db.prepare(`
      SELECT t.id ${ELIGIBLE}
         AND t.user_id = ?
         AND t.last_message_at < datetime('now', ?)
       ORDER BY t.last_message_at DESC
       LIMIT ${RECAP_BATCH}
    `).all(userId, `-${RECAP_QUIET_MINUTES} minutes`);
    runInBackground(rows.map((r) => r.id), 'quiet');
  } catch (err) {
    console.warn(`[ai] recap sweep failed for user ${userId}: ${err.message}`);
  }
}

// Ticking the step off ends the conversation on purpose, so this one skips the
// quiet period. Called from the step-completion route; must never be able to
// fail a completion, hence the swallow.
export function recapStepThread(userId, stepId) {
  try {
    if (!aiTutorConfigured()) return;
    const row = db.prepare(`
      SELECT t.id ${ELIGIBLE}
         AND t.user_id = ? AND t.task_step_id = ?
    `).get(userId, stepId);
    if (row) runInBackground([row.id], 'step completed');
  } catch (err) {
    console.warn(`[ai] recap on completion failed for step ${stepId}: ${err.message}`);
  }
}
