import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guruAuth } from './guru-auth.js';

const auth = guruAuth({ GURU_MAGIC_TOKEN: 'a-long-token' });

test('only the token in his magic link is him', () => {
  assert.equal(auth.isHim('a-long-token'), true);
  assert.equal(auth.isHim('a-long-toker'), false);
  assert.equal(auth.isHim('short'), false);
  assert.equal(auth.isHim(undefined), false);
});

test('with no token set in .env, nobody is him', () => {
  assert.equal(guruAuth({}).isHim('anything'), false);
});
