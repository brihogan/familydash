# Work Log

## Session Start: 2026-06-05 13:58 EDT (afternoon)

### 2026-06-05 — Fix: subtask checks not showing on the single-user page
- On a kid's badge page the subtask checklist never showed checks: `subtaskUserId` comes from `useParams()` (a string) but `completedBy` holds numbers, so `completedBy.includes("52")` was always false. The matrix worked because it passes numeric `data.users` ids. Fix: coerce to `ctxUid = Number(ctxUserId)` in `StepSubtasks` and use it for `isDone`, the single-user toggle target, and the post-toggle done update. Verified: Brian's "Read three books" step now shows "Book 2" checked. Client-only.

### 2026-06-05 — Matrix cell shows subtask progress (orange ring)
- A matrix cell whose step has subtasks now shows a light-orange ring (#FED7AA) instead of the gray one, with a darker-orange arc (#EA580C) = that user's checked-off subtasks ÷ total (`SubtaskRing` SVG). Done cells still show the green check; steps with no subtasks keep the gray ring.
- Server: matrix endpoint attaches `subtaskTotal` + `subtaskDone` per cell via `attachSubtaskProgress()` (batched: group keys → step_subtasks → per-user completions), both badge (`f<fam>:b<badge_id>:<rowKey>`) and regular (`f<fam>:s<taskSetId>:<sort_order>`) branches.
- Verified against Brian's real subtask data (r1 0/3 all → light rings; r2 Daniel 1/2, Ellie 2/2; r5 Brian/Daniel 1/3 → darker arcs): 5 light-only + 4 with progress arcs, matching. (Cleaned up accidental test toggles on his data.) Server change → prod needs image rebuild.

### 2026-06-05 — Per-step subtasks (shared defs, per-user check-off) + mini-matrix
- New "Subtasks" collapsible above General Notes in the step full-screen. A parent-managed checklist (text input + Add) attached to a step and SHARED across everyone who has that step; only the checked-off state is per-user. Parents add/delete; parents or the kid check off.
- DB v83 (+ schema.sql): `step_subtasks` (id, group_key, name, sort_order) + `step_subtask_completions` (subtask_id, user_id). `group_key` is family-scoped + step-identity (`f<fam>:b<badge_id>:<r|o><sortOrder|optReqId>` for badge steps, `f<fam>:s<task_set_id>:<sort_order>` for regular shared sets) so the same step across per-kid badge enrollments shares one subtask list.
- Server (userTasks.js): `stepGroupKey()` + GET/POST `/users/:userId/steps/:stepId/subtasks`, DELETE `/users/:userId/subtasks/:id` (parent), POST `/users/:userId/subtasks/:id/toggle` (parent or self). Client: `taskSetsApi` get/add/delete/toggleSubtask; new `StepSubtasks` component with two modes.
- Opened from the grid → mini-matrix (avatars across the top, a check per (subtask,user); default-open). Opened normally → single-user checklist (default-collapsed). `StepFocusModal` gained `subtaskUserId` + `subtaskUsers`; wired from the matrix (all users who have the step) and the kid page (StepItem/CompletedStepItem, single user).
- E2E-verified: add via Brian's r0 step (994) appears via Daniel's r0 step (1400) → shared; toggle for Daniel → completedBy:[53], Brian done:false → per-user; browser — mini-matrix (4 avatars, Daniel checked, parent add/delete) + single-user checklist. Test data cleaned up. Server change → prod needs image rebuild.

### 2026-06-05 — Matrix: "Also save for" live note-saving + per-user comment icon
- Renamed the cell-click toggle section "Also mark complete for" → "Also save for". Your answer + general notes now save (via `saveStepNotes`) to the focus user AND each toggled-on user — on blur, and when you toggle a user on (any text already entered is saved to them then). Mark complete still also completes the toggled users (unchanged). So you get notes-to-look-at-later even without completing. (Row-click "Who completed it?" mode unchanged.)
- StepFocusModal gained `onSaveCoUserNotes`; `saveNotes` fans out to focus + selected co-users; toggle-on persists existing text. Matrix wires both save handlers (per-user `saveStepNotes`) and refetches on focus close so icons update.
- Server matrix endpoint returns `hasComment` per cell (non-empty general_notes/response_draft in user_step_notes OR non-empty completion input_response), both badge + regular branches. Client renders a small amber comment-dots icon at the top-right corner of each user's check when they have any saved text.
- E2E-verified: server hasComment (8 Goosebumps cells from answers); browser — "Also save for" heading, toggle-on save (Daniel) + blur save (Brian, via real focusout) both persisted and showed comment icons; test notes cleaned up. Server change → prod needs image rebuild.
- Fix: opening a cell with a comment showed empty fields — the matrix returned the step definition but not the saved text. Server now returns `cell.note { inputResponse (latest completion answer), responseDraft, generalNotes }` per cell (both branches); the matrix merges them into `step._inputResponse/_responseDraft/_generalNotes` (only for cell-click, not the row-click "Who completed it?" rep). Verified: completed cell pre-fills the answer ("Cool") + general notes; a not-done draft cell pre-fills the editable draft answer + notes.

### 2026-06-05 — Shared list opens the matrix as an overlay (no badge page behind)
- Clicking a shared badge/award/set used to `navigate()` to the rep's badge detail with `openMatrix`, so the badge page loaded behind the grid. Now `StepMatrixModal` is exported from UserTaskDetailPage and rendered directly on SharedTaskSetsPage over the list (state `matrixTarget`); URL stays `/tasks/shared`, so ✕/Back land back on the shared list. Back-button handled with a pushState/popstate pair (same pattern as the in-page open). `onChanged` refetches the shared list. The direct badge→grid-button flow is unchanged (badge detail still behind the grid). Verified all flows in browser (no console errors). Client-only.

### 2026-06-05 — Matrix: hide-when-all-done, green finished columns, frozen Optional header
- Hide rule changed: a step hides only once EVERY owner (kid who has it) has completed it (single-owner step hides when that kid finishes) — `ownersOf(rowKey).some(notDone)`. A step still shows while anyone who has it still needs it.
- Kids who've completed every step they have get a subtle-green column (`completeUserIds` → green header bg + green name + faint green cell wash). Verified by temporarily finishing Daniel's Test Project (then undone).
- Optional group-header label moved into a sticky `th` (left-0) + a band `td colSpan=users`, so it stays frozen during horizontal scroll instead of partly scrolling (was a `sticky` span inside a colSpan td). Verified left=0 holds through scroll. Client-only.

### 2026-06-05 — Matrix shows ALL steps (stop hiding completed ones)
- Reversed the earlier "hide any step ≥1 kid completed" rule — it was hiding e.g. the Accessories first step (both kids had completed it), which the parent expected to still see. `visibleSteps` is now the full union (`data.steps`), so every step any enrolled kid has shows, including completed ones (they render with their check marks) and steps only one kid has (others get "–"). Empty-state text → "No steps to show yet." Verified in browser (Accessories: first step back with ✓✓, all 14 steps listed, per-kid "–" for unowned steps). Client-only.

### 2026-06-05 — Fix: matrix unscrollable in installed PWA (touch)
- `useScrollLock` (active while the matrix modal is open) had a `touchmove` guard whose `getScrollParent` only recognized VERTICAL scrollers (`overflowY` + `scrollHeight > clientHeight`). The matrix needs HORIZONTAL scroll; when content had no vertical overflow, `getScrollParent` returned null and the guard `preventDefault`-ed the swipe — blocking the pan. Only bit touch devices (the guard never fires for mouse/trackpad), so desktop tabs worked but the installed PWA on a tablet/phone didn't.
- Fix: in the guard, let horizontal swipes through (`|dx| > |dy|` → return) — a horizontal gesture can't move the vertically-locked body anyway. Track `startX/startY` on touchstart. Verified via synthetic TouchEvents in the preview: the exact bug case (scrollableX true, scrollableY false) now reports `defaultPrevented=false` (allowed); both-overflow case also allows H+V. Needs on-device PWA confirmation. Client-only.

### 2026-06-05 — Matrix renders as a centered modal on wider displays
- The grid was full-screen at every width (looked odd on big monitors). Now the StepMatrixModal outer div is a backdrop (`sm:items-center sm:justify-center sm:bg-black/40 sm:p-6`) and the header+body live in a panel (`w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-4xl sm:rounded-2xl sm:shadow-2xl sm:border`). Phones stay full-screen; sm+ gets a centered card. Backdrop click closes (target===currentTarget → onClose, which routes through the history-aware close). Verified in browser (1280px: 896px panel centered, backdrop covers viewport, backdrop-click closes; 375px: panel fills 375×812). Client-only.

### 2026-06-05 — Matrix back-button + Shared close-returns-to-list
- Browser Back now closes the matrix. Opened in-page (grid button): pushes a throwaway history entry + popstate listener so Back pops it and closes the matrix while staying on the detail page. Arrived from the Shared list (`location.state.openMatrix`, tracked via `arrivedWithMatrix` ref): the page entry already serves that role, so Back / ✕ both return to the Shared list (`navigate(-1)`), not the badge page. `closeMatrix` routes ✕ and Back through the same path. Verified all 4 flows in browser (button→Back stays on detail; Shared→badge→matrix→✕ and →Back both land on `/tasks/shared`). Client-only.

### 2026-06-05 — "Shared" view: task sets 2+ family members are doing
- Tasks page (`/tasks/:userId`) profile-pic row now has a group icon (parent-only) → `/tasks/shared`. New `SharedTaskSetsPage` lists task sets 2+ members share REGARDLESS of level: badges/awards grouped by `badge_id` (any level counts), regular sets by `task_set_id`. Each row: medallion + title + member avatar stack; tapping opens the progress grid (navigates to a representative `/tasks/:repUserId/:repTaskSetId` with `state.openMatrix`, which `UserTaskDetailPage` auto-opens — works for non-badge sets too).
- Server: `GET /family/shared-task-sets` (parent-only, family.js) groups assignments and returns items with ≥2 distinct members + a representative target. Generalized the matrix endpoint (userTasks.js) to handle `badge_id == null`: assignees as columns, the set's own steps as rows, per-(user,step) completion counts (scoped by user since regular sets share step ids). `KidProfilePicker` gained `sharedRoute`/`sharedSelected`; route added under ParentRoute (static `/tasks/shared` outranks `/tasks/:userId`).
- E2E-verified via parent token (shared-task-sets → 4 badges/awards + 1 regular "Test Project"; matrix for regular set ts19 → Brian/Daniel cols, per-user done) + browser (shared avatar on tasks page → list of 5 → clicking regular set & badge both auto-open the grid full-width). Server change → prod needs image rebuild.

### 2026-06-05 — Parent "who's done what" badge progress matrix
- Badge/award detail page (`/tasks/:userId/:taskSetId`): added a grid icon next to the (i) info button — desktop title-row cluster + mobile stacked column. Parents only (`viewer.role === 'parent'` + `badge_id != null`). Opens a fullscreen `StepMatrixModal`: steps down the left (truncated, OPT tag on optionals), every family member enrolled in the same badge across the top (avatar + name), a check circle per cell (green ✓ = done, empty ring = not done, `–` = step not in that kid's level/picks). Cumulative levels handled (union of all kids' steps). Tapping a cell opens that kid's fullscreen `StepFocusModal` in their own level/context (readOnly when already done); completing calls the existing toggle endpoint for that user and refreshes both the grid and the page. Horizontally scrollable with sticky first column + header row on narrow screens.
- Server: new `GET /users/:userId/task-assignments/:taskSetId/matrix` (parent-only) in userTasks.js — finds all enrolled family members, unions their steps by stable identity (badge_opt_req_id / sort_order), returns per-(user,step) cells with done state + step detail for the focus view. Client: `taskSetsApi.getTaskMatrix`. E2E-verified via real token (Goosebumps badge, 3 kids at L5/L4/L2) + browser (desktop + mobile scroll, parent-only 403). Server change → prod needs image rebuild.
- Follow-up: replaced the per-row "OPT" tag with a single full-width "Optional" group-header band (colSpan = users+1) above the optional rows. Verified in browser.
- Follow-up: (1) `StepFocusModal` takes an optional `user` prop — when set (opened from the grid), the kid's avatar is tucked at the top-right of the badge medallion (offset, ringed). (2) Tapping a left-column step label in the grid opens a centered title/description modal (z-[60], pulls full `name` + `description` from any enrolled kid's cell; Esc/backdrop closes). Client-only, both verified in browser.
- Follow-up: clicking a grid row now highlights it (brand-50 band across the sticky label + cells) via a single `selectedKey`; only one row highlighted at a time, persists after the info modal closes. Verified in browser.
- Fix: the kid avatar on the badge fullscreen was clipped at the top (it sits at `-top-1` above the medallion, flush with the scroll container's top edge). Added `pt-3` to the StepFocusModal scroll body — avatar now has 8px top clearance (DOM-measured, fully inside).
- Follow-up: in the grid's fullscreen step view, under the answer textarea, an "Also mark complete for" section lists toggles for the other enrolled kids who share that step and haven't done it (`coUsersFor` matches by stable key, excludes the focus kid + already-done). Toggling kids on → "Mark complete" fires `toggleStep` for each (focus kid + selected) with the SAME answer via `Promise.all`, then refreshes grid + page. UI verified in browser (toggles, on/off state, same-answer hint); did NOT click complete to avoid mutating real family data. Client-only.
- Follow-up: clicking a step ROW now opens the fullscreen directly (removed the title/description modal — the description shows in the fullscreen anyway) with a "Who completed it?" section listing ALL enrolled kids as toggles; `requireCoSelection` mode disables "Mark complete" ("Select who completed it") until ≥1 is toggled, then completes for exactly the toggled kids (same answer). Cell clicks unchanged ("Also mark complete for", primary preselected, enabled immediately). `coUsersFor(rowKey, excludeId)` / nullable-primary `handleComplete` / focus carries `rowKey`+nullable `user`. Verified in browser (row click: all 3 toggles, button disabled→enabled on toggle; cell click regression: others-only, level pill, enabled). Client-only.
- Follow-up: grid now hides any step that at least one enrolled kid has already completed (`visibleSteps` filter on `cell.done` — it's a "what's still outstanding" view; empty state "every step completed 🎉"), and shows a sticky-note icon at the right of the Step cell for steps that have a real description (`rowDetail` → `hasDesc = description && !== name`; icon is `shrink-0` after the `flex-1 truncate` label so it survives truncation). Verified in browser (4 done steps hidden, 0 green checks remain; 7 note icons on exactly the described steps). Client-only.
- Follow-up: smarter responsive grid (replaces the `lg` breakpoint) — table is always `table-fixed w-full` with an inline `min-width = 12rem + 5rem×userCount` and fixed `w-20` user columns. When the container is wide enough the Step column absorbs all slack (longest possible title) and avatars hang at the right edge; when too narrow the min-width forces horizontal scroll while the Step column holds at its 12rem floor and stays frozen (sticky), revealing ~2 avatar columns at a time. (Step floor bumped 8rem→12rem so the cramped state shows 2 avatar cols instead of 3.) Verified in browser (1280px: Step ~1025px, avatars right edge, no scroll; 375px: table 432px, Step frozen at 192px, exactly 2 avatar cols visible + 3rd peeking). Client-only.
- Follow-up: parent-initiated step completions no longer hit the parent inbox, and required-input becomes optional for parents. Server (userTasks.js toggle): added `actorIsParent` — gates both `insertNotification` calls (`each_step` per-step + set-completion) on `!actorIsParent`, and relaxes the `require_input && !inputResponse` 400 when the actor is a parent (parent approval skip already existed). Client (StepFocusModal): `useAuth` → `inputOptional = viewer.role==='parent'` feeds `canComplete` + button label so a parent can check off a require-input step with no answer. E2E-verified via parent token (completed Daniel's require-input step with `{}` → 200, inbox_notifications stayed 4 despite his `each_step` mode; then undid → restored) + browser (button enabled/"Mark complete" on empty input as parent). Server change → prod needs image rebuild.

### 2026-06-04 — Browse Badges "Anyone in family" filter + "Clear filter"
- Browse Badges "Shared with…" dropdown: renamed the top option to "Clear filter" and added "Anyone in family" (👨‍👩‍👧‍👦), which shows badges/awards any other family member is enrolled in (excludes the viewing kid). Server `/badges` accepts `enrolledByUserId=any`, scoped to caller's family.

### 2026-06-04 — Fix: co-assignee avatars vanished after picking an optional
- Picking/removing/swapping an optional ran `setSteps(result.steps)` with steps the add/remove/swap endpoints return WITHOUT `co_assignees`, so per-step avatar stacks disappeared until refresh. Added `mergeCoAssignees` (UserTaskDetailPage.jsx) to re-attach them by stable identity (badge_opt_req_id / sort_order), pulling from current steps + optionalCoAssignees. Client-only.

### 2026-06-04 — Per-user manual step ordering (drag-to-reorder)
- Badge/award pages: a "Sort" toggle hangs to the right of each group heading (Required / each award Level / Your Picks). Toggling on relabels the heading "MANUAL ORDER", adds a left-edge drag handle to each step (@dnd-kit), and lets the kid drag steps. Drag is constrained within its group (can't cross Required↔Optional or between award levels).
- The ORDER is per (user, task_set) on the server (new table `user_task_step_order`, migration v82 + schema.sql; `PUT /users/:id/task-assignments/:tsid/step-order`; GET detail returns `stepOrder`), so it follows the kid across devices and a parent sees the kid's order. The view-MODE toggle is per-device (localStorage `stepOrderManual:<taskSetId>`), so a parent can stay on default while the kid uses manual.
- Server endpoint E2E-verified via minted token (GET []→PUT reversed→GET reversed; invalid/dup ids filtered). Client compiles clean; browser drag E2E pending login. Server change → prod needs image rebuild.

## Session Start: 2026-06-02 18:00 EDT (evening, session 2)

### 2026-06-02 — Co-assignee avatars on Browse Badges cards
- Each badge card in the Browse Badges modal now shows (bottom-right) the avatars of other family members currently enrolled in that badge — active assignment, not archived, and not yet finished (completed step instances < total). Server: `/badges` list endpoint runs one grouped query over the page's badge_ids and attaches `co_assignees[]` (gated on bookmarksFor; scoped to viewer's family, excludes self). Client: BadgeBrowser card renders the same overlapping avatar stack. E2E-verified via API token (Ellie's Goosebumps card → Brian, Daniel). Server change → prod rebuild.

### 2026-06-02 — Show co-assigned users' avatars on shared badge steps
- On a user's task-set detail page, incomplete badge/award steps now show an overlapping avatar stack of OTHER family members enrolled in the same badge+level who haven't finished that step (so kids can team up). Renders to the right of the row, left of the fullscreen button; tooltip lists names; caps at 3 + "+N".
- Task sets are PER-KID (each enrollment = own task_set/steps), so "the same step" is matched across enrollments by a stable identity: `badge_opt_req_id` for optionals, `sort_order` for required/award steps (immune to the short_text name change). Server: one grouped query added to the GET detail handler (userTasks.js), filtered to others who haven't completed the step (NOT EXISTS); attaches `co_assignees[]` to each step. Only for `badge_id` sets.
- Client: new `xs` size on Avatar.jsx; avatar stack in StepItem (UserTaskDetailPage.jsx).
- FIX: dropped the `badge_level` filter — leveled badges are CUMULATIVE (a level's required steps are a same-`sort_order` prefix of higher levels), so kids at different levels (e.g. Goosebumps lvl2/4/5) share the prefix steps. Matching now: `badge_id` + (`badge_opt_req_id` for optionals / `sort_order` for required). E2E-verified via real API token as Ellie: her steps return co_assignees [Brian, Daniel].
- ADDED: avatars in the "Pick optional tasks" modal too — server returns `optionalCoAssignees` map (keyed by badge_opt_req_id); each optional row shows the stack. Server change → prod rebuild.

## Session Start: 2026-06-02 (evening)

### 2026-06-02 — Per-step "General Notes" + draft answers + read-only full-screen
- Full-stack feature on the badge/award step full-screen view (StepFocusModal). New `user_step_notes` table (migration v81 + schema.sql) keyed per (user, step): `general_notes` scratchpad + `response_draft`, both saved on blur via new `PUT .../steps/:stepId/notes` upsert endpoint; GET now returns `notes[]`. Completing a step clears the draft (answer commits to task_step_completions.input_response), general notes persist.
- Client (UserTaskDetailPage.jsx): collapsible "General Notes" textarea above the answer (collapsed unless notes exist), both textareas blur-save via `handleSaveNotes` (optimistic). StepItem rows show an amber sticky-note icon when general notes OR a draft answer exist. CompletedStepItem shows the answer + an amber note icon when general notes exist, and a button to reopen the full-screen view in `readOnly` mode (no complete button). Verified: migration applied, upsert SQL (in-memory test), client compiles clean. Browser E2E pending (needs kid login). Server change → prod needs image rebuild.

### 2026-06-02 — Revert password masking + menubar pill positioning
- Reverted Login/Register Password+PIN from the JS `MaskedInput` workaround back to native `type="password"` (kept name/id/autocomplete hints; PIN inputMode=numeric). The masking was for an AutoFill crash that was really the overscroll-reload — so native fields + password-manager autofill are restored. Deleted MaskedInput.jsx.
- Mobile menubar pill counters: were `absolute top-0.5 right-1.5` of the whole slot (floating far from the centered icon). Wrapped the icon in a `relative inline-flex` and anchored the badge to the icon's top-right (`-top-1.5 -right-2`) with a white/dark ring outline. Applied to both nav-item badges and the "More" rollup badge.

### 2026-06-02 — Kid nav: remove redundant "My Badges", label sets page from settings
- Kid nav had a "My Badges" link (/badges browse page, already reachable via the "Browse Badges" modal on /tasks) AND a hardcoded "My Sets" link (/tasks). Removed the /badges item from both render paths (sidebar + mobile bar in Layout.jsx) and changed the /tasks label from "My Sets" → `My ${setsStepsLabel}` so it follows the parent's configured page name (Settings). Client-only.

### 2026-06-02 — HappyWeb (iPad in-app browser) login/scroll reload saga
- Chased "page reloads when focusing Password/PIN" in "HappyWeb: Family Browser" through several theories before the real cause. Steps shipped (all on `main`): added `name`/`id`/`autocomplete` to login+register fields; tried readonly-until-focus (suppressed the keyboard — bad); masked fields via `type=text`+`-webkit-text-security`, then via a JS `MaskedInput` (no `type=password` at all). None fixed it → AutoFill was never the cause.
- **Real cause:** HappyWeb's overscroll/pull-to-refresh + an overlay search bar. Fixes: `overscroll-behavior:none` globally; JS `--app-h` (=`window.innerHeight`) drives the app-shell height because `dvh`/`svh` report the full screen while the visible area is ~128px shorter (proven via a new `?debug=1` layout-readout overlay + event logger); mobile nav `bottom` offset by `100dvh - --app-h` so the fixed bar lifts into view past the search bar.
- Also made the **service worker opt-in / off by default** (login checkbox "Install as app & work offline"; self-heals existing installs by unregistering).
- Short-page reload (swipe not absorbed → document overscroll → HappyWeb reload): new `useOverscrollGuard` hook (client/src/hooks) mounted in Layout — always-on version of useScrollLock's touchmove guard. On a vertical swipe with no scrollable ancestor (short page) or at a scroller's edge, `preventDefault`s to kill the native overscroll; horizontal gestures left alone (nav strip). Decision logic verified in preview; can't repro HappyWeb locally so awaiting Brian's device test.
- **Open:** confirm on-device that the nav-visibility offset + overscroll guard fully resolve it. If HappyWeb still reloads despite preventDefault, it intercepts swipes below the web layer and there's no further web-level lever. See memory `project_happyweb_ipad`.

### 2026-05-31 — Focus mode: no auto-focus; More panel 5-wide
- StepFocusModal no longer auto-focuses the answer textarea on open (removed the `taRef.current?.focus()` timeout) — on mobile that forced the keyboard up and shoved the layout. `taRef` kept as the textarea ref; kid taps to type.
- Mobile menubar "More" sheet: section tile grid changed `grid-cols-4` → `grid-cols-5` so it's 5 icons wide. Client-only (Layout.jsx + UserTaskDetailPage.jsx), esbuild clean.

### 2026-05-29 — "Start this badge" preview modal: summaries + chevron-expand
- Mirrored the optional-picker treatment in BadgePreviewModal ("I want to start this badge"): new `PreviewStep` component shows each requirement/optional's `short_text` summary with a ▶ chevron that expands the full original text in a boxed inset. Lifted `expandedSteps` Set state (keys `r<id>`/`o<id>` so req/opt ids can't collide) + `toggleStep`. Both Required and Optional Pool lists use it.
- Server: `/badges/:id` detail endpoint now SELECTs `short_text` on requirements too (optionals already had it). (`badges.api.js` already passed the kid's `level` to getBadge — no client API change needed; the modal already renders requirements only when a level is set.)
- Only 2 files changed: `server/src/routes/badges.js` + `client/src/components/badges/BadgePreviewModal.jsx`.
- Static-verified: PreviewStep def 1 / uses 2, expandedSteps + toggleStep present, old <li> blocks gone, esbuild clean, badges.js node --check OK. Live browser verification BLOCKED — preview server dropped out at end of session ("Server not found"); needs a visual re-check next session (open a not-enrolled badge → "I want to start this badge" → confirm summaries + chevron-expand on Required + Optional Pool).

## Session Start: 2026-05-30 15:27 EDT

### 2026-05-30 — React ErrorBoundary so a page crash no longer blanks the app
- New `client/src/components/shared/ErrorBoundary.jsx` (class component, `getDerivedStateFromError` + `componentDidCatch` logs to console) renders a styled fallback ("Something went wrong" + Reload button + the error message), Tailwind/dark-mode aware. Wired in `Layout.jsx` around `<Outlet/>` as `<ErrorBoundary key={location.pathname}>` so navigating to another route resets the boundary and recovers automatically; the nav sidebar stays outside it so only the page content area shows the fallback.
- Verified live on /tasks/52/74 via a temporary query-gated throw: fallback rendered with nav intact (no blank #root), error message shown; throw removed and a clean reload confirms the real page renders fully. (Also caught a transient stale-HMR "pickerExpanded is not defined" — the WORK_LOG-noted wedged-preview artifact; actual code at UserTaskDetailPage.jsx:1327 is correct.)

## Session Start: 2026-05-29 17:33 EDT (evening)

### 2026-05-29 — Optional-picker shows summaries + chevron-to-expand description
- The "Pick X more optional tasks" modal now shows each optional's `short_text` summary (falls back to full text), with a ▶ chevron on summarized rows that expands an inline box with the full original text. `/badges/:id/optionals` endpoint now SELECTs `short_text` (both level + all-levels queries, via replace_all); picker rows became a div role=button (so the chevron button can nest) with `pickerExpanded` Set state.
- REAL BUG (blank screen, NOT a wedged preview as I first misdiagnosed): my initial edit adding the `pickerExpanded` useState + `togglePickerExpand` had silently failed to apply (bad anchor), so the picker render referenced undefined `pickerExpanded`/`togglePickerExpand` → runtime ReferenceError crashed UserTaskDetailPage to a blank #root (esbuild passes — undefined-var refs are runtime-only; no error boundary). Inserted the state after the real `areaBrowser` declaration. Verified live on /tasks/52/74: page renders (20 rows, 6 chevrons on summarized optionals), chevron expands the full original text in a box, no vite error. Lesson: trust the blank screen + always grep that a referenced symbol is actually DEFINED, not just that esbuild parses.
- Flagged follow-up: add a React error boundary so a page render crash shows a fallback instead of blanking the whole app.

### 2026-05-29 — Fullscreen button on every Curiosity step
- Replaced the description-only ℹ "Open full step" button in `StepItem` with a `faExpand` "Open full screen" button shown for EVERY completable Curiosity badge/award step (gated `taskSet?.badge_id && !isAutoLinked && !showInput`), so any step — short or long — can open the fullscreen focus view. Auto-linked "Earn the X badge" steps (own medallion, auto-complete) excluded. Client-only, UserTaskDetailPage.jsx. Verified live: 11 fullscreen buttons = 11 mark-checkboxes on /tasks/52/74, opens focus mode, no vite error.
- Focus-mode heading polish: title-only steps (no separate description) now show a generic heading ("Required step" / "Chosen step" by `is_optional`) with the actual step text in the boxed left-justified card — matching how summarized steps show short-title + full-text-card. Verified: required step → "Required step" + text in box; optional → "Chosen step" + text in box.

### 2026-05-29 — Archive→Delete(unassign) toggle on the user task detail page
- On UserTaskDetailPage the archive control now becomes a **Delete (unassign)** button when nothing is checked off, with its own red confirmation modal; once any step is completed it stays **Archive** (preserve history). "Nothing checked" mirrors the server via `completions.length === 0`.
- **Visibility**: a parent always sees the control (on their own or a kid's page); a kid only sees it for a badge/award **they self-enrolled** (`assigned_by === their id`). Parent-assigned items hide the control from the kid (so kids can't ditch parent-assigned chores/badges either).
- New `DELETE /users/:userId/task-assignments/:taskSetId` (soft `is_active=0`, refuses with 409 if any completion exists, permission-gated parent-or-self-enrolled). GET detail now returns `assignedBy`. Added `taskSetsApi.deleteAssignment`. Verified live (parent view): Advanced Cooking (0 done)→Delete, Advanced Aviation (2 done)→Archive, real delete flipped is_active 1→0 + redirected, restored after. NOTE: server change → prod needs image rebuild.

### 2026-05-29 — Badge-step summaries (short_text) + focus mode — COMPLETE
- Goal: long badge/award steps get a punchy one-line title; full text becomes the step description, viewable in a fullscreen "focus mode" (badge on top, full text, answer textarea, Mark complete).
- DONE: migration v80 adds `short_text` to badge_level_requirements + badge_optional_requirements (original `text` untouched, reversible). Pilot of 40 steps approved by Brian — style = **punchy imperative 4-8 words, drop level-counts/example-lists, keep OR-choices, "Teach someone…" boilerplate → "Teach someone a skill from this badge"**. Cutoff: steps >20 words.
- RUNNING: background workflow `summarize-badge-steps` (150 batches × 50 = 7,494 distinct long steps) writing /tmp/longsteps/result_NNN.json. Apply script ready: `server/scripts/applyShortText.mjs` (joins batch+result files, writes short_text to every matching row where NULL; quality-gated to skip non-shorter/runaway summaries; idempotent + reversible).
- DONE (plumbing): enroll wiring in `badges.js` — `stepNameDesc()` helper sets task_step.name = short_text (full text → description) on all 4 paths (required, optional, swap, add-optional). `short_text` added to export/importBadgeLibrary (import null-defaults for old snapshots). `applyShortText.mjs` now ALSO backfills existing active Curiosity enrollments (optionals via badge_opt_req_id, required by text match; safe — completions key off task_step_id).
- **Phase C focus mode DONE** (client-only, UserTaskDetailPage.jsx): new `StepFocusModal` fullscreen view — badge medallion + badge name + "Level 5 · Owl" pill on top, the short title, the full step text in a card, an answer textarea when the step needs input, and a pinned "✓ Mark complete" footer (disabled until an answer is typed for input steps). `StepItem` gained `taskSet` prop + `hasDetails` + `focusOpen`; long steps route both the row click and the ℹ "Open full step" button into focus mode; completion calls the same `onToggle(step,false,resp)`. taskSet passed to all 4 StepItem render sites. Verified live on /tasks/52/22 (Advanced Aviation): focus mode opens with badge/level/short-title/full-text/answer/Mark-complete, esbuild clean, viteError false.
- Fix: X button didn't close focus mode — the modal is portaled to <body> but React replays events through the COMPONENT tree, so the X click bubbled to StepItem's row onClick and re-opened it instantly. Added `e.stopPropagation()` on the portal root + X button. Verified live: closedOk true (open→X→closed).
- Drifted-enrollment fix: a long unsummarized step on /tasks/52/22 (Advanced Aviation) turned out to be TEXT DRIFT — its optional wording no longer exists in the current library (the badge's optionals were rewritten in a prior overhaul), so it couldn't be relinked/summarized. Library itself is 100% summarized (GAP=0); first sweep missed nothing. `backfillStepShortText.mjs` extended to also RELINK orphaned optional picks by text (61 relinked, 29 enrollments got short titles). Only 2 enrollments were truly drifted (Advanced Aviation ts22 user52, About Me ts34 user56); re-added both from the current summarized library via a one-off script (preserved user/level/assigned_by/pin; cleared 2 trivial completions each). Now ts22→74, ts34→75; 0 orphaned optionals remain; new aviation enrollment shows summarized steps + focus mode, old long step gone. Backup: family.db.bak-readd-drifted.
- Re-exported snapshot has 9,157 short_text entries. Out of scope (future): summarizing award *activity* steps (awardSteps.js — sourced from award_config, no short_text col).
- DEPLOY: server + migration v80 → image rebuild; badge-library → export/import; run `backfillStepShortText.mjs` in container for existing prod enrollments.

### 2026-05-29 — Inbox: chat-bubble indicator on rows with a kid's input
- Notification rows whose `detail` is set now show a 💬 before the title (zero-dep emoji, matching the existing ▶ glyph style), so a parent can see at a glance which rows have a typed response to expand. Verified live: bubble shows on the row with input, absent otherwise.

### 2026-05-29 — Inbox notifications: expandable chevron showing kid's input
- Each inbox notification row gets a chevron (▶→▼) that expands to show the full untruncated title + the kid's typed response. Stored the response on the notification at insert time: new `inbox_notifications.detail` column (migration v78), `insertNotification` accepts `detail`, the step-toggle handler passes `inputResponse` for both task_step and task_set notifications, and `GET /inbox` SELECTs `detail`. Offline inbox cache passes it through (no field whitelist). InboxPage: `expandedNotifs` Set state, collapsed rows truncate / expanded show `whitespace-pre-line` + a "Their response" box. Verified live: seeded a notif with a long title + input, collapsed hid the input, expanding revealed it; test row cleaned up afterward. NOTE: server + migration → prod needs image rebuild.

### 2026-05-29 — Fix: per-kid Badge & Award Notifications dropdown was never added
- The earlier per-kid notification work landed the server side (column, family.js, notify logic) but the SettingsUserDetailPage Edit had silently failed (wrong old_string — guessed the Max Active input's classes). Re-applied: the dropdown now renders in the Badges section under Max Active Badges. Verified live on /settings/users/53 — control present, options off/each_step/on_completion.

### 2026-05-29 — Hide "Discover X" Area pills in settings/tasks
- Extended the `renderRow` tag filter on SettingsTasksPage to also drop Area-of-Discovery tags (`!tag.startsWith('Discover')`) alongside the existing Award/Badge filter — inside the badge groups the area is noise. Verified 0 Discover pills after expanding Badges.

### 2026-05-29 — Per-kid badge/award parent-notification setting
- New per-kid `users.badge_notify_mode` ('off'|'each_step'|'on_completion', default off) — migration v77. For Curiosity task sets (badge_id set), the step-toggle handler now uses the kid's `badge_notify_mode` instead of the task_set's own `notify_mode`; regular sets unchanged. `userTasks.js`: taskSet SELECT now includes badge_id, user SELECT includes badge_notify_mode, computed `notifyMode` drives both notification checks (0 old taskSet.notify_mode refs remain).
- `family.js`: added to GET user SELECT, zod UpdateUserSchema, and PUT handler. Client: per-kid dropdown added to the Badges section on SettingsUserDetailPage (beside badge level / max active).
- Edit Set modal (SettingsTasksPage): for Curiosity sets (category==='Curiosity') the Parent Notifications dropdown is replaced with a "Set per kid →" link to /settings/users, and the Display Mode (list/card) chooser is hidden (Curiosity always uses list/medallion). `openEdit` now captures badge_id.
- Verified: migration applied (column present, all users default 'off'), server healthy, all 5 files pass node --check / esbuild parse. Live UI screenshot blocked by preview tooling timing out this session.

### 2026-05-29 — Drop redundant Award/Badge pills inside their groups
- In SettingsTasksPage `renderRow`, filter out the "Award" and "Badge" tags before rendering the purple pills — inside the Awards/Badges group the type is already implied. Other tags (e.g. "Discover Character") still show. Verified: 0 pills after expanding Awards.

### 2026-05-29 — Badge group: single→flat row, multi→stacked-cards look
- In SettingsTasksPage's Curiosity grouping, a badge/award with only ONE level now renders as a normal flat row (`renderRow` — icon + name + Assign/Edit/Delete, click to view steps) instead of a chevron group. With 2+ levels it stays a collapsible group and, while collapsed, shows a faint second card peeking below the main row (absolute `inset-x-2 bottom-0 h-3` ghost card) so it reads as a stack/collection. Verified: esbuild parses clean, single-guard + stacked-hint each present once, no TDZ (renderRow initialized before first group execution). Visual preview verification blocked by flaky preview tooling this session.

### 2026-05-29 — Collapsible Curiosity → Awards/Badges → per-level grouping (settings/tasks)
- Restructured the Curiosity category on SettingsTasksPage into nested collapsibles: **Curiosity opens by default**, with **Awards** and **Badges** sub-groups **collapsed by default** (split via `badge_is_award`). Within each, task sets are grouped by `badge_id` so a badge/award shows as ONE normal-looking row (icon + name + "N levels" count) with a **chevron** instead of edit/delete; expanding reveals its per-level entries (level pill via BADGE_LEVELS, e.g. "Level 5 · Owl") each keeping the Assign/Edit/Delete actions. Other categories render unchanged. `isCollapsed` defaults updated (`::Curiosity` open; `::Curiosity::*` collapsed). Verified live: compiles clean, Bowling → "Level 5 · Owl". Note: heavy tool-output batching this session — changes confirmed via `git diff` + DOM inspection.

### 2026-05-29 — Earn-badge underline everywhere + sub-header + SWAPS delete + L5 audit
- Extracted the "Earn the X badge" dotted-underline into a shared `client/src/utils/earnBadgeRef.jsx` helper; now used by the optional picker AND the "Start this badge" preview modal (`GET /badges/:id` now resolves refs on requirements + optionals). Verified resolution (Fire Building→Fire Safety, Foods→4 food badges, Computers→Internet/Internet Safety).
- Optional picker modal got a `subtitle` (new shared-`Modal` prop) showing "N available to choose from" under the title.
- Soft-deleted the non-badge "Annual SWAPS Event" (#1675, `is_active=0`; 0 refs).
- L5 audit: only Event Planning (9) & Fire Building (8) exceed 7 L5 requirements — both legit (real content, no bad "do requirement X" steps; back-ref cleanup already removed those).

### 2026-05-29 — Strip "* " indicators + clean up "Do Level N requirements" back-refs
- Removed leading `* ` (8) and `*. ` (4) requirement indicators (redundant — required steps already sit under a Required section) + 2 enrolled Bowling task_steps.
- Cleaned the cross-level "Do/Complete Level N requirements 1 & 2" family via a classifier script (dry-run first). Since enrollment already includes every prior level's steps, these are redundant: **HID 65** pure/corrupt/mangled back-refs, **STRIPPED 22** to keep only their own added instructions (Knitting→"Cast on 15 stitches…"), **KEPT 4** continuation rows full (Coloring "…except color N pictures"). Deactivated 2 matching enrolled steps. Backups: family.db.bak-20260529-{asterisk,backrefs}. Prod needs export/importBadgeLibrary.

### 2026-05-29 — Fix nested `<button>` warning in BadgeBrowser
- The badge grid card was a `<button>` wrapping the bookmark-toggle `<button>`, which React flagged with `validateDOMNesting (<button> cannot appear as a descendant of <button>)`. Converted the outer card to a `<div role="button" tabIndex={0}>` with an `onKeyDown` (Enter/Space → `handleCardClick`) so click + keyboard behavior and styling are unchanged. Verified on `/badges/52`: 0 nested button-in-button, console clean, card still focusable and Enter opens the preview modal.

### 2026-05-29 — Sticky header on the optional-tasks picker modal
- Added an opt-in `stickyHeader` prop to the shared `Modal` (default off, so other modals are unchanged) and enabled it on the optional-tasks picker. The "Optional tasks — N of 7 selected" title now pins to the top while the list scrolls so the count stays visible. Gotcha: sticky pins relative to the scroll container's *content* box, so the panel's `pt-6` left a 24px gap where cards peeked above the header bg — fixed by moving the top padding off the panel (`pt-0`) onto the header itself when sticky.

### 2026-05-29 — Badge library cleanup: scraped gibberish + junk "." optionals
- Stripped the scraped CU website footer ("Disclaimer: Our web pages…" + wp-emoji-loader JS, ~13.6KB) that had been appended to **71 optional requirements** (incl. Bowling's "Find out what bowling pins are made of…"). Truncated each at the "Disclaimer:" boundary — uniform across all 71, 0 in `badge_level_requirements`. Deleted **5 junk lone-"." optionals** (Bowling req 10, Accountability, Computers, Costume Design ×2) — none were referenced by any kid's added step. Backup at `data/family.db.bak-20260529-cleanup`. NOTE: library lives in the DB; prod still needs the export/importBadgeLibrary deploy to pick these up.

### 2026-05-29 — Auto-link "Earn the X badge" in badge steps
- Badge requirements/optionals that say "Earn the {Name} badge" now auto-link to that badge just like awards do. New `services/badgeRefLink.js` parses the phrase (anchored on "badge", requires an article so the Level-5 "this badge" boilerplate is skipped) and resolves it to a real non-award badge by name. The kid-task GET endpoint derives `linked_badge_id` at read-time for any unlinked step (so existing `StepItem` renders the medallion/progress ring, or a "Start the X badge" preview when not enrolled) and the `/optionals` endpoint flags resolvable rows so the picker modal dotted-underlines the phrase. ~70–77% of refs resolve cleanly; drift ("Math"→Mathematics), "X or Y" compounds, and Area words ("Character") correctly stay plain text. Verified on user 52 (Advanced Aviation → Airplanes medallion; "Earn the Drones badge" dotted-underlined in the optional modal).

## Session Start: 2026-05-26 (morning)

### 2026-05-26 — Pin task sets to the top of the kid's lists
- New `task_assignments.is_pinned` column (v75) + `PATCH /api/users/:userId/task-assignments/:taskSetId/pin`. UI: pin button in the chevron column on the detail page (between back chevron and tree icon), amber when active. Pinned items surface above the folder cards on `/tasks/:userId` and float above the in-progress / not-started / completed buckets inside the group pages. Pinned sort on `/tasks/:userId` itself is type-then-status (awards → badges → loose, in-progress → not-started → completed).

### 2026-05-26 — Award-link mini badges on each badge medallion
- Bulk task-assignments endpoint now attaches a `linked_awards` list to every enrolled badge — every award the kid is enrolled in whose steps point at this badge via `linked_badge_id`, `linked_task_set_id`, OR a `linked_badge_category` match (the `*` cross-area sentinel is excluded). Renders as a fan of small 26px circles (3px gray outline, 3px overlap) tucked into the badge's bottom-right with the outer edge just kissing the progress ring. So U.S. Constitution shows Liberty + Discovery, Joy shows Discovery + Fruit of the Spirit, etc.

### 2026-05-26 — Responsive medallion sizing + pinned-divider polish
- `useMedallionSize()` hook: 104px on mobile (<640px), 120px from sm+ — keeps the iPhone-12-mini layout breathable inside the page padding while letting the badges grow on wider screens. Inner disc + arc-text scale as size×0.77 / size×0.29 so they look right at both sizes. Folder cards on KidTasksPage consume the same hook for symmetry.
- Horizontal divider after the pinned row on `/tasks/:userId` and inside the group pages so pinned reads as a deliberate "shortcuts" group. Needed `justify-self-stretch w-full` because `justify-items-center` was collapsing `col-span-full` items to width 0.
- Bumped row-gap on the mobile 3-col grid from 4px → 20px so wrapping rows actually look like separate rows.

### 2026-05-26 — Award "tree map" view
- New `/tasks/:userId/:taskSetId/tree` route + `AwardTreePage` component. Renders the parent award as a 140px medallion at top-center, with each badge/sub-award step as a 104px child medallion below, connected by SVG lines drawn from measured DOM positions (re-measured on resize via ResizeObserver so the connectors stay anchored when children wrap on narrow viewports).
- Children sorted in-progress (% desc) → not-started → completed (alphabetical within bucket). Clicking a child with an enrolled `linked_task_set_id` jumps to its detail page; pure category slots ("Earn any Art badge") fall back to the parent award.
- `faSitemap` button on `UserTaskDetailPage` directly under the back chevron — only shown when at least one step has a `linked_badge_id` / `linked_badge_category` / `linked_task_set_id`, so plain projects don't get a useless button. `*` cross-area sentinel renders as "Any badge" (not "Any * badge"); area sentinels strip the "Discover (the)" prefix.

### 2026-05-26 — Bowling badge: backfilled Level 5 reqs + 18 optionals
- The CU Bowling page is missing the two starred Level 5 requirements (page jumps straight to item 3) and the optional pool was empty in our DB despite `level_opt_counts.level5=7`. Inserted:
  - Two `level=level5` rows: `* Do Level 4 requirements 1 & 2` and a made-up capstone `* Bowl 3 games and try to beat your personal best, OR teach someone the basics of bowling (safety, etiquette, and how to keep score).`
  - 18 `level=NULL` optionals matching CU items 3–9 and 11–21 (item 10 was blank on the page, skipped). `req_number` preserved from the source so the numbering matches the page.
- No active enrollments existed, so no existing kid task lists are affected. Future enrollments at any level pick from the full shared optional pool.

### 2026-05-26 — KidGroupPage sort: in-progress (by %) → not-started → completed
- The `/tasks/:userId/group/{badges,awards}` lists now bucket-sort: in-progress first (highest % at top, so the kid sees what they're closest to finishing), then not-started, then completed at the bottom. Within in-progress, sorted by completion ratio desc; within other buckets, alphabetical. Archived view keeps simple alphabetical.

### 2026-05-26 — Removed KidTasksPage filter-pills row
- Dropped the "All / type / category / tag / level" pill row on `/tasks/:userId` and also unwired `onPillFilter` from the medallions so card-pill clicks no longer apply an invisible filter (the row was the only visible reset). Underlying `activeFilter` / `filterOptions` / `setMatchesFilter` machinery is now inert; left in place for now to keep the diff minimal, can be pruned later.

### 2026-05-26 — Pruned KidTasksPage filter dead code
- Deleted the now-inert filter machinery from `KidTasksPage.jsx`: `activeFilter` state, `filterOptions` IIFE, `setMatchesFilter`, the unused `.filter()` in `sortedSets`, `togglePillFilter`, and `filterDotColor`. Collapsed the conditional empty-state copy to just "No tasks assigned yet." `BADGE_LEVELS` import retained — still used by `kidLevelCfg` for the folder-card progress arcs. Verified `/tasks/52` renders normally in the preview with the 3 medallion view (Awards/Badges folders + 🎯 set), no new console errors.

### 2026-05-26 — "Shared with" badge-library filter
- BadgeBrowser gets a violet "Shared with…" dropdown listing every other family member with a `badge_level`. Selecting one filters the library to badges that user is currently enrolled in (any level), so a parent picking a badge for one kid in the "Pick a badge for this step" modal can intentionally choose something a sibling is already working on. Since the BadgeBrowser is shared, the filter shows up on `/badges/:userId` and inside the "Browse Badges" modal on KidTasksPage too.
- Each dropdown option shows a live count "Name (N)" reflecting the current type/category/search/newOnly filters, and options with 0 are disabled — so you can tell at a glance which siblings have anything to coordinate in this view. Backed by a new `GET /api/badges/shared-counts` endpoint that runs the same WHERE conditions as `/badges` but groups by `task_assignments.user_id`.
- New server param `?enrolledByUserId=` on `GET /api/badges`. Guarded with a same-family check (`users.family_id = req.user.familyId`) so the filter can't be used to probe another family. Adds a single `EXISTS` clause; unrelated to the existing `enrolledOnly` flag which uses `bookmarksFor`.
- Files: `server/src/routes/badges.js`, `client/src/api/badges.api.js`, `client/src/components/badges/BadgeBrowser.jsx`.

### 2026-05-26 — Bigger badge medallions + responsive grid
- KidTasksPage / KidGroupPage badge medallions bumped from 96→120px, container switched from `flex flex-wrap` to a responsive grid: `grid-cols-3 sm:4 md:5 lg:6 xl:8` with `justify-items-center` on mobile and `lg:justify-items-start` on desktop. iPhone 12 mini fits 3 across by extending the grid past the page padding with `-mx-4 sm:mx-0` (3×120 + 2×4 gap = 368 < 375); 1440-wide desktop shows 8 per row, left-aligned.
- Inner image disc grew from `w-16` (64px) to `w-24` (96px), arc-text radii from 22/26 → 36/40 to keep proportions inside the larger ring. Affected files: `TaskSetCard.jsx`, `KidTasksPage.jsx`, `KidGroupPage.jsx`.
- Side-fix: rebuilding the API server on Node 24 required bumping `better-sqlite3` from `^9.4.3` → `^12.10.0` (9.x has no Node-24 prebuilt and its source no longer compiles against V8's C++20 headers).

## Session Start: 2026-05-25 (evening)

### 2026-05-25 — Prod deployment + slug-based award badge linking
- Shipped today's library overhaul to prod via new `exportBadgeLibrary.js` / `importBadgeLibrary.js` flow (idempotent: upsert badges by id, clear+reinsert reqs/opts, never touches user data). Docker container gotchas documented in `PROD_DEPLOY.md` + memory.
- STEAM's "Earn the Math badge" row converted from name-keyed (`'Math'`) to slug-keyed (`'mathematics-badge'`) so future enrollments link correctly regardless of name drift (CU's canonical name is "Mathematics"). `awardSteps.js` prefers slug, falls back to case-insensitive name match.

### 2026-05-25 — Massive badge-library + award progress overhaul (5+ hour session)

**Library import + scrape (96 missing + 153 emoji backfill + 26 broken refresh)**
- Built a Chrome-MCP-driven scrape pipeline (`server/scripts/scrapeCuBadges.js`, `parseScrapedTexts.js`, `mergeScrapedBadges.js`, `refreshScrapedBadges.js`, `backfillEmojiImages.js`). Browser fetches CU pages with the user's authenticated session via the Claude-in-Chrome extension; raw text + og:image streams back through a dev-only POST sink (`/api/_scrape-sink` in `app.js`).
- **+81 truly-new badges** added from CU's Yoast sitemap (Shakespeare, Star Trek, Steampunk, Charcuterie, Microsoft Office, Seven Teachings, Zombie Apocalypse, Martial Arts, etc.). All cropped, imaged, level-tagged.
- **+152 emoji backfills**: scraped og:image for the 151 badges that had only an emoji + 1 retro-fix. Cropped + ringed. `scraped_at` deliberately preserved so they don't pollute the "New" filter (image swap ≠ new badge).
- **26 broken-from-March badges refreshed** (Marshmallow, Teal Pumpkin, Microsoft Office, Seven Teachings, Water Games, etc.) — the original 2026-03-04 scrape had partial level data or missing optionals. Re-scraped each.
- Parser learned several CU author variations: "Do/Choose/Complete N requirements", "Do the M starred plus N optional", digit-or-word counts ("4" vs "four"), shared starred reqs across levels (Marshmallow pattern), en-dash section separators, URL-on-its-own-line continuation, multi-line sub-bullets, name-detection fallbacks for pages with no `<h1>` (Goosebumps), and 8-underscore requirement markers (Math).
- Sentinel `linked_badge_category='*'` for cross-area award slots (STEAM's Man Made Wonders + outdoor science + Biography rows).

**Schema (migrations v72 → v74)**
- v72: `badges.scraped_at` — powers the "New" badge browser pill.
- v73: `task_steps.linked_task_set_id` — per-step user-chosen badge link, overrides auto-pick.
- v74: `badge_optional_requirements.level` — for badges (Math) whose optionals are scoped per-level rather than a shared pool.

**Award engine improvements**
- `awardSync` now auto-completes BOTH `linked_badge_id` AND `linked_badge_category` award steps when the kid finishes a qualifying badge. Discovery Award's "Earn a badge in Art" steps actually auto-resolve now.
- Manual badge link API: `PATCH /api/users/:userId/task-assignments/:taskSetId/steps/:stepId/link`. Validates the target task_set belongs to the user.
- BadgeBrowser highlights already-enrolled badges with an emerald border + ✓ corner badge. Clicking an enrolled badge in browse mode jumps to the kid's task page; in pick mode it links the badge to the calling step. Same logic powers the new "Picked" filter pill (next to Bookmarked / New).
- Swap pill on linked-badge step rows lets a parent re-pick which badge fills a category slot.
- New `count_at_level` award detail (`CountAtLevelAwardDetail`) for WOW: shows progress count + completed-badge medallions at the award's level. Retroactive credit; no manual checkboxes.
- Weighted award progress (`client/src/utils/awardProgress.js`): a step linked to a 9-substep badge counts as 9 toward the denominator; unlinked slots use level-average (`{preschool:3, level1:5, level2:7, level3:9, level4:12, level5:15}`, empirical cumulative). Mirrored server-side in the bulk task-assignments endpoint so folder cards match detail-page rings.

**Cropper + image pipeline fixes**
- `cropBadgeImages.js` now flattens transparent PNGs to white before trim so the colored ring on Shakespeare/Big Cats/Star Trek/Steampunk gets caught and stripped. Skips `award-*` files (they have their own pipeline).
- All `<img alt={name}>` swapped to `alt=""` to prevent BIG TEXT title flash during image load (15 spots across the client).

**UI polish**
- Folder cards on KidTasksPage have curved "AWARDS / FOLDER" and "BADGES / FOLDER" arc titles, level-tinted progress rings, +4 padding so they don't sit flush against the filter pills.
- Step text rendered with `whitespace-pre-line` so Math's multi-line sub-bullets stay on separate lines.
- Bookmark + New + Picked filter pills on BadgeBrowser (Picked = enrolled-only).
- Edit Step modal in `TaskSetDetailPage` gates the LinkedBadgePicker behind a checkbox; hidden when family settings have badges off.

**Dev infrastructure**
- Vite client moved to strict port 6010 via `.claude/launch.json`. `vite.config.js` API proxy default now 3010 (was 3001 — conflicted with AuditProofv2).
- Killed a stale `server/public/` from May 20 that was being served on top of the live dev API and confusing the preview panel; renamed to `server/public.stale-2026-05-20` and out of the way.
- Dev-only POST sink endpoint `/api/_scrape-sink` for browser-to-disk handoff during in-page scrape loops.

### 2026-05-25 — Max Active Badges raised to 50 + dashboard rings capped at 6
- Client UI cap (`SettingsUserDetailPage`) raised from 10 → 50, server Zod schema (`family.js`) from 20 → 50. Existing server enrollment guard in `badges.js` already reads the per-user value, no change needed.
- `DashboardTable` + `KidOverviewPage` now slice the task-set rings to the top 6 via new `client/src/utils/topTaskSets.js`: in-progress first (sorted by % desc, then by step count), then completed if there are leftover slots. Stops a kid with 50 active badges from blowing out the row.

### 2026-05-25 — Badge library audit: 96 badges missing from CU library
- New `server/scripts/auditBadgeSitemap.js` pulls the Yoast SEO `page-sitemap*.xml` from curiosityuntamed.com, extracts `/badges/{slug}/` URLs, and diffs against our local `CuriosityUntamed/badges.json` (the source of truth for our 751 imported badges). Read-only — prints two lists and exits.
- First run: 841 slugs in sitemap, 751 in our JSON → **96 missing** (Shakespeare, Skating, Star Trek, Steampunk, Charcuterie, Native Americans, Web Development, …) and 6 obsolete-in-DB slugs (`art-in-nature` → `art-in-nature-2`, ligature-corrupt `college-specific`, etc.). The original badge-list page just doesn't index every published badge post; sitemap is the better source of truth.

## Session Start: 2026-05-24 (morning)

### 2026-05-24 — STEAM Award: one row per badge, unique auto-match per category
- STEAM's "Earn 2 Life Science badges" / "Earn 2 Physical Science badges" / "Earn 2 Man Made Wonders badges" / "Earn 2 Art-area badges" activity rows are now 8 individual `badge_category` step rows (plus the Math badge, an outdoor-science row, and the Biography + 4 activity rows) — 15 steps total.
- New `badge_category` step type in `server/src/services/awardSteps.js` carries a category + custom display text. Renderer treats it like Discovery's area rows but with a friendlier name.
- `server/src/routes/userTasks.js` enrichment now returns *all* candidate enrollments per category (ordered by progress desc) and assigns a unique badge per step row via an `assignedTaskSetIds` Set — so two Life Science rows resolve to two different enrolled Sci&Tech badges, not the same one twice.
- Migration v68 backfill picks up the new step config; task_set 62 verified 15 steps with proper category links.

### 2026-05-24 — Awards live in production
- Pushed all 15 CU awards to prod (`dash.straychips.com` / miniserver). Migrations v64–v70 auto-applied on container restart; existing 751 badges untouched. Sync flow: `git pull` → `docker compose restart app` → `docker compose cp data/uploads/badges/. app:/data/uploads/badges/` → `docker compose exec app node server/scripts/importAwards.js`. Final counts: 766 total / 751 badges / 15 awards. Updated `reference_deployment.md` memory with the prod container details (service=`app`, DB at `/data/family.db`, WORKDIR `/app`, sqlite3 CLI not installed → use `node -e` with better-sqlite3 instead).

### 2026-05-24 — KidTasksPage: collapse badges + awards into folder cards
- Two folder cards (orange Awards, purple Badges, both filled folder icons) replace the per-badge clutter on the main page. Folder ring shows aggregate step progress across the (non-archived) sets, tinted with the kid's badge-level palette.
- New `/tasks/:userId/group/(badges|awards)` sub-pages list the contents with status pills (All / Not started / In progress / Completed / Archived), Area of Discovery pills (badges only), and a Browse modal.
- Awards render before Badges, then any non-Curiosity Project/One-Off sets in the same grid.
- Extracted the rich flippable card into `TaskSetCard.jsx` so the main + sub-pages share one component; ~+379 / –345 lines.

### 2026-05-24 — Minimal "circle only" task-set card variant
- TaskSetCard gained a `minimal` prop used on `KidTasksPage` + the group sub-pages: just the progress ring + badge image/emoji, no card chrome. Folder cards adopt the same compact shape.
- Track stroke uses the level's `trackColor` (per-level tuned in `BADGE_LEVELS` — Preschool/Level 1/2 softer than their `color`, Level 3 + 4 unchanged, Level 5 much lighter); completed arc uses `borderColor`. Stroke pushed flush to the wrapper edge (`r = (size - sw) / 2`) so there's no white halo before the shadow.
- Detail page header ring inherits the same treatment + 8px stroke for consistency.

### 2026-05-24 — Curved title on emoji + plain-set medallions
- Image-less badges and plain sets now get a curved SVG `<textPath>` title curving along the top of the cream/grayscale inner disc, with long names overflowing onto a `side="right"` bottom arc so both halves read left-to-right. Non-Curiosity sets get a grayscale variant of the cream gradient so the title has a background to sit on.

### 2026-05-24 — Archive task assignments
- Migration v70 adds `task_assignments.archived_at`. New POST endpoints for archive / unarchive. UserTaskDetailPage gets a subtle "Archive" button top-right with a confirmation modal explaining the task leaves the active list but stays under the Archived filter. KidGroupPage gets a 5th Archived status pill that swaps the data source. Archived rows show a gray banner with an Unarchive button on their detail page.

### 2026-05-24 — Award image polish
- Trimmed + squared 5 oversize 1080×1080 award icons (Discovery, Liberty, Fruit of the Spirit, Major, WOW) that were tiny inside their thumbnails due to source-image padding. Baked the trim+square step into `importAwards.js` so fresh installs auto-process new downloads (requires ImageMagick; silently no-ops without it).

### 2026-05-24 — Area-coverage award steps: auto-match + in-page browser modal
- Server now auto-picks the kid's highest-progress enrolled badge in each Area of Discovery (at the award's level) and attaches its `linked_task_set_id` + name + image + progress to area-linked award steps — so Discovery Award rows render with the matched badge's ProgressRing just like specific-badge steps.
- When an area still has no match, the "Find ↗" pill now opens a `BadgeBrowser` modal pre-filtered to that area in the same page (no full-page navigation). Enrolling a badge from the modal navigates to its task page; closing returns to the award.

### 2026-05-24 — Linked-badge steps: progress ring + open-or-enroll
- Server step query now enriches each `linked_badge_id` step with the user's enrollment info (`linked_task_set_id`, `linked_step_count`, `linked_completed_count`) for that badge — so the kid view can render progress without an extra round trip.
- Right-side thumbnail on award steps now behaves smartly:
  - **Assigned**: a `ProgressRing` wraps the badge image with the kid's `n/total` progress; click → `/tasks/:userId/:linkedTaskSetId` of the badge.
  - **Not assigned**: plain ringed thumbnail; click pops `BadgePreviewModal` for that badge, and enrolling navigates straight to the new task page.
- Preview modal lives on `UserTaskDetailPage`; an `onPreviewBadge` callback threads down to every `StepItem` so the same flow works for any award (Liberty, Fruit of the Spirit, Outdoors, STEAM, Life Skills).

### 2026-05-24 — Awards: cumulative levels grouped + badge auto-completion
- **Cumulative steps grouped by level**: `generateAwardSteps` for task_list awards reverts to cumulative (Preschool … awardLevel + the `all` bucket). New `task_steps.level` column tags each step with its source level (`preschool`, `level1`, …, `all`). UserTaskDetailPage's badge/award rendering groups consecutive steps under section headers (Preschool · Penguin, Level 1 · Otter, etc.) for task_list awards. Migration v68's regen now compares full step content (name + level + linkage) instead of just step count, so stale rows from earlier generations get refreshed.
- **Badge auto-completion**: New `server/src/services/awardSync.js` exports `syncLinkedAwardSteps(db, userId, taskSetId)`. After any task_step toggle (complete or undo), if the toggled step's task_set is a badge that's now 100% complete, every award step with `linked_badge_id` pointing at that badge gets an auto-completion row inserted; if the badge drops below 100%, those completions are removed. Called from both branches of the toggle endpoint in `userTasks.js`. Verified end-to-end on Liberty Award: completing the U.S. Constitution badge auto-checks Liberty's "Earn the U.S. Constitution badge" step (1/5), and uncompleting reverts it (0/5).
- **Manual toggle disabled on linked-badge steps**: Server rejects toggle requests on steps with `linked_badge_id` (400 error). Client `StepItem` adds `isAutoLinked` flag — checkbox renders with a dashed border + disabled state, with a tooltip explaining the step auto-completes when the linked badge is finished.

### 2026-05-24 — Awards: per-level only + linked-badge polish (Phases B + C)
- **Non-cumulative task lists**: `generateAwardSteps` for `task_list` awards now emits only the kid's exact level (plus the `all` bucket for STEAM). Each level's data already includes a "Complete all [prior level] requirements." step, so the prior cumulative behavior was redundant. Migration v68 regenerates steps for any award enrollment that hasn't been started yet — Outdoors at L5 went from 37 → 2 steps; Life Skills L5 went 180 → 30.
- **Phase B — linked-badge thumbnails on step rows**: When a step has `linked_badge_id`, the right-side thumbnail shows the actual badge image as a brand-ringed circle, clickable to the badge browser pre-searched by name. When `linked_badge_category` is set (Discovery's area steps), a small "Find ↗" pill deep-links to `/badges/X?type=badge&category=…`. Server `getUserTaskSet` step query enriched with `linked_badge_name` + `linked_badge_image` via a LEFT JOIN.
- **Phase C — admin step edit modal**: New `LinkedBadgePicker` (`client/src/components/awards/LinkedBadgePicker.jsx`) rendered inside the existing step edit modal in `TaskSetDetailPage`. Shows the current linked badge (with thumbnail) or area, with Clear / typeahead-search / area-dropdown controls. Server `StepSchema` gained `linked_badge_id` + `linked_badge_category` fields; create + update step endpoints persist them.

### 2026-05-24 — Unify awards onto standard task_steps
- Awards now generate real `task_steps` on enrollment (just like badges) instead of a custom `award_state` JSON blob + per-type detail pages. The `/tasks/:userId/:taskSetId` page renders awards with the same step rows as badges; settings/tasks shows the step count and the standard edit flow works.
- Migration v67 adds `linked_badge_id` + `linked_badge_category` to `task_steps` so a step can reference a specific badge (e.g. Liberty's "Earn the U.S. Constitution badge") or an area (Discovery's "Earn a badge in Agriculture"). Backfills steps for the 2 existing award enrollments. New shared service `server/src/services/awardSteps.js` generates the step list from any award's `award_type` + `award_config`; used by both the enroll endpoint and the migration backfill.
- Dropped `DiscoveryAwardDetail`, `SpecificBadgesAwardDetail`, `TaskListAwardDetail`. The `AwardDetail` dispatcher now only fires when an award has zero steps (manual / count_at_level / composite), falling back to `GenericAwardDetail` with the description + hint.

### 2026-05-24 — Life Skills Award filled in (180 activities, 6 levels)
- Added the full per-level Life Skills requirements (30 activities each for Preschool / Level 1-5, all sourced from the official CU sub-pages and pasted in by Brian since the pages are member-only). Each non-Preschool level starts with "Complete all [prior level] requirements" to mirror the printed checklist, same as Outdoors. A Level 5 kid sees all 180 steps grouped by level.

### 2026-05-24 — Awards data polish + rename task_set type Award→One-Off
- Fixed three mismatched badge names in award configs: `Pocketknife Safety` → `Pocket Knife Safety`, `Faithfulness` → `Faith/Faithfulness` (Fruit of the Spirit), and `Biographies` (non-existent badge) → an activity row in STEAM.
- Added explicit "Complete all [prior level] requirements." activity at the top of each level (1–5) in the Outdoors Award, mirroring how CU lists per-level requirements.
- Migration v66 renames the `task_sets.type` value `'Award'` → `'One-Off'` (table rebuild, same pattern as v28 for the CHECK constraint). Updated all server + client references. CU-award enrollments now use `category='Curiosity'` and `tags=['Award']` (matching the badge convention) so the settings/tasks filter has a single "Award" tag chip instead of duplicates from type + tag.

### 2026-05-24 — CuriosityUntamed Awards (Phases 1–4)
- **Phase 1 – Scrape + DB**: Migration v64 adds `is_award`, `award_type`, `award_config` to badges; v65 adds `award_state` to task_sets. New `server/scripts/importAwards.js` upserts all 15 CU awards (Discovery, Wow, Liberty, Fruit of the Spirit, Servant's Heart, Make a Difference, Leadership, Outdoors, STEAM, Life Skills, Elizabeth Vicory, Gem, Career Exploration, Cassi Jensen, Major) with images downloaded from the source pages. Each award has an `award_type` (specific_badges / area_coverage / count_at_level / composite / task_list / manual) and a per-type config blob.
- **Phase 2 – Browser UI**: `GET /api/badges` gains a `type` param (badge default / award / all) and a `names` param for bulk lookup. `BadgeBrowser` gets a 3-way pill toggle, hides the Area filter when viewing Awards, and renders an "AWARD" tag on award cards. `BadgePreviewModal` swaps to award-flavored copy ("🏆 Start tracking this award!" + a "How to earn it" summary per award_type).
- **Phase 3 – Discovery Award dashboard**: New `client/src/components/awards/DiscoveryAwardDetail.jsx` renders 9 Areas of Discovery as rows for the kid's enrolled badges at the award's level: 1 match → name + progress ring inline, multiple → dropdown defaulting to highest progress (selection persists via PATCH `/api/users/:userId/awards/:taskSetId/state` → `award_state.area_selection`), none → "Find a badge →" deep link to `/badges/:userId?type=badge&category=…` (BadgeBrowserPage now reads those URL params).
- **Phase 4 – Specific-badges + task-list awards**: `SpecificBadgesAwardDetail` (Liberty, Fruit of the Spirit) and `TaskListAwardDetail` (STEAM, Outdoors) share a row layout: badge steps show a progress ring if enrolled / "Start badge" button (opens `BadgePreviewModal`) if not; activity steps are parent/kid-checkable text rows persisted to `award_state.activity_done[stepKey]`. Outdoors steps accumulate from preschool up to the award's level; STEAM uses an `all` bucket.
- **Dispatcher**: `UserTaskDetailPage` now renders `<AwardDetail>` instead of the steps grid when `taskSet.is_award`. AwardDetail switches on `award_type`; unknown types fall through to a generic placeholder. Enrollment flow tweaks: award task_sets get `category='Award'` and empty tags so the header doesn't show duplicate "Award" pills.

## Session Start: 2026-05-23 (evening)

### 2026-05-23 — Badge images no longer cover ProgressRing progress arc
- On the dashboard + `/kid/:id` overview, CuriosityUntamed badge images sat at the full ring diameter and rendered on top of the SVG, hiding the progress stroke. Inset the children container ~12% so images sit inside the stroke, then split ProgressRing's SVG in two: the `bgColor` fill stays behind the children (so images aren't covered), and the track/progress strokes render on top with `z-10`.

### 2026-05-23 — Move KidTasksPage profile picker below the title
- On `/tasks/:userId` the parent's KidProfilePicker was inline with the ticket counter in the header row. Moved it to its own row beneath the header, matching the layout used by KidChoresPage/KidBankPage. Ticket pill stays top-right.

### 2026-05-23 — Dev ports moved to 4000 / 6010
- `scripts/dev-server.sh` now starts searching at 4000 (was 3001), `scripts/dev-client.sh` at 6010 (was 5174 — skips 6000 which Chrome blocks as the X11 unsafe port). Frees the 3xxx/5xxx ranges for Brian's other local apps. Updated `.claude/launch.json` preview proxy targets + README. Saved port reservations to memory.

### 2026-05-23 — Customizable "Sets & Steps" label
- Mirrored the existing `chores_label` pattern for a new `sets_steps_label` (migration v63, default `'Sets & Steps'`). Threaded it through `GET`/`PATCH /api/family/settings`, `FamilySettingsContext` (`setsStepsLabel` + `updateSetsStepsLabel`), and a second Label row on `SettingsPage` (gated on `useSets`).
- The two places that used the literal string — kid sidebar nav in `Layout.jsx` and the `SettingsTasksPage` `<h1>` — now render `setsStepsLabel`. Verified end-to-end: GET/PATCH return the new field, nav link + heading both flip to "Projects" when the label is changed.

## Session Start: 2026-05-21 (evening)

### 2026-05-21 — Move "Badges" out of Individual Pages into a Sets & Steps button
- Removed the "Badges" NavLink from the parent sidebar's Individual Pages section in `Layout.jsx`.
- Added a "Browse Badges" button (gated on `useBadges`) near the top of `KidTasksPage`.
- Extracted `BadgeBrowserPage` content into a reusable `BadgeBrowser` component (`client/src/components/badges/BadgeBrowser.jsx`) with a `compact` prop for modal usage. Page route is now a thin wrapper.
- `Modal` gained a `size` prop (`md`/`lg`/`xl`). The "Browse Badges" button opens BadgeBrowser inside an `xl` modal; enrolling closes the modal and navigates to the new task set.

### 2026-05-21 — TicketBlast cards tilt like a rocker switch on press
- `KidCard` in `TicketBlast.jsx` now applies a 3D `perspective(600px) rotateY(±18deg)` tilt for ~220ms on click: pressing "−" tilts the left side back/smaller (right side larger); pressing "+" does the inverse. The pressed half also gains a colored background tint to reinforce the rocker feel.

## Session Start: 2026-05-20 (evening)

### 2026-05-20 (continued) — Badge polish, AI content, data fixes, KidTasksPage redesign
- AI-generated 751 badge descriptions via Haiku 4.5 (`server/scripts/generateBadgeDescriptions.js`, ~$0.55 total) and 155 fitting emojis for image-less badges (`generateBadgeEmojis.js`, ~$0.05). Stored in `badges.description` and `badges.emoji`.
- Images: cropped all 596 badge images via ImageMagick trim+crop (`cropBadgeImages.js`) to strip drop shadows + colored level outlines, leaving just the inner content. Crop now runs automatically as part of `importBadges.js`.
- Data fixes (`fixMisattributedBadges.js`): re-parsed badges.json to recover 270 starred requirements that the original scrape had misattributed only to level5 (now promoted to preschool so they apply at all levels) and recovered 1,555+ optionals from level5 unstarred items. Soft-disabled 22 truly-empty badges (Disney parks, etc.) via `is_active = 0`.
- Migrations: v60 (use_badges family toggle), v61 (badges.description), v62 (badges.emoji). 9 canonical Areas of Discovery moved into task_set tags; category collapsed to "Curiosity" for badge sets.
- KidTasksPage redesign: greeting header with avatar + completed-today count + ticket pill; colored-dot filter pills with black-selected state; cards now have a primary category pill top-left, tag icon top-right (flip to back for full tag list), thicker progress ring with lighter track, taller cards in 2→3→4→5-column responsive grid, subtle vertical gradient (level-tinted for badge sets), softer shadow + outline, green ✓ overlay + "★ Done" footer when complete.
- Other UI: badge image fullscreen lightbox renders as circle; BadgePreviewModal flow (View → "I want to start" CTA) replaces forced-pick-on-enroll; existing enrolled badges allow re-enrollment after completion (in-progress check only); KidTasksPage filter shows derived pill options from visible sets and supports click-to-filter from any card pill; KidOverviewPage + DashboardRow + DashboardTable rings show the actual badge image.
- Level color palette: Preschool=red, Level1=yellow, Level2=blue, Level3=green, Level4=grey, Level5=black.
- Deploy: `server/scripts/seed-badges.sql` (3.8 MB) checked in to seed badge/req/opt tables on production with one command.

### 2026-05-20 — CuriosityUntamed Badge Library (Phases 1–3)
- Planned and implemented the full badge library feature: DB migrations v54–v59 (badges, badge_level_requirements, badge_optional_requirements tables; badge_level/max_active_badges on users; badge_id/badge_level on task_sets; is_optional/badge_opt_req_id on task_steps).
- Import script (`server/scripts/importBadges.js`) loads 751 badges, 5,357 level requirements, 9,370 optional requirements, and copies 596 badge images to `data/uploads/badges/`. Categories normalized to 9 canonical Areas of Discovery; "Do Level X requirements…" prefixes stripped from cumulative level reqs.
- New `server/src/routes/badges.js` with GET /api/badges (search + category filter + pagination), GET /api/badges/:id (full detail + optional pool), POST /api/users/:userId/badges/enroll (creates Award task_set + steps), PATCH optional-swap.
- Client: `BadgeBrowserPage` (kid view with search, category pills, badge grid), `BadgeEnrollModal` (optional picker), `SettingsBadgesPage` (parent assigns to kids), `badges.api.js`, `badgeLevels.js` constants.
- `SettingsUserDetailPage` gets Badges section: badge level dropdown (Preschool/Penguin → Level 5/Owl) and max active badges input.
- `UserTaskDetailPage` updated for badge sets: required vs optional step split with section headers, chevron toggle reveals unselected optional pool for swapping, level color pill shown in header.

## Session Start: 2026-05-05 (evening)

### 2026-05-05 — Fix kid terminal stuck on "Connection lost. Reconnecting..." loop
- Diagnosed: `activeConnections` counter in `wsService.js` was incremented before the daily-limit check. The `ws.on('close')` decrement handler isn't attached until later, so kids who hit the early `ws.close(4008, 'Daily time limit reached')` leaked +1 each connect attempt. After 3 leaks, every subsequent connect closed with `4029 Too many connections`, which the client *does* loop on (only `4008`/`1000` are special-cased to stop). Only a server restart cleared the leak.
- Fix: moved the connection-cap check + increment to *after* the daily-limit early-return so the 4008/4001/4029 paths never increment. The 4500 catch path already handles decrement safely via `Math.max(0, ...)`.
- Verified the dev server boots clean with the change (`[ws] WebSocket server ready` in logs, /api/health 200). Live verification of the leak fix needs a real kid login + `claude_time_limit=0` repro, which can't be driven from the dev sandbox.

## Session Start: 2026-05-03 (evening)

### 2026-05-03 — Drop persisted npm-global volume so kid `claude` isn't shadowed by stale binary
- Kid terminals failed with `Permission denied` on `/home/coder/.npm-global/bin/claude` and parent terminals hung at the v2.1.116 splash. Root cause for the kid: the per-user `claude-npm-${userId}` named volume preserved a broken Claude install across the auto-recreate-on-stale-image flow added in `ee7c3cc`, shadowing the freshly-built image binary.
- Removed the `claude-npm-*` bind from `getOrCreateContainer` so `/home/coder/.npm-global` always comes from the image; added a self-heal `chmod +x` to `entrypoint.sh`; documented the non-persistence in `CLAUDE.md` and the `Dockerfile`.
- Deploy: image rebuild + `docker rm -f` of all `dash-*` containers + cleanup of orphaned `claude-npm-*` volumes. Both kid and parent terminals working after the recreate.

## Session Start: 2026-04-11 (evening)

### 2026-04-11 — Fix SettingsUsersPage crash + grant-time heartbeat
- `SettingsUsersPage` used `choresLabel`/`choresLabelLower` in JSX without calling `useFamilySettings()` → `ReferenceError` crashed the whole page. Added the hook call to the component body.
- `KidWorkspace` heartbeat fired `POST /api/claude/heartbeat` every 30 seconds even while the kid was on the "Time's up" lock screen — this added 30 seconds of usage per tick, consuming any time a parent had just granted. Fixed: when `remainingSec <= 0`, the interval now calls `GET /api/claude/daily-remaining` (read-only) instead. When remaining becomes > 0 (parent granted time), it auto-increments `terminalReloadKey` to reconnect the terminal. Updated the "Time's up" screen copy to say the terminal will reconnect automatically.

## Session Start: 2026-04-10 (continued session)

### 2026-04-10 — Auto-detect stale kid containers after image rebuild
- `getOrCreateContainer` now compares the running container's image ID against the current `familydash-claude-code:latest` digest. If stale, it removes and recreates the container automatically (workspace volumes preserved). Updated `CLAUDE.md` with the rebuild deploy process.

### 2026-04-10 — Fix ticket adjustment modal not closing on success
- `QuickTicketAdjust` called `setOpen(false)` which doesn't exist (should be `handleClose()`). The adjustment succeeded but the ReferenceError was caught and displayed as "Failed to adjust tickets." Fixed with a one-line change.

### 2026-04-10 — Multiplayer room system for kid apps
- Built a full multiplayer WebSocket room system so kids can make their apps multiplayer. Three new server files: `roomManager.js` (in-memory room lifecycle, fun name gen, auto-cleanup), `multiplayerWs.js` (WS handler with origin + app validation, reconnect support), and `server/src/sdk/multiplayer.js` (self-contained browser SDK with iPad-hardened reconnection, built-in lobby/player list UI).
- Refactored `wsService.js` and `index.js` to use `noServer` mode for both terminal and multiplayer WebSocket servers with path-based upgrade routing.
- Updated `CLAUDE.md.template` with full multiplayer API docs + complete example game so kids' Claude instances know how to wire up multiplayer.
- SDK served at `/sdk/multiplayer.js` on main domain, apps router, and apps subdomain. CSP updated for `ws:/wss:` connect-src.
- Room names are now server-generated (Color + Place, e.g. "Gold Canyon") to prevent strangers entering bad words.
- CLAUDE.md template explicitly tells Claude not to add name-editing UI. Lobby auto-refreshes room list every 3s.

## Session Start: 2026-04-08 (evening)

### 2026-04-08 — CSP frame-src fix for workspace app tabs
- Opening apps from the KidWorkspace Apps dropdown produced blank iframes because Helmet's CSP on the main dashboard had no explicit `frame-src`, so it fell through to `default-src 'self'` and blocked the cross-origin `apps.straychips.com` subdomain. Launching via `/code-apps` worked because that page is served with its own CSP.
- Added `frameSrc: ["'self'", https://${APPS_HOST}, http://${APPS_HOST}]` to the Helmet directives in `server/src/app.js` (only populated when `APPS_HOST` is set, so dev without a subdomain is unaffected).

### 2026-04-08 — Allow Cloudflare Insights beacon in kid-app CSP
- Cloudflare auto-injects `static.cloudflareinsights.com/beacon.min.js` into HTML responses, which was being blocked on every kid-app page because the CSP set by `serveAppFile` only declared `default-src 'self'` with no explicit `script-src` (landing pages had no CSP at all, which is why they looked fine).
- Extracted the CSP into a `KID_APP_CSP` constant in `server/src/routes/claude.js` and added `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://static.cloudflareinsights.com` plus `connect-src 'self' https://cloudflareinsights.com` so the beacon can load and report.

### 2026-04-08 — Fix Claude daily-usage timezone bug + show remaining time on Apps page
- `server/src/routes/claude.js::todayDate()` was using `new Date().toISOString().slice(0, 10)` which keys the usage row by UTC date. For a container on `TZ=America/Denver`, that meant the counter silently reset at 6 PM MST / 7 PM MDT and kids got a fresh budget in the evening on top of their morning session. Switched to `localDateISO()` from `utils/dateHelpers.js` which honors the container's TZ env. Existing UTC-keyed rows become harmless historical leftovers; today's row starts accumulating at local midnight going forward.
- Extended `GET /api/claude/apps` to include `dailyLimitSeconds` + `dailyRemainingSeconds` per kid (null for parents). `AppsPage.jsx` now renders "{remaining} / {limit} min left" next to each kid's name, colored amber under 10 minutes and red at zero.

### 2026-04-08 — Task-set parent notifications (opt-in per set)
- New per-task-set dropdown "Parent Notifications" in the Edit Set modal (`SettingsTasksPage.jsx`), below Display Mode and above Save. Options: Off (default), On each step completion, On set (final step) completion.
- Migration v49 adds `task_sets.notify_mode` (`off` | `each_step` | `on_completion`, default `off`). Task Set zod schema + POST/PUT endpoints thread it through.
- Migration v50 creates a new `inbox_notifications` table — distinct from the live pending-approval query and from the audit-only activity feed. Rows have a `dismissed_at` timestamp that hides them from the inbox.
- New `server/src/services/notificationService.js` with a small `insertNotification()` helper. `userTasks.js` calls it from the step-completion path:
  - On each auto-approved step completion, if `notify_mode === 'each_step'` and the set didn't just finish, emit a step notification with `remaining` steps left.
  - When the final step closes the set (auto-awarded, not pending parent approval), if `notify_mode` is `each_step` or `on_completion`, emit a set-completion notification with the ticket reward.
  - Approval-required paths are intentionally skipped — the pending-approval item already serves as the notification.
- `GET /api/inbox` and `/api/inbox/count` now include active notifications; new `POST /api/inbox/notifications/dismiss` marks them dismissed. `inbox.api.js` gains `dismissNotifications()`.
- `InboxPage.jsx` + `InboxKidPage.jsx` render a "Notifications" section per kid with dismissible blue rows; `useOfflineInbox` counts them toward the nav badge.
- Client build verified with `vite build`; no errors.

### 2026-04-08 — Customizable "Chores" label
- Added a per-family `chores_label` column (migration v48) and surfaced it through GET/PATCH `/api/family/settings`; defaults to `'Chores'` with a 40-char cap.
- Extended `FamilySettingsContext` to expose `choresLabel` / `choreLabel` (singular derived by stripping trailing 's') plus lowercase variants, and an `updateChoresLabel` setter with optimistic state.
- Added a "Labels" section to `SettingsPage` with a text input that saves the label.
- Threaded the label through every user-facing "Chore(s)" reference I could find: Layout nav links (parent + kid), KidChoresPage heading + completion modal, ChoreList/ChoreHistoryList empty states, ChoreTemplateForm + ChoreTemplateList (titles, tooltips, button labels), SettingsChoresPage (titles, confirms, errors, modals, empty states), SettingsCommonChoresPage, SettingsUserDetailPage (section headers, approval toggle, delete warning), SettingsUsersPage Common Chores card, SettingsTasksPage + TaskSetDetailPage "complicated chores" blurb, DashboardPage/DisplayPage sort options, DashboardRow/DashboardTable progress-ring tooltips, KidOverviewPage legend/labels/tooltips + activity filter, KidTicketsPage ledger filter, FamilyActivityPage filter, InboxPage/InboxKidPage day group headers, RewardsPage "daily chore potential" line, QuickTicketAdjust placeholder, TicketLedger type label + empty state, ParentChoreHistoryPage section heading.
- Server-side activity log strings now pick up the current label via a new `server/src/utils/labels.js` helper used by `chores.js` (complete/uncomplete endpoints, `chores_all_done` milestone) and `inbox.js` (approve path). Historical entries remain as-is — only new logs use the renamed label.
- Client build verified with `vite build`.

### 2026-04-08 — AppsPage card redesign
- Per-kid sections now sort apps by launch count desc and show only the top 3, with a "Show N more" / "Show less" chevron toggle (state tracked in `expandedKids`).
- Dropped the explicit Open button — the whole card is clickable and launches the app.
- Dropped the separate edit pen button — clicking the app icon (when the user has edit rights) opens the edit modal instead.
- Merged the top-right star button into the bottom star counter: the counter is now the toggle for the logged-in user (always rendered, shows count, click stars/unstars).
- `stopPropagation` on the icon and star buttons so they don't also trigger the card-level launch handler.

### 2026-04-08 — Strict routing fix for bare app URLs
- Typing `apps.straychips.com/fox/probe` (no trailing slash) served the app's HTML directly instead of redirecting to `/fox/probe/`, so the browser resolved relative script tags (`state.js`, `game.js`, etc.) against `/fox/` instead of `/fox/probe/` and every file 404'd. Clicking from the landing page or the dashboard worked because those links already include the trailing slash.
- Root cause: `appsRouter` and `subdomainRouter` were created with default `Router()`, which has `strict: false` — so `/:username/:appName/` matched both `/fox/probe/` and `/fox/probe`, and the redirect route never fired.
- Fix: `Router({ strict: true })` on both routers so the no-slash request reaches the redirect handler.

## Session Start: 2026-04-06 (evening)

### 2026-04-06 — App storage works on both origins
- Diagnosed kid app storage 404s: subdomain mounted storage at `/`, but main-domain `appsRouter` only had legacy `/api/claude/apps/...` routes, so no single relative URL worked in both contexts.
- Added `GET/PUT/DELETE /:user/:app/data[/:key]` to `appsRouter` (registered before file-serving wildcard) and added matching `storageLimiter` mount in `app.js`.
- Rewrote CLAUDE.md.template storage section to recommend `./data` relative URLs and removed the brittle pathname-parsing snippet. Note: template change requires `kid-claude` image rebuild + container recreate to land in running kids' workspaces.
- **Subdomain isolation regression fix**: `VITE_APPS_ORIGIN` was never set during the client build, so KidWorkspace iframes were loading kid apps from the main domain (`/apps/...`) instead of `apps.straychips.com`, defeating the subdomain-isolation security work and causing storage divergence between direct browser tabs and the iframe. Added `VITE_APPS_ORIGIN` build ARG to Dockerfile and set it to `https://apps.straychips.com` in docker-compose. Requires `docker compose build && docker compose up -d` to take effect.

## Session Start: 2026-04-06

### 2026-04-06 — Production fixes, FAB quick actions, model selection, landing pages
- **Production deploy fixes**: Removed Docker socket proxy (incompatible with exec hijack); restored direct socket mount with `chmod 666` in entrypoint via `su-exec`; allowed internet on `kid-sandbox` network (Claude Code needs api.anthropic.com); raised container limits (1GB RAM, 500 PIDs) for Claude Code v2.x.
- **Service worker fix**: Added `/apps/` to `navigateFallbackDenylist` and `skipWaiting`/`clientsClaim` so app URLs reach the server instead of being intercepted by the PWA cache.
- **App routing**: Trailing-slash handling for `/:user/:app/`, cache-busting headers on served apps, reload button bumps query param.
- **Public slugs**: Random short word per Claude-enabled user (`fox`, `owl`, `elk`...) for shareable app URLs that don't leak usernames.
- **Container rename**: Containers now named `dash-{family}-{user}` (e.g. `dash-hogan-dhogan`); sanitizer strips "The ___s" pattern; auto-removes legacy `claude-kid-*` containers, volumes persist.
- **Model selection**: Per-user dropdown for Haiku/Sonnet/Opus; passed via `CLAUDE_MODEL` env var with `/tmp/claude` wrapper to override saved preferences.
- **Quick Actions FAB**: Global parent-only floating button (mounted in Layout) → pick a kid → Money / Tickets / App Time. Money opens UnifiedBankDialog, Tickets opens controlled QuickTicketAdjust, App Time grants +15/30/45/60 minutes via new `POST /api/claude/grant-time` endpoint.
- **Refactor**: Extracted FAB into `QuickActionsFab.jsx`; added `controlledOpen`/`onControlledClose` props to `QuickTicketAdjust` removing the off-screen `querySelector('button').click()` hack.
- **User landing pages**: `/{slug}/` route renders a dark-themed HTML page listing all the user's apps with icons, descriptions, and launch counts. Clickable username headers on parent's Apps page open the landing page in a new tab.
- Parents always see Transfer/Withdraw buttons on bank pages regardless of viewed user's settings.
- Hide Claude Code settings toggle and Apps nav link unless family has `claude_access` granted.
- Cleared `--watch-path` to plain `--watch` (Synology Drive metadata was triggering restart loops); fixed `--env-file=../.env` ordering so JWT secrets load and survive restarts.

---

## Session Start: 2026-04-04 (~9:00 AM, ~1 hour)

### 2026-04-04 — KidWorkspace, daily time limits, Docker improvements
- Moved Apps nav link to below Inbox (parent view) and top of kid nav section.
- Added per-kid Claude Code daily time limit setting (default 60 min, configurable 5–480 min in kid settings).
- **KidWorkspace**: Unified fullscreen environment for kids replacing separate ClaudeTerminal/AppViewer. Taskbar (52px) with Terminal tab, up to 3 running app tabs, Apps dropdown, shared daily timer, Exit. Terminal has 4 layout modes: docked tab, floating (draggable+resizable), right panel, bottom panel — toggled via title bar buttons. App tabs have browser-style sub-bar (back/forward/reload/URL). Terminal tab has reload button for crash recovery.
- **Daily time limits**: `claude_daily_usage` table tracks cumulative seconds per kid per day. Workspace heartbeats every 30s to server; WebSocket uses daily remaining for cutoff. Resets each new day.
- **Docker**: Claude Code installed under coder user's npm prefix for auto-update support. Entrypoint script auto-restores `.claude.json` from backup on container creation.

### 2026-04-05 — Parent Claude Code, app data storage, workspace improvements
- Parents can now enable Claude Code for themselves (setting toggle, no time limit, full workspace).
- App URLs use user ID fallback for users without usernames (parents).
- **App storage API**: `app_storage` table for per-app key-value data (high scores, counters, etc). Public GET/PUT/DELETE endpoints. Full documentation in kid's CLAUDE.md template with examples.
- **Apps dropdown**: Search field, favorites section at top, apps grouped by owner with expandable sections, running app indicator dots.
- Auto-reconnect on terminal WebSocket drop, narrower `--watch-path` for dev server.
- App list now DB-driven (always visible even when container is stopped).
- **Security hardening for production:**
  - Family-level `claude_access` gate: CLI tool (`node server/claude-access.js grant/revoke/list`) controls which families can use Claude Code
  - JWT secrets: removed hardcoded fallbacks, production crashes if unset, dev uses random per-run
  - Container network isolation: `kid-sandbox` network (internal, no ICC) in docker-compose
  - Docker socket proxy: `tecnativa/docker-socket-proxy` limits API surface if Node.js compromised
  - Container hardening: `CapDrop ALL` + `no-new-privileges`
  - Subdomain isolation: apps served from `apps.straychips.com` (different origin), virtual host routing in Express, CORS for storage API
  - CSP tightened: `connect-src 'self'`, `frame-src 'none'`, `object-src 'none'` on all served apps
  - Storage scoping: Referer path check prevents cross-app data reads
  - CLAUDE.md watchdog: restored every 60s in entrypoint
  - Rate limiting on container start, WS tickets, storage writes, launch counter
  - WebSocket connection limit: max 3 per kid
  - Removed `allow-popups` from iframe sandbox

---

## Session Start: 2026-04-03

### 2026-04-03 — Turns feature (v1)
- New "Turns" feature for tracking whose turn it is (e.g. pick the movie, choose dinner). DB tables (`turns`, `turn_members`), full CRUD API, settings list page with add modal, detail page with filter (all/kids/parents), drag-to-reorder members, and current-turn checkmark. Sidebar nav link + settings card added.
- Fixed `is_current` rendering bug (SQLite integer `0` rendered literally by React). Added exclude/include functionality: each member has an exclude button, excluded members shown in a dimmed "Excluded" group with a + button to re-include.
- Removed filter (include all/kids/parents) — turns now always include all family members, parents exclude as needed.
- Added visibility setting (everyone/parents only/self only) on turn detail page with segmented control. Pencil icon to edit turn name inline. Dashboard shows visible turns as pill-style cards with the turn name, current member avatar and name. `/api/family/turns/visible` endpoint filters by user role.
- Turn logging: clicking a turn card on dashboard opens a modal showing current turn holder, a "Log Turn" button that records the turn and auto-advances to next person, and a scrollable history list (name + relative date). Turn cards show "Last turn logged: Xd ago" below. New `turn_logs` table, POST `/turns/:id/log` and GET `/turns/:id/logs` endpoints.
- **Claude Code for kids** (feature branch `feature/claude-code`): Per-kid `claude_enabled` toggle in settings. Docker container per kid running Claude Code CLI, managed via `dockerode`. WebSocket relay (`ws`) bridges xterm.js in browser to Docker exec session. Full-screen terminal overlay on kid overview page. OAuth auth (uses parent's subscription). Containers auto-stop after 30min idle. Named volumes persist auth tokens and workspace files.
- **Kid app hosting**: Static files from Docker workspace served at `/apps/:username/:appName/`. Relaxed CSP for inline scripts. Auto-detect folder renames and migrate metadata.
- **Apps page**: Left nav "Apps" link (visible to all). Lists all kid apps grouped by kid. Terminal buttons at top. App cards with emoji icon, description, launch counter, star/favorite system. Kids can edit their own app metadata. "My Favorites" group at top.
- **One-time ticket auth**: WebSocket connections use a short-lived ticket obtained via authenticated HTTP call, avoiding JWT expiry issues on WebSocket upgrades.
- **CLAUDE.md guardrails**: Baked into Docker image — steers kids toward simple HTML Canvas apps, limits file output, encourages incremental building.

---

## Session Start: 2026-03-29 (session 2)

### 2026-03-29 — Eager prefetch, offline everything, balance chart, UI polish
- **Eager prefetch**: `prefetchAllData()` in syncEngine fires immediately after auth (no 2s delay). 3 priority waves: critical (dashboard/family/chores/inbox), important (bank/tickets/rewards), deferred (trophies/overview/activity/recurring/yesterday chores/family activity).
- **Offline**: Trophies, recurring rules, inbox, family activity (today), and balance history all cached in Dexie. Inbox badge reads reactively from cache. InboxPage/InboxKidPage use offline hook. KidTrophiesPage, FamilyActivityPage, KidBankPage all use offline hooks now.
- **Balance chart**: New `GET /accounts/:aid/balance-history` endpoint computes daily closing balances. SVG area chart on KidOverviewPage behind a tab bar (Activity | Balance). Shows current vs peak balance with date. Chart tab persists in localStorage. Balance data cached in Dexie.
- **UI**: Modals centered vertically. Rewards profile picker matches KidProfilePicker scroll/border style. README updated with wave-based prefetch docs.

### 2026-03-29 — Offline recurring rules + README updates
- Recurring rules now cached in Dexie (new `recurringRules` table, version 6). Fetched alongside accounts/pending deposits in `useOfflineBank`, so switching kids on the bank page is instant. KidBankPage no longer does its own separate fetch.
- README updated with Offline Support section describing the Dexie-based offline-first architecture, and Dexie added to the Architecture table.

---

## Session Start: 2026-03-29

### 2026-03-29 — Admin dashboard feature
- Added site-wide admin system: `is_admin` flag on users, `login_logs` table tracking every login (IP, user-agent, timestamp). Admin middleware checks DB directly so revoking is instant.
- Admin dashboard page shows: family count, active families (30d), family table with parent/kid counts, logins per 7 days (normalized per kid), last login time with color-coded activity dots. Security flags surface IPs hitting multiple families and high-frequency bots.
- Admin nav link in sidebar (shield icon, only visible to admins). AdminRoute guard on client. Brian set as admin in local DB.

---

## Session Start: 2026-03-26 ~evening

### 2026-03-26 — Ticket Blast drag-and-drop feature
- Added "Ticket Blast" button at bottom of dashboard (parent-only, when tickets enabled). Clicking it shows a drag-and-drop UI: kid cards with ticket counters and a ticket bucket. Drag tickets from bucket to kids to add, drag off a kid (or to bucket) to remove. Save button commits all deltas at once with optimistic Dexie updates + offline support.
- Ticket blast kid cards now compact (2-col grid on mobile, 3-4 on wider). Each card always has a draggable token so tickets can be removed even below zero. Server ticket adjust endpoint no longer clamps to 0 — negative balances are allowed.
- Kid-to-kid ticket transfers removed — dragging a ticket off a kid (anywhere except back on same card) decrements that kid and animates the ticket flying into the bucket (CSS keyframe animation).
- Simplified Ticket Blast: removed drag-and-drop/bucket, now tap-only (+/- sides of card) with pop/shrink ticket animation. Fullscreen modal on mobile, phone-width on desktop.
- Hamburger icon shows red notification dot when parent has inbox items or kid has pending deposits. Mini card mode now shows orange dot for pending deposits (matching full card mode).
- **Server test suite**: Installed vitest + supertest; extracted Express app into `src/app.js` for testability. 34 tests across auth (register, login, logout, middleware), tickets (adjust +/-, negative balances, validation, role/family isolation), and inbox (list, count, approve with ticket awards, deny, cross-family isolation). All passing against in-memory SQLite.
- **Refactor**: Extracted `assertSameFamily` + `assertAccountOwner` into `utils/assertions.js` (was duplicated in 6 route files). Extracted `localDateISO` into `utils/dateHelpers.js` (was duplicated in 7 files across routes + services). Extracted 37 inline migrations from `db.js` (330 lines) into `db/migrations.js`, leaving `db.js` clean (~30 lines).
- Kid username login is now case-insensitive (COLLATE NOCASE) — no more iPad auto-capitalize issues.
- Task step rows (`/tasks/:userId/:taskSetId`) now have white background in list view.
- KidProfilePicker row scrolls horizontally with hidden scrollbar when too many kids. Chores page keeps ticket count visible (no wrap). Fixed selection ring clipping (padding + switched from box-shadow ring to border).

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

## Session Start: 2026-05-27 evening

### 2026-05-27 — Collapsed-sidebar custom tooltips

**What was done:**
- Added an instant, larger custom tooltip for the desktop sidebar when collapsed (Layout.jsx). Uses event delegation on the aside + a single fixed-position tooltip element so no per-NavLink edits are needed.
- A MutationObserver moves `title` → `data-tip-label` on all aside descendants while collapsed (and restores them on expand), which suppresses the native OS tooltip — `Nav` is recreated each render so re-mounts are handled.
- Added thin `<hr>` group separators that show only when the sidebar is collapsed (replacing the hidden section-header text labels) so Individual Pages and Settings stay visually grouped in icon-only mode.
- Switched the custom tooltip from React state to imperative DOM mutation via a ref — `Nav` is recreated on every Layout render, so a state-driven re-render was unmounting/remounting NavLinks between `mousedown` and `mouseup`, silently swallowing real clicks. Now hovering doesn't re-render.
- Parameterized `<Nav collapsed />` so the mobile drawer keeps full-width left-aligned links regardless of the desktop sidebar's collapsed state.
- Bumped divider spacing with `!mt-3 !mb-3` to win against the parent `space-y-1` cascade.
- Made the dark-mode hover visible on nav links: `dark:hover:bg-gray-700` (was `gray-800`, same as the aside's own bg).

**Files changed:**
- `client/src/components/shared/Layout.jsx`
