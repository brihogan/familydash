import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import authRouter from './src/routes/auth.js';
import familyRouter from './src/routes/family.js';
import dashboardRouter from './src/routes/dashboard.js';
import accountsRouter from './src/routes/accounts.js';
import choresRouter from './src/routes/chores.js';
import ticketsRouter from './src/routes/tickets.js';
import rewardsRouter from './src/routes/rewards.js';
import activityRouter from './src/routes/activity.js';
import overviewRouter from './src/routes/overview.js';
import taskSetsRouter from './src/routes/taskSets.js';
import userTasksRouter from './src/routes/userTasks.js';
import inboxRouter from './src/routes/inbox.js';
import commonChoresRouter from './src/routes/commonChores.js';
import { errorHandler } from './src/middleware/errorHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
app.set('trust proxy', 1); // trust first proxy (Cloudflare tunnel)

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
      },
    },
    hsts: false, // Cloudflare handles HTTPS; HSTS breaks localhost access
  }),
);
app.use(express.json());
app.use(cookieParser());

// Rate-limit login/register only (refresh is protected by the cookie, not brute-forceable)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// ─── Routes ────────────────────────────────────────────────────────────────

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRouter);

// Family routes: /api/family/** (includes /rewards, /redemptions, /activity)
// Mount rewards + activity sub-routes on the family router prefix
app.use('/api/family', familyRouter);
app.use('/api/family', rewardsRouter);
app.use('/api/family', activityRouter);
app.use('/api/family', taskSetsRouter);
app.use('/api/family', commonChoresRouter);

// Dashboard
app.use('/api/dashboard', dashboardRouter);

// User-scoped routes
app.use('/api/users', accountsRouter);
app.use('/api/users', choresRouter);
app.use('/api/users', ticketsRouter);
app.use('/api/users', rewardsRouter);
app.use('/api/users', activityRouter);
app.use('/api/users', overviewRouter);
app.use('/api/users', userTasksRouter);
app.use('/api/inbox', inboxRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve compiled React build in production
const publicDir = join(__dirname, 'public');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Family Dashboard server running on port ${PORT}`);
});
