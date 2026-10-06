// Secrets at rest: encrypted under SECRETS_KEY, readable only with the same key, shown only masked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt, secretsKey, maskKey } from './secrets.js';
import { clientFor, webhookSecretFor } from './razorpay.js';

const env = { SECRETS_KEY: 'a'.repeat(64), RAZORPAY_KEY_ID: 'rzp_test_platform', RAZORPAY_KEY_SECRET: 'platform-secret', RAZORPAY_WEBHOOK_SECRET: 'platform-webhook' };

test('a secret round-trips with the key and is unreadable with another', () => {
  const key = secretsKey(env);
  const stored = encrypt('super-secret-key', key);
  assert.ok(stored.startsWith('v1.') && !stored.includes('super-secret-key'));
  assert.equal(decrypt(stored, key), 'super-secret-key');
  assert.throws(() => decrypt(stored, secretsKey({ SECRETS_KEY: 'b'.repeat(64) })));
  assert.equal(secretsKey({}), null);
  assert.throws(() => encrypt('x', null), /SECRETS_KEY/);
});

test('a key id is shown masked, and a guru with his own keys gets his own client and webhook secret', () => {
  assert.equal(maskKey('rzp_live_AbCdEfGh1234'), 'rzp_live_…1234');
  const key = secretsKey(env);
  const guru = { razorpay_key_id: 'rzp_live_AbCdEfGh1234', razorpay_secret_enc: encrypt('his-secret', key), razorpay_webhook_secret_enc: encrypt('his-webhook', key) };
  assert.equal(clientFor(guru, env).keyId, 'rzp_live_AbCdEfGh1234');
  assert.equal(webhookSecretFor(guru, env), 'his-webhook');
  assert.equal(clientFor({}, env).keyId, 'rzp_test_platform', 'a guru without his own keys uses the platform\'s');
  assert.equal(webhookSecretFor(null, env), 'platform-webhook');
});
