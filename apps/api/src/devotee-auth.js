// Her identity is her phone number and nothing else: no account, no password (CLAUDE.md).
// She asks for a code, types it, and gets a signed cookie naming her devotee row.
// The code goes to her on WhatsApp (the number she books with). Outside production, OTP_CODE in .env
// makes it a fixed mock so the dry run and the tests can type it; production never accepts a mock.

import crypto from 'node:crypto';
import { readCookie } from './console-auth.js';

export const DEVOTEE_COOKIE = 'es_devotee';
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_PENDING = 5000;

/**
 * @param {object} env
 * @param {{ sendCode?: (guru: object, phone: string, code: string) => Promise<void> }} deps
 *   `sendCode` delivers the code on WhatsApp; it may throw ProviderError, which requestCode passes on.
 */
export function devoteeAuth(env, { sendCode = null } = {}) {
  const secret = env.DEVOTEE_SESSION_SECRET;
  const production = env.NODE_ENV === 'production';
  const mockCode = !production && env.OTP_CODE ? String(env.OTP_CODE) : null;   // never in production
  const secure = production ? '; Secure' : '';
  const pending = new Map(); // "guruId:phone" -> { code, expiresAt, attempts }

  const sign = (value) => crypto.createHmac('sha256', secret).update(value).digest('hex');
  const masked = (phone) => `${'•'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;

  /**
   * Send her a code. A fresh six digits each time, good for ten minutes. With a mock code (outside
   * production only) nothing is sent and the screen may show it.
   */
  async function requestCode(guru, phone) {
    if (pending.size >= MAX_PENDING) for (const [k, v] of pending) if (v.expiresAt < Date.now()) pending.delete(k);
    const code = mockCode ?? String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const remember = () => pending.set(`${guru.id}:${phone}`, { code, expiresAt: Date.now() + CODE_MINUTES * 60000, attempts: 0 });
    if (mockCode) { remember(); return { sentTo: masked(phone), mock: true, code: mockCode }; }
    if (!sendCode) throw new Error('devoteeAuth needs sendCode to deliver codes in production');
    await sendCode(guru, phone, code);   // ProviderError when WhatsApp cannot reach her: the route words it
    remember();                          // only a code that went out can be typed
    return { sentTo: masked(phone), mock: false };
  }

  /**
   * True if this is the code we sent her, still fresh, and not guessed at too often.
   * A correct code is spent, so it cannot be replayed.
   */
  function verifyCode(guru, phone, given) {
    const key = `${guru.id}:${phone}`;
    const ask = pending.get(key);
    if (!ask || ask.expiresAt < Date.now()) { pending.delete(key); return false; }
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
