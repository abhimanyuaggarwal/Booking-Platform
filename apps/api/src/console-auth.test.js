import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consoleAuth, readCookie, COOKIE_NAME } from './console-auth.js';

const auth = consoleAuth({ CONSOLE_USER: 'team', CONSOLE_PASSWORD: 'correct-horse' });

test('the team signs in with the shared username and password and gets a cookie value', () => {
  const token = auth.login('team', 'correct-horse');
  assert.ok(token);
  assert.equal(auth.isValid(token), true);
});

test('a wrong password, wrong user, or empty input gets nothing', () => {
  assert.equal(auth.login('team', 'wrong'), null);
  assert.equal(auth.login('admin', 'correct-horse'), null);
  assert.equal(auth.login(undefined, undefined), null);
});

test('a token signed with a different password is rejected, as is a tampered expiry', () => {
  const other = consoleAuth({ CONSOLE_PASSWORD: 'different' }).login('team', 'different');
  assert.equal(auth.isValid(other), false);
  const [, mac] = auth.login('team', 'correct-horse').split('.');
  assert.equal(auth.isValid(`${Date.now() + 999999999}.${mac}`), false);
  assert.equal(auth.isValid('garbage'), false);
  assert.equal(auth.isValid(undefined), false);
});

test('an expired token is rejected', () => {
  const [, mac] = auth.login('team', 'correct-horse').split('.');
  assert.equal(auth.isValid(`${Date.now() - 1000}.${mac}`), false);
});

test('the cookie is read out of a Cookie header among others', () => {
  assert.equal(readCookie(`theme=dark; ${COOKIE_NAME}=abc.def; other=1`, COOKIE_NAME), 'abc.def');
  assert.equal(readCookie(undefined, COOKIE_NAME), null);
});

test('a session cookie says who, which role and which guru, and an admin from .env has no guru', () => {
  const token = auth.tokenFor({ id: 'u1', role: 'team', guruId: 'g1' });
  assert.deepEqual(auth.sessionFrom(token), { userId: 'u1', role: 'team', guruId: 'g1' });
  assert.deepEqual(auth.sessionFrom(auth.login('team', 'correct-horse')), { userId: 'env', role: 'admin', guruId: null });
  const [body] = token.split('.');
  assert.equal(auth.sessionFrom(`${body}.0000`), null, 'a cookie with the wrong signature is nobody');
});

test('a password hash checks itself and never stores the password', async () => {
  const { hashPassword, verifyPassword } = await import('./console-auth.js');
  const stored = hashPassword('ashram-2026');
  assert.ok(stored.startsWith('scrypt$') && !stored.includes('ashram-2026'));
  assert.equal(verifyPassword('ashram-2026', stored), true);
  assert.equal(verifyPassword('ashram-2027', stored), false);
  assert.equal(verifyPassword('ashram-2026', 'garbage'), false);
});
