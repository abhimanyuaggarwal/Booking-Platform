// The gurus table: reads for every surface, writes from the console's Settings screen.

import { DAY_KEYS, sittingStep } from '@expert-sessions/shared';
import { query } from './db.js';

export const GURU_STATUSES = ['draft', 'setting_up', 'live', 'paused'];
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

// closed_dates comes back as 'YYYY-MM-DD' strings, the form availableSlots() compares against.
const COLUMNS = `id, slug, domain, name, about, marketing_json, dakshina_paise, whatsapp_number, guru_phone, language,
  pattern_json, closed_dates::text[] as closed_dates, created_at, status, subscription_json, business_json, activated_at,
  razorpay_key_id, razorpay_secret_enc, razorpay_webhook_secret_enc, razorpay_mode, razorpay_connected_at, razorpay_verified_at`;

export async function findGuruBySlug(slug) {
  const { rows } = await query(`select ${COLUMNS} from gurus where slug = $1`, [slug]);
  return rows[0] ?? null;
}

export async function findGuruById(id) {
  const { rows } = await query(`select ${COLUMNS} from gurus where id = $1`, [id]);
  return rows[0] ?? null;
}

/** Every guru, oldest first, for the admin's switcher and the Setup area. */
export async function listGurus() {
  const { rows } = await query(`select ${COLUMNS} from gurus order by created_at`);
  return rows;
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

/**
 * The same pattern on the sitting grid: one start per sitting plus the gap. The console shows his
 * day and week this way — where whole sittings fit — even when the doors offer finer starts
 * (pattern_json.stepMinutes), so a five-minute step never turns the week into 144 rows a day.
 */
export function sittingGridOf(guru) {
  const a = availabilityOf(guru);
  return { ...a, stepMinutes: sittingStep(a) };
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
  if (p.stepMinutes !== undefined && !inRange(p.stepMinutes, 5, 180)) return 'Times offered every 5 to 180 minutes';
  if (!inRange(p.minimumNoticeMinutes, 0, 7 * 24 * 60)) return 'Minimum notice must be 0 minutes to 7 days';
  if (!inRange(p.daysAhead, 1, 60)) return 'Days ahead must be 1 to 60';
  if (!p.weeklyPattern || typeof p.weeklyPattern !== 'object') return 'Send the weekly pattern';
  for (const day of DAY_KEYS) {
    const windows = p.weeklyPattern[day];
    if (!Array.isArray(windows)) return `Windows for ${day} must be a list`;
    for (const w of windows) {
      if (!Array.isArray(w) || w.length < 2 || w.length > 3 || !HHMM.test(w[0]) || !HHMM.test(w[1])) return `Each ${day} window needs a start and end like 10:00 and 13:00`;
      if (w[0] >= w[1]) return `A ${day} window ends before it starts (${w[0]} to ${w[1]})`;
      // An optional third element: which session types this window is for. Absent means all of them.
      if (w.length === 3 && (!Array.isArray(w[2]) || w[2].some((id) => typeof id !== 'string'))) return `The session types for a ${day} window must be a list of ids`;
    }
  }
  if (!Array.isArray(body.closedDates) || body.closedDates.some((d) => !YMD.test(d))) return 'Closed dates must be a list like 2026-09-17';
  if (body.dakshinaPaise !== undefined && !inRange(body.dakshinaPaise, 0, 10_000_000)) return 'Dakshina must be a whole number of paise, up to 1,00,000 rupees';
  return null;
}

/** Shape check for the website content editor. Returns an error sentence or null. */
export function validateSite(body) {
  if (!body || typeof body.name !== 'string' || !body.name.trim()) return 'His name cannot be empty';
  if (body.domain != null && body.domain !== '' && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(body.domain)) return 'Domain should look like guruji.com';
  if (typeof body.about !== 'string') return 'About must be text';
  if (body.guruPhone != null && body.guruPhone !== '' && !/^\d{10,15}$/.test(body.guruPhone)) return 'His own WhatsApp number should be digits with the country code, like 919876543210';
  if (body.language != null && !['en', 'hi'].includes(body.language)) return 'Language must be en or hi';
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
    daysAhead: pattern.daysAhead,
    // Each window keeps its optional list of session types (gurus.validatePattern).
    weeklyPattern: Object.fromEntries(DAY_KEYS.map((d) => [d, pattern.weeklyPattern[d].map((w) => (w.length === 3 ? [w[0], w[1], w[2]] : [w[0], w[1]]))])),
    // How far apart the offered starts are. Left out by an older editor: back to back (slots.js).
    stepMinutes: pattern.stepMinutes ?? pattern.slotMinutes + pattern.gapMinutes,
  };
  // The dakshina lives on the session types now; an editor that still sends it only updates the mirror.
  const { rows } = await query(
    `update gurus set pattern_json = $2, closed_dates = $3::date[], dakshina_paise = coalesce($4, dakshina_paise) where id = $1 returning ${COLUMNS}`,
    [guruId, JSON.stringify(clean), closedDates, dakshinaPaise ?? null]);
  return rows[0];
}

// The picture, facts, themes and quote are optional; an editor that does not know them (an older
// console tab) leaves what is already there instead of wiping it.
export async function updateSite(guruId, { name, domain, about, marketing, guruPhone, language }) {
  const row = (await query('select marketing_json, guru_phone, language from gurus where id = $1', [guruId])).rows[0] ?? {};
  const lang = language === undefined ? (row.language ?? 'en') : language;
  const current = row.marketing_json ?? {};
  // An editor that does not know the field leaves his number alone; an empty field clears it.
  const phone = guruPhone === undefined ? row.guru_phone : (String(guruPhone).replace(/\D/g, '') || null);
  const clean = {
    tagline: marketing.tagline,
    blocks: marketing.blocks.map((b) => ({ heading: b.heading, body: b.body })),
    hero: marketing.hero === undefined ? current.hero : pickHero(marketing.hero),
    facts: marketing.facts === undefined ? current.facts : marketing.facts.map((f) => ({ label: f.label.trim(), value: f.value.trim() })).filter((f) => f.label && f.value),
    themes: marketing.themes === undefined ? current.themes : marketing.themes.map((t) => t.trim()).filter(Boolean),
    quote: marketing.quote === undefined ? current.quote : marketing.quote.trim(),
  };
  const { rows } = await query(
    `update gurus set name = $2, domain = $3, about = $4, marketing_json = $5, guru_phone = $6, language = $7 where id = $1 returning ${COLUMNS}`,
    [guruId, name.trim(), domain || null, about, JSON.stringify(clean), phone, lang]);
  return rows[0];
}

function pickHero(hero) {
  if (!hero) return null;
  const clean = { image: hero.image?.trim() || null, portrait: hero.portrait?.trim() || null, credit: hero.credit?.trim() || null };
  return clean.image || clean.portrait ? clean : null;
}

// ---- Setting a guru up (admin) --------------------------------------------------------------------

/** His site under the platform's own name: <slug>.<PUBLIC_HOST>. One wildcard DNS record serves every guru. */
export function subdomainOf(guru, publicHost = process.env.PUBLIC_HOST) {
  return publicHost ? `${guru.slug}.${publicHost}` : null;
}

/** The guru whose subdomain this host is, or null. "bhagwat.samvad.sli.ke" -> bhagwat. */
export async function findGuruBySubdomain(host, publicHost = process.env.PUBLIC_HOST) {
  if (!host || !publicHost) return null;
  const h = String(host).split(':')[0].toLowerCase();
  const suffix = `.${publicHost.toLowerCase()}`;
  if (!h.endsWith(suffix)) return null;
  const slug = h.slice(0, -suffix.length);
  if (!SLUG.test(slug) || slug === 'www') return null;
  return findGuruBySlug(slug);
}

/** Shape check for "Add a guru". Returns an error sentence or null. */
export function validateNewGuru(body) {
  if (typeof body?.name !== 'string' || !body.name.trim() || body.name.length > 80) return 'His name, up to 80 characters';
  if (!SLUG.test(body?.slug ?? '')) return 'A short address name: lowercase letters, digits and hyphens, like bhagwat';
  if (!['en', 'hi'].includes(body?.language)) return 'Language must be en or hi';
  if (body.domain != null && body.domain !== '' && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(body.domain)) return 'Domain should look like guruji.com';
  return null;
}

const EMPTY_PATTERN = { slotMinutes: 30, gapMinutes: 10, minimumNoticeMinutes: 60, daysAhead: 14, stepMinutes: 40,
  weeklyPattern: { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] } };

/** A new guru: a draft with no timings yet, one kind of sitting (30 minutes, ₹500) his team can change, and his doors shut until he goes live. */
export async function createGuru({ name, slug, language, domain = null }) {
  const { rows: [g] } = await query(
    `insert into gurus (slug, domain, name, about, marketing_json, dakshina_paise, pattern_json, language, status)
     values ($1, $2, $3, '', '{"tagline":"","blocks":[]}'::jsonb, 50000, $4, $5, 'draft') returning ${COLUMNS}`,
    [slug, domain || null, name.trim(), JSON.stringify(EMPTY_PATTERN), language]);
  await query(`insert into session_types (guru_id, name, minutes, dakshina_paise, position) values ($1, '', 30, 50000, 0)`, [g.id]);
  return g;
}

export function validateSetup(body) {
  const sub = body?.subscription;
  if (sub != null) {
    if (typeof sub !== 'object') return 'Send the subscription as an object';
    if (sub.plan != null && (typeof sub.plan !== 'string' || sub.plan.length > 60)) return 'A plan name, up to 60 characters';
    if (sub.feePaise != null && !(Number.isInteger(sub.feePaise) && sub.feePaise >= 0)) return 'The fee is a whole number of paise';
    if (sub.status != null && !['trial', 'active', 'overdue', 'cancelled'].includes(sub.status)) return 'Subscription status must be trial, active, overdue or cancelled';
    if (sub.nextDueOn != null && sub.nextDueOn !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(sub.nextDueOn)) return 'Next due is a date like 2026-11-01';
  }
  const biz = body?.business;
  if (biz != null && (typeof biz !== 'object' || ['legalName', 'address', 'gst', 'pan'].some((k) => biz[k] != null && typeof biz[k] !== 'string'))) return 'Business details are text fields';
  if (body?.domain != null && body.domain !== '' && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(body.domain)) return 'Domain should look like guruji.com';
  return null;
}

/** The admin's fields: his own domain, the subscription, the business details. Each left out stays as it is. */
export async function updateSetup(guruId, { domain, subscription, business }) {
  const current = (await query('select domain, subscription_json, business_json from gurus where id = $1', [guruId])).rows[0];
  const sub = subscription === undefined ? current.subscription_json : { ...current.subscription_json, ...subscription };
  const biz = business === undefined ? current.business_json : { ...current.business_json, ...business };
  const dom = domain === undefined ? current.domain : (domain || null);
  const { rows } = await query(
    `update gurus set domain = $2, subscription_json = $3, business_json = $4 where id = $1 returning ${COLUMNS}`,
    [guruId, dom, JSON.stringify(sub), JSON.stringify(biz)]);
  return rows[0];
}

/** draft -> setting_up -> live <-> paused. Going live is the admin's switch; the route checks readiness first. */
export async function setGuruStatus(guruId, status) {
  if (!GURU_STATUSES.includes(status)) throw new Error(`Unknown guru status ${status}`);
  const { rows } = await query(
    `update gurus set status = $2, activated_at = case when $2 = 'live' and activated_at is null then now() else activated_at end where id = $1 returning ${COLUMNS}`,
    [guruId, status]);
  return rows[0];
}

// ---- His own Razorpay --------------------------------------------------------------------------

export function validateRazorpayKeys(body) {
  const id = String(body?.keyId ?? '').trim();
  if (!/^rzp_(test|live)_[A-Za-z0-9]{8,}$/.test(id)) return 'The key id looks like rzp_live_… or rzp_test_…, from his Razorpay dashboard under Settings, API keys';
  if (String(body?.keySecret ?? '').trim().length < 16) return 'The key secret is shown once, when the key is made; paste it here';
  if (String(body?.webhookSecret ?? '').trim().length < 6) return 'The webhook secret is the one typed into his Razorpay dashboard when the webhook was made';
  return null;
}

/** Writes the connection after guruji approved it. Secrets arrive already encrypted (secrets.js). */
export async function connectRazorpay(guruId, { keyId, secretEnc, webhookSecretEnc }) {
  const mode = keyId.startsWith('rzp_live_') ? 'live' : 'test';
  const { rows } = await query(
    `update gurus set razorpay_key_id = $2, razorpay_secret_enc = $3, razorpay_webhook_secret_enc = $4, razorpay_mode = $5,
            razorpay_connected_at = now(), razorpay_verified_at = null where id = $1 returning ${COLUMNS}`,
    [guruId, keyId, secretEnc, webhookSecretEnc, mode]);
  return rows[0];
}

export async function markRazorpayVerified(guruId, ok) {
  const { rows } = await query(`update gurus set razorpay_verified_at = case when $2 then now() else null end where id = $1 returning ${COLUMNS}`, [guruId, ok]);
  return rows[0];
}

export async function disconnectRazorpay(guruId) {
  const { rows } = await query(
    `update gurus set razorpay_key_id = null, razorpay_secret_enc = null, razorpay_webhook_secret_enc = null, razorpay_mode = null,
            razorpay_connected_at = null, razorpay_verified_at = null where id = $1 returning ${COLUMNS}`, [guruId]);
  return rows[0];
}
