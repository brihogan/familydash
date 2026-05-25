# Production Deployment — Badge Library Overhaul (commit 76bfdb7)

This deploys the May-25 work to `dash.straychips.com` (miniserver). The
moving parts are: schema migrations (v72-v74), 233 new badge images, an
updated `CuriosityUntamed/badges.json` source file, refreshed award
configs, and one soft-delete of a duplicate badge.

**Prod context refresher**
- Host: miniserver, repo at `~/familydash` (adjust path if yours differs)
- Service: `app` (container `family-dashboard`)
- Container WORKDIR: `/app`; DB at `/data/family.db`; uploads at `/data/uploads/`
- `sqlite3` CLI is NOT installed in the container — use `node -e "..."`
  with `better-sqlite3` for any DB inspection

## 1. Pull source (miniserver shell)

```bash
cd ~/familydash
git pull origin main
git log --oneline -1   # should show 76bfdb7
```

## 2. Restart the container so migrations run

Migrations v72 (`badges.scraped_at`), v73 (`task_steps.linked_task_set_id`),
and v74 (`badge_optional_requirements.level`) auto-apply on container boot
via `runMigrations()` in `server/index.js`.

```bash
docker compose restart app
docker compose logs --tail 30 app | grep -i migration   # confirm clean boot
```

Verify the schema:

```bash
docker compose exec -w /app/server app node -e "
import('better-sqlite3').then(({ default: Database }) => {
  const db = new Database('/data/family.db', { readonly: true });
  console.log('badges cols:',  db.prepare('PRAGMA table_info(badges)').all().map(c => c.name).join(','));
  console.log('steps cols:',   db.prepare('PRAGMA table_info(task_steps)').all().map(c => c.name).join(','));
  console.log('opts cols:',    db.prepare('PRAGMA table_info(badge_optional_requirements)').all().map(c => c.name).join(','));
});
"
```

Expect to see `scraped_at` on badges, `linked_task_set_id` on task_steps,
and `level` on badge_optional_requirements.

## 3. Sync badge images (233 new files in the repo)

The repo now contains 829 badge images at `data/uploads/badges/`. The
prod container's `/data` is a Docker volume — not populated from the
repo. Copy the new ones in:

```bash
docker compose cp data/uploads/badges/. app:/data/uploads/badges/
docker compose exec app sh -c 'ls /data/uploads/badges/ | wc -l'
# expect ~844 (829 badges + 15 awards)
```

`docker compose cp` overwrites same-named files. The fresh crops for
Shakespeare/Big Cats/Star Trek/Steampunk + the 233 new images will all
land.

## 4. Sync the `CuriosityUntamed/` source data

This folder lives OUTSIDE the repo (sibling to it on your laptop) and is
where the importers read from. Need to copy it in:

```bash
# From your laptop, ship CU sibling-folder up to miniserver
rsync -av --delete \
  /Users/bhogan/SynologyDrive/Code/CuriosityUntamed/ \
  miniserver:~/CuriosityUntamed/

# Then on miniserver, place it where the importer expects (sibling of repo)
ls ~/CuriosityUntamed/badges.json   # confirm it landed
```

The importer resolves `../../../CuriosityUntamed/badges.json` relative to
`server/scripts/`, so the host path `~/CuriosityUntamed/` is sibling to
`~/familydash/` and gets mounted at `/CuriosityUntamed/` inside the
container via `docker-compose.yml`. **If your compose file doesn't already
bind-mount this path, add:**

```yaml
# docker-compose.yml under app: volumes:
- ~/CuriosityUntamed:/CuriosityUntamed:ro
```

Then `docker compose up -d app` to apply the mount.

## 5. Refresh badge data in the DB

`importBadges.js` upserts every badge from `badges.json`, clearing and
re-inserting each badge's level + optional requirements (so today's
`stripLevelRef` improvements take effect on every existing badge). Safe
to run repeatedly.

```bash
docker compose exec -w /app/server app node scripts/importBadges.js
# Expect a summary at the end. Library should grow from ~766 → ~847 rows.
```

## 6. Refresh award configs

`importAwards.js` upserts the 15 award badges with the latest configs
(STEAM Man Made Wonders → `'*'` cross-area, Biography is now a badge_category
slot, etc.). Also re-crops + re-squares award images.

```bash
docker compose exec -w /app/server app node scripts/importAwards.js
```

## 7. Soft-delete the duplicate Marshmallow badge

`marshmallow-badge-2` (a CU dupe of `marshmallow-badge` with a stale
"OWLS –" extra starred req) was removed from `badges.json` earlier
today, but `importBadges.js` only inserts/updates — it doesn't delete
slugs that disappear from the source. Manually hide it:

```bash
docker compose exec -w /app/server app node -e "
import('better-sqlite3').then(({ default: Database }) => {
  const db = new Database('/data/family.db');
  const r = db.prepare(\"UPDATE badges SET is_active=0 WHERE slug='marshmallow-badge-2'\").run();
  console.log('rows hidden:', r.changes);
});
"
```

## 8. (Optional) Regenerate stale task_set steps

If any kid is enrolled in a badge whose library data we fixed (Math is
the only known one — its original text had cross-reference fragments
like "and 2."), their existing `task_steps` rows are snapshots from
enrollment time and don't auto-refresh. To rebuild them from the now-
clean library:

```bash
docker compose exec -w /app/server app node -e "
import('better-sqlite3').then(({ default: Database }) => {
  const db = new Database('/data/family.db');
  // Find any active enrollment in the Math badge (slug='mathematics-badge')
  const taskSets = db.prepare(\`
    SELECT ts.id, ts.badge_level FROM task_sets ts
    JOIN badges b ON b.id = ts.badge_id
    WHERE b.slug='mathematics-badge' AND ts.is_active=1
  \`).all();
  console.log('Math enrollments to refresh:', taskSets.length);
  // For each, regenerate steps from the current library.
  const LEVEL_ORDER = ['preschool','level1','level2','level3','level4','level5'];
  for (const ts of taskSets) {
    const lvls = LEVEL_ORDER.slice(0, LEVEL_ORDER.indexOf(ts.badge_level) + 1);
    const ph = lvls.map(() => '?').join(',');
    const raw = db.prepare(\`
      SELECT text FROM badge_level_requirements
      WHERE badge_id=(SELECT id FROM badges WHERE slug='mathematics-badge')
        AND level IN (\${ph}) ORDER BY sort_order ASC
    \`).all(...lvls);
    const seen = new Set();
    const required = raw.filter(r => { const k=(r.text||'').replace(/\\s+/g,' ').trim().toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });
    const prevOpts = db.prepare(\"SELECT name, badge_opt_req_id FROM task_steps WHERE task_set_id=? AND is_optional=1 AND is_active=1\").all(ts.id);
    db.transaction(() => {
      db.prepare(\"DELETE FROM task_step_completions WHERE task_set_id=?\").run(ts.id);
      db.prepare(\"DELETE FROM task_steps WHERE task_set_id=?\").run(ts.id);
      const ins = db.prepare(\"INSERT INTO task_steps (task_set_id, name, description, sort_order, is_optional, badge_opt_req_id, require_input, input_prompt) VALUES (?, ?, '', ?, ?, ?, 1, 'How did you complete this step?')\");
      let o=0;
      for (const r of required) ins.run(ts.id, r.text, o++, 0, null);
      for (const op of prevOpts)  ins.run(ts.id, op.name, o++, 1, op.badge_opt_req_id);
    })();
    console.log('refreshed task_set', ts.id);
  }
});
"
```

Award task sets (Outdoors / Liberty / Fruit of Spirit / STEAM / Discovery /
etc.) are handled automatically by **migration v68** every time the
container restarts — it regenerates steps for any award enrollment with
zero completions. Kids with completions are intentionally not touched
(to avoid losing in-progress state).

## 9. Sanity check

Open `https://dash.straychips.com` in a logged-in browser and verify:

- Browse Badges → toggle **New** pill → ~80 freshly-added badges show up
  (the 81 from today's scrape, dated 2026-05-25)
- Browse Badges → toggle **Picked** pill → only the kid's enrolled
  badges show (emerald border + ✓ corner)
- A Shakespeare / Star Trek / Steampunk / Charcuterie card → the cropped
  image renders without the colored level ring
- `tasks/<kid>/<wow-task-set>` → live count progress + completed-badge
  medallions (replaces the static "How to earn it" description)
- `tasks/<kid>/<steam-task-set>` → 15 steps with proper auto-pick on
  category rows, "Pick ↗" buttons on Man Made Wonders / outdoor science /
  Biography rows, Swap pills on auto-picked slots
- Math badge (if enrolled) → clean required steps (no "and 2." fragments),
  level-scoped optional pool (7 items at L5, not 52), sub-bullets render
  on separate lines

## 10. (Optional) Bump max-active-badges on existing kids

The cap defaults to 3 but accepts up to 50 now. If you want to raise it
for everyone:

```bash
docker compose exec -w /app/server app node -e "
import('better-sqlite3').then(({ default: Database }) => {
  const db = new Database('/data/family.db');
  const r = db.prepare(\"UPDATE users SET max_active_badges=50 WHERE max_active_badges<50\").run();
  console.log('users bumped:', r.changes);
});
"
```

Or do it per-kid via Settings → User Detail in the UI.

---

## What you can safely skip on prod

These are dev-only artifacts and DON'T need to deploy:

- `server/public.stale-2026-05-20/` (renamed-out-of-the-way build, .gitignored)
- `/tmp/cu-*` files (scrape sink output, dev-only)
- The `/api/_scrape-sink` endpoint is gated by `NODE_ENV !== 'production'`
  in `app.js` — won't be exposed even though the code is committed.
