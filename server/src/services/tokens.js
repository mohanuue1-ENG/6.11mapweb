import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { unauthorized, forbidden } from '../errors.js';

const ISSUER = '611-drive-gps';

export const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// Short-lived access token. It carries no authority by itself: the auth
// middleware reloads the user on every request, so role, company and status
// always come from the database.
export function signAccessToken(config, userId) {
  return jwt.sign({}, config.jwtAccessSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    expiresIn: config.accessTokenTtlSeconds,
  });
}

export function verifyAccessToken(config, token) {
  try {
    const payload = jwt.verify(token, config.jwtAccessSecret, { algorithms: ['HS256'], issuer: ISSUER });
    return payload.sub;
  } catch {
    throw unauthorized('Invalid or expired access token');
  }
}

// Like verifyAccessToken, and also returns when the token expires (seconds since epoch).
export function verifyAccessTokenDetailed(config, token) {
  try {
    const payload = jwt.verify(token, config.jwtAccessSecret, { algorithms: ['HS256'], issuer: ISSUER });
    return { userId: payload.sub, expiresAt: payload.exp };
  } catch {
    throw unauthorized('Invalid or expired access token');
  }
}

// Creates a refresh token row and returns the raw token (shown to the client once).
export async function issueRefreshToken(q, config, { userId, familyId, meta, maxExpiresAt }) {
  const raw = crypto.randomBytes(48).toString('base64url');
  let expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  // A session never outlives its cap, however often it is used.
  if (maxExpiresAt && maxExpiresAt < expiresAt) expiresAt = maxExpiresAt;
  await q.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, familyId ?? crypto.randomUUID(), hashToken(raw), expiresAt, meta?.userAgent ?? null, meta?.ip ?? null],
  );
  return raw;
}

// Loads a user with company status. Returns null when the user does not exist.
export async function loadUser(q, userId) {
  const { rows } = await q.query(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.company_id,
            c.name AS company_name, c.status AS company_status
       FROM users u LEFT JOIN companies c ON c.id = u.company_id
      WHERE u.id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

// Throws unless the account (and its company) may currently use the platform.
export function assertAccountUsable(user) {
  if (!user) throw unauthorized('Account no longer exists');
  if (user.status !== 'active') throw forbidden('This account is disabled');
  if (user.role !== 'SUPER_ADMIN' && user.company_status !== 'active') {
    throw forbidden('This company account is not active');
  }
}

// Exchanges a refresh token for a new one (rotation). Presenting a token that
// was already rotated or revoked revokes its whole family: it means the token
// was copied, so every session descended from it is closed.
export async function rotateRefreshToken(db, config, raw, meta) {
  const outcome = await db.tx(async (q) => {
    const { rows } = await q.query(
      `SELECT id, user_id, family_id, expires_at, revoked_at
         FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [hashToken(raw)],
    );
    const row = rows[0];
    if (!row) return { error: 'unknown' };
    if (row.revoked_at) return { error: 'reused', familyId: row.family_id };
    if (new Date(row.expires_at) <= new Date()) return { error: 'expired' };

    const user = await loadUser(q, row.user_id);
    if (!user || user.status !== 'active' || (user.role !== 'SUPER_ADMIN' && user.company_status !== 'active')) {
      return { error: 'unusable', familyId: row.family_id, user };
    }

    // A driver's session lasts at most the verification period (30 days) from when the code was entered,
    // however often the app is used; after that they sign in and are verified again.
    let maxExpiresAt = null;
    if (user.role === 'DRIVER' && config.driverCodeLogin) {
      const origin = (await q.query('SELECT min(created_at) AS t FROM refresh_tokens WHERE family_id = $1', [row.family_id])).rows[0].t;
      maxExpiresAt = new Date(new Date(origin).getTime() + config.trustedDeviceDays * 24 * 60 * 60 * 1000);
      if (maxExpiresAt <= new Date()) return { error: 'expired', familyId: row.family_id };
    }

    await q.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);
    const refreshToken = await issueRefreshToken(q, config, { userId: user.id, familyId: row.family_id, meta, maxExpiresAt });
    return { user, refreshToken };
  });

  if (outcome.error) {
    if (outcome.familyId) await revokeFamily(db, outcome.familyId);
    if (outcome.error === 'unusable') assertAccountUsable(outcome.user);
    throw unauthorized('Invalid or expired refresh token');
  }
  return outcome;
}

export async function revokeFamily(q, familyId) {
  await q.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [familyId]);
}

// Logout: closes the session the token belongs to. Unknown tokens are ignored.
export async function revokeByToken(q, raw) {
  const { rows } = await q.query('SELECT family_id FROM refresh_tokens WHERE token_hash = $1', [hashToken(raw)]);
  if (rows[0]) await revokeFamily(q, rows[0].family_id);
}

export async function revokeAllForUser(q, userId) {
  await q.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}
