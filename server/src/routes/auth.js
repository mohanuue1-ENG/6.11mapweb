import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { asyncHandler, parse, unauthorized, forbidden, conflict } from '../errors.js';
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeByToken,
  loadUser,
  assertAccountUsable,
} from '../services/tokens.js';
import { audit } from '../services/audit.js';
import { hashToken, revokeAllForUser } from '../services/tokens.js';
import { HttpError } from '../errors.js';

const REFRESH_COOKIE = 'rt';
const COOKIE_PATH = '/api/v1/auth';

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const email = z.string().trim().toLowerCase().email().max(254);
// bcrypt only reads the first 72 bytes, so longer passwords are rejected rather than silently truncated.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 bytes');

const registerSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  adminName: z.string().trim().min(2).max(200),
  email,
  password,
  phone: optionalText(40),
  dotNumber: optionalText(40),
  mcNumber: optionalText(40),
  address: optionalText(500),
});

const loginSchema = z
  .object({
    email: email.optional(),
    phone: z.string().trim().min(5).max(40).optional(),
    password: z.string().min(1).max(200),
  })
  .refine((v) => v.email || v.phone, { message: 'Email or phone is required', path: ['email'] });

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    companyId: user.company_id,
    companyName: user.company_name ?? null,
  };
}

export function authRoutes({ db, config, authenticate, mailer }) {
  const router = Router();

  // A fixed hash to compare against when the account does not exist, so the
  // response time does not reveal which emails are registered.
  const dummyHash = bcrypt.hashSync('not-a-real-password', config.bcryptRounds);

  const meta = (req) => ({ ip: req.ip, userAgent: (req.get('user-agent') || '').slice(0, 300) || null });
  const isMobile = (req) => (req.get('x-client-type') || '').toLowerCase() === 'mobile';

  const cookieOptions = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: COOKIE_PATH,
  };

  // Web clients get the refresh token in an httpOnly cookie that JavaScript
  // cannot read. The mobile app (X-Client-Type: mobile) gets it in the body
  // and keeps it in the device's secure storage.
  function sendSession(req, res, status, user, refreshToken) {
    const body = {
      accessToken: signAccessToken(config, user.id),
      expiresIn: config.accessTokenTtlSeconds,
      user: publicUser(user),
    };
    if (isMobile(req)) {
      body.refreshToken = refreshToken;
    } else {
      res.cookie(REFRESH_COOKIE, refreshToken, {
        ...cookieOptions,
        maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
      });
    }
    res.status(status).json(body);
  }

  // Reads the refresh token. A cookie is only honoured for requests from our
  // own website, which stops other sites from driving a logged-in browser.
  function readRefreshToken(req) {
    if (typeof req.body?.refreshToken === 'string' && req.body.refreshToken) return req.body.refreshToken;
    const fromCookie = req.cookies?.[REFRESH_COOKIE];
    if (!fromCookie) return null;
    const origin = req.get('origin');
    if (origin && !config.clientUrls.includes(origin)) throw forbidden('Origin not allowed');
    return fromCookie;
  }

  // POST /auth/register — creates a company and its first Company Admin.
  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      if (!config.allowSelfRegistration) {
        throw new HttpError(403, 'REGISTRATION_CLOSED', 'New companies join by request. Use Request access.');
      }
      const input = parse(registerSchema, req.body);
      const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);

      const { userId, refreshToken } = await db.tx(async (q) => {
        const existing = await q.query('SELECT 1 FROM users WHERE lower(email) = $1', [input.email]);
        if (existing.rows.length) throw conflict('An account with this email already exists');

        const company = await q.query(
          `INSERT INTO companies (name, contact_email, contact_phone, address, dot_number, mc_number)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [input.companyName, input.email, input.phone, input.address, input.dotNumber, input.mcNumber],
        );
        const companyId = company.rows[0].id;

        const user = await q.query(
          `INSERT INTO users (company_id, role, name, email, phone, password_hash, last_login_at)
           VALUES ($1, 'COMPANY_ADMIN', $2, $3, NULL, $4, now()) RETURNING id`,
          [companyId, input.adminName, input.email, passwordHash],
        );
        const newUserId = user.rows[0].id;

        await audit(q, {
          companyId,
          actorUserId: newUserId,
          action: 'COMPANY_REGISTERED',
          details: { companyName: input.companyName },
          ip: req.ip,
        });
        const token = await issueRefreshToken(q, config, { userId: newUserId, meta: meta(req) });
        return { userId: newUserId, refreshToken: token };
      });

      sendSession(req, res, 201, await loadUser(db, userId), refreshToken);
    }),
  );

  // POST /auth/set-password — the one-time link from an invitation email. The token
  // works once and for a limited time; it also ends any existing sessions of that user.
  router.post(
    '/set-password',
    asyncHandler(async (req, res) => {
      const input = parse(z.object({ token: z.string().min(20).max(200), password }).strict(), req.body);
      const hash = await bcrypt.hash(input.password, config.bcryptRounds);
      await db.tx(async (q) => {
        const { rows } = await q.query(
          `SELECT id, user_id, expires_at, used_at FROM password_tokens WHERE token_hash = $1 FOR UPDATE`,
          [hashToken(input.token)],
        );
        const t = rows[0];
        if (!t || t.used_at || new Date(t.expires_at) <= new Date()) {
          throw new HttpError(400, 'INVALID_TOKEN', 'This link is invalid or has expired. Ask for a new one.');
        }
        await q.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [t.user_id, hash]);
        await q.query('UPDATE password_tokens SET used_at = now() WHERE id = $1', [t.id]);
        await revokeAllForUser(q, t.user_id);
        const u = (await q.query('SELECT company_id FROM users WHERE id = $1', [t.user_id])).rows[0];
        await audit(q, { companyId: u?.company_id ?? null, actorUserId: t.user_id, action: 'PASSWORD_SET', ip: req.ip });
      });
      res.status(204).end();
    }),
  );

  // POST /auth/login
  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const input = parse(loginSchema, req.body);

      const found = input.email
        ? await db.query('SELECT id, password_hash FROM users WHERE lower(email) = $1', [input.email])
        : await db.query('SELECT id, password_hash FROM users WHERE phone = $1', [input.phone]);
      const row = found.rows[0];

      const ok = await bcrypt.compare(input.password, row?.password_hash ?? dummyHash);
      if (!row || !ok) {
        await audit(db, {
          action: 'LOGIN_FAILED',
          details: { identifier: input.email ?? input.phone },
          ip: req.ip,
        });
        throw unauthorized('Invalid credentials');
      }

      const user = await loadUser(db, row.id);
      assertAccountUsable(user);

      const refreshToken = await db.tx(async (q) => {
        await q.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
        await audit(q, {
          companyId: user.company_id,
          actorUserId: user.id,
          action: 'LOGIN_SUCCESS',
          details: { role: user.role },
          ip: req.ip,
        });
        return issueRefreshToken(q, config, { userId: user.id, meta: meta(req) });
      });

      sendSession(req, res, 200, user, refreshToken);
    }),
  );

  // POST /auth/refresh — rotates the refresh token and returns a new access token.
  router.post(
    '/refresh',
    asyncHandler(async (req, res) => {
      const raw = readRefreshToken(req);
      if (!raw) throw unauthorized('Refresh token required');
      try {
        const { user, refreshToken } = await rotateRefreshToken(db, config, raw, meta(req));
        sendSession(req, res, 200, user, refreshToken);
      } catch (err) {
        res.clearCookie(REFRESH_COOKIE, cookieOptions);
        throw err;
      }
    }),
  );

  // POST /auth/logout — revokes the session. Always succeeds.
  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      const raw = readRefreshToken(req);
      if (raw) await revokeByToken(db, raw);
      res.clearCookie(REFRESH_COOKIE, cookieOptions);
      res.status(204).end();
    }),
  );

  // POST /auth/forgot-password — emails a one-hour, single-use link. The answer is always
  // the same, so the form cannot be used to find out which emails have an account.
  router.post(
    '/forgot-password',
    asyncHandler(async (req, res) => {
      const { email: address } = parse(z.object({ email }).strict(), req.body);
      const u = (await db.query('SELECT id, name, status, company_id FROM users WHERE lower(email) = $1', [address])).rows[0];
      if (u && u.status === 'active') {
        const raw = crypto.randomBytes(32).toString('base64url');
        await db.tx(async (q) => {
          // Only the newest link works.
          await q.query(`UPDATE password_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'reset' AND used_at IS NULL`, [u.id]);
          await q.query(
            `INSERT INTO password_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, 'reset', $2, now() + interval '1 hour')`,
            [u.id, hashToken(raw)],
          );
          await audit(q, { companyId: u.company_id, actorUserId: u.id, action: 'PASSWORD_RESET_REQUESTED', ip: req.ip });
        });
        const url = `${config.appUrl}/set-password?token=${raw}&type=reset`;
        const mail = await mailer.send({
          to: address,
          subject: 'Reset your 6.11 Drive GPS password',
          text: [
            `Hello ${u.name},`,
            '',
            'Use this link to choose a new password. It works once and expires in 1 hour:',
            url,
            '',
            'If you did not ask for this, ignore this email. Your password has not changed.',
          ].join('\n'),
        });
        // Development convenience only: without SMTP the link is printed so the flow can be tried.
        if (!mail.sent && !config.isProduction) console.log(`[dev] password reset link for ${address}: ${url}`);
      }
      res.status(202).json({ ok: true });
    }),
  );

  // POST /auth/change-password — a signed-in user changes their own password. All other
  // sessions are closed and this one continues with a fresh token.
  router.post(
    '/change-password',
    authenticate,
    asyncHandler(async (req, res) => {
      const input = parse(z.object({ currentPassword: z.string().min(1).max(200), newPassword: password }).strict(), req.body);
      const { userId, companyId } = req.auth;
      const row = (await db.query('SELECT password_hash FROM users WHERE id = $1', [userId])).rows[0];
      if (!(await bcrypt.compare(input.currentPassword, row.password_hash))) {
        await audit(db, { companyId, actorUserId: userId, action: 'PASSWORD_CHANGE_FAILED', ip: req.ip });
        // 400, not 401: the client treats 401 as "token expired".
        throw new HttpError(400, 'WRONG_PASSWORD', 'Your current password is not correct.');
      }
      const hash = await bcrypt.hash(input.newPassword, config.bcryptRounds);
      const refreshToken = await db.tx(async (q) => {
        await q.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [userId, hash]);
        await revokeAllForUser(q, userId);
        await audit(q, { companyId, actorUserId: userId, action: 'PASSWORD_CHANGED', ip: req.ip });
        return issueRefreshToken(q, config, { userId, meta: meta(req) });
      });
      sendSession(req, res, 200, await loadUser(db, userId), refreshToken);
    }),
  );

  // GET /auth/me — the signed-in user.
  router.get('/me', authenticate, (req, res) => {
    res.json({ user: publicUser(req.auth.user) });
  });

  return router;
}
