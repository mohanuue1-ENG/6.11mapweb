import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { createSmsSender } from '../src/services/sms.js';

const base = { NODE_ENV: 'test', JWT_ACCESS_SECRET: 'x'.repeat(40) };

test('without provider settings nothing is configured', () => {
  const config = loadConfig(base);
  assert.equal(config.driverSmsLogin, false);
  assert.equal(createSmsSender(config).configured, false);
});

test('Telnyx settings switch sign-in codes on and send one JSON request', async () => {
  const config = loadConfig({ ...base, TELNYX_API_KEY: 'KEY123', TELNYX_FROM: '+15551230000', TELNYX_MESSAGING_PROFILE_ID: 'prof-1' });
  assert.equal(config.driverSmsLogin, true);
  const sender = createSmsSender(config);
  assert.equal(sender.configured, true);

  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => (calls.push({ url, init }), { ok: true, text: async () => '' });
  try {
    await sender.send({ to: '+15559876543', body: 'Your TRUKOVA code is 123456.' });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.telnyx.com/v2/messages');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer KEY123');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    from: '+15551230000',
    to: '+15559876543',
    text: 'Your TRUKOVA code is 123456.',
    messaging_profile_id: 'prof-1',
  });
});

test('a refused message is reported, not hidden', async () => {
  const sender = createSmsSender(loadConfig({ ...base, TELNYX_API_KEY: 'k', TELNYX_FROM: '+15551230000' }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403, text: async () => 'not allowed' });
  try {
    await assert.rejects(() => sender.send({ to: '+15559876543', body: 'x' }), /refused the message \(403\)/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Twilio settings still work, and Telnyx wins when both are set', () => {
  const twilio = createSmsSender(loadConfig({ ...base, TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+15550001111' }));
  assert.equal(twilio.configured, true);
  const config = loadConfig({ ...base, TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+15550001111', TELNYX_API_KEY: 'k', TELNYX_FROM: '+15551230000' });
  assert.equal(config.driverSmsLogin, true);
});
