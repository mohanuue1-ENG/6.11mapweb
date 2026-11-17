import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { createMailer, parseSender } from '../src/services/mailer.js';

const base = { NODE_ENV: 'test', JWT_ACCESS_SECRET: 'x'.repeat(40) };

test('the sender is read from "Name <address>"', () => {
  assert.deepEqual(parseSender('TRUKOVA <me@gmail.com>'), { name: 'TRUKOVA', email: 'me@gmail.com' });
  assert.deepEqual(parseSender('"TRUKOVA GPS" <me@gmail.com>'), { name: 'TRUKOVA GPS', email: 'me@gmail.com' });
  assert.deepEqual(parseSender('me@gmail.com'), { email: 'me@gmail.com' });
});

test('Mailjet keys turn email and the driver codes on, and send one signed web request', async () => {
  const config = loadConfig({ ...base, MAILJET_API_KEY: 'mjkey', MAILJET_SECRET_KEY: 'mjsecret', MAIL_FROM: 'TRUKOVA <me@gmail.com>' });
  assert.equal(config.driverCodeLogin, true);
  const mailer = createMailer(config);
  assert.equal(mailer.configured, true);

  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => (calls.push({ url, init }), { ok: true, status: 200, text: async () => JSON.stringify({ Messages: [{ Status: 'success' }] }) });
  try {
    assert.equal((await mailer.send({ to: 'driver@example.test', subject: 'Your TRUKOVA code', text: 'Your TRUKOVA code is 123456' })).sent, true);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls[0].url, 'https://api.mailjet.com/v3.1/send');
  assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from('mjkey:mjsecret').toString('base64')}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    Messages: [{ From: { Email: 'me@gmail.com', Name: 'TRUKOVA' }, To: [{ Email: 'driver@example.test' }], Subject: 'Your TRUKOVA code', TextPart: 'Your TRUKOVA code is 123456' }],
  });
});

test('a message Mailjet refuses, by status or by an error answer, is reported as not sent', async () => {
  const mailer = createMailer(loadConfig({ ...base, MAILJET_API_KEY: 'k', MAILJET_SECRET_KEY: 's', MAIL_FROM: 'TRUKOVA <me@gmail.com>' }));
  const realFetch = globalThis.fetch;
  const realError = console.error;
  console.error = () => {};
  try {
    globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => 'sender not validated' });
    assert.deepEqual(await mailer.send({ to: 'a@example.test', subject: 's', text: 't' }), { sent: false });
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ Messages: [{ Status: 'error' }] }) });
    assert.deepEqual(await mailer.send({ to: 'a@example.test', subject: 's', text: 't' }), { sent: false });
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
  }
});

test('without Mailjet or SMTP, nothing is configured', () => {
  const config = loadConfig(base);
  assert.equal(config.driverCodeLogin, false);
  assert.equal(createMailer(config).configured, false);
});
