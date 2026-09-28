// One row per WhatsApp message, in or out. The console reads these to show what she was told and when.

import { query } from './db.js';

export async function logMessage({ guruId, devoteeId, bookingId = null, direction, kind, payload }) {
  await query(
    `insert into messages_log (guru_id, devotee_id, booking_id, direction, kind, payload_json)
     values ($1, $2, $3, $4, $5, $6)`,
    [guruId, devoteeId, bookingId, direction, kind, JSON.stringify(payload)]);
}
