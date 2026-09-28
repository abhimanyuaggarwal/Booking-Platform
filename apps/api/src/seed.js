// Demo data: one guru, his pattern, twenty devotees, and a realistic week around today.
// Part of the product — the console demo runs on it. Wipes every table first.
//   pnpm --filter api seed   (or pnpm seed from the root)

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { availableSlots, nowInIst, startOfDay, slotIdToInstant, describeSlot, formatRupees } from '@expert-sessions/shared';
import { query, migrate, close, explainDbError } from './db.js';
import { GREETINGS as QR_GREETINGS } from './qr-codes.js';

if (process.env.NODE_ENV === 'production') {
  console.error('seed wipes every table; refusing to run with NODE_ENV=production');
  process.exit(1);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DAKSHINA_PAISE = 50_000;

const pattern = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'config', 'availability.json'), 'utf8'));

// The demo guru is a row, not a build: `pnpm seed -- --slug bhagwat --name Bhagwat` seeds the same
// week under another identity. Defaults are the original demo persona. --domain is optional; with
// none, her join link uses APP_BASE_URL.
const args = readArgs(process.argv.slice(2));
const SLUG = args.slug ?? 'guruji';
const NAME = args.name ?? 'Guruji Vishwanath';

const GURU = {
  slug: SLUG,
  domain: args.domain ?? (SLUG === 'guruji' ? 'guruji.com' : null),
  name: NAME,
  about: 'Forty years in the Advaita tradition. Weekly satsang since 2009. Personal guidance on family, work and practice.',
  marketing: {
    tagline: 'Satsang every Wednesday, 5:00 pm. Personal guidance, 30 minutes.',
    blocks: [
      { heading: 'Who he is', body: `${NAME} has taught in the Advaita tradition for forty years, first at the ashram in Jaipur and, since 2009, in a weekly satsang that is now watched across India.` },
      { heading: 'A personal time', body: 'Thirty minutes, one to one, on video. Bring one question. He listens first.' },
      { heading: 'How it works', body: 'Choose a time, offer the dakshina, and a link arrives on WhatsApp. Open it at your time.' },
    ],
    // The picture band at the top of his page and the portrait over it. The portrait file is his
    // team's to add (apps/web/public/guruji.jpg); the page hides the frame until it exists.
    hero: { image: '/guruji-hero.jpg', portrait: `/${SLUG}.jpg`, credit: 'Dawn on the Ganga at Varanasi. Photo by Patrick Barry, CC BY-SA 2.0' },
    facts: [
      { label: 'Tradition', value: 'Advaita Vedanta' },
      { label: 'Teaching since', value: '1986' },
      { label: 'Sits from', value: 'The ashram in Jaipur' },
      { label: 'Speaks', value: 'Hindi and English' },
    ],
    themes: ['Work and its uncertainties', 'Family and marriage', 'Grief and loss', 'Daily practice and meditation', 'Health and growing old', 'Money and dharma'],
    quote: 'Bring one question. Sit with it for a day before you bring it. Then we will look at it together.',
  },
  whatsappNumber: process.env.WHATSAPP_DISPLAY_NUMBER || '15550001234',
};

// name, phone (digits with country code, as Meta sends them), for whom
const DEVOTEES = [
  ['Ramesh K', '919829012345', null],
  ['Kavita J', '919811022334', null],
  ['Neha S', '919867033445', null],
  ['Suresh B', '919845044556', null],
  ['Anita Rao', '919900055667', 'for my mother'],
  ['Vikram Mehta', '919820066778', null],
  ['Priya Nair', '919447077889', null],
  ['Deepak Sharma', '919871088990', null],
  ['Meera Iyer', '919444099001', 'for my son'],
  ['Arjun Singh', '919876010112', null],
  ['Lakshmi Pillai', '919495021223', null],
  ['Rohit Verma', '919818032334', null],
  ['Sunita Desai', '919822043445', null],
  ['Manoj Gupta', '919935054556', null],
  ['Pooja Bhatt', '919824065667', 'for my husband'],
  ['Harish Reddy', '919848076778', null],
  ['Geeta Kulkarni', '919890087889', null],
  ['Sanjay Joshi', '919826098990', null],
  ['Rekha Menon', '919446109001', null],
  ['Amit Chandra', '919810110112', null],
];

const QUESTIONS = [
  'A property dispute with my brother. I want to do the right thing without losing the family.',
  'My son is 26 and will not settle. How do I stop worrying?',
  'I have been offered a transfer to Pune. My mother is here.',
  'Meditation has gone dry. I sit every morning and nothing happens.',
  'My daughter wants to marry outside the community.',
  'I lost my father in March. The anger has not gone.',
  'Should I leave the job I have held for eighteen years?',
  'How do I speak to my wife about money without it becoming a fight?',
  'I keep starting things and not finishing them.',
  'What is my duty to a friend who has hurt me?',
];

const SOURCES = ['live', 'live', 'live', 'live', 'live', 'page', 'page', 'ashram', 'ashram', 'poster', 'direct'];
const GREETINGS = { ...QR_GREETINGS, direct: 'Hi' };

/** --slug x --name "Y" --domain z  ->  { slug, name, domain }. Anything else is ignored. */
function readArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(slug|name|domain)$/.exec(argv[i]);
    if (m && argv[i + 1] !== undefined) out[m[1]] = argv[++i];
  }
  if (out.slug && !/^[a-z0-9-]{2,40}$/.test(out.slug)) { console.error('--slug should be lowercase letters, digits and dashes, like bhagwat'); process.exit(1); }
  return out;
}

// A fixed random sequence, so re-seeding on the same day gives the same week.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(20260914);
const pick = (arr) => arr[Math.floor(random() * arr.length)];

async function main() {
  await migrate();
  await query('truncate messages_log, sessions, ledger_entries, qr_codes, events, bookings, devotees, gurus cascade');

  const guru = await insertGuru();
  const devotees = await insertDevotees(guru);
  await insertEvents(guru);
  const bookings = await insertWeek(guru, devotees);
  await insertQrCodes(guru);

  const byStatus = bookings.reduce((acc, b) => ({ ...acc, [b.status]: (acc[b.status] || 0) + 1 }), {});
  console.log(`Seeded ${guru.name} (slug ${guru.slug}), ${devotees.length} devotees, ${bookings.length} bookings:`);
  for (const [status, n] of Object.entries(byStatus).sort()) console.log(`  ${status.padEnd(12)} ${n}`);
  console.log(`Slots: http://localhost:3000/api/gurus/${guru.slug}/slots`);
  if (process.env.CONSOLE_GURU_SLUG && process.env.CONSOLE_GURU_SLUG !== guru.slug) console.log(`Note: CONSOLE_GURU_SLUG in .env is ${process.env.CONSOLE_GURU_SLUG}; set it to ${guru.slug} so the console and guruji's screens show this guru.`);
}

async function insertGuru() {
  const { rows } = await query(
    `insert into gurus (slug, domain, name, about, marketing_json, dakshina_paise, whatsapp_number, pattern_json, closed_dates)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::date[]) returning *`,
    [GURU.slug, GURU.domain, GURU.name, GURU.about, JSON.stringify(GURU.marketing), DAKSHINA_PAISE,
      GURU.whatsappNumber, JSON.stringify(withoutClosedDates(pattern)), pattern.closedDates]);
  return rows[0];
}

function withoutClosedDates({ closedDates, ...rest }) {
  return rest; // closed dates live in their own column
}

async function insertDevotees(guru) {
  const rows = [];
  for (const [name, phone, forWhom] of DEVOTEES) {
    const { rows: [d] } = await query(
      'insert into devotees (guru_id, phone, name, for_whom) values ($1, $2, $3, $4) returning *',
      [guru.id, phone, name, forWhom]);
    rows.push(d);
  }
  return rows;
}

// --- time helpers: "wall" Dates carry IST wall-clock in UTC fields (see packages/shared/slots.js) ---
const todayWall = new Date(startOfDay(nowInIst()));
const now = new Date();

function wallAt(dayWall, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(dayWall.getTime() + (h * 60 + m) * MINUTE);
}
function toInstant(wall) {
  return slotIdToInstant(`slot:${wall.toISOString().slice(0, 16)}`);
}
function nextWeekday(fromWall, weekday) {
  const ahead = (weekday - fromWall.getUTCDay() + 7) % 7 || 7;
  return new Date(fromWall.getTime() + ahead * DAY);
}

async function insertEvents(guru) {
  const nextWed = nextWeekday(todayWall, 3);
  const events = [
    ['Weekly satsang — verses on karma, and your questions', 'satsang', toInstant(wallAt(new Date(nextWed.getTime() - 7 * DAY), '17:00')), `https://www.youtube.com/@${SLUG}/live`, null, 'Last week'],
    ['Weekly satsang — verses on karma, and your questions', 'satsang', toInstant(wallAt(nextWed, '17:00')), `https://www.youtube.com/@${SLUG}/live`, null, null],
    ['Live — questions from the week', 'live', toInstant(wallAt(nextWeekday(todayWall, 6), '19:00')), `https://www.youtube.com/@${SLUG}/live`, null, null],
    ['Morning meetup at the ashram', 'meetup', toInstant(wallAt(nextWeekday(todayWall, 0), '10:00')), null, 'Vishwanath Ashram, Jaipur', 'Open to all. Chai after.'],
  ];
  for (const [title, kind, startsAt, link, location, notes] of events) {
    await query(
      'insert into events (guru_id, title, kind, starts_at, link, location, notes) values ($1, $2, $3, $4, $5, $6, $7)',
      [guru.id, title, kind, startsAt, link, location, notes]);
  }
}

// Three days back to four days ahead, filled from the same slot maths the doors use, so every
// seeded booking sits on a slot the pattern would actually offer.
async function insertWeek(guru, devotees) {
  const dayPattern = { ...pattern, minimumNoticeMinutes: 0, daysAhead: 1 };
  let nextDevotee = 0;
  const takeDevotee = () => devotees[nextDevotee++ % devotees.length];

  const planned = [];
  const openFuture = [];
  const openToday = [];
  for (let offset = -3; offset <= 4; offset++) {
    const dayWall = new Date(todayWall.getTime() + offset * DAY);
    for (const slot of availableSlots(dayPattern, new Set(), dayWall)) {
      const start = slotIdToInstant(slot.id);
      if (random() < 0.28) { // leave gaps so the grid shows where he is free
        if (start > now) (offset === 0 ? openToday : openFuture).push(slot);
        continue;
      }
      // She booked some days before her time — but never in the future, or the ledger would show
      // money arriving on a day that has not happened.
      const bookedAt = new Date(start.getTime() - (1 + Math.floor(random() * 5)) * DAY - Math.floor(random() * 6) * HOUR);
      const createdAt = bookedAt < now ? bookedAt : new Date(now.getTime() - random() * 4 * DAY - Math.floor(random() * 12) * HOUR);
      planned.push({
        devotee: takeDevotee(), slot, start, offset,
        source: pick(SOURCES),
        status: start < now ? 'completed' : 'confirmed',
        question: random() < 0.5 ? pick(QUESTIONS) : null,
        media: null,
        createdAt, paidAt: new Date(createdAt.getTime() + 4 * MINUTE),
        paidWithCredit: false,
      });
    }
  }
  for (const p of planned) if (!p.question && random() < 0.4) p.media = `seed-audio-${p.slot.id.slice(5, 21).replace(/\D/g, '')}`;

  // The stories the console screens need to tell.
  const past = planned.filter((p) => p.start < now);
  const future = planned.filter((p) => p.start > now);
  if (past[0]) past[0].status = 'no_show';
  if (past[1]) { past[1].status = 'refunded'; past[1].devotee = devotees[3]; } // Suresh B: guruji could not sit
  if (past[2]) { past[2].status = 'cancelled'; past[2].devotee = devotees[1]; } // Kavita J cancels...
  const creditUser = future.find((p, i) => i > 2 && p.offset >= 2); // not one of the rows given a story below
  if (past[2] && creditUser) { creditUser.devotee = devotees[1]; creditUser.paidWithCredit = true; } // ...and rebooks with the credit
  if (past[3] && future[0]) { past[3].status = 'rescheduled'; future[0].rescheduledFrom = past[3]; future[0].devotee = past[3].devotee; }
  if (future[1]) { future[1].status = 'held'; future[1].paidAt = null; future[1].createdAt = new Date(now.getTime() - 2 * MINUTE); }
  if (future[2]) { future[2].status = 'held'; future[2].paidAt = null; future[2].createdAt = new Date(now.getTime() - 6 * MINUTE); }

  const held = openToday[0] ?? openFuture[0];
  if (held) planned.push({ devotee: devotees[5], slot: held, start: slotIdToInstant(held.id), offset: 0, source: 'live', status: 'held', question: null, media: null, createdAt: new Date(now.getTime() - 3 * MINUTE), paidAt: null, paidWithCredit: false });
  const expiredOn = openToday[1] ?? planned.find((p) => p.offset === 0)?.slot ?? openFuture[1];
  if (expiredOn) planned.push({ devotee: devotees[2], slot: expiredOn, start: slotIdToInstant(expiredOn.id), offset: 0, source: 'live', status: 'expired', question: null, media: null, createdAt: new Date(now.getTime() - 40 * MINUTE), paidAt: null, paidWithCredit: false }); // Neha S chose a time and did not finish paying

  // Write them, old row before the row that replaced it.
  planned.sort((a, b) => a.start - b.start);
  let linkNo = 0;
  const inserted = [];
  for (const p of planned) {
    if (p.rescheduledFrom && !p.rescheduledFrom.id) await writeBooking(guru, p.rescheduledFrom, ++linkNo);
    if (!p.id) await writeBooking(guru, p, ++linkNo);
    inserted.push(p);
  }
  return inserted;
}

async function writeBooking(guru, p, linkNo) {
  const paid = p.paidAt !== null;
  const { rows: [row] } = await query(
    `insert into bookings (guru_id, devotee_id, slot_start, status, source, question_text, question_media_id,
                           payment_link_id, rescheduled_from_id, created_at, paid_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [guru.id, p.devotee.id, p.start, p.status, p.source, paid ? p.question : null, paid ? p.media : null,
      `plink_seed_${String(linkNo).padStart(3, '0')}`, p.rescheduledFrom?.id ?? null, p.createdAt, p.paidAt]);
  p.id = row.id;

  const ledger = (kind, at, ref, expiresAt = null) => query(
    `insert into ledger_entries (guru_id, booking_id, devotee_id, kind, amount_paise, provider_ref, expires_at, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [guru.id, p.id, p.devotee.id, kind, DAKSHINA_PAISE, ref, expiresAt, at]);

  if (paid && p.paidWithCredit) await ledger('credit_used', p.paidAt, null);
  if (paid && !p.paidWithCredit && !p.rescheduledFrom) await ledger('payment', p.paidAt, `pay_seed_${String(linkNo).padStart(3, '0')}`);
  if (p.status === 'refunded') await ledger('refund', new Date(p.start.getTime() - 2 * HOUR), `rfnd_seed_${String(linkNo).padStart(3, '0')}`);
  if (p.status === 'cancelled') {
    const cancelledAt = new Date(p.start.getTime() - 6 * HOUR);
    await ledger('credit_issued', cancelledAt, null, new Date(cancelledAt.getTime() + 30 * DAY));
  }

  if (p.status === 'completed' || p.status === 'no_show') {
    const startedAt = new Date(p.start.getTime() + 2 * MINUTE);
    const showed = p.status === 'completed';
    await query(
      `insert into sessions (guru_id, booking_id, room_id, started_at, ended_at, devotee_joined_at, guru_joined_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [guru.id, p.id, `seed-room-${linkNo}`, startedAt,
        new Date(startedAt.getTime() + (showed ? 29 : 10) * MINUTE),
        showed ? new Date(p.start.getTime() - 3 * MINUTE) : null, startedAt]);
  }

  await writeMessages(guru, p);
}

// What the thread with her looked like, so the console can show it.
async function writeMessages(guru, p) {
  const dakshina = formatRupees(DAKSHINA_PAISE);
  const log = (direction, kind, payload, at) => query(
    `insert into messages_log (guru_id, booking_id, devotee_id, direction, kind, payload_json, created_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [guru.id, p.id, p.devotee.id, direction, kind, JSON.stringify(payload), at]);

  const t = (offsetMinutes) => new Date(p.createdAt.getTime() + offsetMinutes * MINUTE);
  if (p.source !== 'page') {
    await log('in', 'text', { from: p.devotee.phone, kind: 'text', text: GREETINGS[p.source] }, t(-2));
    await log('out', 'buttons', { body: `Namaste 🙏\nBook time with ${guru.name} — 30 minutes, dakshina ${dakshina}.\nNext available:` }, t(-1));
    await log('out', 'link', { body: `${describeSlot(p.slot.id)} with ${guru.name}.\nDakshina ${dakshina}.\n\nThis time is held for you for 10 minutes.`, buttonLabel: `Pay ${dakshina}` }, t(0));
  }
  if (p.paidAt) {
    await log('out', 'link', { body: `Your time is confirmed.\n${describeSlot(p.slot.id)} with ${guru.name}.\n\nOpen this link at your time to join.`, buttonLabel: 'Join session' }, p.paidAt);
    if (p.question) await log('in', 'text', { from: p.devotee.phone, kind: 'text', text: p.question }, new Date(p.paidAt.getTime() + 3 * MINUTE));
    if (p.media) await log('in', 'audio', { from: p.devotee.phone, kind: 'audio', mediaId: p.media }, new Date(p.paidAt.getTime() + 3 * MINUTE));
  }
}

async function insertQrCodes(guru) {
  const codes = [
    ['live', 'Slike test stream · L-band', GREETINGS.live],
    ['live', 'YouTube live · L-band', GREETINGS.live],
    ['ashram', 'Ashram notice board', GREETINGS.ashram],
    ['poster', 'Poster · satsang hall', GREETINGS.poster],
  ];
  for (const [source, label, text] of codes) {
    await query('insert into qr_codes (guru_id, source, label, wa_link) values ($1, $2, $3, $4)',
      [guru.id, source, label, `https://wa.me/${guru.whatsapp_number}?text=${encodeURIComponent(text)}`]);
  }
}

try {
  await main();
} catch (err) {
  console.error(explainDbError(err));
  process.exit(1);
}
await close();
