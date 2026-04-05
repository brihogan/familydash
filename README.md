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

### Offline Support
- Offline-first architecture using **Dexie** (IndexedDB wrapper) for local caching
- All data cached locally: chores, bank accounts, transactions, tickets, recurring rules, rewards, trophies, inbox, family activity, and family members
- **Wave-based prefetch** — immediately after login/auth, all data is eagerly fetched in priority waves so every page loads instantly:
  - **Wave 1 (critical):** dashboard, family members, today's chores, inbox count
  - **Wave 2 (important):** bank accounts, tickets, rewards
  - **Wave 3 (deferred):** trophies, overview, activity, recurring rules, yesterday's chores
- Optimistic UI updates — actions (completing chores, bank transactions, ticket adjustments) apply instantly to the local cache
- Mutation queue with automatic sync — offline changes are queued and replayed when connectivity returns
- Sync engine triggers on: coming back online, tab visibility change, and periodic 60-second intervals
- Cached session fallback — users stay logged in even if the server is unreachable

### Claude Code (Optional)
- Give kids (and parents) their own sandboxed Claude Code terminal in the browser
- Each user gets an isolated Docker container with resource limits (512MB RAM, 1 CPU, 100 PIDs)
- Kids build HTML/Canvas web apps that are served and playable by the whole family
- **KidWorkspace** — unified fullscreen environment with tabbed terminal + up to 3 running apps, an apps dropdown with search and favorites, and a floating/dockable terminal panel
- Per-app key-value storage API for persistent data (high scores, counters, etc.)
- Daily time limits for kids (configurable per-kid, enforced server-side)
- Parents have unlimited access with no time limits
- App starring/favorites system with launch counters
- Auto-reconnecting terminal sessions
- **Completely optional** — the dashboard works fully without Docker or Claude Code. The feature is gated behind a family-level access flag and per-user toggles.

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
```

Generate two unique secrets and paste them into `.env`:

```bash
openssl rand -hex 32   # use for JWT_ACCESS_SECRET
openssl rand -hex 32   # use for JWT_REFRESH_SECRET
```

Then start the app:

```bash
docker compose up --build
# Open http://localhost:3001
```

### Local Development

```bash
cp .env.example .env         # optional in dev — random secrets are generated if missing
npm install                  # installs concurrently
npm run install:all          # installs server + client deps
npm run dev                  # starts both server and client
# Open http://localhost:5174  (proxies /api → :3001)
```

In dev mode, JWT secrets are auto-generated per run if not set (with a console warning). Sessions won't survive a server restart, but that's fine for development.

## First Run

1. Open the app and click **Register here**
2. Create your family account (first parent)
3. Go to **Settings → Family Members** to add kids
4. Go to **Settings → Chores** (per kid) to add chore templates
5. Go to **Settings → Rewards** to create the rewards catalog

## Admin Access

To grant admin access to a parent account (required for the admin dashboard):

```bash
cd server
node set-admin.js user@example.com
```

To revoke:

```bash
node set-admin.js user@example.com --revoke
```

If using Docker or a custom database path:

```bash
DATABASE_PATH=/path/to/family.db node set-admin.js user@example.com
```

The user must log out and back in to pick up the new admin status.

## Claude Code Setup (Optional)

Claude Code is entirely optional. The dashboard works fully without it. If you want to enable it:

### 1. Build the Claude Code container image

```bash
docker build -t familydash-claude-code:latest docker/claude-code/
```

### 2. Grant Claude Code access to your family

**Local development:**

```bash
cd server
node claude-access.js grant user@example.com    # enable for a family
node claude-access.js revoke user@example.com   # disable for a family
node claude-access.js list                       # show all families
```

**Production (Docker):**

```bash
docker exec -it family-dashboard node server/claude-access.js grant user@example.com
docker exec -it family-dashboard node server/claude-access.js list
```

This gates the entire feature at the family level. Without a grant, the Claude Code settings toggle, the Apps nav link, and all Claude Code endpoints are hidden/blocked.

### 3. Enable per-user in settings

After granting family access, go to **Settings → [User]** and toggle **Enable Claude Code** for each family member who should have access. The toggle only appears once the family has been granted access. For kids, you can also set a **Daily Time Limit** (default 60 minutes).

### 4. First-time login

Open a terminal for the user (from the Apps page or Kid Overview) and run `claude` to start the OAuth login flow. A parent needs to do this the first time to authenticate.

### Development testing

No extra setup needed in dev — the server uses the local Docker socket directly, and containers run on the default network. Just build the image (step 1) and grant access (step 2).

### Production deploy

For production behind a reverse proxy (e.g., Cloudflare):

**Environment variables** (add to `.env` or `docker-compose.yml`):

| Variable | Purpose | Example |
|----------|---------|---------|
| `CLAUDE_CONTAINER_IMAGE` | Docker image for kid containers | `familydash-claude-code:latest` |
| `APPS_HOST` | Hostname for the apps subdomain | `apps.yourdomain.com` |
| `MAIN_ORIGIN` | Dashboard origin (for CORS) | `https://dash.yourdomain.com` |
| `VITE_APPS_ORIGIN` | Client-side apps origin (build-time) | `https://apps.yourdomain.com` |

**Subdomain isolation** — Kid-built apps are served from a separate subdomain for browser-level cookie/API isolation. This prevents a malicious app from accessing dashboard data.

1. In your DNS provider, add a CNAME for `apps.yourdomain.com` pointing to the same server as your dashboard
2. Set `APPS_HOST=apps.yourdomain.com` in your server environment
3. Build the client with `VITE_APPS_ORIGIN=https://apps.yourdomain.com`

If you skip subdomain isolation, apps will still work from the main domain at `/apps/` — but they'll share cookies with the dashboard, which is a security risk in production.

**Security features enabled in production:**

- Isolated container network (no internet, no cross-container communication)
- All Linux capabilities dropped + no-new-privileges
- Tightened CSP on served apps (`connect-src 'self'` blocks external data exfiltration)
- Referer-based storage scoping (prevents cross-app data reads)
- Rate limiting on container operations, storage writes, and WebSocket tickets
- Max 3 WebSocket connections per user
- CLAUDE.md guardrails restored every 60 seconds

See `docker-compose.yml` for the full production configuration including the socket proxy and network setup.

## Architecture

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Offline cache | Dexie (IndexedDB) with mutation queue + sync engine |
| Backend | Node.js (ESM) + Express |
| Database | SQLite (better-sqlite3) |
| Auth | JWT access token (in memory) + refresh token (httpOnly cookie) |
| Claude Code (optional) | Docker containers + WebSocket terminals + xterm.js |

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
