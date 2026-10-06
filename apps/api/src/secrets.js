// Secrets a guru hands us (his Razorpay key secret, his webhook secret) are stored encrypted at rest
// with AES-256-GCM under SECRETS_KEY, 32 random bytes in hex (openssl rand -hex 32). Without the key
// nothing can be connected; with a different key nothing already stored can be read, which is the
// point. Format: v1.<iv>.<tag>.<ciphertext>, all base64url.

import crypto from 'node:crypto';

export function secretsKey(env) {
  const hex = env.SECRETS_KEY;
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) return null;
  return Buffer.from(hex, 'hex');
}

export function encrypt(plain, key) {
  if (!key) throw new Error('SECRETS_KEY is not set: add 32 random bytes in hex to .env (openssl rand -hex 32) before connecting a guru\'s account');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const out = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${out.toString('base64url')}`;
}

export function decrypt(stored, key) {
  if (!key) throw new Error('SECRETS_KEY is not set, so a stored secret cannot be read');
  const [v, iv, tag, data] = String(stored ?? '').split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('A stored secret is not in the expected form');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

/** "rzp_live_AbCd…" -> "rzp_live_…WxYz": enough to recognise, never enough to use. */
export function maskKey(keyId) {
  const k = String(keyId ?? '');
  return k.length > 12 ? `${k.slice(0, 9)}…${k.slice(-4)}` : k ? '…' : '';
}
