import crypto from 'node:crypto';
import { HttpError } from '../errors.js';
import { hashToken } from './tokens.js';

export const digits = (v) => String(v ?? '').replace(/\D+/g, '');

// Two phone numbers are the same when their digits match, or when the last nine digits match
// (a number written with and without its country code).
export function samePhone(a, b) {
  const da = digits(a);
  const db = digits(b);
  if (da.length < 7 || db.length < 7) return false;
  if (da === db) return true;
  return da.length >= 9 && db.length >= 9 && da.slice(-9) === db.slice(-9);
}

export const maskPhone = (v) => {
  const d = digits(v);
  return d.length > 4 ? `••••${d.slice(-4)}` : '••••';
};

// The number in the form text-message providers want: digits with a leading +.
export const toE164 = (v) => `+${digits(v)}`;

const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;
const codeHash = (id, code) => hashToken(`${id}:${code}`);
const invalid = () => new HttpError(400, 'INVALID_CODE', 'That code is not correct or has expired. Ask for a new one.');

// Makes a fresh six-digit code for a phone. Older unused codes for the same purpose stop working.
export async function createCode(q, config, { purpose, phone, driverId = null, userId = null }) {
  const p = digits(phone);
  const recent = (
    await q.query(`SELECT count(*)::int AS n FROM sms_codes WHERE phone = $1 AND created_at > now() - interval '1 hour'`, [p])
  ).rows[0].n;
  if (recent >= MAX_CODES_PER_HOUR) {
    throw new HttpError(429, 'TOO_MANY_CODES', 'Too many codes were requested for this number. Try again in an hour.');
  }
  await q.query(`UPDATE sms_codes SET consumed_at = now() WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL`, [p, purpose]);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const id = crypto.randomUUID();
  await q.query(
    `INSERT INTO sms_codes (id, purpose, phone, driver_id, user_id, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + $7::interval)`,
    [id, purpose, p, driverId, userId, codeHash(id, code), `${config.smsCodeTtlMinutes} minutes`],
  );
  return { id, code };
}

// Checks a code (by its id, or the newest one for a phone) and uses it up. A wrong guess counts against the
// code, which locks after a few. Run on the database itself, not inside a transaction that may roll back,
// so a wrong guess is always remembered.
export async function verifyCode(db, { purpose, id, phone, code, consume = true }) {
  const row = id
    ? (await db.query('SELECT * FROM sms_codes WHERE id = $1 AND purpose = $2', [id, purpose])).rows[0]
    : (
        await db.query(
          `SELECT * FROM sms_codes WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
          [digits(phone), purpose],
        )
      ).rows[0];
  if (!row || row.consumed_at || new Date(row.expires_at) <= new Date() || row.attempts >= MAX_ATTEMPTS) throw invalid();

  const given = Buffer.from(codeHash(row.id, String(code).trim()));
  const expected = Buffer.from(row.code_hash);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    await db.query('UPDATE sms_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    throw invalid();
  }
  if (!consume) return row; // only checking: the code stays usable for the real step
  const used = await db.query('UPDATE sms_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id', [row.id]);
  if (!used.rows.length) throw invalid();
  return row;
}

// "Remember this phone": a token the app keeps, so a verified phone can sign in without a code until it expires.
export async function createTrustedDevice(q, config, userId) {
  const raw = crypto.randomBytes(32).toString('base64url');
  await q.query(
    `INSERT INTO trusted_devices (user_id, token_hash, expires_at) VALUES ($1, $2, now() + $3::interval)`,
    [userId, hashToken(raw), `${config.trustedDeviceDays} days`],
  );
  return raw;
}

export async function checkTrustedDevice(q, userId, raw) {
  const { rows } = await q.query(
    `UPDATE trusted_devices SET last_used_at = now()
      WHERE token_hash = $1 AND user_id = $2 AND expires_at > now() RETURNING id`,
    [hashToken(raw), userId],
  );
  return rows.length > 0;
}
