// The people who open the console: Slike admins and each guru's team. Written only by an admin.

import { query } from './db.js';

const PHONE = /^\d{10,15}$/;

export async function listUsers({ guruId = null, role = null } = {}) {
  const { rows } = await query(
    `select u.id, u.name, u.phone, u.role, u.active, u.guru_id, g.slug as guru_slug, g.name as guru_name,
            u.created_at, u.last_login_at, (u.password_hash is not null) as has_password
       from console_users u left join gurus g on g.id = u.guru_id
      where ($1::uuid is null or u.guru_id = $1) and ($2::text is null or u.role = $2)
      order by u.role, g.name nulls first, u.name`, [guruId, role]);
  return rows.map(userRow);
}

/** Shape check at the edge. Returns an error sentence or null. */
export function validateUser(body) {
  const phone = String(body?.phone ?? '').replace(/\D/g, '');
  if (!PHONE.test(phone)) return 'A WhatsApp number with the country code, like 919876543210';
  if (typeof body?.name !== 'string' || body.name.trim().length > 80) return 'A name, up to 80 characters';
  if (!['admin', 'team'].includes(body?.role)) return 'Role must be admin or team';
  if (body.role === 'team' && !body.guruId) return 'A team member belongs to a guru';
  if (body.role === 'admin' && body.guruId) return 'An admin belongs to Slike, not to a guru';
  return null;
}

/** Adds a person. They sign in for the first time through a WhatsApp code and choose their password then. */
export async function createUser({ name, phone, role, guruId = null }) {
  const digits = String(phone).replace(/\D/g, '');
  const { rows: [u] } = await query(
    `insert into console_users (name, phone, role, guru_id) values ($1, $2, $3, $4)
     on conflict (phone) do update set name = excluded.name, role = excluded.role, guru_id = excluded.guru_id, active = true
     returning id`, [name.trim(), digits, role, guruId]);
  return (await listUsers({})).find((row) => row.id === u.id);
}

/** Access removed, the row kept: the audit of who signed in stays readable. */
export async function deactivateUser(id) {
  const { rows: [u] } = await query('update console_users set active = false where id = $1 returning *', [id]);
  return u ? userRow(u) : null;
}

export async function findUser(id) {
  if (id === 'env') return { id: 'env', name: 'Slike admin', phone: null, role: 'admin', guruId: null, active: true };
  const { rows: [u] } = await query('select * from console_users where id = $1', [id]);
  return u ? userRow(u) : null;
}

/** On boot: with ADMIN_PHONE set and no admin yet, that phone becomes the first admin. */
export async function ensureFirstAdmin(env) {
  const phone = String(env.ADMIN_PHONE ?? '').replace(/\D/g, '');
  if (!phone) return null;
  const { rows } = await query(`select 1 from console_users where role = 'admin' limit 1`);
  if (rows.length) return null;
  return createUser({ name: env.ADMIN_NAME || 'Slike admin', phone, role: 'admin' });
}

function userRow(u) {
  return {
    id: u.id, name: u.name, phone: u.phone, role: u.role, active: u.active, guruId: u.guru_id ?? null,
    guruSlug: u.guru_slug ?? null, guruName: u.guru_name ?? null,
    hasPassword: u.has_password ?? (u.password_hash != null), lastLoginAt: u.last_login_at ? new Date(u.last_login_at).toISOString() : null,
  };
}
