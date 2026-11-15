import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestContext, bearer } from './helpers.js';

const V1 = '/api/v1';
let ctx;
const post = (path, body, session) => {
  const r = ctx.api().post(V1 + path);
  return (session ? r.set(bearer(session)) : r).send(body);
};
const tokenFrom = (text) => new URL(text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
const lastMailTo = (to) => [...ctx.mail].reverse().find((m) => m.to === to);

before(async () => {
  ctx = await createTestContext();
});
after(async () => {
  await ctx.db.close();
});

test('forgot password sends a one-hour link, and answers the same for unknown emails', async () => {
  const c = await ctx.registerCompany('Forgetful Co');
  const known = await post('/auth/forgot-password', { email: c.email.toUpperCase() });
  const unknown = await post('/auth/forgot-password', { email: 'nobody@example.test' });
  assert.equal(known.status, 202);
  assert.equal(unknown.status, 202);
  assert.deepEqual(known.body, unknown.body);

  assert.equal(lastMailTo('nobody@example.test'), undefined);
  const mail = lastMailTo(c.email.toLowerCase());
  assert.match(mail.text, /1 hour/);
  assert.ok(tokenFrom(mail.text).length >= 40);
  assert.equal((await post('/auth/forgot-password', {})).status, 400);

  const row = (
    await ctx.db.query(
      `SELECT purpose, (EXTRACT(EPOCH FROM (expires_at - now())))::float8 AS secs, token_hash FROM password_tokens
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [c.user.id],
    )
  ).rows[0];
  assert.equal(row.purpose, 'reset');
  assert.ok(row.secs > 3500 && row.secs <= 3601);
  assert.notEqual(row.token_hash, tokenFrom(mail.text));
});

test('a reset link works once, sets the new password and ends every old session', async () => {
  const c = await ctx.registerCompany('Reset Co');
  await post('/auth/forgot-password', { email: c.email });
  const token = tokenFrom(lastMailTo(c.email).text);

  const pw = `New-${crypto.randomBytes(8).toString('base64url')}`;
  assert.equal((await post('/auth/set-password', { token, password: pw })).status, 204);
  assert.equal((await post('/auth/login', { email: c.email, password: c.password })).status, 401); // old password dead
  assert.equal((await post('/auth/login', { email: c.email, password: pw })).status, 200);
  assert.equal((await post('/auth/refresh', { refreshToken: c.refreshToken })).status, 401); // old session closed

  assert.equal((await post('/auth/set-password', { token, password: `${pw}x` })).body.error.code, 'INVALID_TOKEN');
});

test('only the newest reset link works, and an expired one does not', async () => {
  const c = await ctx.registerCompany('Twice Co');
  await post('/auth/forgot-password', { email: c.email });
  const first = tokenFrom(lastMailTo(c.email).text);
  await post('/auth/forgot-password', { email: c.email });
  const second = tokenFrom(lastMailTo(c.email).text);
  assert.notEqual(first, second);
  assert.equal((await post('/auth/set-password', { token: first, password: 'GoodPassword123' })).status, 400);

  await ctx.db.query(`UPDATE password_tokens SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL`);
  assert.equal((await post('/auth/set-password', { token: second, password: 'GoodPassword123' })).status, 400);
});

test('a disabled account gets no reset email', async () => {
  const c = await ctx.registerCompany('Disabled Co');
  await ctx.db.query(`UPDATE users SET status = 'disabled' WHERE id = $1`, [c.user.id]);
  const before = ctx.mail.length;
  assert.equal((await post('/auth/forgot-password', { email: c.email })).status, 202);
  assert.equal(ctx.mail.length, before);
});

test('change password needs the current password and keeps the user signed in', async () => {
  const c = await ctx.registerCompany('Changer Co');
  const other = await post('/auth/login', { email: c.email, password: c.password });
  const newPw = `Chg-${crypto.randomBytes(8).toString('base64url')}`;

  assert.equal((await post('/auth/change-password', { currentPassword: c.password, newPassword: newPw })).status, 401); // not signed in
  const wrong = await post('/auth/change-password', { currentPassword: 'not-my-password', newPassword: newPw }, c);
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error.code, 'WRONG_PASSWORD');
  assert.equal((await post('/auth/change-password', { currentPassword: c.password, newPassword: 'short' }, c)).status, 400);
  assert.equal((await post('/auth/login', { email: c.email, password: c.password })).status, 200); // nothing changed yet

  const ok = await post('/auth/change-password', { currentPassword: c.password, newPassword: newPw }, c);
  assert.equal(ok.status, 200);
  assert.ok(ok.body.accessToken && ok.body.user.id === c.user.id);

  // The caller continues with the new token; the new password works, the old one does not.
  assert.equal((await ctx.api().get(`${V1}/auth/me`).set(bearer(ok.body))).status, 200);
  assert.equal((await post('/auth/login', { email: c.email, password: c.password })).status, 401);
  assert.equal((await post('/auth/login', { email: c.email, password: newPw })).status, 200);
  // Other sessions of the same user are closed.
  assert.equal((await post('/auth/refresh', { refreshToken: other.body.refreshToken ?? c.refreshToken })).status, 401);

  const actions = (await ctx.db.query('SELECT action FROM audit_logs WHERE actor_user_id = $1', [c.user.id])).rows.map((r) => r.action);
  for (const a of ['PASSWORD_CHANGED', 'PASSWORD_CHANGE_FAILED']) assert.ok(actions.includes(a), a);
});
