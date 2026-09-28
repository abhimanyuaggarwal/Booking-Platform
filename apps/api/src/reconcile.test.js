// Only a captured payment on a paid link is money we hold. Everything else is asked about again next hour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capturedPayment } from './reconcile.js';

test('a paid link with a captured payment names that payment', () => {
  const link = { status: 'paid', payments: [
    { id: 'pay_failed', status: 'failed', amountPaise: 50000 },
    { id: 'pay_ok', status: 'captured', amountPaise: 50000 },
  ] };
  assert.deepEqual(capturedPayment(link), { id: 'pay_ok', status: 'captured', amountPaise: 50000 });
});

test('an unpaid, expired or cancelled link, or a paid one with nothing captured yet, gives nothing to settle', () => {
  assert.equal(capturedPayment({ status: 'created', payments: [] }), null);
  assert.equal(capturedPayment({ status: 'expired', payments: [{ id: 'p', status: 'captured' }] }), null);
  assert.equal(capturedPayment({ status: 'paid', payments: [{ id: 'p', status: 'authorized' }] }), null);
  assert.equal(capturedPayment(null), null);
});
