// QR codes the team prints or overlays on a live. Each one is a wa.me link with a greeting baked in;
// the greeting is how the WhatsApp door learns where she came from (sourceFromText in whatsapp-door.js).

import { query } from './db.js';

export const GREETINGS = { live: 'Hi — from the live', ashram: 'Hi — ashram', poster: 'Hi — poster', page: 'Hi — from his page' };
export const QR_SOURCES = ['live', 'ashram', 'poster', 'custom'];

export function greetingFor(source, label) {
  return GREETINGS[source] ?? `Hi — ${label}`;
}

export function waLink(whatsappNumber, text) {
  const digits = String(whatsappNumber ?? '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * The link is rebuilt from his CURRENT whatsapp number every time, never read from the stored
 * column. Change his number and a stored link would point at the old one for ever — and a QR that
 * is already printed and stuck on a wall cannot be reissued. The column stays as a record of what
 * was generated; this is what the team is shown and prints.
 */
export async function listQrCodes(guru) {
  const { rows } = await query(
    'select id, source, label, wa_link, created_at from qr_codes where guru_id = $1 order by created_at desc', [guru.id]);
  return rows.map((row) => toView(row, guru.whatsapp_number));
}

export async function createQrCode(guru, { source, label }) {
  const link = waLink(guru.whatsapp_number, greetingFor(source, label));
  const { rows } = await query(
    `insert into qr_codes (guru_id, source, label, wa_link) values ($1, $2, $3, $4)
     returning id, source, label, wa_link, created_at`,
    [guru.id, source, label, link]);
  return toView(rows[0], guru.whatsapp_number);
}

function toView(row, whatsappNumber = null) {
  const link = whatsappNumber ? waLink(whatsappNumber, greetingFor(row.source, row.label)) : row.wa_link;
  return {
    id: row.id, source: row.source, label: row.label, waLink: link, createdAt: row.created_at,
    // True when a code was generated against a different number — anything printed from it is dead.
    stale: link !== row.wa_link,
  };
}
