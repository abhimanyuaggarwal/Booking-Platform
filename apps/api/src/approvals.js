// Guruji's Yes. A change to where the money goes, or to the number devotees write to, is parked here
// until he taps Approve on his own WhatsApp. The request's details are encrypted at rest like any
// secret; the summary is what he reads. Two days, then it lapses.

import { query } from './db.js';
import { encrypt, decrypt } from './secrets.js';

const DAYS = 2;

export async function requestApproval({ guru, kind, payload, summary, requestedBy, key }) {
  await query(`update approvals set status = 'expired' where guru_id = $1 and kind = $2 and status = 'pending'`, [guru.id, kind]);
  const { rows: [a] } = await query(
    `insert into approvals (guru_id, kind, payload_enc, summary, requested_by) values ($1, $2, $3, $4, $5) returning id, created_at`,
    [guru.id, kind, encrypt(JSON.stringify(payload), key), summary, requestedBy ?? null]);
  return { id: a.id, createdAt: a.created_at.toISOString() };
}

export async function pendingApproval(guruId, kind) {
  const { rows: [a] } = await query(
    `select id, summary, requested_by, created_at from approvals where guru_id = $1 and kind = $2 and status = 'pending'
        and created_at > now() - make_interval(days => $3::int) order by created_at desc limit 1`, [guruId, kind, DAYS]);
  return a ? { id: a.id, summary: a.summary, requestedBy: a.requested_by, createdAt: a.created_at.toISOString() } : null;
}

/** Guruji tapped. Returns the decision and, when approved, the payload to apply; null when there is nothing to decide. */
export async function decide({ id, approved, key }) {
  const { rows: [a] } = await query(
    `update approvals set status = $2, decided_at = now()
      where id = $1 and status = 'pending' and created_at > now() - make_interval(days => $3::int) returning *`,
    [id, approved ? 'approved' : 'rejected', DAYS]);
  if (!a) return null;
  return { guruId: a.guru_id, kind: a.kind, approved, payload: approved ? JSON.parse(decrypt(a.payload_enc, key)) : null };
}
