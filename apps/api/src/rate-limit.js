// Online guessing is the one attack a phone-and-code door invites. A few attempts per key per window
// is plenty for a person and nothing for a script. In memory on purpose: one api process serves the
// pilot, and a restart forgiving everyone is fine.

/**
 * @param {{max: number, windowMs: number}} rule
 * @returns {(key: string) => boolean} true while the key is under its limit; counts the attempt
 */
export function limiter({ max, windowMs }) {
  const hits = new Map(); // key -> timestamps inside the window
  let lastSweep = Date.now();
  return function allow(key) {
    const now = Date.now();
    if (now - lastSweep > windowMs) {          // forget keys that went quiet, so the map cannot grow for ever
      for (const [k, times] of hits) if (times[times.length - 1] < now - windowMs) hits.delete(k);
      lastSweep = now;
    }
    const times = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (times.length >= max) { hits.set(key, times); return false; }
    times.push(now); hits.set(key, times);
    return true;
  };
}

export const TOO_MANY = 'Too many attempts from here. Wait ten minutes and try again.';
