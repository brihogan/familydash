# Family Dashboard

Self-hosted family web app for chores, bank accounts, and a ticket/rewards system.

## Quick Start

### Docker (Production)

```bash
cp .env.example .env
# Edit .env with real secrets
docker compose up --build
# Open http://localhost:3001
```

### Local Development

**Terminal 1 — Server:**
```bash
cd server
npm install
cp ../.env.example ../.env   # fill in secrets
node --env-file=../.env --watch index.js
```

**Terminal 2 — Client:**
```bash
cd client
npm install
npm run dev
# Open http://localhost:5173  (proxies /api → :3001)
```

## First Run

1. Open the app and click **Register here**
2. Create your family account (first parent)
3. Go to **Settings → Family Members** to add kids
4. Go to **Settings → Chores** (per kid) to add chore templates
5. Go to **Settings → Rewards** to create the rewards catalog

## Architecture

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js (ESM) + Express |
| Database | SQLite (better-sqlite3) |
| Auth | JWT access token (in memory) + refresh token (httpOnly cookie) |

## Roles

- **Parent**: full read/write access to all family data
- **Kid**: can only access own data; can check off today/yesterday's chores; can withdraw/transfer from own accounts; can self-redeem rewards

## Future: TRMNL e-ink

`GET /api/dashboard` returns clean JSON. To enable TRMNL polling, add an `api_keys` table and optional `?apiKey=xxx` bypass — no other schema changes needed.

## Future: Badges / Task Lists

Planned feature: optional badge task lists (e.g. "Florida Birds checklist") that kids can choose and slowly complete for real-world badges, without ticket rewards. Will require a `badge_templates`, `badge_task_items`, and `badge_progress` schema addition.
