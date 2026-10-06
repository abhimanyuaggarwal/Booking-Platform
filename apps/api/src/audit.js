// The trail: who did what to a guru's setup, and when. Written by the admin routes and the settings
// saves; read on the guru's Setup page. Never deleted.

import { query } from './db.js';

export async function audit({ guruId = null, user = null, action, detail = {} }) {
  await query(
    `insert into audit_log (guru_id, user_id, user_name, action, detail) values ($1, $2, $3, $4, $5)`,
    [guruId, user?.id ?? null, user?.name ?? null, action, JSON.stringify(detail)]);
}

export async function auditTrail(guruId, limit = 30) {
  const { rows } = await query(
    `select id, user_name, action, detail, created_at from audit_log where guru_id = $1 order by created_at desc limit $2`, [guruId, limit]);
  return rows.map((r) => ({ id: r.id, who: r.user_name ?? 'Slike', action: r.action, detail: r.detail, at: r.created_at.toISOString() }));
}
