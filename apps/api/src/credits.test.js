import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditBalance } from './credits.js';

const day = 86400000;
const now = new Date('2026-09-16T00:00:00Z');
const issued = (amount, daysFromNow, createdDaysAgo = 1) => ({
  amount_paise: amount, expires_at: new Date(now.getTime() + daysFromNow * day), created_at: new Date(now.getTime() - createdDaysAgo * day),
});

test('a cancelled booking leaves one credit to spend', () => {
  const { balancePaise, vouchers } = creditBalance([issued(50000, 29)], [], now);
  assert.equal(balancePaise, 50000);
  assert.equal(vouchers.length, 1);
});

test('spending the credit empties it', () => {
  assert.equal(creditBalance([issued(50000, 29)], [{ amount_paise: 50000 }], now).balancePaise, 0);
});

test('a credit past thirty days is gone, and spending it earlier does not go negative', () => {
  assert.equal(creditBalance([issued(50000, -1)], [], now).balancePaise, 0);
  assert.equal(creditBalance([issued(50000, -1)], [{ amount_paise: 50000 }], now).balancePaise, 0);
});

test('two credits are spent oldest first, so the one expiring soonest goes first', () => {
  const old = issued(50000, 2, 28);
  const fresh = issued(50000, 29, 1);
  const { balancePaise, vouchers } = creditBalance([fresh, old], [{ amount_paise: 50000 }], now);
  assert.equal(balancePaise, 50000);
  assert.equal(vouchers[0].expiresAt.getTime(), fresh.expires_at.getTime(), 'the one left is the fresher credit');
});

test('no credits at all is simply nothing to spend', () => {
  assert.deepEqual(creditBalance([], [], now), { balancePaise: 0, vouchers: [] });
});
