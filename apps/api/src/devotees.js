// A devotee is a phone number under one guru. Name and "for whom" are filled in later, if ever.

import { query } from './db.js';

/**
 * The row for this phone, created on first contact. Phone is digits with country code, as Meta sends it.
 * `name` is what WhatsApp shows for her, when the door has it; it fills an empty name and never
 * replaces one the team typed.
 */
export async function findOrCreateDevotee(guruId, phone, { name = null } = {}) {
  // The update makes "returning" give back the existing row instead of nothing.
  const { rows } = await query(
    `insert into devotees (guru_id, phone, name) values ($1, $2, $3)
     on conflict (guru_id, phone) do update set name = coalesce(devotees.name, excluded.name)
     returning *`,
    [guruId, phone, name]);
  return rows[0];
}

export async function findDevoteeById(id) {
  const { rows } = await query('select * from devotees where id = $1', [id]);
  return rows[0] ?? null;
}

/** The team learned her name or who the time is for. Empty strings leave the field alone. */
export async function updateDevotee(id, { name, forWhom }) {
  const { rows } = await query(
    `update devotees set name = coalesce(nullif($2, ''), name), for_whom = coalesce(nullif($3, ''), for_whom)
     where id = $1 returning *`,
    [id, name ?? '', forWhom ?? '']);
  return rows[0];
}
