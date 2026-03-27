import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { seedFamily, db } from './setup.js';

describe('POST /api/auth/register', () => {
  it('creates a new family and parent', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        familyName: 'New Family',
        name: 'New Parent',
        email: 'new@test.com',
        password: 'securepassword',
      });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.name).toBe('New Parent');
    expect(res.body.user.role).toBe('parent');

    // Family created in DB
    const family = db.prepare('SELECT * FROM families WHERE name = ?').get('New Family');
    expect(family).toBeDefined();
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ familyName: 'F1', name: 'P1', email: 'dupe@test.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ familyName: 'F2', name: 'P2', email: 'dupe@test.com', password: 'password456' });

    expect(res.status).toBe(409);
  });

  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ familyName: 'F' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in parent with email/password', async () => {
    seedFamily();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'parent@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('parent');
  });

  it('logs in kid with username/pin', async () => {
    const { kids } = seedFamily();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: kids[0].username, pin: '1234' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('kid');
  });

  it('rejects wrong password', async () => {
    seedFamily();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'parent@test.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  it('logs in kid with username in any case', async () => {
    const { kids } = seedFamily();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: kids[0].username.toUpperCase(), pin: '1234' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('kid');
  });

  it('rejects wrong pin', async () => {
    const { kids } = seedFamily();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: kids[0].username, pin: '9999' });

    expect(res.status).toBe(401);
  });

  it('rejects non-existent user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'whatever' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('invalidates refresh token', async () => {
    seedFamily();

    // Login to get a refresh token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'parent@test.com', password: 'password123' });

    const accessToken = loginRes.body.accessToken;

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('Authentication middleware', () => {
  it('rejects requests without token', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
  });

  it('rejects requests with invalid token', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('accepts valid token', async () => {
    const { parentToken } = seedFamily();
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${parentToken}`);
    expect(res.status).toBe(200);
  });
});
