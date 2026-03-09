# Family Dashboard

Self-hosted family web app for chores, bank accounts, and a ticket/rewards system.

## Features

### Chores
- Create chore templates per family member with ticket rewards
- Schedule chores by day of week
- Daily checklist view with completion tracking
- Optional parent approval workflow before tickets are awarded
- Chore progress rings on the dashboard
- Parents can enable chores for themselves too

### Banking
- Multiple accounts per user (Checking, Savings, Charity, custom)
- Deposits, withdrawals, and transfers between family members
- Recurring allowance rules (automated deposits on a schedule)
- Sub-account allocation (split deposits by % or flat amount)
- **"Working with Currency" mode** — kids must drag coins/bills to count and match deposit amounts before receiving money, turning deposits into a hands-on math exercise
- Parents can toggle whether kids are allowed to withdraw or transfer
- Animated balance displays

### Tickets & Rewards
- Earn tickets from completing chores and task sets
- Parent-managed rewards catalog with ticket costs
- Kids self-redeem rewards
- Full ticket ledger history

### Task Sets (Projects & Awards)
- **Awards** — one-time achievements that earn a trophy (e.g., badge checklists)
- **Projects** — repeatable multi-step assignments
- Steps, categories, tags, and emoji per set
- Ticket payouts on completion
- Progress rings on the dashboard
- Trophy shelf for completed awards

### Dashboard
- At-a-glance family overview: balances, tickets, chore progress, active tasks, trophies
- Desktop table and mobile card layouts
- Quick-action buttons for deposits, tickets, and transfers
- Per-member activity feed

### Approval Inbox
- Parent inbox for pending chore and task completions
- Bulk approve actions
- Grouped by day for easy review
- Nav badge count

### User Management
- Parent and kid roles with different permission levels
- Kids get optional PIN-based login (can be disabled entirely)
- "Remember Me" session persistence
- Avatar customization (emoji + background color)
- Activate/deactivate users (soft delete)
- Per-kid settings: approval requirements, currency work, withdraw/transfer permissions

### Other
- Dark/light/system theme
- Mobile-friendly with responsive layout
- Family-wide feature toggles (banking, tickets, task sets)
- Activity logging across all features
- Docker support for self-hosting

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

- **Parent**: full read/write access to all family data and settings
- **Kid**: can only access own data; can check off today/yesterday's chores; can withdraw/transfer from own accounts (if allowed); can self-redeem rewards

## Planned

- **TRMNL e-ink display** — `GET /api/dashboard` returns clean JSON; adding an `api_keys` table and optional `?apiKey=xxx` bypass would enable TRMNL polling
- **PWA support** — installable app with offline basics
- **Badges / checklists** — optional badge task lists (e.g., "Florida Birds") that kids choose and slowly complete for real-world badges
- **Task set checkout** — kids request to pick up a task set, parent approves from inbox
- **Streaks & challenges** — track consecutive chore completion days, savings milestones, etc.
- **Approval for bank actions** — require parent approval for withdrawals and transfers
- **Trophies expansion** — ranks, challenge levels, and streak-based awards
