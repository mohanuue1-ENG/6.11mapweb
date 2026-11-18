import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestContext, bearer } from './helpers.js';

const V1 = '/api/v1';
let ctx;
let admin;
const mails = [];
// A mailer that records what would be emailed, and can be told to fail.
const mailer = {
  configured: true,
  failing: false,
  async send(m) {
    if (this.failing) return { sent: false };
    mails.push(m);
    return { sent: true };
  },
};

const mobile = (req) => req.set('X-Client-Type', 'mobile');
const post = (path, body, session) => {
  const r = mobile(ctx.api().post(V1 + path));
  return (session ? r.set(bearer(session)) : r).send(body);
};
const lastCode = (to) => [...mails].reverse().find((m) => m.to === to).text.match(/code is (\d{6})/)[1];
const uniqueEmail = (label) => `${label}-${crypto.randomBytes(4).toString('hex')}@example.test`;
let phoneCounter = 1000000;
const uniquePhone = () => `+1555${phoneCounter++}`;
const strongPassword = () => `Pw-${crypto.randomBytes(8).toString('base64url')}`;

// A driver the company has added with only a phone number: no email, no login yet.
async function addDriver(name, number = uniquePhone(), session = admin) {
  const res = await post('/drivers', { name, phone: number }, session);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { driver: res.body.driver, number };
}

// Runs the whole sign-up and returns the account.
async function signUp(name, remember = false) {
  const { driver, number } = await addDriver(name);
  const email = uniqueEmail('driver');
  const password = strongPassword();
  assert.equal((await post('/auth/driver/request-code', { phone: number, email })).status, 202);
  const res = await post('/auth/driver/register', { phone: number, email, code: lastCode(email), name, password, remember });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { driver, number, email, password, session: res.body };
}

before(async () => {
  ctx = await createTestContext({ DRIVER_LOGIN_CODES: 'true' }, { mailer });
  admin = await ctx.registerCompany('Number Haulage');
});
after(async () => {
  await ctx.db.close();
});

test('a driver gives the phone number, then name, email and the emailed code, and creates their own account', async () => {
  const { driver, number } = await addDriver('Amina Driver');
  assert.equal(driver.hasLogin, false);

  // step 1: the number
  assert.equal((await post('/auth/driver/lookup', { phone: '+15559999999' })).status, 404);
  assert.equal((await post('/auth/driver/lookup', { phone: number.replace('+', '') })).status, 200, 'the number is found with or without the +');

  // step 3: the driver's own email; a code is emailed
  const email = uniqueEmail('amina');
  const asked = await post('/auth/driver/request-code', { phone: number, email });
  assert.equal(asked.status, 202);
  assert.match(asked.body.hint, /^a•+@example\.test$/);
  assert.equal(asked.body.devCode, undefined, 'the code is only in the email');
  const code = lastCode(email);

  // step 4: the code is checked at once, without being used up
  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal((await post('/auth/driver/check-code', { email, code: wrong })).status, 400);
  assert.equal((await post('/auth/driver/check-code', { email, code })).status, 200);
  assert.equal((await post('/auth/driver/check-code', { email, code })).status, 200, 'checking twice is fine');

  // step 5: name and password finish it
  const password = strongPassword();
  const body = { phone: number, email, name: 'Amina Hassan', password };
  const bad = await post('/auth/driver/register', { ...body, code: wrong });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'INVALID_CODE');
  const ok = await post('/auth/driver/register', { ...body, code });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.user.role, 'DRIVER');
  assert.equal(ok.body.user.email, email);
  assert.equal(ok.body.user.name, 'Amina Hassan');
  assert.equal(ok.body.user.companyId, admin.companyId);
  assert.ok(ok.body.refreshToken);

  const listed = (await ctx.api().get(`${V1}/drivers/${driver.id}`).set(bearer(admin))).body.driver;
  assert.equal(listed.hasLogin, true);
  assert.equal(listed.loginEmail, email);
  assert.equal((await post('/auth/driver/lookup', { phone: number })).status, 409, 'the number now has an account');
  assert.equal((await post('/auth/driver/register', { ...body, code })).status, 409);
});

test('an email that already has an account is refused before a code is sent', async () => {
  const { number } = await addDriver('Clash Driver');
  const sentBefore = mails.length;
  const res = await post('/auth/driver/request-code', { phone: number, email: admin.email });
  assert.equal(res.status, 409);
  assert.equal(mails.length, sentBefore);
});

test('a code asked for one driver cannot create another driver\'s account', async () => {
  const a = await addDriver('Driver A');
  const b = await addDriver('Driver B');
  const email = uniqueEmail('mixup');
  await post('/auth/driver/request-code', { phone: a.number, email });
  const res = await post('/auth/driver/register', { phone: b.number, email, code: lastCode(email), name: 'Driver B', password: strongPassword() });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_CODE');
});

test('weak passwords and bad codes are refused, and the code survives a mistake', async () => {
  const { number } = await addDriver('Careful Driver');
  const email = uniqueEmail('careful');
  await post('/auth/driver/request-code', { phone: number, email });
  const code = lastCode(email);
  const base = { phone: number, email, name: 'Careful Driver' };
  assert.equal((await post('/auth/driver/register', { ...base, code, password: 'short' })).status, 400);
  assert.equal((await post('/auth/driver/register', { ...base, code: '12ab56', password: strongPassword() })).status, 400);
  assert.equal((await post('/auth/driver/register', { ...base, code, password: strongPassword() })).status, 201);
});

test('five wrong guesses lock the code', async () => {
  const { number } = await addDriver('Locked Driver');
  const email = uniqueEmail('locked');
  await post('/auth/driver/request-code', { phone: number, email });
  const code = lastCode(email);
  const wrong = code === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i += 1) assert.equal((await post('/auth/driver/check-code', { email, code: wrong })).status, 400);
  assert.equal((await post('/auth/driver/check-code', { email, code })).status, 400, 'even the right code no longer works');
});

test('only five codes an hour per email', async () => {
  const { number } = await addDriver('Eager Driver');
  const email = uniqueEmail('eager');
  for (let i = 0; i < 5; i += 1) assert.equal((await post('/auth/driver/request-code', { phone: number, email })).status, 202);
  assert.equal((await post('/auth/driver/request-code', { phone: number, email })).status, 429);
});

test('a phone number is unique among waiting drivers on the whole platform', async () => {
  const { number } = await addDriver('First Co Driver');
  const other = await ctx.registerCompany('Other Haulage');
  const clash = await post('/drivers', { name: 'Second Co Driver', phone: number }, other);
  assert.equal(clash.status, 409);
});

test('a driver signs in with email and password, then the emailed code; "remember" skips the code for 30 days', async () => {
  const { email, password } = await signUp('Sara Driver');

  // wrong password: no code is sent
  const before = mails.length;
  assert.equal((await post('/auth/login', { email, password: 'wrong-password' })).status, 401);
  assert.equal(mails.length, before);

  // right password: a code, no session yet
  const step1 = await post('/auth/login', { email, password });
  assert.equal(step1.status, 200);
  assert.equal(step1.body.verificationRequired, true);
  assert.equal(step1.body.accessToken, undefined);
  const code = lastCode(email);

  assert.equal((await post('/auth/login/verify', { challengeId: step1.body.challengeId, code: code === '999999' ? '888888' : '999999' })).status, 400);
  const step2 = await post('/auth/login/verify', { challengeId: step1.body.challengeId, code, remember: true });
  assert.equal(step2.status, 200);
  assert.ok(step2.body.accessToken && step2.body.refreshToken && step2.body.deviceToken);
  assert.equal((await post('/auth/login/verify', { challengeId: step1.body.challengeId, code })).status, 400, 'a code works once');

  // a remembered phone signs in without a code; an unknown token does not
  const again = await post('/auth/login', { email, password, deviceToken: step2.body.deviceToken });
  assert.equal(again.status, 200);
  assert.ok(again.body.accessToken);
  assert.equal((await post('/auth/login', { email, password, deviceToken: 'not-a-real-token' })).body.verificationRequired, true);

  // after 30 days the phone must be verified again
  await ctx.db.query(`UPDATE trusted_devices SET expires_at = now() - interval '1 minute'`);
  assert.equal((await post('/auth/login', { email, password, deviceToken: step2.body.deviceToken })).body.verificationRequired, true);
});

test('a driver session ends 30 days after the code, however often the app refreshes', async () => {
  const { session } = await signUp('Long Driver');
  const fresh = await post('/auth/refresh', { refreshToken: session.refreshToken });
  assert.equal(fresh.status, 200);
  const expiry = (await ctx.db.query(`SELECT max(expires_at) AS t FROM refresh_tokens WHERE user_id = $1`, [session.user.id])).rows[0].t;
  assert.ok(new Date(expiry) - Date.now() <= 30 * 86400000 + 5000, 'no longer than 30 days');

  await ctx.db.query(`UPDATE refresh_tokens SET created_at = now() - interval '31 days' WHERE user_id = $1`, [session.user.id]);
  assert.equal((await post('/auth/refresh', { refreshToken: fresh.body.refreshToken })).status, 401);
});

test('administrators sign in as before, and drivers cannot sign in on the website', async () => {
  const res = await post('/auth/login', { email: admin.email, password: admin.password });
  assert.equal(res.status, 200);
  assert.equal(res.body.verificationRequired, undefined);

  const { email, password } = await signUp('App Only Driver');
  const web = await ctx.api().post(`${V1}/auth/login`).send({ email, password }); // no X-Client-Type: mobile
  assert.equal(web.status, 403);
  assert.equal(web.body.error.code, 'USE_THE_APP');
});

test('a driver whose login the admin set up is sent the code at that email', async () => {
  const email = uniqueEmail('setup');
  const password = strongPassword();
  const created = await post('/drivers', { name: 'Set Up', login: { email, password } }, admin);
  assert.equal(created.status, 201);
  const res = await post('/auth/login', { email, password });
  assert.equal(res.body.verificationRequired, true);
  assert.ok(lastCode(email));
});

test('forgot password: number, email, code, new password', async () => {
  const { driver, number, email, password, session } = await signUp('Forgetful Driver', true);
  assert.ok(session.deviceToken);

  // a wrong email gets the same answer and no mail
  const before = mails.length;
  const nobody = await post('/auth/driver/forgot/request', { phone: number, email: uniqueEmail('stranger') });
  assert.equal(nobody.status, 202);
  assert.equal(mails.length, before);

  const asked = await post('/auth/driver/forgot/request', { phone: number, email });
  assert.equal(asked.status, 202);
  const code = lastCode(email);
  const newPassword = strongPassword();

  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal((await post('/auth/driver/check-code', { email, code: wrong, purpose: 'reset' })).status, 400);
  assert.equal((await post('/auth/driver/check-code', { email, code, purpose: 'reset' })).status, 200);
  assert.equal((await post('/auth/driver/forgot/reset', { phone: number, email, code: wrong, newPassword })).status, 400);
  assert.equal((await post('/auth/driver/forgot/reset', { phone: '+15559999999', email, code, newPassword })).status, 400);
  assert.equal((await post('/auth/driver/forgot/reset', { phone: number, email, code, newPassword: 'short' })).status, 400);
  const done = await post('/auth/driver/forgot/reset', { phone: number, email, code, newPassword });
  assert.equal(done.status, 204);

  // the old password and the old sessions and remembered phones are finished
  assert.equal((await post('/auth/login', { email, password })).status, 401);
  assert.equal((await post('/auth/refresh', { refreshToken: session.refreshToken })).status, 401);
  assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM trusted_devices WHERE user_id = $1', [session.user.id])).rows[0].n, 0);
  // the new password works (and asks for a code again)
  assert.equal((await post('/auth/login', { email, password: newPassword })).body.verificationRequired, true);
  assert.equal((await post('/auth/driver/forgot/reset', { phone: number, email, code, newPassword })).status, 400, 'a code works once');
  assert.ok(driver.id);
});

test('if the email cannot be sent, the driver gets a clear message and no detail leaks', async () => {
  const { number } = await addDriver('Unlucky Driver');
  mailer.failing = true;
  try {
    const res = await post('/auth/driver/request-code', { phone: number, email: uniqueEmail('unlucky') });
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, 'EMAIL_FAILED');
  } finally {
    mailer.failing = false;
  }
});

test('without email set up, development hands the code back so the flow can be tried', async () => {
  const dev = await createTestContext({ DRIVER_LOGIN_CODES: 'true' }, { mailer: { configured: false, send: async () => ({ sent: false }) } });
  try {
    const company = await dev.registerCompany('Dev Co');
    const number = uniquePhone();
    await dev.api().post(`${V1}/drivers`).set(bearer(company)).send({ name: 'Dev Driver', phone: number });
    const res = await dev.api().post(`${V1}/auth/driver/request-code`).send({ phone: number, email: uniqueEmail('dev') });
    assert.equal(res.status, 202);
    assert.match(res.body.devCode, /^\d{6}$/);
  } finally {
    await dev.db.close();
  }
});

test('the admin adds a driver with only a phone number; the name the driver types at sign-up becomes the driver\'s name', async () => {
  const number = uniquePhone();
  const added = await post('/drivers', { phone: number }, admin);
  assert.equal(added.status, 201, JSON.stringify(added.body));
  assert.equal(added.body.driver.hasLogin, false);
  const email = uniqueEmail('driver');
  assert.equal((await post('/auth/driver/request-code', { phone: number, email })).status, 202);
  const reg = await post('/auth/driver/register', { phone: number, email, code: lastCode(email), name: 'Cali Warsame', password: strongPassword(), remember: false });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const list = await ctx.api().get(V1 + '/drivers').set(bearer(admin));
  assert.equal(list.body.drivers.find((d) => d.id === added.body.driver.id).name, 'Cali Warsame');
});

test('a driver can delete their own account with their password; the phone is freed and their login stops working', async () => {
  const { number, email, password, session } = await signUp('Leaving Driver');
  const send = (body) => mobile(ctx.api().delete(V1 + '/driver/me')).set(bearer(session)).send(body);
  assert.equal((await send({ password: 'wrong-password-1' })).status, 403);
  assert.equal((await send({ password })).status, 204);
  const again = await post('/auth/login', { email, password });
  assert.notEqual(again.status, 200);
  assert.equal((await mobile(ctx.api().get(V1 + '/driver/me')).set(bearer(session))).status, 401);
  const list = await ctx.api().get(V1 + '/drivers').set(bearer(admin));
  const row = list.body.drivers.find((d) => d.name === 'Deleted driver' && d.status === 'inactive');
  assert.ok(row, 'the company keeps an inactive record');
  assert.equal(row.phone, null);
  // the number can be used again by a new driver
  assert.equal((await post('/drivers', { phone: number }, admin)).status, 201);
});
