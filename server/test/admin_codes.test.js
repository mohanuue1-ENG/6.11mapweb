import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createTestContext } from './helpers.js';
import { seed } from '../src/db/seed.js';

const V1 = '/api/v1';
let ctx;
const mails = [];
const mailer = {
  configured: true,
  async send(m) {
    mails.push(m);
    return { sent: true };
  },
};
const post = (path, body) => ctx.api().post(V1 + path).send(body); // the website: no X-Client-Type header
const lastCode = (to) => [...mails].reverse().find((m) => m.to === to).text.match(/code is (\d{6})/)[1];

before(async () => {
  ctx = await createTestContext({ ADMIN_LOGIN_CODES: 'true' }, { mailer });
});
after(async () => {
  await ctx.db.close();
});

async function makeSuperAdmin() {
  const email = `root-${crypto.randomBytes(4).toString('hex')}@example.test`;
  const password = `Pw-${crypto.randomBytes(8).toString('base64url')}`;
  await ctx.db.query(`INSERT INTO users (company_id, role, name, email, password_hash) VALUES (NULL, 'SUPER_ADMIN', 'Root', $1, $2)`, [email, await bcrypt.hash(password, 4)]);
  return { email, password };
}

test('a Company Admin signs in with the password, then the emailed code; "remember" skips the code', async () => {
  const company = await ctx.registerCompany('Code Haulage');
  const wrong = await post('/auth/login', { email: company.email, password: 'wrong-password-1' });
  assert.equal(wrong.status, 401);

  const before = mails.length;
  const step1 = await post('/auth/login', { email: company.email, password: company.password });
  assert.equal(step1.status, 200);
  assert.equal(step1.body.verificationRequired, true);
  assert.equal(step1.body.accessToken, undefined);
  assert.equal(mails.length, before + 1);
  const code = lastCode(company.email);

  assert.equal((await post('/auth/login/verify', { challengeId: step1.body.challengeId, code: code === '999999' ? '888888' : '999999' })).status, 400);
  const step2 = await post('/auth/login/verify', { challengeId: step1.body.challengeId, code, remember: true });
  assert.equal(step2.status, 200);
  assert.ok(step2.body.accessToken && step2.body.deviceToken);
  assert.equal(step2.body.user.role, 'COMPANY_ADMIN');
  assert.equal((await post('/auth/login/verify', { challengeId: step1.body.challengeId, code })).status, 400, 'a code works once');

  const again = await post('/auth/login', { email: company.email, password: company.password, deviceToken: step2.body.deviceToken });
  assert.ok(again.body.accessToken, 'a remembered browser needs no code');
  assert.equal((await post('/auth/login', { email: company.email, password: company.password, deviceToken: 'not-a-real-token' })).body.verificationRequired, true);
});

test('the Super Admin signs in with a code too, and has no emailed password reset', async () => {
  const root = await makeSuperAdmin();
  const step1 = await post('/auth/login', { email: root.email, password: root.password });
  assert.equal(step1.body.verificationRequired, true);
  const step2 = await post('/auth/login/verify', { challengeId: step1.body.challengeId, code: lastCode(root.email) });
  assert.equal(step2.status, 200);
  assert.equal(step2.body.user.role, 'SUPER_ADMIN');

  const before = mails.length;
  const reset = await post('/auth/forgot-password', { email: root.email });
  assert.equal(reset.status, 202, 'the answer is the same as for any email');
  assert.equal(mails.length, before, 'but nothing is emailed');

  const company = await ctx.registerCompany('Reset Haulage');
  const other = await post('/auth/forgot-password', { email: company.email });
  assert.equal(other.status, 202);
  assert.equal(mails.length, before + 1, 'a Company Admin still gets the reset link');
});

test('the Super Admin password follows the server settings (SEED_SUPER_ADMIN_PASSWORD)', async () => {
  const email = `owner-${crypto.randomBytes(4).toString('hex')}@example.test`;
  const first = 'First-Password-123';
  const env = { SEED_SUPER_ADMIN_EMAIL: email, SEED_SUPER_ADMIN_PASSWORD: first };
  await seed(ctx.db, ctx.config, env);
  const row = (await ctx.db.query('SELECT id, password_hash FROM users WHERE lower(email) = $1', [email])).rows[0];
  assert.ok(await bcrypt.compare(first, row.password_hash));

  await seed(ctx.db, ctx.config, env);
  assert.equal((await ctx.db.query('SELECT password_hash FROM users WHERE id = $1', [row.id])).rows[0].password_hash, row.password_hash, 'same settings, nothing changes');

  const second = 'Second-Password-456';
  await seed(ctx.db, ctx.config, { ...env, SEED_SUPER_ADMIN_PASSWORD: second });
  const after = (await ctx.db.query('SELECT password_hash FROM users WHERE id = $1', [row.id])).rows[0].password_hash;
  assert.ok(await bcrypt.compare(second, after), 'a forgotten password is set again in the settings');
});
