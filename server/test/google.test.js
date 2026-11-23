import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './helpers.js';

const V1 = '/api/v1';
let ctx;
let admin;

// A stand-in for Google's check: three known credentials.
const googleVerify = async (credential) => {
  if (credential === 'x'.repeat(30)) return { email: admin.email, emailVerified: true, name: 'Known Admin', sub: '1' };
  if (credential === 'n'.repeat(30)) return { email: 'brand.new@example.test', emailVerified: true, name: 'Brand New', sub: '2' };
  if (credential === 'u'.repeat(30)) return { email: admin.email, emailVerified: false, name: '', sub: '3' };
  return null;
};
const post = (credential) => ctx.api().post(`${V1}/auth/google`).send({ credential });

before(async () => {
  ctx = await createTestContext({ GOOGLE_CLIENT_ID: 'test-client-id' }, { googleVerify });
  admin = await ctx.registerCompany('Google Haulage');
});
after(async () => {
  await ctx.db.close();
});

test('a known administrator signs in with Google, with no password and no code', async () => {
  const res = await post('x'.repeat(30));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.accessToken);
  assert.equal(res.body.user.email, admin.email);
  assert.ok((res.headers['set-cookie'] || []).some((c) => c.startsWith('rt=')), 'the website keeps the session in its cookie');
});

test('an address we do not know is told to create an account, with its name and email', async () => {
  const res = await post('n'.repeat(30));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { newUser: true, email: 'brand.new@example.test', name: 'Brand New' });
});

test('a credential Google does not accept, or an unverified email, is refused', async () => {
  assert.equal((await post('z'.repeat(30))).status, 401);
  assert.equal((await post('u'.repeat(30))).status, 403);
  assert.equal((await post('short')).status, 400);
});

test('without a Google client id the route is off', async () => {
  const off = await createTestContext({}, { googleVerify });
  const res = await off.api().post(`${V1}/auth/google`).send({ credential: 'x'.repeat(30) });
  assert.equal(res.status, 503);
  await off.db.close();
});
