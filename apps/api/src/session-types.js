// A guru's session types: the few ways to sit with him, each a length and a dakshina. Up to three,
// so a WhatsApp message can show them as buttons and a sixty-year-old can choose between them.
// The first active one is the default: the website's headline, the console's open rows, and the
// one offered when a door does not ask. gurus.dakshina_paise and pattern_json.slotMinutes mirror
// the default so older readers (seed, reports) keep agreeing with it.

import { formatRupees } from '@expert-sessions/shared';
import { query, transaction } from './db.js';

export const MAX_SESSION_TYPES = 3;

export async function listSessionTypes(guruId, { activeOnly = false } = {}) {
  const { rows } = await query(
    `select * from session_types where guru_id = $1 ${activeOnly ? 'and active' : ''} order by position, created_at`, [guruId]);
  return rows;
}

export async function findSessionType(guruId, id) {
  if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) return null;
  const { rows } = await query('select * from session_types where guru_id = $1 and id = $2', [guruId, id]);
  return rows[0] ?? null;
}

/** The first active type. Every guru has at least one (the migration made it). */
export async function defaultSessionType(guruId) {
  const types = await listSessionTypes(guruId, { activeOnly: true });
  if (!types[0]) throw new Error(`Guru ${guruId} has no active session type; add one in Settings`);
  return types[0];
}

/**
 * Shape check at the edge for the console's editor. Returns an error sentence or null.
 * Accepts { types: [{ id?, name, minutes, dakshinaPaise, active }] } in display order; the first active is the default.
 */
export function validateSessionTypes(body) {
  const types = body?.types;
  if (!Array.isArray(types) || types.length === 0) return 'Add at least one session type';
  if (types.length > MAX_SESSION_TYPES) return `At most ${MAX_SESSION_TYPES} session types, so the WhatsApp buttons stay simple`;
  const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  for (const t of types) {
    if (t.id != null && !/^[0-9a-f-]{36}$/i.test(t.id)) return 'A session type id is not valid';
    if (typeof t.name !== 'string' || t.name.length > 40) return 'A name is up to 40 characters, or empty';
    if (!inRange(t.minutes, 5, 180)) return 'A session is 5 to 180 minutes';
    if (!inRange(t.dakshinaPaise, 0, 10_000_000)) return 'Dakshina must be a whole number of paise, up to 1,00,000 rupees';
    if (typeof t.active !== 'boolean') return 'Each type says whether it is active';
  }
  if (!types.some((t) => t.active)) return 'Keep at least one session type active';
  return null;
}

/**
 * The editor saves the whole list. Types it still names are updated in that order; types it left
 * out are switched off, never deleted — old bookings point at them. The default is mirrored to the
 * guru row so nothing else has to look here for "his" dakshina or sitting length.
 */
export async function replaceSessionTypes(guruId, types) {
  return transaction(async (q) => {
    const { rows: existing } = await q('select id from session_types where guru_id = $1', [guruId]);
    const keep = new Set();
    for (const [i, t] of types.entries()) {
      if (t.id && existing.some((e) => e.id === t.id)) {
        await q(`update session_types set name = $3, minutes = $4, dakshina_paise = $5, position = $6, active = $7 where id = $2 and guru_id = $1`,
          [guruId, t.id, t.name.trim(), t.minutes, t.dakshinaPaise, i, t.active]);
        keep.add(t.id);
      } else {
        const { rows: [made] } = await q(
          `insert into session_types (guru_id, name, minutes, dakshina_paise, position, active) values ($1, $2, $3, $4, $5, $6) returning id`,
          [guruId, t.name.trim(), t.minutes, t.dakshinaPaise, i, t.active]);
        keep.add(made.id);
      }
    }
    await q(`update session_types set active = false where guru_id = $1 and not (id = any($2::uuid[]))`, [guruId, [...keep]]);
    const first = types.find((t) => t.active);
    await q(`update gurus set dakshina_paise = $2, pattern_json = jsonb_set(pattern_json, '{slotMinutes}', $3::jsonb) where id = $1`,
      [guruId, first.dakshinaPaise, String(first.minutes)]);
    const { rows } = await q('select * from session_types where guru_id = $1 order by position, created_at', [guruId]);
    return rows;
  });
}

/** "10 min · ₹500" / "10 मिनट · ₹500" — what a WhatsApp button shows; within Meta's twenty characters. */
export function typeLabel(type, lang = 'en') {
  return `${type.minutes} ${lang === 'hi' ? 'मिनट' : 'min'} · ${formatRupees(type.dakshina_paise)}`;
}

/** What a page or the console may know about a type. */
export function publicType(t) {
  return { id: t.id, name: t.name, minutes: t.minutes, dakshinaPaise: t.dakshina_paise, dakshina: formatRupees(t.dakshina_paise), active: t.active };
}
