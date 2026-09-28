// Webhook signature checks. A bad signature must never confirm a booking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isValidWebhook } from './razorpay.js';

const secret = 'another-password-you-invent';
const body = Buffer.from(JSON.stringify({ event: 'payment_link.paid', payload: {} }));
const goodSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');

test('the signature Razorpay computes over the raw body is accepted', () => {
  assert.equal(isValidWebhook(body, goodSignature, secret), true);
});

test('a signature made with a different secret is rejected', () => {
  const other = crypto.createHmac('sha256', 'wrong-secret').update(body).digest('hex');
  assert.equal(isValidWebhook(body, other, secret), false);
});

test('a tampered body no longer matches its signature', () => {
  const tampered = Buffer.from(body.toString().replace('paid', 'unpaid'));
  assert.equal(isValidWebhook(tampered, goodSignature, secret), false);
});

test('a missing, short or garbage header is a bad signature, not a crash', () => {
  assert.equal(isValidWebhook(body, undefined, secret), false);
  assert.equal(isValidWebhook(body, 'abc', secret), false);
  assert.equal(isValidWebhook(body, 'x'.repeat(64), secret), false);
});
