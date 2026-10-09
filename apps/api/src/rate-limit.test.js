import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limiter } from './rate-limit.js';

test('a key gets its allowance and no more; another key is not affected', () => {
  const allow = limiter({ max: 3, windowMs: 60000 });
  assert.deepEqual([allow('a'), allow('a'), allow('a'), allow('a')], [true, true, true, false]);
  assert.equal(allow('b'), true);
});
