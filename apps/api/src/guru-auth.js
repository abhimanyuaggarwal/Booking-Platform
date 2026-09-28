// Guruji's own screens. For the pilot this is one magic link from .env — no password, no accounts
// (CLAUDE.md). The token is a plain shared secret in the link; his phone keeps it.

import { readCookie } from './console-auth.js';
import crypto from 'node:crypto';

export const GURU_COOKIE = 'es_guru';

export function guruAuth(env) {
  const token = env.GURU_MAGIC_TOKEN;
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';

  function isHim(given) {
    if (!token || typeof given !== 'string') return false;
    const a = Buffer.from(given);
    const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /** The token may arrive in the magic link, a header, or the cookie it left behind. */
  function requireGuru(req, res, next) {
    const given = req.query.t ?? req.header('X-Guru-Token') ?? readCookie(req.headers.cookie, GURU_COOKIE);
    if (!isHim(given)) return res.status(401).json({ error: 'Open the link his team gave him' });
    if (req.query.t) res.setHeader('Set-Cookie', `${GURU_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${180 * 86400}${secure}`);
    next();
  }

  return { isHim, requireGuru };
}
