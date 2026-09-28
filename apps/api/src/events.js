// His public schedule: satsangs, lives and meetups. Shown on his website; edited from the console.

import { query } from './db.js';

export const EVENT_KINDS = ['satsang', 'live', 'meetup'];
const COLUMNS = 'id, title, kind, starts_at, link, location, notes';

/** Everything from a month ago onward, soonest first. */
export async function listEvents(guruId) {
  const { rows } = await query(
    `select ${COLUMNS} from events where guru_id = $1 and starts_at > now() - interval '30 days' order by starts_at`, [guruId]);
  return rows.map(toView);
}

export async function createEvent(guruId, e) {
  const { rows } = await query(
    `insert into events (guru_id, title, kind, starts_at, link, location, notes) values ($1, $2, $3, $4, $5, $6, $7)
     returning ${COLUMNS}`,
    [guruId, e.title, e.kind, e.startsAt, e.link, e.location, e.notes]);
  return toView(rows[0]);
}

/** Returns null if the event is not this guru's. */
export async function updateEvent(guruId, id, e) {
  const { rows } = await query(
    `update events set title = $3, kind = $4, starts_at = $5, link = $6, location = $7, notes = $8
     where guru_id = $1 and id = $2 returning ${COLUMNS}`,
    [guruId, id, e.title, e.kind, e.startsAt, e.link, e.location, e.notes]);
  return rows[0] ? toView(rows[0]) : null;
}

export async function deleteEvent(guruId, id) {
  const { rowCount } = await query('delete from events where guru_id = $1 and id = $2', [guruId, id]);
  return rowCount > 0;
}

/** Shape check at the edge. Returns an error sentence or null. */
export function validateEvent(e) {
  if (!e || typeof e.title !== 'string' || !e.title.trim()) return 'Give the event a title';
  if (!EVENT_KINDS.includes(e.kind)) return `Kind must be one of ${EVENT_KINDS.join(', ')}`;
  if (Number.isNaN(Date.parse(e.startsAt))) return 'Pick when it starts';
  for (const k of ['link', 'location', 'notes']) {
    if (e[k] != null && typeof e[k] !== 'string') return `${k} must be text`;
  }
  return null;
}

function toView(row) {
  return { id: row.id, title: row.title, kind: row.kind, startsAt: row.starts_at, link: row.link, location: row.location, notes: row.notes };
}
