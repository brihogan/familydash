# Family Apps

Hand-written HTML apps that show up in the **Family Apps** section at the top of
the Apps page. Unlike kid apps, these live in the repo instead of inside a Claude
Code container — so they survive container rebuilds, deploy with `git`, and work
even when Docker isn't running.

## Adding one

```
server/static-apps/<slug>/
  index.html      # required — the app entry point
  app.json        # optional — display metadata
  ...             # any other assets, referenced with relative paths
```

`<slug>` must be `[a-z0-9][a-z0-9_-]*`. It becomes the URL:
`/apps/family/<slug>/`.

`app.json` (all fields optional):

```json
{
  "name": "Chore Roulette",
  "description": "Spin to pick tonight's chore",
  "icon": "🎲",
  "order": 1
}
```

Without `app.json` the card falls back to the slug (dashes → spaces) and a
rocket icon. `order` controls sort position (default 999, then alphabetical).

New folders are picked up on the next page load in dev; in production the list
is cached, so a redeploy (which restarts the server) is what publishes them.

## Notes

- Served under the same relaxed CSP as kid apps: inline scripts/styles and
  `eval` are allowed, but network egress is limited to the same origin.
  **No CDN scripts or remote fonts** — inline everything or add it as a local
  asset in the app folder.
- Opened in the standard AppViewer iframe (`sandbox="allow-scripts
  allow-same-origin allow-forms"`), so `localStorage` works.
- No launch counter or stars — those are keyed to an owning user, and these
  apps have none.
- Baked into the server image by `COPY server/ ./server/` in the root
  `Dockerfile`. No extra deploy step.
