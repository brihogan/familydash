/**
 * Crop badge images so only the inner content is visible — no drop shadow,
 * no colored level outline. Three-pass:
 *   1. `-background white -alpha remove -alpha off`  flattens transparent
 *      PNGs onto white so the trim step sees the colored ring's outer edge
 *      instead of just the alpha boundary (without this, newer 2024+ PNG
 *      badges like Shakespeare / Star Trek / Big Cats kept their full ring
 *      because alpha-trim only removed the empty corners). No-op on opaque
 *      JPGs.
 *   2. `-fuzz 6% -trim`  removes the white/shadow padding, auto-centering
 *      the badge in its frame (fixes the down-right offset of the source).
 *   3. `-crop 70%x70%`   center-crops to drop the colored outline ring.
 *
 * Idempotent: skips files whose smallest dimension is already <= 320px
 * (assumes 500x500 originals; cropped output is ~230x230).
 *
 * Usage:
 *   node server/scripts/cropBadgeImages.js [--dir=<dir>] [--percent=70] [--force]
 *   --force re-crops everything regardless of size (use when re-processing
 *           badges that were cropped too tightly by an older pipeline).
 *
 * Requires ImageMagick (`magick` on PATH).
 */

import { readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args    = process.argv.slice(2);
const cropPct = parseInt(args.find(a => a.startsWith('--percent='))?.split('=')[1] || '70', 10);
const fuzz    = args.find(a => a.startsWith('--fuzz='))?.split('=')[1]    || '6%';
const force   = args.includes('--force');
const dataDir = process.env.DATABASE_PATH ? dirname(process.env.DATABASE_PATH) : join(__dirname, '../../data');
const defaultDir = join(dataDir, 'uploads', 'badges');
const targetDir  = args.find(a => a.startsWith('--dir='))?.split('=')[1] || defaultDir;

try { execSync('which magick', { stdio: 'ignore' }); }
catch { console.error('ImageMagick not found. Install with: brew install imagemagick'); process.exit(1); }

console.log(`Trim+crop ${targetDir}/  (fuzz=${fuzz}, post-trim crop=${cropPct}% center)…`);

// Skip award images: `importAwards.js` does its own trim+square (different
// geometry from badges — full-canvas medallions, not centered-with-ring), and
// re-applying the badge crop here destroys them.
const files = readdirSync(targetDir).filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f) && !f.startsWith('award-'));
console.log(`Found ${files.length} image files (award-* skipped).`);

let cropped = 0;
let skipped = 0;
let failed  = 0;

for (const file of files) {
  const path = join(targetDir, file);
  try {
    const dim = execSync(`magick identify -format "%w %h" "${path}"`, { encoding: 'utf8' }).trim().split(/\s+/);
    const w = parseInt(dim[0], 10);
    const h = parseInt(dim[1], 10);
    if (!force && Math.min(w, h) <= 320) { skipped++; continue; }

    const tmp = path + '.tmp';
    const result = spawnSync('magick', [
      path,
      // Flatten transparent PNGs to white so the trim step catches the ring's
      // outer edge (no-op on opaque images — see header comment).
      '-background', 'white', '-alpha', 'remove', '-alpha', 'off',
      '-fuzz', fuzz,
      '-trim', '+repage',
      '-gravity', 'center',
      '-crop', `${cropPct}%x${cropPct}%+0+0`, '+repage',
      tmp,
    ]);
    if (result.status !== 0) {
      console.error(`  ! ${file}: ${result.stderr?.toString().slice(0, 100)}`);
      failed++;
      continue;
    }
    execSync(`mv "${tmp}" "${path}"`);
    cropped++;
    if (cropped % 50 === 0) console.log(`  [${cropped}] ${file}`);
  } catch (err) {
    failed++;
    console.error(`  ! ${file}: ${err.message?.slice(0, 100)}`);
  }
}

console.log('---');
console.log(`Cropped: ${cropped}   Skipped (already ≤320px): ${skipped}   Failed: ${failed}`);
