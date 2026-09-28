// Meta signs each webhook delivery; with WHATSAPP_APP_SECRET set, the door refuses anything else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isSignedByMeta } from './whatsapp.js';

test('a delivery signed with the app secret passes; a forged, missing or tampered one does not', () => {
  const secret = 'app-secret-xyz';
  const body = Buffer.from(JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '919205101862', type: 'text', text: { body: 'Hi' } }] } }] }] }));
  const good = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(isSignedByMeta(body, good, secret), true);
  assert.equal(isSignedByMeta(body, 'sha256=' + '0'.repeat(64), secret), false);
  assert.equal(isSignedByMeta(body, undefined, secret), false);
  assert.equal(isSignedByMeta(Buffer.from(body.toString().replace('Hi', 'Hi there')), good, secret), false);
  assert.equal(isSignedByMeta(body, good, 'another-secret'), false);
});
