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
        objectSrc: ["'none'"],
      },
    },
    hsts: false,
  }),
);
app.use(express.json());
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
app.use('/api/inbox', inboxRouter);
app.use('/api/admin', adminRouter);
app.use('/api/family', turnsRouter);
app.use('/api/claude', claudeRouter);
app.use('/apps', appsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve uploaded step images
const dataDir = process.env.DATABASE_PATH ? dirname(process.env.DATABASE_PATH) : join(__dirname, '..', '..', 'data');
const stepsUploadsDir = join(dataDir, 'uploads', 'steps');
app.use('/api/uploads/steps', express.static(stepsUploadsDir));

// Serve compiled React build in production
const publicDir = join(__dirname, '..', 'public');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });
}

app.use(errorHandler);

export default app;
