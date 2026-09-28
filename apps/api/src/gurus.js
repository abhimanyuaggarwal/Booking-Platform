// The gurus table: reads for every surface, writes from the console's Settings screen.

import { DAY_KEYS } from '@expert-sessions/shared';
import { query } from './db.js';

// closed_dates comes back as 'YYYY-MM-DD' strings, the form availableSlots() compares against.
const COLUMNS = `id, slug, domain, name, about, marketing_json, dakshina_paise, whatsapp_number,
  pattern_json, closed_dates::text[] as closed_dates, created_at`;

export async function findGuruBySlug(slug) {
  const { rows } = await query(`select ${COLUMNS} from gurus where slug = $1`, [slug]);
  return rows[0] ?? null;
}

export async function findGuruById(id) {
  const { rows } = await query(`select ${COLUMNS} from gurus where id = $1`, [id]);
  return rows[0] ?? null;
}

/** The only guru, for the pilot's single-guru screens. */
export async function firstGuru() {
  const { rows } = await query(`select ${COLUMNS} from gurus order by created_at limit 1`);
  return rows[0] ?? null;
}

/** His own domain, as the browser sent it in the Host header. Port and any www. are stripped first. */
export async function findGuruByDomain(host) {
  if (!host) return null;
  const domain = String(host).split(':')[0].replace(/^www\./i, '').toLowerCase();
  const { rows } = await query(`select ${COLUMNS} from gurus where lower(domain) = $1`, [domain]);
  return rows[0] ?? null;
}

// Meta sends the number she wrote to as display_phone_number, digits only. Compare digits to digits.
export async function findGuruByWhatsappNumber(number) {
  if (!number) return null;
  const digits = String(number).replace(/\D/g, '');
  const { rows } = await query(
    `select ${COLUMNS} from gurus where regexp_replace(coalesce(whatsapp_number, ''), '\\D', '', 'g') = $1`,
    [digits]);
  return rows[0] ?? null;
}

/** The shape availableSlots() wants: the pattern plus the closed dates, which live in their own column. */
export function availabilityOf(guru) {
  return { ...guru.pattern_json, closedDates: guru.closed_dates };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Shape check for the pattern editor, at the edge. Returns an error sentence or null.
 * Accepts { pattern: { slotMinutes, gapMinutes, minimumNoticeMinutes, daysAhead, weeklyPattern }, closedDates, dakshinaPaise }.
 */
export function validatePattern(body) {
  const p = body?.pattern;
  if (!p) return 'Send the pattern';
  const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!inRange(p.slotMinutes, 5, 180)) return 'Slot length must be 5 to 180 minutes';
  if (!inRange(p.gapMinutes, 0, 120)) return 'Gap must be 0 to 120 minutes';
  if (!inRange(p.minimumNoticeMinutes, 0, 7 * 24 * 60)) return 'Minimum notice must be 0 minutes to 7 days';
  if (!inRange(p.daysAhead, 1, 60)) return 'Days ahead must be 1 to 60';
  if (!p.weeklyPattern || typeof p.weeklyPattern !== 'object') return 'Send the weekly pattern';
  for (const day of DAY_KEYS) {
    const windows = p.weeklyPattern[day];
    if (!Array.isArray(windows)) return `Windows for ${day} must be a list`;
    for (const w of windows) {
      if (!Array.isArray(w) || w.length !== 2 || !HHMM.test(w[0]) || !HHMM.test(w[1])) return `Each ${day} window needs a start and end like 10:00 and 13:00`;
      if (w[0] >= w[1]) return `A ${day} window ends before it starts (${w[0]} to ${w[1]})`;
    }
  }
  if (!Array.isArray(body.closedDates) || body.closedDates.some((d) => !YMD.test(d))) return 'Closed dates must be a list like 2026-09-17';
  if (!inRange(body.dakshinaPaise, 0, 10_000_000)) return 'Dakshina must be a whole number of paise, up to 1,00,000 rupees';
  return null;
}

/** Shape check for the website content editor. Returns an error sentence or null. */
export function validateSite(body) {
  if (!body || typeof body.name !== 'string' || !body.name.trim()) return 'His name cannot be empty';
  if (body.domain != null && body.domain !== '' && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(body.domain)) return 'Domain should look like guruji.com';
  if (typeof body.about !== 'string') return 'About must be text';
  const m = body.marketing;
  if (!m || typeof m.tagline !== 'string' || !Array.isArray(m.blocks)) return 'Send the tagline and text blocks';
  if (m.blocks.some((b) => typeof b?.heading !== 'string' || typeof b?.body !== 'string')) return 'Each text block needs a heading and a body';
  if (m.facts != null && (!Array.isArray(m.facts) || m.facts.some((f) => typeof f?.label !== 'string' || typeof f?.value !== 'string'))) return 'Each fact needs a label and a value';
  if (m.themes != null && (!Array.isArray(m.themes) || m.themes.some((t) => typeof t !== 'string'))) return 'Themes should be a list of short phrases';
  if (m.quote != null && typeof m.quote !== 'string') return 'The quote must be text';
  if (m.hero != null && (typeof m.hero !== 'object' || ['image', 'portrait', 'credit'].some((k) => m.hero[k] != null && typeof m.hero[k] !== 'string'))) return 'The picture fields must be web addresses or paths';
  return null;
}

export async function updatePattern(guruId, { pattern, closedDates, dakshinaPaise }) {
  const clean = {
    slotMinutes: pattern.slotMinutes, gapMinutes: pattern.gapMinutes, minimumNoticeMinutes: pattern.minimumNoticeMinutes,
    daysAhead: pattern.daysAhead, weeklyPattern: Object.fromEntries(DAY_KEYS.map((d) => [d, pattern.weeklyPattern[d]])),
  };
  const { rows } = await query(
    `update gurus set pattern_json = $2, closed_dates = $3::date[], dakshina_paise = $4 where id = $1 returning ${COLUMNS}`,
    [guruId, JSON.stringify(clean), closedDates, dakshinaPaise]);
  return rows[0];
}

// The picture, facts, themes and quote are optional; an editor that does not know them (an older
// console tab) leaves what is already there instead of wiping it.
export async function updateSite(guruId, { name, domain, about, marketing }) {
  const current = (await query('select marketing_json from gurus where id = $1', [guruId])).rows[0]?.marketing_json ?? {};
  const clean = {
    tagline: marketing.tagline,
    blocks: marketing.blocks.map((b) => ({ heading: b.heading, body: b.body })),
    hero: marketing.hero === undefined ? current.hero : pickHero(marketing.hero),
    facts: marketing.facts === undefined ? current.facts : marketing.facts.map((f) => ({ label: f.label.trim(), value: f.value.trim() })).filter((f) => f.label && f.value),
    themes: marketing.themes === undefined ? current.themes : marketing.themes.map((t) => t.trim()).filter(Boolean),
    quote: marketing.quote === undefined ? current.quote : marketing.quote.trim(),
  };
  const { rows } = await query(
    `update gurus set name = $2, domain = $3, about = $4, marketing_json = $5 where id = $1 returning ${COLUMNS}`,
    [guruId, name.trim(), domain || null, about, JSON.stringify(clean)]);
  return rows[0];
}

function pickHero(hero) {
  if (!hero) return null;
  const clean = { image: hero.image?.trim() || null, portrait: hero.portrait?.trim() || null, credit: hero.credit?.trim() || null };
  return clean.image || clean.portrait ? clean : null;
}
