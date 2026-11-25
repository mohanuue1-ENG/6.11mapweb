import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, bearer, makeFleet } from './helpers.js';

const V1 = '/api/v1';
let ctx, admin, fleet, otherAdmin, otherFleet;
const as = (s) => ({
  get: (p) => ctx.api().get(V1 + p).set(bearer(s)),
  post: (p, b) => ctx.api().post(V1 + p).set(bearer(s)).send(b),
  patch: (p, b) => ctx.api().patch(V1 + p).set(bearer(s)).send(b),
  del: (p) => ctx.api().delete(V1 + p).set(bearer(s)),
});
const fuel = (over = {}) => ({ fuelDate: '2026-11-25', stateAbbr: 'ia', location: 'Pilot, Des Moines', receiptNumber: 'R-1001', gallons: 120.5, cashOutCents: 45600, driverId: fleet.driver.id, truckId: fleet.truck.id, ...over });

before(async () => {
  ctx = await createTestContext();
  admin = await ctx.registerCompany('Fuel Freight');
  fleet = await makeFleet(ctx, admin, 'F');
  otherAdmin = await ctx.registerCompany('Other Fuel Co');
  otherFleet = await makeFleet(ctx, otherAdmin, 'G');
});
after(async () => {
  await ctx.db.close();
});

test('the office writes fuel; the driver sees only their own, and nobody sees another company\'s', async () => {
  const created = await as(admin).post('/fuel', fuel());
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.fuel.stateAbbr, 'IA');
  assert.equal(created.body.fuel.gallons, 120.5);
  await as(admin).post('/fuel', fuel({ gallons: 80, cashOutCents: 30000, receiptNumber: null }));

  const list = (await as(admin).get('/fuel')).body;
  assert.equal(list.fuel.length, 2);
  assert.equal(list.totals.gallons, 200.5);
  assert.equal(list.totals.cashOutCents, 75600);
  assert.equal((await as(admin).get('/fuel?state=TX')).body.fuel.length, 0);

  // The driver sees their own.
  assert.equal((await as(fleet.session).get('/driver/fuel')).body.fuel.length, 2);
  assert.equal((await as(otherFleet.session).get('/driver/fuel')).body.fuel.length, 0);
  // Another company sees and changes nothing.
  assert.equal((await as(otherAdmin).get('/fuel')).body.fuel.length, 0);
  assert.equal((await as(otherAdmin).patch(`/fuel/${created.body.fuel.id}`, { gallons: 1 })).status, 404);
  assert.equal((await as(otherAdmin).del(`/fuel/${created.body.fuel.id}`)).status, 404);
  assert.equal((await as(admin).post('/fuel', fuel({ driverId: otherFleet.driver.id }))).status, 400);
  // A driver cannot write fuel.
  assert.equal((await as(fleet.session).post('/fuel', fuel())).status, 403);

  assert.equal((await as(admin).patch(`/fuel/${created.body.fuel.id}`, { gallons: 100 })).body.fuel.gallons, 100);
  assert.equal((await as(admin).del(`/fuel/${created.body.fuel.id}`)).status, 204);
  // Bad input.
  assert.equal((await as(admin).post('/fuel', fuel({ stateAbbr: 'Iowa' }))).status, 400);
  assert.equal((await as(admin).post('/fuel', fuel({ gallons: -1 }))).status, 400);
});
