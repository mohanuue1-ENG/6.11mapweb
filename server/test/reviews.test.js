import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, bearer, makeFleet } from './helpers.js';

const V1 = '/api/v1';
let ctx, root, owner, other;
const as = (s) => ({
  get: (p) => ctx.api().get(V1 + p).set(bearer(s)),
  post: (p, b) => ctx.api().post(V1 + p).set(bearer(s)).send(b),
  patch: (p, b) => ctx.api().patch(V1 + p).set(bearer(s)).send(b),
});

before(async () => {
  ctx = await createTestContext();
  root = await ctx.createSuperAdmin();
  owner = await ctx.registerCompany('Review Freight');
  other = await ctx.registerCompany('Quiet Haulers');
});
after(async () => {
  await ctx.db.close();
});

test('a review is shown to the public only after the platform admin approves it', async () => {
  // Nothing at the start, and no invented reviews.
  const none = (await ctx.api().get(`${V1}/reviews`)).body;
  assert.equal(none.count, 0);
  assert.deepEqual(none.reviews, []);

  const written = await as(owner).post('/reviews', { rating: 5, body: 'We always know where our trucks are.', displayName: 'Owner, Review Freight' });
  assert.equal(written.status, 201, JSON.stringify(written.body));
  assert.equal(written.body.review.status, 'pending');
  // Still hidden.
  assert.equal((await ctx.api().get(`${V1}/reviews`)).body.reviews.length, 0);
  assert.equal((await as(owner).get('/reviews/mine')).body.review.rating, 5);

  // Only the platform admin decides.
  assert.equal((await as(owner).get('/admin/reviews')).status, 403);
  const list = (await as(root).get('/admin/reviews')).body.reviews;
  assert.equal(list.length, 1);
  assert.equal(list[0].companyName, 'Review Freight');
  assert.equal((await as(owner).patch(`/admin/reviews/${list[0].id}`, { status: 'approved' })).status, 403);
  assert.equal((await as(root).patch(`/admin/reviews/${list[0].id}`, { status: 'approved' })).status, 200);

  const shown = (await ctx.api().get(`${V1}/reviews`)).body;
  assert.equal(shown.count, 1);
  assert.equal(shown.average, 5);
  assert.equal(shown.reviews[0].body, 'We always know where our trucks are.');

  // Changing it sends it back for approval; one review per company.
  const changed = await as(owner).post('/reviews', { rating: 4, body: 'Better after the update.', displayName: 'Owner' });
  assert.equal(changed.body.review.status, 'pending');
  assert.equal((await ctx.api().get(`${V1}/reviews`)).body.reviews.length, 0);
  assert.equal((await as(root).get('/admin/reviews')).body.reviews.length, 1);

  // A driver or a bad rating cannot write one.
  const fleet = await makeFleet(ctx, other, 'Q');
  assert.equal((await as(fleet.session).post('/reviews', { rating: 5, body: 'x', displayName: 'Driver' })).status, 403);
  assert.equal((await as(owner).post('/reviews', { rating: 9, body: 'x', displayName: 'x' })).status, 400);
  assert.equal((await ctx.api().post(`${V1}/reviews`).send({ rating: 5, body: 'x', displayName: 'x' })).status, 401);
});
