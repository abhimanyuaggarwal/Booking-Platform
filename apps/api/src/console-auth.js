// One shared console login for the whole team, from .env. No accounts, no roles (CLAUDE.md).
// A signed, expiring cookie proves this browser has logged in. The signing key is the password
// itself, so changing CONSOLE_PASSWORD signs everyone out.

import crypto from 'node:crypto';

export const COOKIE_NAME = 'es_console';
const SESSION_DAYS = 7;

export function consoleAuth(env) {
  const user = env.CONSOLE_USER || 'team';
  const password = env.CONSOLE_PASSWORD;
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  const sign = (expiresAt) => crypto.createHmac('sha256', password).update(String(expiresAt)).digest('hex');

  /** A cookie value for a correct username and password, or null. */
  function login(username, candidate) {
    if (!safeEqual(username, user) || !safeEqual(candidate, password)) return null;
    const expiresAt = Date.now() + SESSION_DAYS * 86400000;
    return `${expiresAt}.${sign(expiresAt)}`;
  }

  function isValid(token) {
    if (typeof token !== 'string') return false;
    const [expiresAt, mac] = token.split('.');
    if (!expiresAt || !mac || Number(expiresAt) < Date.now()) return false;
    return safeEqual(mac, sign(expiresAt));
  }

  /** Express middleware: everything after it needs a valid console cookie. */
  function requireConsole(req, res, next) {
    if (!isValid(readCookie(req.headers.cookie, COOKIE_NAME))) {
      return res.status(401).json({ error: 'Sign in to the console first' });
    }
    next();
  }

  function setCookie(res, token) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  }

  function clearCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  }

  return { user, login, isValid, requireConsole, setCookie, clearCookie };
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
