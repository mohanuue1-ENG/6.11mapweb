import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCommonPassword, passwordProblems } from '../src/services/passwordPolicy.js';

test('the rules say exactly what is missing', () => {
  assert.deepEqual(passwordProblems('Tr!ckers-2026-Go'), []);
  assert.ok(passwordProblems('short').includes('at least 8 characters'));
  assert.ok(passwordProblems('alllowercase1!').includes('an uppercase letter'));
  assert.ok(passwordProblems('ALLUPPERCASE1!').includes('a lowercase letter'));
  assert.ok(passwordProblems('NoNumbers!!').includes('a number'));
  assert.ok(passwordProblems('NoSpecial123').some((m) => m.startsWith('a special character')));
  assert.ok(passwordProblems('x'.repeat(80) + 'A1!').includes('no more than 72 characters'));
});

test('well-known passwords are caught, even with the usual swaps', () => {
  for (const bad of ['password', 'Password1', 'P@ssw0rd!', 'qwerty123', '12345678', 'aaaaaaaa', 'abcdefgh', 'Welcome123', 'Mohamed123!', 'letmein1']) {
    assert.equal(isCommonPassword(bad), true, bad);
  }
  for (const ok of ['Tr!ckers-2026-Go', 'purple-Giraffe#41', 'k9$Lm2-Vq8xZ']) {
    assert.equal(isCommonPassword(ok), false, ok);
  }
});
