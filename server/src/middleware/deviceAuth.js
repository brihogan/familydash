import crypto from 'crypto';
import db from '../db/db.js';

// Device tokens authenticate wearable / embedded read clients (the Garmin
// "FamDash" app) without the full JWT login flow. The token's value IS the
// credential — same trust model as the TRMNL webhook URL — so it's only ever
// stored hashed (sha-256) and compared by hash lookup, never kept in plaintext.
//
// A token with user_id = NULL and scope = 'read' is family-wide read access
// (Phase 1). Per-user write tokens (user_id set, scope 'read,write') are the
// planned Phase 2 path; requireDeviceToken('write') already gates for them.

export function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

/**
 * Mint a new device token, persist only its hash, and return the PLAINTEXT once.
 * The caller must surface the plaintext to the user immediately — it can never
 * be recovered after this returns.
 * @param {{familyId:number, userId?:number|null, scope?:string, label?:string}} opts
 * @returns {{id:number|bigint, token:string}}
 */
export function createDeviceToken({ familyId, userId = null, scope = 'read', label = '' }) {
  const raw = 'fd_' + crypto.randomBytes(24).toString('hex'); // fd_ + 48 hex chars
  const info = db.prepare(
    `INSERT INTO device_tokens (family_id, user_id, token_hash, scope, label)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(familyId, userId, hashToken(raw), scope, label || '');
  return { id: info.lastInsertRowid, token: raw };
}

/**
 * Express middleware factory. Requires a valid, non-revoked device token whose
 * scope includes `requiredScope`, presented via the `X-Api-Key` header (or a
 * `?key=` query param as a fallback). Attaches
 * `req.device = { tokenId, familyId, userId, scopes }`.
 */
export function requireDeviceToken(requiredScope = 'read') {
  return (req, res, next) => {
    const presented = req.get('X-Api-Key') || req.query.key;
    if (!presented) return res.status(401).json({ error: 'Missing device API key.' });

    const row = db.prepare(
      `SELECT id, family_id, user_id, scope FROM device_tokens
       WHERE token_hash = ? AND revoked_at IS NULL`,
    ).get(hashToken(presented));
    if (!row) return res.status(401).json({ error: 'Invalid device API key.' });

    const scopes = row.scope.split(',').map((s) => s.trim()).filter(Boolean);
    if (!scopes.includes(requiredScope)) {
      return res.status(403).json({ error: `Token lacks '${requiredScope}' scope.` });
    }

    db.prepare(`UPDATE device_tokens SET last_used_at = datetime('now') WHERE id = ?`).run(row.id);
    req.device = { tokenId: row.id, familyId: row.family_id, userId: row.user_id, scopes };
    next();
  };
}
