import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devoteeAuth, normalisePhone, DEVOTEE_COOKIE } from './devotee-auth.js';
import { ProviderError } from './errors.js';

// Outside production, OTP_CODE is a fixed mock the dry run can type. The guru is an object because the code goes out in his language.
const auth = devoteeAuth({ DEVOTEE_SESSION_SECRET: 'a-secret', OTP_CODE: '1234', NODE_ENV: 'test' });
const g1 = { id: 'g1', name: 'Bhagwat', language: 'hi' };
const g2 = { id: 'g2', name: 'Other', language: 'en' };
const cookie = (token) => `other=1; ${DEVOTEE_COOKIE}=${token}`;

test('she asks for a code and the reply names only the last four digits', async () => {
  const { sentTo, mock } = await auth.requestCode(g1, '919829012345');
  assert.equal(sentTo, '••••••••2345');
  assert.equal(mock, true);
});

test('the mock code signs her in, and her cookie names her devotee row', async () => {
  await auth.requestCode(g1, '919829012345');
  assert.equal(auth.verifyCode(g1, '919829012345', '1234'), true);
  const token = auth.tokenFor('devotee-1');
  assert.equal(auth.devoteeIdFrom(cookie(token)), 'devotee-1');
});

test('a correct code works once and cannot be used again', async () => {
  await auth.requestCode(g1, '919829012345');
  assert.equal(auth.verifyCode(g1, '919829012345', '1234'), true);
  assert.equal(auth.verifyCode(g1, '919829012345', '1234'), false);
});

test('a wrong code, a number that never asked, or another guru’s request is refused', async () => {
  await auth.requestCode(g1, '919829012345');
  assert.equal(auth.verifyCode(g1, '919829012345', '9999'), false);
  assert.equal(auth.verifyCode(g1, '910000000000', '1234'), false);
  await auth.requestCode(g1, '919811022334');
  assert.equal(auth.verifyCode(g2, '919811022334', '1234'), false);
});

test('guessing is capped, and the request is burned once the cap is passed', async () => {
  await auth.requestCode(g1, '919900000000');
  for (let i = 0; i < 5; i++) assert.equal(auth.verifyCode(g1, '919900000000', '0000'), false);
  assert.equal(auth.verifyCode(g1, '919900000000', '1234'), false, 'the real code no longer helps after five wrong tries');
});

test('in production the mock is refused: a fresh six-digit code goes to her on WhatsApp, in his language, and only that code works', async () => {
  const sent = [];
  const prod = devoteeAuth({ DEVOTEE_SESSION_SECRET: 'a-secret', OTP_CODE: '1234', NODE_ENV: 'production' }, {
    sendCode: async (guru, phone, code) => { sent.push({ guru: guru.id, phone, code }); },
  });
  const reply = await prod.requestCode(g1, '919829012345');
  assert.equal(reply.mock, false);
  assert.equal(reply.code, undefined, 'the screen is never told the code');
  assert.equal(sent.length, 1);
  assert.match(sent[0].code, /^\d{6}$/);
  assert.equal(prod.verifyCode(g1, '919829012345', '1234'), false, 'the old mock opens nothing');
  assert.equal(prod.verifyCode(g1, '919829012345', sent[0].code), true);
});

test('when WhatsApp cannot carry the code, the refusal is passed on and nothing is pending', async () => {
  const prod = devoteeAuth({ DEVOTEE_SESSION_SECRET: 'a-secret', NODE_ENV: 'production' }, {
    sendCode: async () => { throw new ProviderError('Meta refused'); },
  });
  await assert.rejects(() => prod.requestCode(g1, '919829012345'), ProviderError);
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
