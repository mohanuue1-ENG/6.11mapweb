import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestContext, bearer } from './helpers.js';

const V1 = '/api/v1';
let ctx;
let admin;
const sent = [];
// A text-message sender that records what would have been sent (like a real provider being set up).
const sms = { configured: true, send: async (m) => (sent.push(m), { sent: true }) };

const mobile = (req) => req.set('X-Client-Type', 'mobile');
const post = (path, body, session) => {
  const r = mobile(ctx.api().post(V1 + path));
  return (session ? r.set(bearer(session)) : r).send(body);
};
const lastCode = (to) => [...sent].reverse().find((m) => m.to === to).body.match(/\b(\d{6})\b/)[1];
const phone = () => `+25261${Math.floor(1000000 + Math.random() * 8999999)}`;
const strongPassword = () => `Pw-${crypto.randomBytes(8).toString('base64url')}`;

// A driver the company has added with a phone number and no login yet.
async function addDriver(name, number = phone()) {
  const res = await post('/drivers', { name, phone: number, driverNumber: `D${crypto.randomBytes(2).toString('hex')}` }, admin);
  assert.equal(res.status, 201);
  return { driver: res.body.driver, phone: number };
}

before(async () => {
  ctx = await createTestContext({ DRIVER_SMS_LOGIN: 'true' }, { sms });
  admin = await ctx.registerCompany('Sms Haulage');
});
after(async () => {
  await ctx.db.close();
});

test('a driver the company added can create their own account with a texted code', async () => {
  const { driver, phone: number } = await addDriver('Amina Driver');
  assert.equal(driver.hasLogin, false);

  // unknown number
  const unknown = await post('/auth/driver/request-code', { phone: '+252610000000' });
  assert.equal(unknown.status, 404);

  const asked = await post('/auth/driver/request-code', { phone: number });
  assert.equal(asked.status, 202);
  assert.match(asked.body.phoneHint, /^••••\d{4}$/);
  assert.equal(asked.body.devCode, undefined, 'the code is only in the text message');
  const code = lastCode(number);

  // the code step can check the code without using it up
  const wrongCode = code === '000000' ? '111111' : '000000';
  assert.equal((await post('/auth/driver/check-code', { phone: number, code: wrongCode })).status, 400);
  assert.equal((await post('/auth/driver/check-code', { phone: number, code })).status, 200);
  assert.equal((await post('/auth/driver/check-code', { phone: number, code })).status, 200, 'checking twice is fine');

  const email = `amina-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const password = strongPassword();
  const body = { phone: number, name: 'Amina Hassan', email, password };

  const wrong = await post('/auth/driver/register', { ...body, code: code === '000000' ? '111111' : '000000' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error.code, 'INVALID_CODE');

  const ok = await post('/auth/driver/register', { ...body, code });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.user.role, 'DRIVER');
  assert.equal(ok.body.user.companyId, admin.companyId);
  assert.ok(ok.body.refreshToken);
  assert.equal(ok.body.deviceToken, undefined);

  // the account belongs to that driver, and the same code cannot be used again
  const listed = (await ctx.api().get(`${V1}/drivers/${driver.id}`).set(bearer(admin))).body.driver;
  assert.equal(listed.hasLogin, true);
  assert.equal(listed.loginEmail, email);
  assert.equal((await post('/auth/driver/register', { ...body, email: `again-${email}`, code })).status, 400);
  assert.equal((await post('/auth/driver/request-code', { phone: number })).status, 409);
});

test('a taken email does not use up the code, and bad input is refused', async () => {
  const { phone: number } = await addDriver('Careful Driver');
  await post('/auth/driver/request-code', { phone: number });
  const code = lastCode(number);
  const base = { phone: number, code, name: 'Careful Driver', password: strongPassword() };

  const taken = await post('/auth/driver/register', { ...base, email: admin.email });
  assert.equal(taken.status, 409);
  assert.equal((await post('/auth/driver/register', { ...base, email: 'new@example.test', password: 'short' })).status, 400);
  assert.equal((await post('/auth/driver/register', { ...base, email: 'new@example.test', code: '12ab56' })).status, 400);
  const ok = await post('/auth/driver/register', { ...base, email: `careful-${crypto.randomBytes(3).toString('hex')}@example.test` });
  assert.equal(ok.status, 201, 'the code still worked after the email problem');
});

test('five wrong guesses lock the code', async () => {
  const { phone: number } = await addDriver('Locked Driver');
  await post('/auth/driver/request-code', { phone: number });
  const code = lastCode(number);
  const wrong = code === '123456' ? '654321' : '123456';
  const base = { phone: number, name: 'Locked Driver', email: `locked-${crypto.randomBytes(3).toString('hex')}@example.test`, password: strongPassword() };
  for (let i = 0; i < 5; i += 1) assert.equal((await post('/auth/driver/register', { ...base, code: wrong })).status, 400);
  assert.equal((await post('/auth/driver/register', { ...base, code })).status, 400, 'even the right code no longer works');
});

test('only five codes an hour per phone', async () => {
  const { phone: number } = await addDriver('Eager Driver');
  for (let i = 0; i < 5; i += 1) assert.equal((await post('/auth/driver/request-code', { phone: number })).status, 202);
  assert.equal((await post('/auth/driver/request-code', { phone: number })).status, 429);
});

test('a driver signs in with email and password, then the texted code; "remember" skips the code for 30 days', async () => {
  const { phone: number } = await addDriver('Sara Driver');
  await post('/auth/driver/request-code', { phone: number });
  const email = `sara-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const password = strongPassword();
  const reg = await post('/auth/driver/register', { phone: number, code: lastCode(number), name: 'Sara Ali', email, password });
  assert.equal(reg.status, 201);

  // wrong password: no code is sent
  const before = sent.length;
  assert.equal((await post('/auth/login', { email, password: 'wrong-password' })).status, 401);
  assert.equal(sent.length, before);

  // right password: a code, no session yet
  const step1 = await post('/auth/login', { email, password });
  assert.equal(step1.status, 200);
  assert.equal(step1.body.verificationRequired, true);
  assert.equal(step1.body.accessToken, undefined);
  assert.ok(step1.body.challengeId);
  const code = lastCode(number);

  const bad = await post('/auth/login/verify', { challengeId: step1.body.challengeId, code: code === '999999' ? '888888' : '999999' });
  assert.equal(bad.status, 400);

  const step2 = await post('/auth/login/verify', { challengeId: step1.body.challengeId, code, remember: true });
  assert.equal(step2.status, 200);
  assert.ok(step2.body.accessToken && step2.body.refreshToken && step2.body.deviceToken);
  assert.equal(step2.body.user.role, 'DRIVER');
  assert.equal((await post('/auth/login/verify', { challengeId: step1.body.challengeId, code })).status, 400, 'a code works once');

  // a remembered phone signs in without a code
  const again = await post('/auth/login', { email, password, deviceToken: step2.body.deviceToken });
  assert.equal(again.status, 200);
  assert.ok(again.body.accessToken);
  // an unknown token does not
  const other = await post('/auth/login', { email, password, deviceToken: 'not-a-real-token' });
  assert.equal(other.body.verificationRequired, true);

  // after 30 days the phone must be verified again
  await ctx.db.query(`UPDATE trusted_devices SET expires_at = now() - interval '1 minute'`);
  const expired = await post('/auth/login', { email, password, deviceToken: step2.body.deviceToken });
  assert.equal(expired.body.verificationRequired, true);
});

test('a driver session ends 30 days after the code, however often the app refreshes', async () => {
  const { phone: number } = await addDriver('Long Driver');
  await post('/auth/driver/request-code', { phone: number });
  const email = `long-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const reg = await post('/auth/driver/register', { phone: number, code: lastCode(number), name: 'Long Driver', email, password: strongPassword() });
  assert.equal(reg.status, 201);

  const fresh = await post('/auth/refresh', { refreshToken: reg.body.refreshToken });
  assert.equal(fresh.status, 200);
  const expiry = (await ctx.db.query(`SELECT max(expires_at) AS t FROM refresh_tokens WHERE user_id = $1`, [reg.body.user.id])).rows[0].t;
  assert.ok(new Date(expiry) - Date.now() <= 30 * 86400000 + 5000, 'no longer than 30 days');

  // pretend the session began 31 days ago
  await ctx.db.query(`UPDATE refresh_tokens SET created_at = now() - interval '31 days' WHERE user_id = $1`, [reg.body.user.id]);
  assert.equal((await post('/auth/refresh', { refreshToken: fresh.body.refreshToken })).status, 401);
});

test('administrators sign in as before, with no code', async () => {
  const res = await post('/auth/login', { email: admin.email, password: admin.password });
  assert.equal(res.status, 200);
  assert.ok(res.body.accessToken);
  assert.equal(res.body.verificationRequired, undefined);
});

test('a driver without a phone number on the profile cannot be verified', async () => {
  const email = `nophone-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const password = strongPassword();
  const created = await post('/drivers', { name: 'No Phone', login: { email, password } }, admin);
  assert.equal(created.status, 201);
  const res = await post('/auth/login', { email, password });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'NO_PHONE');
});

test('if the text-message service refuses, the driver gets a clear message', async () => {
  const { phone: number } = await addDriver('Unlucky Driver');
  const original = sms.send;
  sms.send = async () => {
    throw new Error('SMS provider refused the message (403) not allowed');
  };
  const logged = console.error;
  console.error = () => {};
  try {
    const res = await post('/auth/driver/request-code', { phone: number });
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, 'SMS_FAILED');
    assert.doesNotMatch(JSON.stringify(res.body), /403|provider/i, 'the provider detail stays in the server log');
  } finally {
    console.error = logged;
    sms.send = original;
  }
});
