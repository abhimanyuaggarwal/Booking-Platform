// Who may open the console, and as whom.
//
// Two roles (6 October 2026): an admin at Slike, who sees every guru, and a team member, who sees
// one guru. Everyone signs in with a phone number and a password; the first password, and a
// forgotten one, are set through a six-digit code sent on WhatsApp. The shared CONSOLE_USER /
// CONSOLE_PASSWORD login from .env stays as the admin's break-glass door, so a lost phone never
// locks Slike out of its own panel.
//
// A signed, expiring cookie carries who this is: user id, role, guru. The signing key is
// CONSOLE_SESSION_SECRET, or the shared password when that is not set, so rotating either signs
// everyone out.

import crypto from 'node:crypto';
import { query } from './db.js';

export const COOKIE_NAME = 'es_console';
const SESSION_DAYS = 7;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export function consoleAuth(env, { sendCode = null } = {}) {
  const user = env.CONSOLE_USER || 'team';
  const password = env.CONSOLE_PASSWORD;
  const key = env.CONSOLE_SESSION_SECRET || password;
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  const mockCode = env.NODE_ENV !== 'production' ? env.OTP_CODE || '1234' : null;
  const sign = (body) => crypto.createHmac('sha256', key).update(body).digest('hex');

  /** The cookie value for a signed-in person: who, which role, which guru, until when. */
  function tokenFor({ id, role, guruId = null }) {
    const body = Buffer.from(JSON.stringify({ u: id, r: role, g: guruId, e: Date.now() + SESSION_DAYS * 86400000 })).toString('base64url');
    return `${body}.${sign(body)}`;
  }

  /** The break-glass door: the shared username and password from .env sign in a Slike admin. */
  function login(username, candidate) {
    if (!password || !safeEqual(username, user) || !safeEqual(candidate, password)) return null;
    return tokenFor({ id: 'env', role: 'admin' });
  }

  /** Who a cookie value stands for, or null if it is forged, tampered with, or expired. */
  function sessionFrom(token) {
    if (typeof token !== 'string') return null;
    const [body, mac] = token.split('.');
    if (!body || !mac || !safeEqual(mac, sign(body))) return null;
    try {
      const s = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (!s || typeof s.e !== 'number' || s.e < Date.now() || !['admin', 'team'].includes(s.r)) return null;
      return { userId: s.u, role: s.r, guruId: s.g ?? null };
    } catch {
      return null;
    }
  }

  function isValid(token) {
    return sessionFrom(token) !== null;
  }

  // ---- phone and password -------------------------------------------------------------------

  /** A person signs in with phone and password. Null when there is no such active person or the password is wrong. */
  async function signIn(phone, candidate) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (!digits || !candidate) return null;
    const { rows: [u] } = await query('select * from console_users where phone = $1 and active', [digits]);
    if (!u || !u.password_hash || !verifyPassword(candidate, u.password_hash)) return null;
    await query('update console_users set last_login_at = now() where id = $1', [u.id]);
    return { user: u, token: tokenFor({ id: u.id, role: u.role, guruId: u.guru_id }) };
  }

  /**
   * Send a six-digit code to a phone that belongs to someone, on WhatsApp. Silent when the phone is
   * nobody's, so the screen cannot be used to find out who has access. Outside production the
   * mock code (OTP_CODE, default 1234) is accepted too, so a laptop without WhatsApp can sign in.
   */
  async function requestCode(phone) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    const { rows: [u] } = await query('select id, name from console_users where phone = $1 and active', [digits]);
    if (!u) return { sent: false };
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await query(
      `insert into login_codes (phone, code_hash, expires_at, attempts) values ($1, $2, now() + make_interval(mins => $3::int), 0)
       on conflict (phone) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = now()`,
      [digits, hashCode(digits, code), CODE_MINUTES]);
    if (sendCode) await sendCode(digits, code);   // ProviderError when WhatsApp refuses: the route says so
    if (mockCode) console.log(`Console sign-in code for ${digits}: ${code} (or the mock ${mockCode} outside production)`);
    return { sent: true };
  }

  /** True if this is the code we sent to this phone, still fresh, and not guessed at too often. A correct code is spent. */
  async function verifyCode(phone, given) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    const typed = String(given ?? '').trim();
    if (mockCode && typed === mockCode) return true;
    const { rows: [ask] } = await query('select * from login_codes where phone = $1', [digits]);
    if (!ask || new Date(ask.expires_at) < new Date()) return false;
    if (ask.attempts >= MAX_ATTEMPTS) { await query('delete from login_codes where phone = $1', [digits]); return false; }
    if (!safeEqual(hashCode(digits, typed), ask.code_hash)) { await query('update login_codes set attempts = attempts + 1 where phone = $1', [digits]); return false; }
    await query('delete from login_codes where phone = $1', [digits]);
    return true;
  }

  /** After a good code: set the password and sign the person in. */
  async function setPassword(phone, newPassword) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (String(newPassword ?? '').length < 8) throw new Error('A password is at least 8 characters');
    const { rows: [u] } = await query('update console_users set password_hash = $2, last_login_at = now() where phone = $1 and active returning *', [digits, hashPassword(newPassword)]);
    if (!u) return null;
    return { user: u, token: tokenFor({ id: u.id, role: u.role, guruId: u.guru_id }) };
  }

  // ---- middleware and cookies ---------------------------------------------------------------

  /** Express middleware: everything after it needs a valid console cookie; `req.session` says who. */
  function requireConsole(req, res, next) {
    const session = sessionFrom(readCookie(req.headers.cookie, COOKIE_NAME));
    if (!session) return res.status(401).json({ error: 'Sign in to the console first' });
    req.session = session;
    next();
  }

  /** Express middleware for the admin's own screens. */
  function requireAdmin(req, res, next) {
    if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Only a Slike admin can do this' });
    next();
  }

  function setCookie(res, token) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  }

  function clearCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  }

  function hashCode(phone, code) {
    return crypto.createHmac('sha256', key).update(`${phone}:${code}`).digest('hex');
  }

  return { user, login, isValid, sessionFrom, tokenFor, signIn, requestCode, verifyCode, setPassword, requireConsole, requireAdmin, setCookie, clearCookie };
}

/** scrypt with a random salt; the stored form carries both so a hash checks itself. */
export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(String(plain), salt, 32).toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  const [kind, salt, hash] = String(stored ?? '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  return safeEqual(crypto.scryptSync(String(plain), salt, 32).toString('hex'), hash);
}

export function readCookie(header = '', name) {
  for (const part of String(header).split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
