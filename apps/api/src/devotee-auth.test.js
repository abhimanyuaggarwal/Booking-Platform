import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devoteeAuth, normalisePhone, DEVOTEE_COOKIE } from './devotee-auth.js';

const auth = devoteeAuth({ DEVOTEE_SESSION_SECRET: 'a-secret' });
const cookie = (token) => `other=1; ${DEVOTEE_COOKIE}=${token}`;

test('she asks for a code and the reply names only the last four digits', () => {
  const { sentTo } = auth.requestCode('g1', '919829012345');
  assert.equal(sentTo, '••••••••2345');
});

test('the mock code signs her in, and her cookie names her devotee row', () => {
  auth.requestCode('g1', '919829012345');
  assert.equal(auth.verifyCode('g1', '919829012345', '1234'), true);
  const token = auth.tokenFor('devotee-1');
  assert.equal(auth.devoteeIdFrom(cookie(token)), 'devotee-1');
});

test('a correct code works once and cannot be used again', () => {
  auth.requestCode('g1', '919829012345');
  assert.equal(auth.verifyCode('g1', '919829012345', '1234'), true);
  assert.equal(auth.verifyCode('g1', '919829012345', '1234'), false);
});

test('a wrong code, a number that never asked, or another guru’s request is refused', () => {
  auth.requestCode('g1', '919829012345');
  assert.equal(auth.verifyCode('g1', '919829012345', '9999'), false);
  assert.equal(auth.verifyCode('g1', '910000000000', '1234'), false);
  auth.requestCode('g1', '919811022334');
  assert.equal(auth.verifyCode('g2', '919811022334', '1234'), false);
});

test('guessing is capped, and the request is burned once the cap is passed', () => {
  auth.requestCode('g1', '919900000000');
  for (let i = 0; i < 5; i++) assert.equal(auth.verifyCode('g1', '919900000000', '0000'), false);
  assert.equal(auth.verifyCode('g1', '919900000000', '1234'), false, 'the real code no longer helps after five wrong tries');
});

test('a forged or stale cookie is not her', () => {
  const other = devoteeAuth({ DEVOTEE_SESSION_SECRET: 'different' }).tokenFor('devotee-1');
  assert.equal(auth.devoteeIdFrom(cookie(other)), null);
  assert.equal(auth.devoteeIdFrom(cookie('devotee-1.1.deadbeef')), null);
  assert.equal(auth.devoteeIdFrom(cookie('garbage')), null);
  assert.equal(auth.devoteeIdFrom(''), null);
});

test('a bare ten-digit mobile gets its country code; nonsense is refused', () => {
  assert.equal(normalisePhone('98765 43210'), '919876543210');
  assert.equal(normalisePhone('+91 98765 43210'), '919876543210');
  assert.equal(normalisePhone('12345'), null);
  assert.equal(normalisePhone(''), null);
});
