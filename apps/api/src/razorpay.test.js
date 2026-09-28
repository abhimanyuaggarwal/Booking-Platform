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

import { isValidCheckout } from './razorpay.js';

test('the result Checkout hands the page is accepted only with the right order, payment and key secret', () => {
  const keySecret = 'rzp_test_secret';
  const signature = crypto.createHmac('sha256', keySecret).update('order_1|pay_1').digest('hex');
  assert.equal(isValidCheckout({ orderId: 'order_1', paymentId: 'pay_1', signature }, keySecret), true);
  assert.equal(isValidCheckout({ orderId: 'order_2', paymentId: 'pay_1', signature }, keySecret), false);
  assert.equal(isValidCheckout({ orderId: 'order_1', paymentId: 'pay_9', signature }, keySecret), false);
  assert.equal(isValidCheckout({ orderId: 'order_1', paymentId: 'pay_1', signature }, 'another'), false);
  assert.equal(isValidCheckout({ orderId: 'order_1', paymentId: 'pay_1', signature: undefined }, keySecret), false);
  assert.equal(isValidCheckout({ orderId: 'order_1', paymentId: 'pay_1', signature: 'short' }, keySecret), false);
});
