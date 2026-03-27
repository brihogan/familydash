import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { seedFamily, db } from './setup.js';

function seedChoreWithPendingApproval(kidId) {
  const template = db.prepare(`
    INSERT INTO chore_templates (user_id, name, ticket_reward) VALUES (?, 'Clean room', 3) RETURNING *
  `).get(kidId);

  const log = db.prepare(`
    INSERT INTO chore_logs (chore_template_id, user_id, log_date, completed_at, ticket_reward_at_time, approval_status)
    VALUES (?, ?, date('now'), datetime('now'), 3, 'pending') RETURNING *
  `).get(template.id, kidId);

  return { template, log };
}

describe('GET /api/inbox', () => {
  it('returns pending items grouped by kid', async () => {
    const { parentToken, kids } = seedFamily();
    seedChoreWithPendingApproval(kids[0].id);

    const res = await request(app)
      .get('/api/inbox')
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.kids).toHaveLength(1);
    expect(res.body.kids[0].id).toBe(kids[0].id);
    expect(res.body.kids[0].chores).toHaveLength(1);
    expect(res.body.kids[0].chores[0].chore_name).toBe('Clean room');
  });

  it('returns empty when no pending items', async () => {
    const { parentToken } = seedFamily();

    const res = await request(app)
      .get('/api/inbox')
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.kids).toHaveLength(0);
  });

  it('rejects kid access', async () => {
    const { kids } = seedFamily();

    const res = await request(app)
      .get('/api/inbox')
      .set('Authorization', `Bearer ${kids[0].token}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/inbox/count', () => {
  it('returns count of all pending items', async () => {
    const { parentToken, kids } = seedFamily();
    seedChoreWithPendingApproval(kids[0].id);
    seedChoreWithPendingApproval(kids[1].id);

    const res = await request(app)
      .get('/api/inbox/count')
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });
});

describe('POST /api/inbox/approve', () => {
  it('approves a chore and awards tickets', async () => {
    const { parentToken, kids } = seedFamily();
    const { log } = seedChoreWithPendingApproval(kids[0].id);

    const res = await request(app)
      .post('/api/inbox/approve')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ chore_log_ids: [log.id] });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Chore log is approved
    const updatedLog = db.prepare('SELECT approval_status FROM chore_logs WHERE id = ?').get(log.id);
    expect(updatedLog.approval_status).toBe('approved');

    // Tickets awarded
    const user = db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(kids[0].id);
    expect(user.ticket_balance).toBe(3);

    // Ledger entry created
    const ledger = db.prepare('SELECT * FROM ticket_ledger WHERE user_id = ?').get(kids[0].id);
    expect(ledger.amount).toBe(3);
    expect(ledger.type).toBe('chore_reward');
  });

  it('does not award tickets when family has tickets disabled', async () => {
    const { parentToken, kids, family } = seedFamily();
    db.prepare('UPDATE families SET use_tickets = 0 WHERE id = ?').run(family.id);
    const { log } = seedChoreWithPendingApproval(kids[0].id);

    await request(app)
      .post('/api/inbox/approve')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ chore_log_ids: [log.id] });

    const user = db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(kids[0].id);
    expect(user.ticket_balance).toBe(0);
  });

  it('ignores already-approved or non-existent log ids', async () => {
    const { parentToken } = seedFamily();

    const res = await request(app)
      .post('/api/inbox/approve')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ chore_log_ids: [9999] });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('will not approve items from another family', async () => {
    const family1 = seedFamily({ familyName: 'Family 1', kidNames: ['Kid 1'] });
    const family2 = seedFamily({ familyName: 'Family 2', kidNames: ['Kid 2'] });
    const { log } = seedChoreWithPendingApproval(family2.kids[0].id);

    await request(app)
      .post('/api/inbox/approve')
      .set('Authorization', `Bearer ${family1.parentToken}`)
      .send({ chore_log_ids: [log.id] });

    // Should still be pending — not approved by wrong family
    const updatedLog = db.prepare('SELECT approval_status FROM chore_logs WHERE id = ?').get(log.id);
    expect(updatedLog.approval_status).toBe('pending');
  });
});

describe('POST /api/inbox/deny', () => {
  it('denies a chore log (resets completion)', async () => {
    const { parentToken, kids } = seedFamily();
    const { log } = seedChoreWithPendingApproval(kids[0].id);

    const res = await request(app)
      .post('/api/inbox/deny')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ chore_log_ids: [log.id] });

    expect(res.status).toBe(200);

    const updatedLog = db.prepare('SELECT completed_at, approval_status FROM chore_logs WHERE id = ?').get(log.id);
    expect(updatedLog.completed_at).toBeNull();
    expect(updatedLog.approval_status).toBeNull();
  });

  it('does not award tickets on denial', async () => {
    const { parentToken, kids } = seedFamily();
    const { log } = seedChoreWithPendingApproval(kids[0].id);

    await request(app)
      .post('/api/inbox/deny')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ chore_log_ids: [log.id] });

    const user = db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(kids[0].id);
    expect(user.ticket_balance).toBe(0);
  });
});
