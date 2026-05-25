import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import authRouter from './routes/auth.js';
import familyRouter from './routes/family.js';
import dashboardRouter from './routes/dashboard.js';
import accountsRouter from './routes/accounts.js';
import choresRouter from './routes/chores.js';
import ticketsRouter from './routes/tickets.js';
import rewardsRouter from './routes/rewards.js';
import activityRouter from './routes/activity.js';
import overviewRouter from './routes/overview.js';
import taskSetsRouter from './routes/taskSets.js';
import userTasksRouter from './routes/userTasks.js';
import badgesRouter from './routes/badges.js';
import inboxRouter from './routes/inbox.js';
import commonChoresRouter from './routes/commonChores.js';
import adminRouter from './routes/admin.js';
import turnsRouter from './routes/turns.js';
import claudeRouter, { appsRouter, appsSubdomainApp } from './routes/claude.js';
import { errorHandler } from './middleware/errorHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);

// ─── Apps subdomain virtual host ──────────────────────────────────────────
// If APPS_HOST is set (e.g., apps.straychips.com or apps.localhost), requests
// to that host are routed to the isolated apps sub-app (no dashboard APIs).
const APPS_HOST = process.env.APPS_HOST || null;
if (APPS_HOST) {
  app.use((req, res, next) => {
    const host = (req.hostname || req.get('host') || '').split(':')[0];
    if (host === APPS_HOST) return appsSubdomainApp(req, res, next);
    next();
  });
}

// CORS for Capacitor native app
const CAPACITOR_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'http://localhost'];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CAPACITOR_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

// Allow the apps subdomain to be iframed from the main dashboard (KidWorkspace
// opens kid apps in tabs that are iframes pointing at apps.straychips.com).
const appsFrameSrc = APPS_HOST ? [`https://${APPS_HOST}`, `http://${APPS_HOST}`] : [];
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", "wss:", "ws:"],
        workerSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        frameSrc: ["'self'", ...appsFrameSrc],
        objectSrc: ["'none'"],
      },
    },
    hsts: false,
  }),
);
// 5mb default JSON body limit — covers the dev-only scrape sink that
// posts the parsed CU badge dump (~400KB) and leaves plenty of headroom
// for normal API payloads.
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRouter);

// Claude Code rate limiters
const claudeStartLimiter = rateLimit({ windowMs: 60_000, max: 5, message: { error: 'Too many requests.' } });
const claudeTicketLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: 'Too many requests.' } });
const storageLimiter = rateLimit({ windowMs: 60_000, max: 60, message: { error: 'Too many storage requests.' } });
const launchLimiter = rateLimit({ windowMs: 60_000, max: 30, message: { error: 'Too many requests.' } });
app.use('/api/claude/:userId/start', claudeStartLimiter);
app.use('/api/claude/:userId/ws-ticket', claudeTicketLimiter);
app.use('/api/claude/apps/:username/:appName/data', storageLimiter);
app.use('/apps/:username/:appName/data', storageLimiter);
app.use('/api/claude/apps/:username/:appName/launch', launchLimiter);

app.use('/api/family', familyRouter);
app.use('/api/family', rewardsRouter);
app.use('/api/family', activityRouter);
app.use('/api/family', taskSetsRouter);
app.use('/api/family', commonChoresRouter);

app.use('/api/dashboard', dashboardRouter);

app.use('/api/users', accountsRouter);
app.use('/api/users', choresRouter);
app.use('/api/users', ticketsRouter);
app.use('/api/users', rewardsRouter);
app.use('/api/users', activityRouter);
app.use('/api/users', overviewRouter);
app.use('/api/users', userTasksRouter);
app.use('/api', badgesRouter);
app.use('/api/inbox', inboxRouter);
app.use('/api/admin', adminRouter);
app.use('/api/family', turnsRouter);
app.use('/api/claude', claudeRouter);
app.use('/apps', appsRouter);

// SDK files (main domain — for apps served at /apps/:user/:app/)
app.get('/sdk/multiplayer.js', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(join(__dirname, 'sdk', 'multiplayer.js'));
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// DEV-ONLY: tiny scrape sink so the Claude-in-Chrome browser session can POST
// parsed badge JSON back to /tmp/ without us hitting tool-return truncation
// limits. CORS is wide-open here — fine because the endpoint only writes to
// /tmp on the dev machine. Remove (or NODE_ENV-gate) before merging if you
// don't want it sticking around.
if (process.env.NODE_ENV !== 'production') {
  app.options('/api/_scrape-sink', (_req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
  });
  app.post('/api/_scrape-sink', express.json({ limit: '20mb' }), async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const fs   = await import('fs');
    const path = await import('path');
    const batch = String(req.body?.batch || 'default').replace(/[^a-z0-9_-]/gi, '');
    const file  = path.join('/tmp', `cu-scrape-${batch}.json`);
    fs.writeFileSync(file, JSON.stringify(req.body?.data ?? req.body, null, 2));
    res.json({ ok: true, file, bytes: fs.statSync(file).size });
  });
}

// Serve uploaded step images and badge images
const dataDir = process.env.DATABASE_PATH ? dirname(process.env.DATABASE_PATH) : join(__dirname, '..', '..', 'data');
const stepsUploadsDir = join(dataDir, 'uploads', 'steps');
app.use('/api/uploads/steps', express.static(stepsUploadsDir));
const badgeImagesDir = join(dataDir, 'uploads', 'badges');
app.use('/api/uploads/badges', express.static(badgeImagesDir));

// Serve compiled React build in production
const publicDir = join(__dirname, '..', 'public');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    // Don't serve the SPA for /apps routes — those are handled by the apps router
    if (req.path.startsWith('/apps/')) return res.status(404).send('Not found');
    res.sendFile(join(publicDir, 'index.html'));
  });
}

app.use(errorHandler);

export default app;
