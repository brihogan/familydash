# Work Log

## Session Start: 2026-03-26 ~evening

### 2026-03-26 — Ticket Blast drag-and-drop feature
- Added "Ticket Blast" button at bottom of dashboard (parent-only, when tickets enabled). Clicking it shows a drag-and-drop UI: kid cards with ticket counters and a ticket bucket. Drag tickets from bucket to kids to add, drag off a kid (or to bucket) to remove. Save button commits all deltas at once with optimistic Dexie updates + offline support.
- Ticket blast kid cards now compact (2-col grid on mobile, 3-4 on wider). Each card always has a draggable token so tickets can be removed even below zero. Server ticket adjust endpoint no longer clamps to 0 — negative balances are allowed.
- Kid-to-kid ticket transfers removed — dragging a ticket off a kid (anywhere except back on same card) decrements that kid and animates the ticket flying into the bucket (CSS keyframe animation).

---

## Session Start: 2026-03-25 ~8:00 PM

### 2026-03-25 — Capacitor iOS native app
- Installed Capacitor with iOS platform. Enabled CapacitorHttp to bypass CORS for native API calls.
- Added token-based auth for Capacitor (refresh token in request body + localStorage instead of httpOnly cookies, since CapacitorHttp has a separate cookie jar from WKWebView).
- Safe area insets: header, nav panel, modals, and main content all respect iPhone notch/island.
- Suppressed PWA install prompt in native app. Server returns refreshToken in response body for native clients.
- Emojis show as `?` in simulator only — confirmed correct in DOM, likely simulator font limitation (works on real devices).
- Apple Developer membership renewed; waiting for activation to deploy to real device.

### 2026-03-25 — Chores page improvements
- Live ticket balance with rolling slot-machine animation on chore toggle (RollingNumber component).
- Compact DateNav: 3-letter day abbreviation, tight spacing, tap to jump to today, brand pill for current day.
- Chore item rows get white/dark bg for contrast. Progress bar + tickets on same row for kid view.
- Ticket animation only triggers on chore toggle, not on user switch or page load.

---

## Session Start: 2026-03-25

## Session Start: 2026-03-18

### 2026-03-18 — Redeem reward buttons on tickets and overview pages

**What was done:**
- Added "Redeem" button on `/tickets/:id` next to the add/remove buttons, navigating to `/rewards?kidId=X` so the kid's profile is pre-selected.
- Added "Ticket history →" and "Redeem reward →" links to the Tickets stat card on `/kid/:id` overview page.
- RewardsPage now reads `?kidId=` query param to auto-select the kid's profile on mount.

---

## Session Start: 2026-03-17

---

## Session Start: 2026-03-16

### 2026-03-16 — Mini card mode toggle on mobile dashboard

**What was done:**
- Added a "Mini" toggle button on mobile dashboard (right of sort dropdown, persisted to localStorage). When enabled, cards collapse to a single colored row: avatar, name, balance, tickets, and a smaller chore ring — no white body, no task sets, no last activity.

---

## Session Start: 2026-03-14

### 2026-03-14 — Offline kid overview page (/kid/:id)

**What was done:**
- Added `overviewCache` and `activityCache` tables to Dexie (schema v5).
- Created `useOfflineOverview` hook: caches full overview API response + activity feed per user, with client-side date/type filtering for the activity feed.
- Added `refreshOverview()` and `refreshActivity()` to sync engine's `pullFreshData()`.
- Migrated `KidOverviewPage` to offline hooks: overview stats/chart, kid picker via `useOfflineFamily`, activity feed with client-side filtering. Page works fully offline with cached data.

### 2026-03-14 — Offline banking: accounts, transactions, deposits, transfers

**What was done:**
- Added `bankAccounts`, `bankTransactions`, `pendingDeposits` tables to Dexie (schema v4).
- Created `useOfflineBank` hook: cached accounts + transactions + pending deposits, optimistic deposit/withdraw/transfer with balance updates, pending deposit claim.
- Made `UnifiedBankDialog` fully offline-capable: optimistic Dexie balance updates + transaction records + mutation queue. Works from both dashboard (QuickBankAdjust) and bank page.
- Added `BANK_TRANSACTION` and `CLAIM_PENDING_DEPOSIT` handlers to sync engine + `refreshBank()` in `pullFreshData`.
- Migrated `KidBankPage` to offline hooks: cached accounts/transactions with client-side date+type filtering, offline pending deposit receive via MoneyPopover. Add account, edit account, recurring rules remain online-only.
- Dashboard bank balance updates optimistically for main account transactions.

### 2026-03-14 — Offline rewards: redemption + history

**What was done:**
- Added `rewards` and `rewardRedemptions` tables to Dexie (schema v3).
- Created `useOfflineRewards` hook: cached rewards catalog + redemption history, optimistic redeem with ticket deduction + ledger entry.
- Added `REDEEM_REWARD` handler to sync engine + `refreshRewards()` in `pullFreshData`.
- Migrated `RewardsPage` to offline hooks: rewards catalog, redemption history with client-side date filtering, offline-capable redeem flow with confetti/sound. Add/edit/delete rewards remain online-only.
- Redemptions now also create ticket ledger entries (type `redemption`) so they show in /tickets/:id history.

### 2026-03-14 — Offline tickets: adjust dialog + /tickets/:id page

**What was done:**
- Added `ticketLedger` table to Dexie (schema v2).
- Created `useOfflineTickets` hook: cached balance + ledger via `useLiveQuery`, optimistic adjustments, offline queueing.
- Made `QuickTicketAdjust` fully offline-capable: optimistic Dexie updates + mutation queue. Works from both dashboard and tickets page.
- Migrated `KidTicketsPage` to `useOfflineTickets` + `useOfflineFamily` — client-side date/type filtering of cached ledger.
- Added `ADJUST_TICKETS` handler to sync engine + `refreshTickets()` in `pullFreshData`.
- Fixed chore completion not updating dashboard tickets (field was `ticket_reward_at_time`, not `ticket_reward`).
- Fixed offline→online flicker: hooks now skip fetches when mutation queue has pending items, letting sync engine push first then pull.

### 2026-03-14 — Offline-first Phase 0+1: Foundation + Dashboard & Chores

**What was done:**
- Installed Dexie.js + dexie-react-hooks for IndexedDB-backed offline storage with reactive queries.
- Created 11 new files under `client/src/offline/`: Dexie database schema (db.js), network status hook (networkStatus.js), mutation queue (mutationQueue.js), offline auth caching (authOffline.js), sync engine singleton (syncEngine.js), and 6 hooks (useOfflineQuery, useOfflineMutation, useOfflineDashboard, useOfflineChores, useOfflineFamily, useSyncStatus).
- Created Toast notification component for offline sync feedback.
- Modified AuthContext to cache sessions to IndexedDB on login/refresh and fall back to cached session when offline.
- Migrated DashboardPage from useState/useEffect/axios to useOfflineDashboard (cached-first with background refresh).
- Migrated KidChoresPage from direct API calls to useOfflineChores (optimistic chore completion/uncheck with offline queueing, temp log generation from cached templates when offline).
- Added offline/sync status pill to Layout header (desktop + mobile) showing "Offline" state and pending mutation count.
- Initialized SyncEngine on app startup (main.jsx) with iOS-safe triggers: online event, visibility change, 60s polling.

---

## Session Start: 2026-03-14 (prior session)

### 2026-03-14 — Started dev server

**What was done:**
- Started the family-dashboard dev server (Vite client on :5173, Express server on :3001).

### 2026-03-14 — Replaced add buttons with faSquarePlus icons

**What was done:**
- Replaced the text-based "+ Add X" buttons on 6 pages with `faPlus` icon buttons in a bordered style. On SettingsChoresPage, moved "Common Chores" below the plus button. On SettingsUsersPage, moved "Common Chores" to a card above the user list with a broom icon and description.
- Fixed QuickTicketAdjust: ticket amount input can now be cleared (was locked to min 1). Submit button disables when amount is empty or 0.
- Fixed crown streak bug: streaks broke when kids completed yesterday's last chore today. Root cause was `chores_all_done` events keyed on `created_at` instead of `log_date`. Changed streak calculations (userTasks.js, streakService.js) to query `chore_logs` directly by `log_date`. Fixed duplicate-event checks (chores.js, inbox.js) to key on `reference_type = 'log_date:YYYY-MM-DD'`.

---

### 2026-03-14 — Profile picker on all kid pages for parents

**What was done:**
- Created a shared `KidProfilePicker` component and replaced the text-based switcher dropdown on all 7 kid-specific pages with avatar profile pics. Selected kid gets a brand ring at full opacity; unselected kids are dimmed. SettingsChoresPage uses a gear icon for the "Everyone" view. Cleaned up unused `navigate`/`faChevronDown` imports.

**Files changed:**
- `family-dashboard/client/src/components/shared/KidProfilePicker.jsx` (new)
- `family-dashboard/client/src/pages/KidChoresPage.jsx`
- `family-dashboard/client/src/pages/KidBankPage.jsx`
- `family-dashboard/client/src/pages/KidTicketsPage.jsx`
- `family-dashboard/client/src/pages/KidTasksPage.jsx`
- `family-dashboard/client/src/pages/KidTrophiesPage.jsx`
- `family-dashboard/client/src/pages/KidOverviewPage.jsx`
- `family-dashboard/client/src/pages/SettingsChoresPage.jsx`

### 2026-03-14 — Profile picker on Rewards page for parents

**What was done:**
- Added a profile picker strip at the top of `/rewards` (parent-only). Far left is a gear icon (manage mode, default), followed by each kid's avatar. Selected profile gets a brand-colored ring; unselected are dimmed. Clicking a kid switches to their view — shows their ticket balance, redeem buttons (instead of edit/remove), and filters redemption history to that kid. Parents can redeem rewards on behalf of a kid from this view.

**Files changed:**
- `family-dashboard/client/src/pages/RewardsPage.jsx`

### 2026-03-14 — Diagnosed "Login Failed" issue

**What was done:**
- Investigated login failure on dash.straychips.com and localhost. Production server returns 502 Bad Gateway from Cloudflare — the Docker daemon wasn't running. Restarting Docker Desktop fixed it. Advised enabling "Start Docker Desktop when you sign in" to prevent recurrence.

### 2026-03-14 — Mobile-friendly common chores settings

**What was done:**
- Added collapsible card layout for `/settings/common-chores` on mobile (`md:hidden`). Each row shows drag handle, chore name/notes/tickets, edit/delete buttons, and an expand chevron. Expanding reveals kid avatars as toggle buttons — assigned kids get a brand-colored ring + checkmark badge, unassigned kids are dimmed. Desktop table unchanged.

**Files changed:**
- `family-dashboard/client/src/pages/SettingsCommonChoresPage.jsx`

---

## Session Start: 2026-02-26 8:30 PM

---

### 2026-02-26 — MoneyPopover Layout Adjustments

**What was done:**
- Centered the account name ("Checking") and balance in the popover header (close button now positioned absolutely on the right)
- Moved the "USE X" button from inline in the Exchange Area label to a full-width footer bar at the bottom of the popover
- Made the "USE X" button significantly bigger (full width, larger padding, rounded-xl, text-base font)
- Increased `TOP_FRAC` from `0.55` to `0.62` to vertically shrink the Exchange Area and push the swap/action zone higher up

**Files changed:**
- `family-dashboard/client/src/components/bank/MoneyPopover.jsx`

---

### 2026-02-26 — MoneyPopover: Always-on USE button, rebalanced zones, centered swap

**What was done:**
- Made the "USE X" footer button always visible — shows disabled (gray) state when exchange is empty, active (brand color) when money is in the exchange
- Changed `TOP_FRAC` from `0.62` to `0.52` for a more even split between Your Money and Exchange Area
- Repositioned the swap/action zone panel to be vertically centered on the boundary between the two zones (instead of anchored to the bottom). Updated all 8 places where `azTopY` is computed (render, handlePointerUp, handleMerge, handleApplySplit, handleReset)

**Files changed:**
- `family-dashboard/client/src/components/bank/MoneyPopover.jsx`

---

### 2026-02-26 — MoneyPopover: Normal corner radiuses

**What was done:**
- Changed panel border-radius from `38px` to `rounded-2xl` (16px) via Tailwind
- Changed zone border overlays from `borderRadius: 38` to `16` to match

---

### 2026-02-26 — MoneyPopover: "Use this amount" button label

**What was done:**
- Changed footer button text to "Use this amount ($X.XX)" when active, "Use this amount" when disabled

---

### 2026-02-26 — MoneyPopover: Tighter swap area

**What was done:**
- Reduced `AZ_H_MIN` 106→78, `AZ_ROW_H` 90→72, `AZ_BTN_H` 56→44, `AZ_SEP` 8→4
- Reduced inner top padding from 51→40 (all 7 occurrences across render + callbacks)
- Tightened empty-state: smaller icons (16px), less padding, shorter helper text ("Drag here to merge or split")
- Tightened merge/split button padding (9px→6px vertical)

---

### 2026-02-26 — MoneyPopover: Remove amount from USE button

**What was done:**
- Button now always reads "Use this amount" with no dollar figure, so kids figure out the value from the stacks

---

### 2026-02-26 — Custom "To account" picker + hide Recent for kids

**What was done:**
- **Server**: Added `owner_avatar_color` and `owner_avatar_emoji` to the `GET /api/family/accounts` query
- **UnifiedBankDialog**: Replaced the native `<select>` dropdown for "To account" with a custom button list showing each person's Avatar + name
  - Other people's accounts show avatar + their name (no "checking" label)
  - Own accounts show avatar + account name (e.g. "Savings") so kids can transfer between their own accounts
  - Selected account gets a brand-color highlight border
- **Recent transactions**: Hidden entirely for kid users (was already filtering deposit recents, now hides the whole section)

**Files changed:**
- `family-dashboard/server/src/routes/family.js`
- `family-dashboard/client/src/components/bank/UnifiedBankDialog.jsx`

---

### 2026-02-26 — "To account" grouped dropdown

**What was done:**
- Replaced custom button list with a native `<select>` dropdown using `<optgroup>` grouping
- Kid's own accounts (if more than the source) grouped under their name, showing account names
- Other family members grouped under "Others in the family", showing just their name
- Removed unused Avatar import

---

### 2026-02-26 — Two-panel sliding AccountPicker dropdown

**What was done:**
- Rewrote `AccountPicker` with a two-mode design:
- **Parent view**: Panel 1 lists kids (emoji + name). Clicking a kid slides to Panel 2 showing their accounts. If a kid has only one account, selects directly. Back arrow to return.
- **Kid view**: Flat list — "My accounts" header with own account names, then other family members shown with emoji + name (selects their main account).
- **Trigger display**: Parent sees emoji + name + account. Kid sees just account name (own) or emoji + name (other person).
- Slide animation via CSS translateX transition (200ms)

---

### 2026-02-26 — AccountPicker fixes: slide bug, panel 2 layout, kid divider

**What was done:**
- Fixed slide translateX from -100% to -50% (was overshooting since container is 200% wide)
- Panel 2 now always renders the Back button (not conditionally gated on drillOwner)
- Added kid identity header on panel 2: emoji + name so parent knows who they're picking for
- Added horizontal divider in kid view between own accounts and family members

---

### 2026-02-26 — Portal the AccountPicker dropdown above the modal

**What was done:**
- Dropdown panel now renders via `createPortal` to `document.body` with `position: fixed` and `z-index: 9999`
- Trigger's bounding rect is captured on open to position the panel directly below it
- Click-outside detection checks both the trigger ref and the portal panel ref

**Files changed:**
- `family-dashboard/client/src/components/bank/UnifiedBankDialog.jsx`

---

## Session Start: 2026-02-27

---

### 2026-02-27 — "Remember Me" checkbox on login

**What was done:**
- Added a "Remember Me" checkbox to the login form (defaults to checked)
- When unchecked, the refresh token cookie is set as a session cookie (no `maxAge`), so it expires when the browser is closed
- When checked, the existing 7-day persistent cookie behavior is preserved
- Added `remember` column to `refresh_tokens` table so the preference persists across token rotations

**Files changed:**
- `family-dashboard/server/src/db/db.js` — migration v20
- `family-dashboard/server/src/routes/auth.js` — `issueTokens` + login/refresh logic
- `family-dashboard/client/src/pages/LoginPage.jsx` — checkbox UI + credentials

---

### 2026-02-27 — Fix mobile menu buttons + parent "Count It" override

**What was done:**
- Fixed mobile bottom sheet logout and close buttons not responding to taps — moved them outside the drag touch handler so touch events don't interfere with clicks
- Parents now always see the amount text input field, even when viewing a kid with `requireCurrencyWork` enabled (the "Count It" locked mode is kid-only)

**Files changed:**
- `family-dashboard/client/src/components/shared/Layout.jsx` — separated drag handler from button row
- `family-dashboard/client/src/components/bank/UnifiedBankDialog.jsx` — added `!isParent` to currency work condition

---

### 2026-02-27 — Green money icons + system theme support

**What was done:**
- Made the money bills icon green in the transfer dialog and on bank account cards
- Theme now follows the OS `prefers-color-scheme` by default and reacts to system changes; pressing the toggle button overrides to a manual choice stored in localStorage

**Files changed:**
- `family-dashboard/client/src/components/bank/UnifiedBankDialog.jsx` — green icon color
- `family-dashboard/client/src/components/bank/AccountCard.jsx` — green icon color
- `family-dashboard/client/src/context/ThemeContext.jsx` — system theme detection + manual override

---

### 2026-02-27 — Settings/users mobile cleanup + detail page reorg

**What was done:**
- Hidden "Chores" and "Deactivate" buttons on mobile in the family members list (available on the detail page instead)
- Moved Chores & Tickets cards to the top of the user detail page and renamed section header from "Sections" to "Chores & Tickets"
- Added a Deactivate button above the Danger Zone on the user detail page

**Files changed:**
- `family-dashboard/client/src/pages/SettingsUsersPage.jsx` — `hidden lg:inline-flex` on Chores/Deactivate buttons
- `family-dashboard/client/src/pages/SettingsUserDetailPage.jsx` — reordered sections, added deactivate card

---

### 2026-02-27 — Fix inactive user "00" bug + Reactivate button

**What was done:**
- Fixed React rendering `0` as visible text when `{member.is_active && <JSX>}` was used with integer `0` — changed to `!!member.is_active` in both SettingsUsersPage and SettingsUserDetailPage
- Added reactivation support: the Deactivate section on the user detail page now shows "Reactivate" with a green button when the user is inactive
- Added `is_active` field support to the server's `updateUser` PUT endpoint so reactivation works via the existing API

**Files changed:**
- `family-dashboard/server/src/routes/family.js` — added `is_active` to updateUser handler
- `family-dashboard/client/src/pages/SettingsUsersPage.jsx` — `!!member.is_active` fix
- `family-dashboard/client/src/pages/SettingsUserDetailPage.jsx` — Deactivate/Reactivate toggle

---

### 2026-02-27 — Reactivate fix + hide Assign button on mobile

**What was done:**
- Fixed Reactivate button: removed unnecessary confirmation dialog, added try/catch error handling so the API call failure doesn't silently prevent the state update
- Hidden the "Assign" button on task set rows in mobile view to reduce row cramping

**Files changed:**
- `family-dashboard/client/src/pages/SettingsUserDetailPage.jsx` — removed confirm, added try/catch
- `family-dashboard/client/src/pages/SettingsTasksPage.jsx` — `hidden lg:inline-flex` on Assign button

---

## Session Start: 2026-03-03 (time not provided)

---

### 2026-03-03 — Fix inbox badge count mismatch

**What was done:**
- Fixed inbox nav badge showing 9 while the inbox page showed nothing — the count query was counting pending items from all family users (including parents and inactive users), while the inbox page only displays items from active kids. Added `role = 'kid' AND is_active = 1` filters to the count query.

**Files changed:**
- `family-dashboard/server/src/routes/inbox.js`

---

---

### 2026-03-03 — Add `chores_enabled` setting for parents

**What was done:**
- Added `chores_enabled` column to users (migration v21) — kids default to 1, existing parents default to 0
- Added "Enable Chores" toggle on parent user detail page; when enabled, shows the Chores card and parent appears in chore management/kid-chores switchers
- Dashboard shows chore progress ring for parents who have chores enabled and active chores

**Files changed:**
- `family-dashboard/server/src/db/db.js` — migration v21
- `family-dashboard/server/src/routes/family.js` — GET/PUT chores_enabled support, new parent INSERT defaults to 0
- `family-dashboard/server/src/routes/dashboard.js` — expose choresEnabled to client
- `family-dashboard/client/src/pages/SettingsUserDetailPage.jsx` — "Enable Chores" toggle + conditional Chores card
- `family-dashboard/client/src/pages/SettingsChoresPage.jsx` — include parents with chores in switcher
- `family-dashboard/client/src/pages/KidChoresPage.jsx` — include parents with chores in switcher
- `family-dashboard/client/src/components/dashboard/DashboardRow.jsx` — chore ring for parents with chores
- `family-dashboard/client/src/components/dashboard/DashboardTable.jsx` — same for mobile cards

---

### 2026-03-03 — Make chores-enabled parent a first-class "individual" across the app

**What was done:**
- Renamed sidebar "Kid Pages" → "Individual Pages" and defaulted nav links to the logged-in parent's own ID when they have `chores_enabled`, otherwise first active kid
- Made the dashboard chore ring clickable for parents with chores enabled (both desktop row and mobile card)
- Added chores-enabled parents to the switcher dropdown on all 5 "kid pages": Overview, Bank, Tickets, Tasks, and Trophies

**Files changed:**
- `family-dashboard/client/src/components/shared/Layout.jsx`
- `family-dashboard/client/src/components/dashboard/DashboardRow.jsx`
- `family-dashboard/client/src/components/dashboard/DashboardTable.jsx`
- `family-dashboard/client/src/pages/KidOverviewPage.jsx`
- `family-dashboard/client/src/pages/KidBankPage.jsx`
- `family-dashboard/client/src/pages/KidTicketsPage.jsx`
- `family-dashboard/client/src/pages/KidTasksPage.jsx`
- `family-dashboard/client/src/pages/KidTrophiesPage.jsx`

---

### 2026-03-03 — Multiple parent/dashboard/settings refinements

**What was done:**
- Made all links in the parent's dashboard row clickable (name, balance, tickets, trophies, chores)
- Task sets assigned to parents now show on the dashboard
- Assign dialog only shows parents with chores enabled
- Removed "Show on Dashboard" and "Show Balance on Dashboard" toggles for parents; parents auto-show when chores enabled
- Fixed assignment counts in settings/tasks and task detail page to exclude non-chores-enabled parents
- Renamed "Manage Sets" → "Set Management"
- Fixed rate limiting: auth limiter now only applies to login/register (not refresh/logout)
- Bank page shows message when viewing a parent; hides all bank UI
- Overview page hides Bank stat card and Bank filter when viewing a parent
- Dashboard shows "—" for parent balance
- Parent trophy count shows on dashboard when chores enabled

**Files changed:**
- `family-dashboard/client/src/components/dashboard/DashboardRow.jsx`
- `family-dashboard/client/src/components/dashboard/DashboardTable.jsx`
- `family-dashboard/client/src/pages/KidOverviewPage.jsx`
- `family-dashboard/client/src/pages/KidBankPage.jsx`
- `family-dashboard/client/src/pages/SettingsUserDetailPage.jsx`
- `family-dashboard/client/src/pages/SettingsTasksPage.jsx`
- `family-dashboard/client/src/pages/TaskSetDetailPage.jsx`
- `family-dashboard/client/src/pages/SettingsPage.jsx`
- `family-dashboard/client/src/pages/DashboardPage.jsx`
- `family-dashboard/client/src/pages/DisplayPage.jsx`
- `family-dashboard/client/src/components/shared/Layout.jsx`
- `family-dashboard/server/src/routes/dashboard.js`
- `family-dashboard/server/src/routes/taskSets.js`
- `family-dashboard/server/index.js`

---

### 2026-03-03 — "Allow login for child" feature

**What was done:**
- Added `allow_login` column to users table (migration v22, default 1)
- Server: AddUserSchema accepts optional `allowLogin`/`username`/`pin` for kids; POST creates kid without credentials when login disabled; PUT handles `allow_login` updates; login route rejects disabled accounts
- Client: AddUserForm now has "Allow login for child" toggle (default off), hiding Username/PIN when off
- Client: SettingsUserDetailPage shows "Login Credentials" section for kids with edit button opening a modal to toggle login and update username/PIN

**Files changed:**
- `family-dashboard/server/src/db/db.js`
- `family-dashboard/server/src/routes/family.js`
- `family-dashboard/server/src/routes/auth.js`
- `family-dashboard/client/src/pages/SettingsUsersPage.jsx`
- `family-dashboard/client/src/pages/SettingsUserDetailPage.jsx`

---

## Session End: 2026-03-03

## Session Start: 2026-03-05 (time not provided)

---

### 2026-03-05 — Fix transfer "To account" default for kids

**What was done:**
- Changed the transfer destination default so kids' own accounts (e.g., Savings) are selected first, falling back to the first sibling only if no own accounts exist.

**Files changed:**
- `family-dashboard/client/src/components/bank/UnifiedBankDialog.jsx`

---

### 2026-03-05 — MoneyPopover: half-circle swap zone with arrow icon

**What was done:**
- Replaced the empty swap area (two icons + "Drag here to merge or split" text) with a single `faRightLeft` arrow icon
- Empty swap zone is now a half-circle protruding from the right edge; expands to the full rectangle when items are dragged in

**Files changed:**
- `family-dashboard/client/src/components/bank/MoneyPopover.jsx`

---

### 2026-03-05 — "Receive money" feature for kids with currency work

**What was done:**
- Kids with `require_currency_work` now must "receive" deposits instead of getting them credited instantly. Parent deposits and recurring allowances create a `pending_deposit` record.
- Bank page shows amber "Money to receive!" banners for each pending deposit; clicking opens MoneyPopover in receive mode.
- Receive mode popover: top zone is "Bank Money" with infinite stacks (5 visual, never deplete), bottom is "My new money". Kid drags the correct amount down; "Receive this money!" button only succeeds on exact match.
- Server: new `pending_deposits` table (migration v23), deposit interception for currency-work kids, GET/POST endpoints for listing and claiming pending deposits.

**Files changed:**
- `family-dashboard/server/src/db/db.js` — migration v23
- `family-dashboard/server/src/routes/accounts.js` — pending deposit interception + list/claim endpoints
- `family-dashboard/server/src/services/recurringRuleService.js` — recurring deposits go to pending for currency-work kids
- `family-dashboard/client/src/api/accounts.api.js` — pending deposit API methods
- `family-dashboard/client/src/pages/KidBankPage.jsx` — pending deposit banners + receive popover
- `family-dashboard/client/src/components/bank/MoneyPopover.jsx` — receive mode with infinite stacks, zone relabeling, exact-match validation

---

### 2026-03-05 — Parent deposit warning + tap-to-transfer + animated balances

**What was done:**
- Parent deposit dialog shows amber warning when depositing to a kid with `require_currency_work`; pending deposit banners update without page refresh.
- Tapping a coin/bill in MoneyPopover smoothly animates it to the opposite zone (no drag needed).
- Account balances on `/bank/x` now animate (count up/down) when they change, using requestAnimationFrame with ease-out cubic curve over 1200ms. Shows green "+" or red "−" indicator during animation.

**Files changed:**
- `family-dashboard/client/src/components/bank/UnifiedBankDialog.jsx` — amber currency-work notice
- `family-dashboard/client/src/pages/KidBankPage.jsx` — fetchPendingDeposits in onSuccess
- `family-dashboard/client/src/components/bank/MoneyPopover.jsx` — tap-to-transfer animation
- `family-dashboard/client/src/components/shared/CurrencyDisplay.jsx` — animated counting with +/- indicator
- `family-dashboard/client/src/components/bank/AccountCard.jsx` — uses CurrencyDisplay

---

### 2026-03-05 — Sub-account allocation system for receive flow

**What was done:**
- Parents can set % or flat $ allocation per sub-account when depositing to a currency-work kid (defaults to 10% per sub-account).
- Kid receive flow is now multi-step: step 0 = count total deposit, steps 1+ = figure out each sub-account allocation amount.
- Server validates allocation amounts on claim and credits each sub-account accordingly.
- DB migration v24 adds `allocations` column to `pending_deposits` table.

**Files changed:**
- `family-dashboard/server/src/db/db.js` — migration v24
- `family-dashboard/server/src/routes/accounts.js` — allocation schema, validation, multi-account crediting on claim
- `family-dashboard/client/src/components/bank/UnifiedBankDialog.jsx` — allocation UI (checkboxes, % / flat inputs per sub-account)
- `family-dashboard/client/src/components/bank/MoneyPopover.jsx` — multi-step receive with step tracking, allocation results
- `family-dashboard/client/src/pages/KidBankPage.jsx` — passes allocations to MoneyPopover, multi-step onReceiveConfirm handler
- `family-dashboard/client/src/api/accounts.api.js` — claimPendingDeposit with allocations param

---

### 2026-03-05 — Recurring rules: currency work notice + sub-account splits; claim creates transfers

**What was done:**
- RecurringRuleForm now shows the amber currency-work warning and sub-account allocation splits (matching the deposit dialog) when adding a deposit rule for a currency-work kid.
- Allocations are stored on recurring_rules (migration v25) and passed through to pending deposits when recurring rules fire.
- Claiming a pending deposit now credits the full amount to checking first, then creates transfer_out/transfer_in transactions for each sub-account allocation — so transaction history shows a deposit followed by transfers.

**Files changed:**
- `family-dashboard/server/src/db/db.js` — migration v25 (allocations on recurring_rules)
- `family-dashboard/server/src/routes/accounts.js` — RecurringRuleSchema accepts allocations, stores on INSERT; claim endpoint creates deposit + transfer transactions
- `family-dashboard/server/src/services/recurringRuleService.js` — passes rule.allocations to pending deposit
- `family-dashboard/client/src/components/bank/RecurringRuleForm.jsx` — currency work notice + allocation UI
- `family-dashboard/client/src/pages/KidBankPage.jsx` — passes requireCurrencyWork and userAccounts to RecurringRuleForm

---

### 2026-03-05 — Move currency work notice below Amount in deposit dialog

**What was done:**
- Moved the amber "Require Working with Currency" notice and sub-account splits from above the Amount field to below it in the parent's deposit popup.

**Files changed:**
- `family-dashboard/client/src/components/bank/UnifiedBankDialog.jsx`

---

### 2026-03-05 — Fix receive flow losing money between allocation steps

**What was done:**
- Fixed bug where "My Money" zone showed incorrect amount on later allocation steps — items dragged to exchange were being subtracted twice (once on drag, once in the step transition logic). Now step 1+ transitions just use `yourMoney` as-is since it's already decremented.

**Files changed:**
- `family-dashboard/client/src/components/bank/MoneyPopover.jsx`

---

### 2026-03-05 — MoneyPopover header: title · amount on one line, bigger text

**What was done:**
- Combined the title and balance into a single line with a dot separator (·). Bumped from text-sm/text-xs to text-base so both are more readable.

**Files changed:**
- `family-dashboard/client/src/components/bank/MoneyPopover.jsx`

---

### 2026-03-05 — Step transition animations for receive flow sub-account splits

**What was done:**
- Step 0→1: bank money (top) slides off-screen left; bottom money smoothly glides up into the top zone via a two-phase settle animation (no pop/jump).
- Step 1→2+ and final step: bottom zone money corkscrews off-screen left (720° spin, shrink, fade). Top zone money stays in place during sub-account steps.
- Header bounces on each sub-account step change to signal a new task. Button disabled during transitions.
- Final step plays the same corkscrew animation on the bottom zone before submitting and closing.

**Files changed:**
- `family-dashboard/client/src/components/bank/MoneyPopover.jsx`

---

## Session Start: 2026-03-09 (time not provided)

---

### 2026-03-09 — Banking settings: allow_withdraws toggle + reorder

**What was done:**
- Added `allow_withdraws` column (migration v26, default on) so parents can control whether kids see the Withdraw button
- Reordered banking toggles: Require Working with Currency (top, always shown), Allow Withdraws (new), Allow Transfers (bottom)
- Updated "Require Working with Currency" description to mention receive, transfer, and withdraw
- Withdraw button on bank page now hidden for kids when `allow_withdraws` is off (parents always see it)

**Files changed:**
- `family-dashboard/server/src/db/db.js`
- `family-dashboard/server/src/routes/family.js`
- `family-dashboard/client/src/pages/SettingsUserDetailPage.jsx`
- `family-dashboard/client/src/pages/KidBankPage.jsx`

---

### 2026-03-09 — Group inbox chores by day

**What was done:**
- Chores in the inbox are now grouped by `log_date` with day headers (Today, Yesterday, or weekday+date). Most recent days appear first. Applied to both `InboxPage.jsx` and `InboxKidPage.jsx`.

**Files changed:**
- `family-dashboard/client/src/pages/InboxPage.jsx`
- `family-dashboard/client/src/pages/InboxKidPage.jsx`

---

## Session Start: 2026-03-09 ~evening

---

### 2026-03-09 — Updated README with full feature list and planned items

**What was done:**
- Rewrote README.md to list all current features (chores, banking with currency work mode, tickets & rewards, task sets/projects/awards, dashboard, approval inbox, user management) and planned future features (TRMNL, PWA, badges, streaks, etc.)

**Files changed:**
- `family-dashboard/README.md`

---

### 2026-03-09 — Replace hardcoded secrets in .env.example with placeholders

**What was done:**
- Updated `.env.example` to use placeholder values with a comment showing how to generate secrets via `openssl rand -hex 32`
- Added secret generation instructions to README.md Quick Start section

**Files changed:**
- `family-dashboard/.env.example`
- `family-dashboard/README.md`

---

### 2026-03-09 — Single `npm run dev` for local development

**What was done:**
- Added root `package.json` with `concurrently` to run server + client in one terminal via `npm run dev`
- Added `install:all` script to install both server and client deps
- Simplified README local development section to a single code block

**Files changed:**
- `family-dashboard/package.json` (new)
- `family-dashboard/README.md`

---

### 2026-03-09 — "Money to receive" indicator in nav panel for kids

**What was done:**
- Kids with pending deposits see a yellow "Money to receive!" banner above their profile in the desktop sidebar, and a yellow pill next to their avatar in the mobile top bar. Clicking either navigates to the bank page and auto-opens the receive popover. Pending deposit count is fetched alongside existing kid nav stats. Server dashboard endpoint also includes `pendingDepositCount` per member.

**Files changed:**
- `family-dashboard/client/src/components/shared/Layout.jsx`
- `family-dashboard/client/src/pages/KidBankPage.jsx`
- `family-dashboard/server/src/routes/dashboard.js`

---

### 2026-03-09 — MoneyPopover: animate swap zone items to My Money on step transitions

**What was done:**
- When advancing to the next allocation step (or final step), any items in the swap/action zone now animate back to the "My Money" zone with landing ghosts instead of silently disappearing. Step 0→1 left unchanged (bank money clears naturally).

**Files changed:**
- `family-dashboard/client/src/components/bank/MoneyPopover.jsx`

---

### 2026-03-09 — Extract CurrencyWorkNotice shared component + fix dashboard allocation init

**What was done:**
- Extracted the currency work warning banner + sub-account allocation splits into a shared `CurrencyWorkNotice` component, replacing ~50 lines of duplicated JSX in both `UnifiedBankDialog` and `RecurringRuleForm`.
- Fixed bug where sub-account checkboxes were unchecked when opening from the dashboard (accounts fetched async but allocations never re-initialized).
- Added `leading-relaxed` to the notice text for proper wrapping.

**Files changed:**
- `family-dashboard/client/src/components/bank/CurrencyWorkNotice.jsx` (new)
- `family-dashboard/client/src/components/bank/UnifiedBankDialog.jsx`
- `family-dashboard/client/src/components/bank/RecurringRuleForm.jsx`

---

### 2026-03-09 — Parent dashboard: pending deposit dot + QuickBankAdjust currency work

**What was done:**
- Added small yellow indicator dot to the top-left of a kid's bank balance on the parent's dashboard (desktop and mobile) when they have pending deposits.
- QuickBankAdjust now passes `requireCurrencyWork` to UnifiedBankDialog so the deposit dialog shows the "requires working with currency" warning and sub-account allocation splits, matching the `/bank/:userId` page behavior.

**Files changed:**
- `family-dashboard/server/src/routes/dashboard.js` — added `require_currency_work` to query/response
- `family-dashboard/client/src/components/dashboard/DashboardRow.jsx` — amber dot + requireCurrencyWork prop
- `family-dashboard/client/src/components/dashboard/DashboardTable.jsx` — amber dot + requireCurrencyWork prop (mobile)
- `family-dashboard/client/src/components/dashboard/QuickBankAdjust.jsx` — accepts/passes requireCurrencyWork

---

### 2026-03-09 — Fix session lost on page refresh (Cloudflare tunnel + dev mode)

**What was done:**
- Fixed React StrictMode double-invoking the refresh effect, which rotated the token twice and invalidated the session. Deduplicated concurrent refresh calls in `auth.api.js`.
- Changed cookie `sameSite` from `strict` to `lax` for better compatibility behind Cloudflare tunnels. Fixed `clearCookie` to pass matching options. Added `trust proxy` to Express.

**Files changed:**
- `family-dashboard/client/src/api/auth.api.js`
- `family-dashboard/server/src/routes/auth.js`
- `family-dashboard/server/index.js`

---

## Session Start: 2026-03-09 (evening, continued)

---

## Session Start: 2026-03-09 (late evening)

---

### 2026-03-09 — Propagate common chore reorder to per-kid lists

**What was done:**
- When common chores are reordered on `/settings/common-chores`, the new order now propagates to each kid's per-kid chore list. Individual (non-common) chores keep their positions — only the common chores swap within the kid's existing sort_order slots.

**Files changed:**
- `family-dashboard/server/src/routes/commonChores.js` — expanded reorder transaction to also update per-kid `chore_templates` sort_order

---

### 2026-03-09 — Common Chores feature

**What was done:**
- Added "Common Chores" system: family-level chore templates assignable to multiple kids via checkboxes. New page at `/settings/common-chores` with a table (chores as rows, kids as columns). Checking a kid's checkbox creates a linked per-kid chore template; editing a common chore propagates to all linked kids. Per-kid chore settings show a shared icon for common chores and redirect edit to the common chores page.

**Files changed:**
- `family-dashboard/server/src/db/db.js` — migration v27 (common_chore_templates + common_chore_assignments tables)
- `family-dashboard/server/src/routes/commonChores.js` (new) — CRUD + assignment endpoints
- `family-dashboard/server/src/routes/chores.js` — GET templates includes common_chore_id via LEFT JOIN
- `family-dashboard/server/index.js` — mount commonChores router
- `family-dashboard/client/src/api/commonChores.api.js` (new) — API client
- `family-dashboard/client/src/pages/SettingsCommonChoresPage.jsx` (new) — chore table with kid checkboxes
- `family-dashboard/client/src/pages/SettingsUsersPage.jsx` — "Common Chores" button
- `family-dashboard/client/src/components/chores/ChoreTemplateList.jsx` — shared icon + common edit redirect
- `family-dashboard/client/src/pages/SettingsChoresPage.jsx` — pass onCommonEdit handler
- `family-dashboard/client/src/App.jsx` — route for /settings/common-chores

---

## Session Start: 2026-03-10

---

### 2026-03-10 — Mobile nav: hamburger side panel replaces bottom bar

**What was done:**
- Removed the mobile bottom footer bar. Added a hamburger button to the top-left of the mobile header. Nav now slides in from the left as a side panel matching the desktop sidebar layout (nav links, pending deposit banner, user info + theme toggle + logout at bottom).

**Files changed:**
- `family-dashboard/client/src/components/shared/Layout.jsx`

---

### 2026-03-10 — Bank page: inline user switcher dropdown in title

**What was done:**
- Replaced the "Switch to: [select]" below the title with a chevron next to the title that opens a dropdown to switch users. Icon, title, and chevron stay on one line with truncation.

**Files changed:**
- `family-dashboard/client/src/pages/KidBankPage.jsx`

---

### 2026-03-10 — Inline user switcher dropdown on Overview, Chores, Tickets, Sets pages

**What was done:**
- Applied the same chevron-dropdown switcher pattern (from the Bank page) to KidOverviewPage, KidChoresPage, KidTicketsPage, and KidTasksPage. Removed "Switch to: [select]" from all four.

**Files changed:**
- `family-dashboard/client/src/pages/KidOverviewPage.jsx`
- `family-dashboard/client/src/pages/KidChoresPage.jsx`
- `family-dashboard/client/src/pages/KidTicketsPage.jsx`
- `family-dashboard/client/src/pages/KidTasksPage.jsx`

---

### 2026-03-10 — Inline user switcher dropdown on Trophies page

**What was done:**
- Applied the same chevron-dropdown switcher pattern to KidTrophiesPage, removing the "Switch to: [select]".

**Files changed:**
- `family-dashboard/client/src/pages/KidTrophiesPage.jsx`

---

### 2026-03-10 — Reward undo: activity row + ticket refund instead of silent delete

**What was done:**
- Undo now creates a `reward_undone` activity event and a refund ticket ledger entry instead of silently deleting records. The ↩️ row shows in activity feeds with the refunded ticket count.

**Files changed:**
- `family-dashboard/server/src/routes/rewards.js`
- `family-dashboard/client/src/components/shared/ActivityRow.jsx`
- `family-dashboard/client/src/pages/KidOverviewPage.jsx`
- `family-dashboard/client/src/pages/FamilyActivityPage.jsx`

---

### 2026-03-10 — Undo redeemed rewards for parents

**What was done:**
- Added server endpoint to undo reward redemptions (refunds tickets, removes ledger/redemption/activity records). Undo button appears on activity rows and redemption history for parents.

**Files changed:**
- `family-dashboard/server/src/routes/rewards.js` — DELETE undo endpoint
- `family-dashboard/client/src/api/rewards.api.js` — undoRedemption method
- `family-dashboard/client/src/components/shared/ActivityRow.jsx` — undo for reward_redeemed
- `family-dashboard/client/src/components/rewards/RedemptionHistory.jsx` — undo button per row
- `family-dashboard/client/src/pages/RewardsPage.jsx` — pass onUndone callback

---

### 2026-03-10 — Login page: remember last-used tab (parent/kid)

**What was done:**
- Login page saves the last-used tab to localStorage on successful login and restores it on next visit.

**Files changed:**
- `family-dashboard/client/src/pages/LoginPage.jsx`

---

### 2026-03-10 — Kid logout: remove from nav, add to overview with confirm

**What was done:**
- Hidden the logout button in Layout (desktop + mobile) for kids. Added a subtle "Log out" button at the bottom of KidOverviewPage with a confirmation dialog.

**Files changed:**
- `family-dashboard/client/src/components/shared/Layout.jsx`
- `family-dashboard/client/src/pages/KidOverviewPage.jsx`

---

### 2026-03-10 — Overview page: settings gear icon replaces "Full activity" link

**What was done:**
- Replaced the "Full activity →" link on `/kid/:userId` with a gear icon linking to `/settings/users/:userId`.

**Files changed:**
- `family-dashboard/client/src/pages/KidOverviewPage.jsx`

---

### 2026-03-10 — Inline user switcher dropdown on Settings Chores page

**What was done:**
- Applied the same chevron-dropdown switcher pattern to SettingsChoresPage (includes "Everyone" option). Removed "Switch to: [select]".

**Files changed:**
- `family-dashboard/client/src/pages/SettingsChoresPage.jsx`

---

### 2026-03-10 — Dashboard mobile cards: trophies column narrower

**What was done:**
- Changed 3-column stats grid from equal thirds to `1fr 1fr auto` so Balance and Tickets get more room and Trophies shrinks to fit.

**Files changed:**
- `family-dashboard/client/src/components/dashboard/DashboardTable.jsx`

---

### 2026-03-10 — Prefill login email/username when Remember Me is checked

**What was done:**
- On successful login with "Remember me" checked, the email (parent) or username (kid) is saved to localStorage and prefilled on next visit. The correct tab is auto-selected based on which credential was saved.

**Files changed:**
- `family-dashboard/client/src/pages/LoginPage.jsx`

---

### 2026-03-10 — Fix reward undo: keep original row, hide undo button, fix Rewards filter

**What was done:**
- Stopped deleting the original `reward_redeemed` activity row on undo — row stays but undo button hides. Added `reward_undone` to server's `VALID_EVENT_TYPES` whitelist so it shows under the Rewards filter. Client now computes `undoneRefIds` from the activity list to hide undo buttons on already-undone rewards.

**Files changed:**
- `family-dashboard/server/src/routes/rewards.js` — removed DELETE of original activity row
- `family-dashboard/server/src/routes/activity.js` — added `reward_undone` to VALID_EVENT_TYPES
- `family-dashboard/client/src/components/shared/ActivityRow.jsx` — undoneRefIds logic

---

### 2026-03-10 — Remove Countdown type, mobile activity layout, tap-to-check, progress fix

**What was done:**
- Removed "Countdown" set type from add/edit dialogs and server validation (DB still allows it for existing data)
- Made entire chore row and task step row tappable to check off (not just the checkbox)
- Fixed task set progress on /dashboard and /kid/x to use SUM(repeat_count) instead of COUNT(*) for step totals
- "Limit one per day" checkbox now only shows when repeat count > 1; fixed checkbox text alignment
- Improved /family-activity mobile layout: stacked event icon + avatar vertically, undo button drops below value info — gives description text more room on small screens

**Files changed:**
- `family-dashboard/client/src/pages/TaskSetDetailPage.jsx` — removed Countdown type, checkbox alignment
- `family-dashboard/client/src/pages/SettingsTasksPage.jsx` — removed Countdown type
- `family-dashboard/server/src/routes/taskSets.js` — removed Countdown from Zod enum, SUM(repeat_count) for step_count
- `family-dashboard/server/src/routes/dashboard.js` — SUM(repeat_count) for step_count + trophy queries
- `family-dashboard/server/src/routes/overview.js` — SUM(repeat_count) for step_count + trophy queries
- `family-dashboard/client/src/components/chores/ChoreItem.jsx` — full row click to check off
- `family-dashboard/client/src/pages/UserTaskDetailPage.jsx` — full row click to check off
- `family-dashboard/client/src/components/shared/ActivityRow.jsx` — mobile stacked layout

---

## Session Start: 2026-03-10 (new session)

---

## Session Start: 2026-03-10 (evening session)

---

### 2026-03-10 — Docker setup fixes + .dockerignore

**What was done:**
- Fixed Dockerfile for production Docker builds: added `python3 make g++` for `better-sqlite3` native compilation, created `.dockerignore` to prevent host `node_modules` from overwriting container binaries.
- Added `client/dev-dist/` to `.gitignore`.

**Files changed:**
- `family-dashboard/Dockerfile`
- `family-dashboard/.dockerignore` (new)
- `family-dashboard/.gitignore`

---

### 2026-03-10 — Scroll lock for overlays/dialogs (iOS-safe)

**What was done:**
- Created `useScrollLock` hook that prevents background scrolling when overlays are open, including iOS pull-to-refresh prevention. Allows scrolling inside scrollable overlay content (nav panel, long dialogs).
- Applied to all overlay components: Modal, Layout mobile panel, MoneyPopover, and inline celebration/confirmation dialogs.

**Files changed:**
- `family-dashboard/client/src/hooks/useScrollLock.js` (new)
- `family-dashboard/client/src/components/shared/Modal.jsx`
- `family-dashboard/client/src/components/shared/Layout.jsx`
- `family-dashboard/client/src/components/bank/MoneyPopover.jsx`
- `family-dashboard/client/src/pages/KidChoresPage.jsx`
- `family-dashboard/client/src/pages/UserTaskDetailPage.jsx`
- `family-dashboard/client/src/pages/SettingsUserDetailPage.jsx`
- `family-dashboard/client/src/pages/KidOverviewPage.jsx`

---

### 2026-03-10 — Fix PWA chore double-fire error

**What was done:**
- Fixed "Chore already completed" error in PWA by stopping click propagation on the ChoreItem checkbox button (preventing double API call from nested click handlers). Added graceful 409 handling in KidChoresPage and ParentChoreHistoryPage.

**Files changed:**
- `family-dashboard/client/src/components/chores/ChoreItem.jsx`
- `family-dashboard/client/src/pages/KidChoresPage.jsx`
- `family-dashboard/client/src/pages/ParentChoreHistoryPage.jsx`

---

### 2026-03-10 — Task set display mode: List vs Card view

**What was done:**
- Added `display_mode` column to `task_sets` (migration v32, default 'list'). List/Card toggle in Add Set and Edit Set dialogs on both SettingsTasksPage and TaskSetDetailPage. Card view renders steps as a responsive grid (3 cols mobile, 4 sm, 5 lg) with square aspect-ratio cards showing step number, name, completion checkmark, undo, and input prompts.

**Files changed:**
- `family-dashboard/server/src/db/db.js` — migration v32
- `family-dashboard/server/src/routes/taskSets.js` — display_mode in schema + CRUD
- `family-dashboard/client/src/pages/SettingsTasksPage.jsx` — display mode toggle in form
- `family-dashboard/client/src/pages/TaskSetDetailPage.jsx` — display mode toggle in edit form
- `family-dashboard/client/src/pages/UserTaskDetailPage.jsx` — StepCard component + card grid rendering

---

### 2026-03-10 — Fullscreen image lightbox + card view checkbox

**What was done:**
- Tapping a step image (in list or card view) now opens a fullscreen lightbox overlay (dark background, image centered, tap anywhere to close).
- Card view: removed whole-card tap-to-check-off. Instead, a small checkbox circle appears to the left of the step name — tapping the checkbox or name checks off the step. The image area only opens the lightbox.
- List view: image thumbnail click opens lightbox (stopPropagation prevents check-off).

**Files changed:**
- `family-dashboard/client/src/pages/UserTaskDetailPage.jsx`

---

### 2026-03-10 — Step image upload for task sets

**What was done:**
- Added image upload to task steps (migration v33). Step add/edit dialog has a drag-area upload field with preview and remove. Images stored in `data/uploads/steps/` (persists in Docker volume alongside DB).
- List view shows a small 40px thumbnail on the right side of each step row.
- Card view shows the image as a larger square at the top of each card, with the step name below.
- Server serves uploads at `/api/uploads/steps/`, with 5MB limit and image-type validation.

**Files changed:**
- `family-dashboard/server/src/db/db.js` — migration v33 (image column on task_steps)
- `family-dashboard/server/src/routes/taskSets.js` — multer upload, POST/DELETE image endpoints
- `family-dashboard/server/index.js` — static serving for uploads
- `family-dashboard/server/package.json` — added multer dependency
- `family-dashboard/client/src/api/taskSets.api.js` — uploadStepImage, deleteStepImage methods
- `family-dashboard/client/src/pages/TaskSetDetailPage.jsx` — image upload UI in step modal, thumbnail in admin step list
- `family-dashboard/client/src/pages/UserTaskDetailPage.jsx` — images in StepItem (list), StepCard (card), and completed steps

---

### 2026-03-10 — "Require input" on task steps

**What was done:**
- Added "Require input" option to task steps: a checkbox + prompt field in the Add/Edit Step dialog. When enabled, the user must type a response (e.g. "Name of hymn learned") before checking off the step. Responses are stored in `task_step_completions.input_response` and displayed in italics under completed steps.

**Files changed:**
- `family-dashboard/server/src/db/db.js` — migration v31 (require_input, input_prompt on task_steps; input_response on task_step_completions)
- `family-dashboard/server/src/routes/taskSets.js` — StepSchema + step CRUD with new fields
- `family-dashboard/server/src/routes/userTasks.js` — toggle validates/stores input_response, returns completions
- `family-dashboard/client/src/pages/TaskSetDetailPage.jsx` — checkbox, input prompt field, "input" badge
- `family-dashboard/client/src/pages/UserTaskDetailPage.jsx` — input prompt UI before check-off, displays responses
- `family-dashboard/client/src/api/taskSets.api.js` — toggleStep accepts inputResponse param

---

## Session Start: 2026-03-10 (afternoon)

---

### 2026-03-10 — Add "Countdown" set type + repeating steps

**What was done:**
- Added "Countdown" as a new task set type. Added repeating step support: `repeat_count` (how many times a step repeats) and `limit_one_per_day` (can only check off once per day). Steps with `{#}` in the name show the current instance number. Progress bar reflects total instances. Only one uncompleted instance shows at a time; completed instances appear below with undo on the last one.

**Files changed:**
- `family-dashboard/server/src/db/schema.sql` — updated task_steps + task_step_completions schemas
- `family-dashboard/server/src/db/db.js` — v28 (Countdown type), v29 (repeat columns), v30 (instance column)
- `family-dashboard/server/src/routes/taskSets.js` — StepSchema + step CRUD with new fields
- `family-dashboard/server/src/routes/userTasks.js` — toggle logic for repeating steps, SUM(repeat_count)
- `family-dashboard/client/src/pages/TaskSetDetailPage.jsx` — step form with repeat/limit fields, badges
- `family-dashboard/client/src/pages/UserTaskDetailPage.jsx` — expanded instances, toggle with undo flag
- `family-dashboard/client/src/pages/SettingsTasksPage.jsx` — Countdown type option
- `family-dashboard/client/src/api/taskSets.api.js` — toggleStep accepts undo param

---

### 2026-03-10 — Fix blank page on localhost (HSTS breaking Safari)

**What was done:**
- Disabled Helmet's HSTS header which was causing Safari to upgrade localhost requests to HTTPS, resulting in TLS errors and a blank page. Cloudflare handles HTTPS in production so HSTS from Express is unnecessary.

**Files changed:**
- `family-dashboard/server/index.js`

---

### 2026-03-10 — PWA implementation (installable app)

**What was done:**
- Added `vite-plugin-pwa` with autoUpdate, Workbox static asset precaching (14 entries), and SPA navigateFallback (excluding `/api/` routes). Generated manifest with app name, theme colors, and icons.
- Created all PWA icon assets (indigo background, white house silhouette): 192px, 512px, maskable 512px, apple-touch-icon 180px, favicon.ico, favicon.svg.
- Added PWA meta tags to `index.html` (theme-color, apple-mobile-web-app-*, favicon links).
- Added `workerSrc: ["'self'"]` to Helmet CSP so the service worker can register.
- Created `InstallPrompt` component (captures `beforeinstallprompt`, shows install banner, dismissal saved to localStorage). Rendered in Layout.

**Files changed:**
- `family-dashboard/client/package.json` — added `vite-plugin-pwa` devDependency
- `family-dashboard/client/vite.config.js` — VitePWA plugin config
- `family-dashboard/client/index.html` — PWA meta tags + favicon links
- `family-dashboard/client/public/` — 6 icon files (new)
- `family-dashboard/client/src/components/shared/InstallPrompt.jsx` (new)
- `family-dashboard/client/src/components/shared/Layout.jsx` — renders InstallPrompt
- `family-dashboard/server/index.js` — workerSrc CSP directive

---

## Session Start: 2026-03-10 (new session, time not provided)

---

### 2026-03-10 — Docker deployment, iOS scroll locking, PWA 409 fix, task set card/list toggle, step images + lightbox

**What was done:**
- Set up Docker deployment on Mac Mini server (Dockerfile with Alpine native module build, .dockerignore, database migration from pm2)
- Fixed iOS background scroll when overlays/dialogs are open (useScrollLock hook with position:fixed + smart touchmove prevention)
- Fixed PWA double-fire causing "chore already checked off" 409 errors (stopPropagation + graceful 409 handling)
- Added List/Card display mode toggle for task sets (migration v32, admin UI, user-facing card grid layout)
- Added image upload for task steps (multer disk storage, migration v33, upload/delete endpoints, admin UI)
- Added fullscreen image lightbox on tap, separated image-tap from checkbox-tap in card view

---

## Session Start: 2026-03-10 (continued session)

---

### 2026-03-10 — Fix lightbox bugs + add note icon for step descriptions on cards

**What was done:**
- Fixed lightbox trapped inside completed cards by rendering via `createPortal` to document.body
- Fixed list-view lightbox dismiss triggering step check-off by adding `stopPropagation`
- Added lightbox support to completed steps in list view (extracted `CompletedStepItem` component)
- Added note icon (sticky note) on cards with descriptions — tapping shows description overlay (on image) or popup (no-image cards)

**Files changed:**
- `family-dashboard/client/src/pages/UserTaskDetailPage.jsx`

---

### 2026-03-10 — Fix Docker timezone + dashboard chore progress

**What was done:**
- Docker container was using UTC, causing graph and progress bars to think it was tomorrow at ~9 PM local time
- Added `TZ: America/Denver` to docker-compose.yml
- Fixed 7 SQLite queries in userTasks.js, dashboard.js, overview.js that used `date('now')` without `'localtime'`
- Dashboard now lazily generates chore logs for all family members (same as overview), fixing 0% progress when chores page hadn't been visited yet
- Installed `tzdata` in Alpine Docker image so SQLite `'localtime'` works
- Replaced all SQLite `date('now', 'localtime')` in routes with JS-computed `localDateISO()` parameters (Alpine lacked timezone data so SQLite was still using UTC)

**Files changed:**
- `family-dashboard/Dockerfile`
- `family-dashboard/docker-compose.yml`
- `family-dashboard/server/src/routes/userTasks.js`
- `family-dashboard/server/src/routes/dashboard.js`
- `family-dashboard/server/src/routes/overview.js`

---

## Session Start: 2026-03-11 09:41 AM

---

### 2026-03-11 — Parent auto-approval + currency bypass toggle

**What was done:**
- Parents checking off a kid's chores/steps now auto-approve (skip pending state) — only the kid from their own account triggers the approval flow
- Added "Receive / Bypass" toggle to the CurrencyWorkNotice in the deposit dialog — "Bypass" credits the kid's account immediately and hides sub-account splits

**Files changed:**
- `family-dashboard/server/src/routes/chores.js`
- `family-dashboard/server/src/routes/userTasks.js`
- `family-dashboard/server/src/routes/accounts.js`
- `family-dashboard/client/src/components/bank/CurrencyWorkNotice.jsx`
- `family-dashboard/client/src/components/bank/UnifiedBankDialog.jsx`

---

### 2026-03-11 — Fix bypass deposit Zod stripping bug

**What was done:**
- Bypass deposits were still creating pending deposits because Zod's `TransactionSchema.parse()` stripped the `bypass_currency_work` field. Added it to the schema.

**Files changed:**
- `family-dashboard/server/src/routes/accounts.js`

---

### 2026-03-11 — Chore approval buttons on kid's chore page

**What was done:**
- Added "Approve All" button (for 2+ items) and per-row "Approve" button in the "Waiting for Approval" section on `/chores/:id` when viewed by a parent.

**Files changed:**
- `family-dashboard/client/src/pages/KidChoresPage.jsx`

---

### 2026-03-11 — Settings page reorganization + Set & Step approval level

**What was done:**
- Hid approval/banking settings when login is disabled on a kid
- Moved approval settings below login credentials under an "Approvals" group
- Renamed "Require Task Approval" to "Require Chore Approval"
- Added "Set & Step approval level" dropdown with three modes: Auto-accepted, Approve each step, Approve Set completion

**Files changed:**
- `family-dashboard/client/src/pages/SettingsUserDetailPage.jsx`
- `family-dashboard/server/src/routes/family.js`

---

### 2026-03-11 — Full set/step approval plumbing (end-to-end)

**What was done:**
- Plumbed the three approval modes through server and client:
  - **Auto-accepted**: steps complete immediately (existing behavior)
  - **Approve each step**: step completions go to 'pending' status, appear in parent inbox, shown on task detail page with undo
  - **Approve Set completion**: when final step is done, set goes to 'pending' on task_assignments, no tickets awarded until parent approves from inbox
- Added DB migrations: `require_set_approval` TEXT column on users (v34), `completion_status` on task_assignments (v35)
- Inbox now handles set completions (approve awards tickets, deny resets status)
- UserTaskDetailPage shows pending step/set banners and suppresses fireworks/trophies when pending

**Files changed:**
- `family-dashboard/server/src/db/db.js`
- `family-dashboard/server/src/routes/userTasks.js`
- `family-dashboard/server/src/routes/inbox.js`
- `family-dashboard/server/src/routes/family.js`
- `family-dashboard/client/src/pages/UserTaskDetailPage.jsx`
- `family-dashboard/client/src/pages/InboxPage.jsx`
- `family-dashboard/client/src/pages/SettingsUserDetailPage.jsx`

---

### 2026-03-11 — Approval-aware celebration modals + trophy shelf gating

**What was done:**
- Fixed blank screen on Project completion (ProjectCompletionModal referenced `useTickets` without having it in scope)
- Moved celebration trigger from useEffect to handleToggle so approval status is known at celebration time
- Celebration modals now show "After approval: +X tickets" when approval is pending
- Award modal hides "Go to Trophy Shelf" and shows approval message when pending
- Trophy shelf filters out Awards with pending approval (set-level or step-level)
- My Sets keeps pending Awards visible with "Awaiting approval" label

**Files changed:**
- `family-dashboard/server/src/routes/userTasks.js`
- `family-dashboard/client/src/pages/UserTaskDetailPage.jsx`
- `family-dashboard/client/src/pages/KidTrophiesPage.jsx`
- `family-dashboard/client/src/pages/KidTasksPage.jsx`

---

### 2026-03-11 — Inbox set completion messaging + nav kid sync + daily streak trophy

**What was done:**
- Inbox step groups now show "Final step — completes this set (+X 🎟)" or "Approving all steps completes this set" when applicable
- Set completions in inbox show ticket reward amount
- Nav "My Trophies" badge excludes pending-approval Awards
- Parent nav "Individual Pages" links now sync to the currently viewed kid (switching kid on any page updates all nav links)
- Added "Daily Streak" system trophy on the trophies page — counts consecutive days with at least one chore or step completed; shows current streak and best-ever streak

**Files changed:**
- `family-dashboard/server/src/routes/inbox.js`
- `family-dashboard/server/src/routes/userTasks.js`
- `family-dashboard/client/src/pages/InboxPage.jsx`
- `family-dashboard/client/src/pages/KidTrophiesPage.jsx`
- `family-dashboard/client/src/components/shared/Layout.jsx`

---

### 2026-03-11 — Savings streak, Crown streak, King of Crowns moving trophy + dashboard fix

**What was done:**
- Added "Savings Streak" badge (green) counting consecutive days without withdrawals, and "Crown Streak" badge (purple) counting consecutive days with all chores completed
- Renamed "Streaks" section to "Special" on trophy shelf
- Added "King of Crowns" moving trophy — awarded to kid(s) with the highest current crown streak; increases trophy count by 1 when held
- Created shared `streakService.js` to compute King of Crowns across dashboard, overview, and task routes
- Trophy counts in dashboard, overview, and nav badge now exclude pending-approval Awards and include King of Crowns
- Fixed dashboard crash caused by undefined `familyId` variable (should be `req.user.familyId`)

**Files changed:**
- `family-dashboard/server/src/services/streakService.js` (new)
- `family-dashboard/server/src/routes/dashboard.js`
- `family-dashboard/server/src/routes/overview.js`
- `family-dashboard/server/src/routes/userTasks.js`
- `family-dashboard/client/src/pages/KidTrophiesPage.jsx`
- `family-dashboard/client/src/components/shared/Layout.jsx`

---

### 2026-03-11 — Fullscreen step detail modal + 30-day refresh tokens

**What was done:**
- Replaced `ImageLightbox` and inline note popups with a unified `StepDetailModal` — fullscreen dark overlay with image on top and scrollable description below
- Clicking the image or note icon on any step opens this modal; no-image steps with descriptions show a note icon
- Extended refresh token lifetime from 7 to 30 days to reduce re-login after Docker rebuilds

**Files changed:**
- `family-dashboard/client/src/pages/UserTaskDetailPage.jsx`
- `family-dashboard/server/src/services/authService.js`
- `family-dashboard/server/src/routes/auth.js`
- `family-dashboard/docker-compose.yml`

---

### 2026-03-11 — Recurring rule catch-up + bypass toggle + rule indicators

**What was done:**
- Recurring rules now catch up missed weeks — if nobody logs in on the scheduled day, all missed occurrences fire on next login, each backdated to midnight of the day it was supposed to run
- Added Receive/Bypass toggle to Add Recurring Rule form (reuses CurrencyWorkNotice)
- Added `bypass_currency_work` column to `recurring_rules` table; bypass rules deposit directly
- Recurring rule list now shows mode indicators: "Receive" with sub-account splits, or "Bypass"

**Files changed:**
- `family-dashboard/server/src/services/recurringRuleService.js` (rewritten)
- `family-dashboard/server/src/routes/accounts.js`
- `family-dashboard/server/src/db/db.js`
- `family-dashboard/client/src/components/bank/RecurringRuleForm.jsx`
- `family-dashboard/client/src/components/bank/RecurringRuleList.jsx`

---

### 2026-03-11 — TRMNL e-ink display integration

**What was done:**
- Created `trmnlService.js` — builds dashboard payload (kids' names, emoji, money, tickets, chores, trophies, latest activity) and pushes to TRMNL webhook with 5-min per-family throttle
- Added `trmnl_webhook_url` column to families table (DB v37); settings API reads/writes it
- Added TRMNL webhook URL input under Integrations section on Settings page
- Dashboard route fires a push to TRMNL after responding
- Iterated on TRMNL Liquid markup (progress bars, conditional latest row for >4 kids, crown when chores done)

**Files changed:**
- `family-dashboard/server/src/services/trmnlService.js` (new)
- `family-dashboard/server/src/db/db.js`
- `family-dashboard/server/src/routes/family.js`
- `family-dashboard/server/src/routes/dashboard.js`
- `family-dashboard/client/src/pages/SettingsPage.jsx`

---

### 2026-03-11 — Rebrand to "Family Dash" + new PWA icon & splash screens

**What was done:**
- Renamed app from "Family Dashboard" to "Family Dash" everywhere: manifest, HTML title, apple-mobile-web-app-title, and all three nav header locations in Layout.jsx
- Added FontAwesome `faPeopleRoof` icon next to "Family Dash" in nav headers
- Replaced all PWA icons (favicon.svg, favicon.ico, pwa-192x192, pwa-512x512, maskable-icon, apple-touch-icon) with new people-roof design on indigo background
- Created iOS/iPadOS splash screens for 7 device sizes (iPhone 14/15/Pro/Max, iPad Air/Pro/Mini/10th gen) with centered icon + "Family Dash" text

**Files changed:**
- `family-dashboard/client/src/components/shared/Layout.jsx`
- `family-dashboard/client/vite.config.js`
- `family-dashboard/client/index.html`
- `family-dashboard/client/public/favicon.svg`, `favicon.ico`, `pwa-*.png`, `apple-touch-icon-180x180.png`, `maskable-icon-512x512.png`
- `family-dashboard/client/public/splash-*.png` (7 new files)

---
