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
