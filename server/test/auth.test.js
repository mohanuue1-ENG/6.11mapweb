import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createTestContext, bearer, randomPassword } from './helpers.js';

let ctx;
before(async () => {
  ctx = await createTestContext();
});
after(async () => {
  await ctx.db.close();
});

const V1 = '/api/v1';

test('health check responds', async () => {
  const res = await ctx.api().get(`${V1}/health`);
  assert.equal(res.status, 200);
});

test('web registration sets an httpOnly refresh cookie and never returns the refresh token', async () => {
  const password = randomPassword();
  const res = await ctx
    .api()
    .post(`${V1}/auth/register`)
    .send({ companyName: 'Web Co', adminName: 'Web Admin', email: 'Web.Admin@Example.test', password });

  assert.equal(res.status, 201);
  assert.ok(res.body.accessToken);
  assert.equal(res.body.refreshToken, undefined);
  assert.equal(res.body.user.role, 'COMPANY_ADMIN');
  assert.equal(res.body.user.email, 'web.admin@example.test');
  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('rt='));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Path=\/api\/v1\/auth/);

  const { rows } = await ctx.db.query('SELECT password_hash FROM users WHERE email = $1', ['web.admin@example.test']);
  assert.notEqual(rows[0].password_hash, password);
  assert.match(rows[0].password_hash, /^\$2[aby]\$/);
});

test('registration rejects a duplicate email and weak input', async () => {
  const a = await ctx.registerCompany('Dup Co');
  const dup = await ctx
    .api()
    .post(`${V1}/auth/register`)
    .send({ companyName: 'Other', adminName: 'Other Admin', email: a.email.toUpperCase(), password: randomPassword() });
  assert.equal(dup.status, 409);

  const weak = await ctx
    .api()
    .post(`${V1}/auth/register`)
    .send({ companyName: 'X Co', adminName: 'X Admin', email: 'x@example.test', password: 'short' });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.error.details[0].field, 'password');
});

test('login succeeds with the right password and fails identically otherwise', async () => {
  const a = await ctx.registerCompany('Login Co');
  const ok = await ctx.api().post(`${V1}/auth/login`).send({ email: a.email, password: a.password });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.companyId, a.companyId);

  const wrong = await ctx.api().post(`${V1}/auth/login`).send({ email: a.email, password: 'wrong-password' });
  const unknown = await ctx.api().post(`${V1}/auth/login`).send({ email: 'nobody@example.test', password: 'whatever1' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
});

test('protected routes reject missing, forged and expired tokens', async () => {
  const a = await ctx.registerCompany('Token Co');

  assert.equal((await ctx.api().get(`${V1}/auth/me`)).status, 401);

  const forged = jwt.sign({}, 'some-other-secret-some-other-secret', { subject: a.user.id, issuer: '611-drive-gps' });
  assert.equal((await ctx.api().get(`${V1}/auth/me`).set('Authorization', `Bearer ${forged}`)).status, 401);

  const expired = jwt.sign({}, ctx.config.jwtAccessSecret, {
    subject: a.user.id,
    issuer: '611-drive-gps',
    expiresIn: -10,
  });
  assert.equal((await ctx.api().get(`${V1}/auth/me`).set('Authorization', `Bearer ${expired}`)).status, 401);

  const unsigned = jwt.sign({}, '', { subject: a.user.id, issuer: '611-drive-gps', algorithm: 'none' });
  assert.equal((await ctx.api().get(`${V1}/auth/me`).set('Authorization', `Bearer ${unsigned}`)).status, 401);

  const me = await ctx.api().get(`${V1}/auth/me`).set(bearer(a));
  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, a.user.id);
});

test('refresh tokens rotate, and reusing an old one closes the whole session', async () => {
  const a = await ctx.registerCompany('Rotate Co');

  const first = await ctx.api().post(`${V1}/auth/refresh`).send({ refreshToken: a.refreshToken });
  assert.equal(first.status, 200);
  assert.notEqual(first.body.refreshToken, a.refreshToken);

  // The original token was already used: this is treated as theft.
  const replay = await ctx.api().post(`${V1}/auth/refresh`).send({ refreshToken: a.refreshToken });
  assert.equal(replay.status, 401);

  // The token issued by the legitimate rotation is revoked too.
  const afterReplay = await ctx.api().post(`${V1}/auth/refresh`).send({ refreshToken: first.body.refreshToken });
  assert.equal(afterReplay.status, 401);

  assert.equal((await ctx.api().post(`${V1}/auth/refresh`).send({ refreshToken: 'garbage' })).status, 401);
  assert.equal((await ctx.api().post(`${V1}/auth/refresh`).send({})).status, 401);
});

test('refresh tokens are stored only as hashes', async () => {
  const a = await ctx.registerCompany('Hash Co');
  const { rows } = await ctx.db.query('SELECT token_hash FROM refresh_tokens WHERE user_id = $1', [a.user.id]);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, a.refreshToken);
  assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
});

test('logout revokes the refresh token', async () => {
  const a = await ctx.registerCompany('Logout Co');
  const out = await ctx.api().post(`${V1}/auth/logout`).send({ refreshToken: a.refreshToken });
  assert.equal(out.status, 204);
  const res = await ctx.api().post(`${V1}/auth/refresh`).send({ refreshToken: a.refreshToken });
  assert.equal(res.status, 401);
});

test('cookie refresh works from the website and is refused from another origin', async () => {
  const password = randomPassword();
  const reg = await ctx
    .api()
    .post(`${V1}/auth/register`)
    .send({ companyName: 'Cookie Co', adminName: 'Cookie Admin', email: 'cookie@example.test', password });
  const cookie = reg.headers['set-cookie'].find((c) => c.startsWith('rt=')).split(';')[0];

  const foreign = await ctx.api().post(`${V1}/auth/refresh`).set('Cookie', cookie).set('Origin', 'https://evil.example');
  assert.equal(foreign.status, 403);

  const own = await ctx.api().post(`${V1}/auth/refresh`).set('Cookie', cookie).set('Origin', 'http://localhost:5173');
  assert.equal(own.status, 200);
  assert.equal(own.body.refreshToken, undefined);
  assert.ok(own.headers['set-cookie'].some((c) => c.startsWith('rt=')));
});

test('logins are written to the audit log without secrets', async () => {
  const a = await ctx.registerCompany('Audit Co');
  await ctx.api().post(`${V1}/auth/login`).send({ email: a.email, password: a.password });
  await ctx.api().post(`${V1}/auth/login`).send({ email: a.email, password: 'wrong-password' });

  const { rows } = await ctx.db.query(
    `SELECT action, details::text AS details FROM audit_logs
      WHERE company_id = $1 OR details::text LIKE $2 ORDER BY created_at`,
    [a.companyId, `%${a.email}%`],
  );
  const actions = rows.map((r) => r.action);
  assert.ok(actions.includes('COMPANY_REGISTERED'));
  assert.ok(actions.includes('LOGIN_SUCCESS'));
  assert.ok(actions.includes('LOGIN_FAILED'));
  for (const r of rows) assert.ok(!r.details.includes(a.password));
});
