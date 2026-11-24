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
import { HttpError, notFound } from '../errors.js';
import { strongPassword, password as basicPassword } from '../validation.js';
import { createCode, verifyCode, createTrustedDevice, checkTrustedDevice, maskEmail, samePhone } from '../services/verification.js';

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
// On the website a person chooses a strong password; a driver choosing one in the app needs the basic rule.
const password = strongPassword;
const driverPassword = basicPassword;

const registerSchema = z
  .object({
    // Optional: a company that signs up by itself gives its details after it has paid.
    companyName: z.string().trim().min(2).max(200).optional(),
    adminName: z.string().trim().min(2).max(200),
    email: email.optional(),
    // Either a password, or a Google sign-in (Google has already confirmed the address, so no password is needed).
    password: password.optional(),
    googleCredential: z.string().min(20).max(6000).optional(),
    phone: optionalText(40),
    dotNumber: optionalText(40),
    mcNumber: optionalText(40),
    address: optionalText(500),
  })
  .refine((v) => (v.googleCredential ? true : Boolean(v.email && v.password)), { message: 'Enter your email and a password' });

const loginSchema = z
  .object({
    email: email.optional(),
    phone: z.string().trim().min(5).max(40).optional(),
    password: z.string().min(1).max(200),
    // Given by the app when this phone was verified and remembered; lets it skip the text-message code.
    deviceToken: z.string().max(200).optional(),
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
    // False until the company has paid for a plan: the website then shows the plan page instead of the dashboard.
    subscribed: user.role === 'SUPER_ADMIN' || Boolean(user.has_subscription),
    // True until the company has told us about itself (asked right after the first payment).
    needsSetup: Boolean(user.needs_setup),
  };
}

const codeField = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');
// The phone number the company put on the driver profile: it finds the driver, so it is the first thing asked.
const phoneField = z.string().trim().min(6).max(40);
const driverLookupSchema = z.object({ phone: phoneField }).strict();
const driverRequestSchema = z.object({ phone: phoneField, email }).strict();
const driverCheckSchema = z.object({ email, code: codeField, purpose: z.enum(['register', 'reset']).optional() }).strict();
const driverRegisterSchema = z
  .object({ phone: phoneField, email, code: codeField, name: z.string().trim().min(2).max(200), password: driverPassword, remember: z.boolean().optional() })
  .strict();
const driverResetSchema = z.object({ phone: phoneField, email, code: codeField, newPassword: driverPassword }).strict();
const verifyLoginSchema = z.object({ challengeId: z.string().uuid(), code: codeField, remember: z.boolean().optional() }).strict();

export function authRoutes({ db, config, authenticate, mailer, googleVerify }) {
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
  function sendSession(req, res, status, user, refreshToken, extra = {}) {
    const body = {
      accessToken: signAccessToken(config, user.id),
      expiresIn: config.accessTokenTtlSeconds,
      user: publicUser(user),
      ...extra,
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

  // Emails a code. Where email is not set up, production says so, and development / test mode skips the email
  // and lets the API hand the code back.
  async function sendCode(to, code, brand = 'TRUKOVA') {
    if (!mailer.configured) {
      if (config.isProduction && !config.codeTestMode) {
        throw new HttpError(503, 'EMAIL_UNAVAILABLE', 'Email is not set up yet. Please contact your company.');
      }
      return;
    }
    const mail = await mailer.send({
      to,
      subject: `Your ${brand} code`,
      text: [`Your ${brand} code is ${code}`, '', `It works once and expires in ${config.codeTtlMinutes} minutes.`, 'If you did not ask for it, ignore this email.'].join('\n'),
    });
    if (!mail.sent) {
      throw new HttpError(502, 'EMAIL_FAILED', 'We could not send the email right now. Try again in a moment, or contact your company.');
    }
  }
  const devCodeFor = (code) => (!mailer.configured && (!config.isProduction || config.codeTestMode) ? code : undefined);

  // The driver profile a phone number belongs to, for a driver who has no account yet.
  const openDriverByPhone = async (phone) => {
    const rows = (await db.query(`SELECT id, company_id, user_id, phone FROM drivers WHERE status = 'active' AND phone IS NOT NULL`)).rows.filter((d) => samePhone(d.phone, phone));
    if (!rows.length) throw notFound('We could not find this phone number. Check it, or ask your company to add it for you.');
    const open = rows.filter((d) => !d.user_id);
    if (!open.length) throw conflict('This driver already has an account. Sign in instead.');
    if (open.length > 1) throw conflict('This phone number is used by more than one driver. Ask your company to fix it.');
    return open[0];
  };
  const invalidCode = () => new HttpError(400, 'INVALID_CODE', 'That code is not correct or has expired. Ask for a new one.');
  const emailTaken = async (address) => (await db.query('SELECT 1 FROM users WHERE lower(email) = $1', [address])).rows.length > 0;

  // POST /auth/driver/lookup — step 1 of creating an account: is this a phone number a company has set up?
  router.post(
    '/driver/lookup',
    asyncHandler(async (req, res) => {
      const { phone } = parse(driverLookupSchema, req.body);
      await openDriverByPhone(phone);
      res.json({ ok: true });
    }),
  );

  // POST /auth/driver/request-code — the driver's own email, for the phone number from step 1. A code is emailed to it.
  router.post(
    '/driver/request-code',
    asyncHandler(async (req, res) => {
      const { phone, email: target } = parse(driverRequestSchema, req.body);
      const driver = await openDriverByPhone(phone);
      if (await emailTaken(target)) throw conflict('An account with this email already exists. Sign in instead.');
      const { code } = await db.tx((q) => createCode(q, config, { purpose: 'register', target, driverId: driver.id }));
      await sendCode(target, code);
      res.status(202).json({ ok: true, hint: maskEmail(target), devCode: devCodeFor(code) });
    }),
  );

  // POST /auth/driver/check-code — tells the app at once whether the typed code is right, without using it up.
  // The sign-up form is a series of small steps, so a wrong code is found on the code step, not at the end.
  router.post(
    '/driver/check-code',
    asyncHandler(async (req, res) => {
      const input = parse(driverCheckSchema, req.body);
      await verifyCode(db, { purpose: input.purpose ?? 'register', target: input.email, code: input.code, consume: false });
      res.json({ ok: true });
    }),
  );

  // POST /auth/driver/register — the last step: the phone number, email and emailed code, with the driver's name and password.
  router.post(
    '/driver/register',
    asyncHandler(async (req, res) => {
      const input = parse(driverRegisterSchema, req.body);
      // Checked before the code is used up, so these do not waste it.
      const driver = await openDriverByPhone(input.phone);
      if (await emailTaken(input.email)) throw conflict('An account with this email already exists. Sign in instead.');
      const row = await verifyCode(db, { purpose: 'register', target: input.email, code: input.code });
      if (row.driver_id !== driver.id) throw invalidCode(); // the code was asked for another driver's phone number

      const hash = await bcrypt.hash(input.password, config.bcryptRounds);
      const { userId, refreshToken, deviceToken } = await db.tx(async (q) => {
        const locked = (await q.query(`SELECT id, company_id FROM drivers WHERE id = $1 AND user_id IS NULL AND status = 'active' FOR UPDATE`, [driver.id])).rows[0];
        if (!locked) throw notFound('This driver profile is no longer available. Ask your company.');
        const user = await q.query(
          `INSERT INTO users (company_id, role, name, email, phone, password_hash, status, last_login_at)
           VALUES ($1, 'DRIVER', $2, $3, NULL, $4, 'active', now()) RETURNING id`,
          [locked.company_id, input.name, input.email, hash],
        );
        const newUserId = user.rows[0].id;
        // The name the driver typed becomes the driver's name everywhere (the app and the company's Drivers page).
        await q.query('UPDATE drivers SET user_id = $2, name = $3, updated_at = now() WHERE id = $1', [locked.id, newUserId, input.name]);
        await audit(q, { companyId: locked.company_id, actorUserId: newUserId, action: 'DRIVER_REGISTERED', details: { driverId: locked.id }, ip: req.ip });
        const token = await issueRefreshToken(q, config, {
          userId: newUserId,
          meta: meta(req),
          maxExpiresAt: config.driverCodeLogin ? new Date(Date.now() + config.trustedDeviceDays * 86400000) : null,
        });
        const device = input.remember ? await createTrustedDevice(q, config, newUserId) : null;
        return { userId: newUserId, refreshToken: token, deviceToken: device };
      });
      sendSession(req, res, 201, await loadUser(db, userId), refreshToken, deviceToken ? { deviceToken } : {});
    }),
  );

  // The driver account a phone number and email belong to, for a forgotten password.
  const driverAccount = async (phone, address) =>
    (
      await db.query(
        `SELECT d.id AS driver_id, d.phone, u.id AS user_id, u.company_id FROM drivers d JOIN users u ON u.id = d.user_id
          WHERE d.status = 'active' AND d.phone IS NOT NULL AND lower(u.email) = $1`,
        [address],
      )
    ).rows.find((r) => samePhone(r.phone, phone));

  // POST /auth/driver/forgot/request — forgot password, steps 1 and 2: the phone number and the account's email.
  // The answer is the same whether or not they match, so this cannot be used to find out who has an account.
  router.post(
    '/driver/forgot/request',
    asyncHandler(async (req, res) => {
      const { phone, email: target } = parse(driverRequestSchema, req.body);
      const account = await driverAccount(phone, target);
      let devCode;
      if (account) {
        const { code } = await db.tx((q) => createCode(q, config, { purpose: 'reset', target, driverId: account.driver_id, userId: account.user_id }));
        await sendCode(target, code);
        await audit(db, { companyId: account.company_id, actorUserId: account.user_id, action: 'PASSWORD_RESET_REQUESTED', ip: req.ip });
        devCode = devCodeFor(code);
      }
      res.status(202).json({ ok: true, hint: maskEmail(target), devCode });
    }),
  );

  // POST /auth/driver/forgot/reset — step 4: the emailed code and the new password. Every session of that driver
  // ends and every remembered phone has to be verified again.
  router.post(
    '/driver/forgot/reset',
    asyncHandler(async (req, res) => {
      const input = parse(driverResetSchema, req.body);
      const account = await driverAccount(input.phone, input.email);
      if (!account) throw invalidCode();
      const row = await verifyCode(db, { purpose: 'reset', target: input.email, code: input.code });
      if (row.driver_id !== account.driver_id) throw invalidCode();

      const hash = await bcrypt.hash(input.newPassword, config.bcryptRounds);
      await db.tx(async (q) => {
        await q.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [account.user_id, hash]);
        await revokeAllForUser(q, account.user_id);
        await q.query('DELETE FROM trusted_devices WHERE user_id = $1', [account.user_id]);
        await audit(q, { companyId: account.company_id, actorUserId: account.user_id, action: 'PASSWORD_RESET', ip: req.ip });
      });
      res.status(204).end();
    }),
  );

  // POST /auth/login/verify — the second step of a driver's sign-in: the code from the email.
  router.post(
    '/login/verify',
    asyncHandler(async (req, res) => {
      const input = parse(verifyLoginSchema, req.body);
      const row = await verifyCode(db, { purpose: 'login', id: input.challengeId, code: input.code });
      const user = await loadUser(db, row.user_id);
      assertAccountUsable(user);
      const { refreshToken, deviceToken } = await db.tx(async (q) => {
        await q.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
        await audit(q, { companyId: user.company_id, actorUserId: user.id, action: 'LOGIN_SUCCESS', details: { role: user.role, verified: true }, ip: req.ip });
        const token = await issueRefreshToken(q, config, {
          userId: user.id,
          meta: meta(req),
          maxExpiresAt: new Date(Date.now() + config.trustedDeviceDays * 86400000),
        });
        const device = input.remember ? await createTrustedDevice(q, config, user.id) : null;
        return { refreshToken: token, deviceToken: device };
      });
      sendSession(req, res, 200, user, refreshToken, deviceToken ? { deviceToken } : {});
    }),
  );

  // POST /auth/register — creates a company and its first Company Admin.
  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      if (!config.allowSelfRegistration) {
        throw new HttpError(403, 'REGISTRATION_CLOSED', 'New accounts are not being created right now.');
      }
      const input = parse(registerSchema, req.body);
      if (input.googleCredential) {
        if (!config.googleClientId) throw new HttpError(503, 'GOOGLE_NOT_SET', 'Google sign-in is not set up yet.');
        const g = await googleVerify(input.googleCredential, config.googleClientId);
        if (!g || !g.email) throw unauthorized('Google could not confirm this sign-in. Try again.');
        if (!g.emailVerified) throw forbidden('Your Google email address is not verified.');
        input.email = g.email.toLowerCase();
      }
      const passwordHash = await bcrypt.hash(input.password ?? crypto.randomBytes(32).toString('hex'), config.bcryptRounds);

      const { userId, refreshToken } = await db.tx(async (q) => {
        const existing = await q.query('SELECT 1 FROM users WHERE lower(email) = $1', [input.email]);
        if (existing.rows.length) throw conflict('An account with this email already exists');

        const company = await q.query(
          `INSERT INTO companies (name, contact_email, contact_phone, address, dot_number, mc_number, needs_setup)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [input.companyName || input.adminName, input.email, input.phone, input.address, input.dotNumber, input.mcNumber, !input.companyName],
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

      // Drivers sign in with the app. The website is for administrators.
      if (user.role === 'DRIVER' && !isMobile(req)) {
        throw new HttpError(403, 'USE_THE_APP', 'Drivers sign in with the TRUKOVA app. The website is for company administrators.');
      }

      // A driver is also checked with a code emailed to their account address, unless this phone was verified
      // and remembered less than 30 days ago. Administrators (Super Admin, Company Admin) are checked the same way
      // on the website, unless this browser was verified and remembered.
      const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'COMPANY_ADMIN';
      const needsCode = (user.role === 'DRIVER' && config.driverCodeLogin) || (isAdmin && config.adminCodeLogin);
      if (needsCode) {
        const trusted = input.deviceToken ? await checkTrustedDevice(db, user.id, input.deviceToken) : false;
        if (!trusted) {
          const driver = user.role === 'DRIVER' ? (await db.query('SELECT id FROM drivers WHERE user_id = $1', [user.id])).rows[0] : null;
          const target = String(user.email || '').trim().toLowerCase();
          if (!target) throw new HttpError(403, 'NO_EMAIL', 'There is no email address on your account. Ask your company.');
          const { id, code } = await db.tx((q) => createCode(q, config, { purpose: 'login', target, driverId: driver?.id ?? null, userId: user.id }));
          await sendCode(target, code, isAdmin ? '6.11 TruckOS' : 'TRUKOVA');
          await audit(db, { companyId: user.company_id, actorUserId: user.id, action: 'LOGIN_CODE_SENT', ip: req.ip });
          return res.json({ verificationRequired: true, challengeId: id, hint: maskEmail(target), devCode: devCodeFor(code) });
        }
      }

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

  // POST /auth/google — "Continue with Google". The browser sends the credential Google gave it; Google has already
  // checked the person, so a known, active account is signed in without a password or an emailed code. An address
  // we do not know answers { newUser: true, email, name } so the website can start "Create account" with it filled in.
  router.post(
    '/google',
    asyncHandler(async (req, res) => {
      if (!config.googleClientId) throw new HttpError(503, 'GOOGLE_NOT_SET', 'Google sign-in is not set up yet.');
      const { credential } = parse(z.object({ credential: z.string().min(20).max(6000) }).strict(), req.body);
      const g = await googleVerify(credential, config.googleClientId);
      if (!g || !g.email) throw unauthorized('Google could not confirm this sign-in. Try again.');
      if (!g.emailVerified) throw forbidden('Your Google email address is not verified.');
      const row = (await db.query('SELECT id FROM users WHERE lower(email) = $1', [g.email])).rows[0];
      if (!row) return res.json({ newUser: true, email: g.email, name: g.name });
      const user = await loadUser(db, row.id);
      assertAccountUsable(user);
      if (user.role === 'DRIVER' && !isMobile(req)) {
        throw new HttpError(403, 'USE_THE_APP', 'Drivers sign in with the app. The website is for company administrators.');
      }
      const refreshToken = await db.tx(async (q) => {
        await q.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
        await audit(q, { companyId: user.company_id, actorUserId: user.id, action: 'LOGIN_SUCCESS', details: { role: user.role, via: 'google' }, ip: req.ip });
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
      const u = (await db.query('SELECT id, name, status, company_id, role FROM users WHERE lower(email) = $1', [address])).rows[0];
      // The Super Admin has no emailed reset: a forgotten password is set again in the server settings
      // (SEED_SUPER_ADMIN_PASSWORD) by whoever runs the server. The answer stays the same.
      if (u && u.status === 'active' && u.role !== 'SUPER_ADMIN') {
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
          subject: 'Reset your 6.11 TruckOS password',
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
