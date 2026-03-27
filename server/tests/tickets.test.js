import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { seedFamily, db } from './setup.js';

describe('POST /api/users/:id/tickets/adjust', () => {
  it('adds tickets to a kid', async () => {
    const { parentToken, kids } = seedFamily();
    const kid = kids[0];

    const res = await request(app)
      .post(`/api/users/${kid.id}/tickets/adjust`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ amount: 5, description: 'Good job' });

    expect(res.status).toBe(200);
    expect(res.body.ticketBalance).toBe(5);

    // Verify DB state
    const user = db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(kid.id);
    expect(user.ticket_balance).toBe(5);

    // Verify ledger entry
    const ledger = db.prepare('SELECT * FROM ticket_ledger WHERE user_id = ?').get(kid.id);
    expect(ledger.amount).toBe(5);
    expect(ledger.type).toBe('manual');
    expect(ledger.description).toBe('Good job');
  });

  it('removes tickets from a kid', async () => {
    const { parentToken, kids } = seedFamily();
    const kid = kids[0];
    db.prepare('UPDATE users SET ticket_balance = 10 WHERE id = ?').run(kid.id);

    const res = await request(app)
      .post(`/api/users/${kid.id}/tickets/adjust`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ amount: -3, description: 'Penalty' });

    expect(res.status).toBe(200);
    expect(res.body.ticketBalance).toBe(7);
  });

  it('allows negative ticket balance', async () => {
    const { parentToken, kids } = seedFamily();
    const kid = kids[0];
    // Kid starts with 0 tickets

    const res = await request(app)
      .post(`/api/users/${kid.id}/tickets/adjust`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ amount: -5, description: 'Ticket Blast' });

    expect(res.status).toBe(200);
    expect(res.body.ticketBalance).toBe(-5);

    const user = db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(kid.id);
    expect(user.ticket_balance).toBe(-5);
  });

  it('creates activity feed entry', async () => {
    const { parentToken, kids, family } = seedFamily();
    const kid = kids[0];

    await request(app)
      .post(`/api/users/${kid.id}/tickets/adjust`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ amount: 3, description: 'Bonus' });

    const activity = db.prepare(
      'SELECT * FROM activity_feed WHERE family_id = ? AND subject_user_id = ?'
    ).get(family.id, kid.id);
    expect(activity.event_type).toBe('tickets_added');
    expect(activity.description).toContain('3 ticket');
  });

  it('rejects zero amount', async () => {
    const { parentToken, kids } = seedFamily();
    const res = await request(app)
      .post(`/api/users/${kids[0].id}/tickets/adjust`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ amount: 0, description: 'Nothing' });

    expect(res.status).toBe(400);
  });

  it('rejects missing description', async () => {
    const { parentToken, kids } = seedFamily();
    const res = await request(app)
      .post(`/api/users/${kids[0].id}/tickets/adjust`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ amount: 1 });

    expect(res.status).toBe(400);
  });

  it('rejects kid trying to adjust tickets', async () => {
    const { kids } = seedFamily();
    const res = await request(app)
      .post(`/api/users/${kids[0].id}/tickets/adjust`)
      .set('Authorization', `Bearer ${kids[0].token}`)
      .send({ amount: 1, description: 'Hack attempt' });

    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated request', async () => {
    const { kids } = seedFamily();
    const res = await request(app)
      .post(`/api/users/${kids[0].id}/tickets/adjust`)
      .send({ amount: 1, description: 'No auth' });

    expect(res.status).toBe(401);
  });

  it('rejects cross-family access', async () => {
    const family1 = seedFamily({ familyName: 'Family 1', kidNames: ['Kid 1'] });
    const family2 = seedFamily({ familyName: 'Family 2', kidNames: ['Kid 2'] });

    const res = await request(app)
      .post(`/api/users/${family2.kids[0].id}/tickets/adjust`)
      .set('Authorization', `Bearer ${family1.parentToken}`)
      .send({ amount: 1, description: 'Cross-family' });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/users/:id/tickets', () => {
  it('returns ticket balance and ledger', async () => {
    const { parentToken, kids } = seedFamily();
    const kid = kids[0];
    db.prepare('UPDATE users SET ticket_balance = 7 WHERE id = ?').run(kid.id);
    db.prepare(`
      INSERT INTO ticket_ledger (user_id, amount, type, description) VALUES (?, 7, 'manual', 'Test')
    `).run(kid.id);

    const res = await request(app)
      .get(`/api/users/${kid.id}/tickets`)
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ticketBalance).toBe(7);
    expect(res.body.ledger).toHaveLength(1);
    expect(res.body.ledger[0].amount).toBe(7);
  });

  it('allows kid to view own tickets', async () => {
    const { kids } = seedFamily();
    const kid = kids[0];

    const res = await request(app)
      .get(`/api/users/${kid.id}/tickets`)
      .set('Authorization', `Bearer ${kid.token}`);

    expect(res.status).toBe(200);
  });

  it('prevents kid from viewing another kids tickets', async () => {
    const { kids } = seedFamily();

    const res = await request(app)
      .get(`/api/users/${kids[1].id}/tickets`)
      .set('Authorization', `Bearer ${kids[0].token}`);

    expect(res.status).toBe(403);
  });
});
