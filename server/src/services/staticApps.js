// Family Apps — hand-written HTML apps that live in the repo instead of inside
// a kid's Claude Code container. They're baked into the server image (the
// Dockerfile does `COPY server/ ./server/`), so they survive container rebuilds
// and still work when Docker isn't running at all.
//
// Layout:
//   server/static-apps/<slug>/index.html   (required)
//   server/static-apps/<slug>/app.json     (optional metadata)
//   server/static-apps/<slug>/anything...  (assets, served relative)
//
// app.json shape (all fields optional):
//   { "name": "Chore Roulette", "description": "Spin for a chore", "icon": "🎲", "order": 1 }
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STATIC_APPS_DIR = path.join(__dirname, '..', '..', 'static-apps');

// URL namespace these are served under: /apps/family/<slug>/
export const FAMILY_APPS_SLUG = 'family';

const isValidSlug = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9_-]*$/i.test(s);

// Cached in production (files can't change without a redeploy); re-read every
// call in dev so dropping in a new folder shows up on refresh.
let cache = null;

export function listStaticApps() {
  if (cache && process.env.NODE_ENV === 'production') return cache;

  let entries;
  try {
    entries = fs.readdirSync(STATIC_APPS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const apps = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidSlug(entry.name)) continue;
    const dir = path.join(STATIC_APPS_DIR, entry.name);
    if (!fs.existsSync(path.join(dir, 'index.html'))) continue;

    let meta = {};
    try {
      meta = JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'));
    } catch { /* no app.json, or malformed — fall back to defaults */ }

    apps.push({
      slug: entry.name,
      name: typeof meta.name === 'string' && meta.name ? meta.name : entry.name.replace(/[-_]/g, ' '),
      description: typeof meta.description === 'string' ? meta.description : '',
      icon: typeof meta.icon === 'string' && meta.icon ? meta.icon : null,
      order: Number.isFinite(meta.order) ? meta.order : 999,
    });
  }

  apps.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  cache = apps;
  return apps;
}

// Resolve a request path inside a static app to an absolute file path.
// Returns null for unknown apps or anything that escapes the app directory.
export function resolveStaticAppFile(slug, filePath) {
  if (!isValidSlug(slug)) return null;

  const appDir = path.join(STATIC_APPS_DIR, slug);
  const resolved = path.resolve(appDir, filePath || 'index.html');

  // Containment check — blocks ../ traversal and absolute paths alike
  if (resolved !== appDir && !resolved.startsWith(appDir + path.sep)) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;

  return resolved;
}
