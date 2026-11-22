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

test('SMTP settings turn email and the driver codes on', () => {
  const config = loadConfig({ ...base, SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'me@gmail.com', SMTP_PASS: 'app-password', MAIL_FROM: 'TRUKOVA <me@gmail.com>' });
  assert.equal(config.driverCodeLogin, true);
  assert.equal(createMailer(config).configured, true);
});

test('without SMTP, nothing is configured', () => {
  const config = loadConfig(base);
  assert.equal(config.driverCodeLogin, false);
  assert.equal(createMailer(config).configured, false);
});
