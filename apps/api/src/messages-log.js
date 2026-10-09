// One row per WhatsApp message, in or out. The console reads these to show what she was told and when.

import { query } from './db.js';

export async function logMessage({ guruId, devoteeId, bookingId = null, direction, kind, payload }) {
  await query(
    `insert into messages_log (guru_id, devotee_id, booking_id, direction, kind, payload_json)
     values ($1, $2, $3, $4, $5, $6)`,
    [guruId, devoteeId, bookingId, direction, kind, JSON.stringify(payload)]);
}

/** True when an inbound message with this Meta id is already on record (a redelivery). */
export async function alreadySeen(wamid) {
  const { rows } = await query(
    `select 1 from messages_log where direction = 'in' and payload_json->>'wamid' = $1 and created_at > now() - interval '2 days' limit 1`, [wamid]);
  return rows.length > 0;
}
