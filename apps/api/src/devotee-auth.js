// Her identity is her phone number and nothing else: no account, no password (CLAUDE.md).
// She asks for a code, types it, and gets a signed cookie naming her devotee row.
// The code is the mock 1234 until an SMS provider is wired; OTP_CODE in .env changes it.

import crypto from 'node:crypto';
import { readCookie } from './console-auth.js';

export const DEVOTEE_COOKIE = 'es_devotee';
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export function devoteeAuth(env) {
  const secret = env.DEVOTEE_SESSION_SECRET;
  const code = env.OTP_CODE || '1234';
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  const pending = new Map(); // "guruId:phone" -> { code, expiresAt, attempts }

  const sign = (value) => crypto.createHmac('sha256', secret).update(value).digest('hex');

  /** Send her a code. Mock for now: it is always the same one, and the log says so. */
  function requestCode(guruId, phone) {
    pending.set(`${guruId}:${phone}`, { code, expiresAt: Date.now() + CODE_MINUTES * 60000, attempts: 0 });
    console.log(`Sign-in code for ${phone}: ${code} (mock; wire an SMS provider to send it for real)`);
    // `mock` stays true until a provider actually sends the code; the screen must not claim a message was sent.
    return { sentTo: `${'•'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`, mock: true, code: env.OTP_CODE ? undefined : code };
  }

  /**
   * True if this is the code we sent her, still fresh, and not guessed at too often.
   * A correct code is spent, so it cannot be replayed.
   */
  function verifyCode(guruId, phone, given) {
    const key = `${guruId}:${phone}`;
    const ask = pending.get(key);
    if (!ask || ask.expiresAt < Date.now()) return false;
    ask.attempts += 1;
    if (ask.attempts > MAX_ATTEMPTS) { pending.delete(key); return false; }
    if (String(given ?? '').trim() !== ask.code) return false;
    pending.delete(key);
    return true;
  }

  /** Her cookie, minted once verifyCode passes and her devotee row is known. */
  function tokenFor(devoteeId) {
    const expiresAt = Date.now() + SESSION_DAYS * 86400000;
    const body = `${devoteeId}.${expiresAt}`;
    return `${body}.${sign(body)}`;
  }

  /** The devotee id this cookie names, or null if it is missing, stale or forged. */
  function devoteeIdFrom(cookieHeader) {
    const token = readCookie(cookieHeader, DEVOTEE_COOKIE);
    if (!token) return null;
    const [devoteeId, expiresAt, mac] = String(token).split('.');
    if (!devoteeId || !expiresAt || !mac) return null;
    if (Number(expiresAt) < Date.now()) return null;
    const expected = Buffer.from(sign(`${devoteeId}.${expiresAt}`));
    const given = Buffer.from(mac);
    if (given.length !== expected.length || !crypto.timingSafeEqual(expected, given)) return null;
    return devoteeId;
  }

  function setCookie(res, token) {
    res.setHeader('Set-Cookie', `${DEVOTEE_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  }

  function clearCookie(res) {
    res.setHeader('Set-Cookie', `${DEVOTEE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  }

  return { requestCode, verifyCode, tokenFor, devoteeIdFrom, setCookie, clearCookie };
}

/** Digits only, with the country code. Returns null if it cannot be a WhatsApp number. */
export function normalisePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return digits.length === 10 ? `91${digits}` : digits; // a bare Indian mobile gets its country code
}
