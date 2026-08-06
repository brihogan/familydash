import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { seedFamily, db } from './setup.js';

// `badges` isn't in setup.js's between-test cleanup (it's library data, not
// family data), so slugs have to stay unique across the whole file.
let badgeCounter = 0;

function seedBadge({ reqCount = 2 } = {}) {
  badgeCounter++;
  const badge = db.prepare(`
    INSERT INTO badges (name, slug, category, level_opt_counts)
    VALUES (?, ?, 'Discover Science & Technology', '{}')
    RETURNING *
  `).get(`Test Badge ${badgeCounter}`, `test-badge-${badgeCounter}`);

  for (let i = 0; i < reqCount; i++) {
    db.prepare(`
      INSERT INTO badge_level_requirements (badge_id, level, sort_order, text)
      VALUES (?, 'level1', ?, ?)
    `).run(badge.id, i, `Requirement ${i + 1}`);
  }
  return badge;
}

function prepKid(kid, { maxActiveBadges = 1 } = {}) {
  db.prepare(
    `UPDATE users SET badge_level = 'level1', max_active_badges = ? WHERE id = ?`
  ).run(maxActiveBadges, kid.id);
}

const enroll = (token, kidId, badgeId) =>
  request(app)
    .post(`/api/users/${kidId}/badges/enroll`)
    .set('Authorization', `Bearer ${token}`)
    .send({ badgeId, selectedOptionalIds: [] });

// Mark every step of an enrollment complete, `daysAgo` in the past.
function completeAllSteps(taskSetId, userId, daysAgo = 0) {
  const steps = db.prepare(
    `SELECT id FROM task_steps WHERE task_set_id = ? AND is_active = 1`
  ).all(taskSetId);
  for (const s of steps) {
    db.prepare(`
      INSERT INTO task_step_completions (task_step_id, task_set_id, user_id, instance, completed_at, approval_status)
      VALUES (?, ?, ?, 1, datetime('now', ?), 'approved')
    `).run(s.id, taskSetId, userId, `-${daysAgo} days`);
  }
}

const listTaskSets = (token, kidId, archived) =>
  request(app)
    .get(`/api/users/${kidId}/task-assignments${archived ? `?archived=${archived}` : ''}`)
    .set('Authorization', `Bearer ${token}`);

describe('badge enrollment limit', () => {
  it('a finished badge stops holding a slot', async () => {
    const { parentToken, kids } = seedFamily();
    const kid = kids[0];
    prepKid(kid, { maxActiveBadges: 1 });
    const badgeA = seedBadge();
    const badgeB = seedBadge();

    const first = await enroll(parentToken, kid.id, badgeA.id);
    expect(first.status).toBe(201);

    // Slot is taken while badge A is in progress.
    const blocked = await enroll(parentToken, kid.id, badgeB.id);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/maximum of 1 active badge/);

    // Finishing badge A frees the slot immediately — no waiting for the
    // auto-archive sweep.
    completeAllSteps(first.body.taskSetId, kid.id);
    const afterEarning = await enroll(parentToken, kid.id, badgeB.id);
    expect(afterEarning.status).toBe(201);
  });

  it('an archived in-progress badge stops holding a slot', async () => {
    const { parentToken, kids } = seedFamily();
    const kid = kids[0];
    prepKid(kid, { maxActiveBadges: 1 });
    const badgeA = seedBadge();
    const badgeB = seedBadge();

    const first = await enroll(parentToken, kid.id, badgeA.id);
    await request(app)
      .post(`/api/users/${kid.id}/task-assignments/${first.body.taskSetId}/archive`)
      .set('Authorization', `Bearer ${parentToken}`);

    const res = await enroll(parentToken, kid.id, badgeB.id);
    expect(res.status).toBe(201);
  });
});

describe('completed badges auto-archive', () => {
  it('keeps a badge earned today in the list', async () => {
    const { parentToken, kids } = seedFamily();
    const kid = kids[0];
    prepKid(kid, { maxActiveBadges: 3 });
    const badge = seedBadge();

    const { body } = await enroll(parentToken, kid.id, badge.id);
    completeAllSteps(body.taskSetId, kid.id, 0);

    const res = await listTaskSets(parentToken, kid.id);
    expect(res.body.taskSets.map((ts) => ts.id)).toContain(body.taskSetId);
    expect(res.body.taskSets[0].archived_at).toBeNull();
  });

  it('archives a badge earned more than 2 days ago, but keeps it under archived=all', async () => {
    const { parentToken, kids } = seedFamily();
    const kid = kids[0];
    prepKid(kid, { maxActiveBadges: 3 });
    const badge = seedBadge();

    const { body } = await enroll(parentToken, kid.id, badge.id);
    completeAllSteps(body.taskSetId, kid.id, 3);

    const res = await listTaskSets(parentToken, kid.id);
    expect(res.body.taskSets).toHaveLength(0);

    const all = await listTaskSets(parentToken, kid.id, 'all');
    expect(all.body.taskSets).toHaveLength(1);
    expect(all.body.taskSets[0].archived_at).toBeTruthy();

    const archivedOnly = await listTaskSets(parentToken, kid.id, 'true');
    expect(archivedOnly.body.taskSets.map((ts) => ts.id)).toEqual([body.taskSetId]);
  });

  it('leaves an unfinished badge alone', async () => {
    const { parentToken, kids } = seedFamily();
    const kid = kids[0];
    prepKid(kid, { maxActiveBadges: 3 });
    const badge = seedBadge({ reqCount: 2 });

    const { body } = await enroll(parentToken, kid.id, badge.id);
    const step = db.prepare(
      `SELECT id FROM task_steps WHERE task_set_id = ? ORDER BY sort_order LIMIT 1`
    ).get(body.taskSetId);
    db.prepare(`
      INSERT INTO task_step_completions (task_step_id, task_set_id, user_id, instance, completed_at, approval_status)
      VALUES (?, ?, ?, 1, datetime('now', '-5 days'), 'approved')
    `).run(step.id, body.taskSetId, kid.id);

    const res = await listTaskSets(parentToken, kid.id);
    expect(res.body.taskSets).toHaveLength(1);
    expect(res.body.taskSets[0].archived_at).toBeNull();
  });

  it('leaves a badge waiting on approval alone', async () => {
    const { parentToken, kids } = seedFamily();
    const kid = kids[0];
    prepKid(kid, { maxActiveBadges: 3 });
    const badge = seedBadge();

    const { body } = await enroll(parentToken, kid.id, badge.id);
    completeAllSteps(body.taskSetId, kid.id, 4);
    db.prepare(
      `UPDATE task_step_completions SET approval_status = 'pending' WHERE task_set_id = ?`
    ).run(body.taskSetId);

    const res = await listTaskSets(parentToken, kid.id);
    expect(res.body.taskSets).toHaveLength(1);
    expect(res.body.taskSets[0].archived_at).toBeNull();
  });
});
