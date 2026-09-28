// The whole journey, end to end, in one command: pnpm demo
//
// It drives the running api exactly as the real doors do — Meta's webhook shape, Razorpay's signed
// webhook, the console's endpoints, the socket, guruji's taps. Where an outside service is not
// wired on this machine it stands in for it and says so, so the output never claims more than was
// proved. Run `pnpm seed` first, and have `pnpm dev` running.

import 'dotenv/config';
import crypto from 'node:crypto';
import { describeSlot } from '@expert-sessions/shared';
import { query, close, explainDbError } from './db.js';

const API = process.env.DEMO_API ?? `http://localhost:${process.env.PORT || 3000}`;
const PHONE = process.env.DEMO_PHONE ?? '919000000007';
const CONSOLE = { username: process.env.CONSOLE_USER || 'team', password: process.env.CONSOLE_PASSWORD };

let step = 0;
const notes = [];
const say = (text) => console.log(`  ${text}`);
const heading = (text) => console.log(`\n${String(++step).padStart(2, ' ')}. ${text}`);
const stood_in = (what) => { notes.push(what); say(`      (stood in for ${what} — not wired on this machine)`); };
const problems = [];
const failed = (what) => { problems.push(what); say(`      PROBLEM: ${what}`); };

async function main() {
  const guru = await one('select * from gurus order by created_at limit 1');
  if (!guru) throw new Error('No guru. Run pnpm seed first.');
  const consoleCookie = await signInToConsole();
  const guruToken = process.env.GURU_MAGIC_TOKEN;

  heading('She is watching the live and scans the QR');
  const qr = await one(`select label, wa_link from qr_codes where guru_id = $1 and source = 'live' order by created_at limit 1`, [guru.id]);
  say(`WhatsApp opens from "${qr.label}" with a greeting already typed`);
  await inbound(guru, { type: 'text', text: { body: 'Hi — from the live' } });
  const offered = await waitFor(() => lastOut(PHONE, 'buttons'));
  if (!offered) say('No times were offered — check his pattern in the console Settings');
  else if (offered.payload_json.delivered === false) { say('The times were composed for her'); stood_in('WhatsApp: no live token, so nothing reached her phone'); }
  else say('She is offered the two nearest times and "Other times"');

  heading('She taps a time');
  const slot = (await json(`${API}/api/gurus/${guru.slug}/slots`)).slots[0];
  if (!slot) throw new Error('No open times. Widen his pattern in the console, or re-seed.');
  await inbound(guru, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: slot.id, title: slot.label } } });
  let booking = await waitFor(() => one(`select b.* from bookings b join devotees d on d.id = b.devotee_id
                                          where d.phone = $1 order by b.created_at desc limit 1`, [PHONE]));
  if (!booking) throw new Error('The tap did not hold a time; look at the api log.');
  say(`${describeSlot(slot.id)} is held for her`);

  heading('She pays the dakshina by UPI');
  // The booking row is written before Razorpay is called, so its link id arrives a moment later.
  // Wait for it rather than reading the row we already have: judging Razorpay on a row fetched
  // milliseconds earlier reports a working account as unwired, which is the worst kind of wrong
  // for an acceptance test.
  const paid = await waitFor(async () => {
    const b = await one('select * from bookings where id = $1', [booking.id]);
    return b.payment_link_id ? b : null;
  });
  const paymentLinkId = paid?.payment_link_id ?? `plink_demo_${Date.now()}`;
  if (!paid) {
    stood_in('Razorpay: the payment link could not be made, so the hold was released');
    await query(`update bookings set status = 'held', payment_link_id = $2 where id = $1`, [booking.id, paymentLinkId]);
  }
  await razorpayPaid(paymentLinkId);
  booking = await waitFor(async () => {
    const b = await one('select * from bookings where id = $1', [booking.id]);
    return b.status === 'confirmed' ? b : null;
  }) ?? await one('select * from bookings where id = $1', [booking.id]);
  say(`Her time is ${booking.status}`);
  // The ledger row is written a moment after the status flips; wait for it rather than misjudge it.
  const ledger = await waitFor(() => one(`select kind, amount_paise from ledger_entries where booking_id = $1`, [booking.id]));
  if (ledger) say(`The ledger records ${ledger.kind} of ${ledger.amount_paise / 100} rupees`); else failed('Nothing reached the ledger');

  heading('She sends what she wants to ask');
  await inbound(guru, { type: 'text', text: { body: 'My son is 26 and will not settle. How do I stop worrying?' } });
  booking = await waitFor(async () => {
    const b = await one('select * from bookings where id = $1', [booking.id]);
    return b.question_text ? b : null;
  }) ?? booking;
  say(booking.question_text ? `Guruji will read: "${booking.question_text}"` : 'Her question did not attach — look at the api log');

  heading('The team sees her on Today');
  await query(`update bookings set slot_start = now() + interval '6 minutes' where id = $1`, [booking.id]);
  const today = await json(`${API}/api/console/today`, { cookie: consoleCookie });
  const hers = today.timeline.find((t) => t.booking?.id === booking.id);
  say(hers ? `${hers.time} · ${hers.booking.name ?? 'her'} · ${hers.booking.status}` : 'She is not on Today — check the date');
  say(`Collected today: ${today.kpis.collectedTodayPaise / 100} rupees`);

  heading('She opens her link and waits');
  const waitingSocket = await openSocket(booking.id, 'devotee');
  const board = await json(`${API}/api/console/waiting`, { cookie: consoleCookie });
  const her = board.people.find((p) => p.id === booking.id);
  say(her ? `The team's panel: ${her.name} — ${her.inRoomSince ? 'in the waiting room' : 'link not opened'}` : 'She is not on the waiting panel yet');

  heading('The team tells her he is running late');
  const told = await post(`${API}/api/console/bookings/${booking.id}/message`, { text: 'Joining in 10 minutes' }, consoleCookie);
  say(told.landed === 'room' ? 'It appeared in her waiting room at once'
    : told.landed === 'whatsapp' ? 'She had not opened her link, so it went to her WhatsApp'
    : 'WhatsApp refused it, and the team is told to call her');
  if (told.landed === 'failed') stood_in('WhatsApp: no live token, so nothing was delivered');

  heading('Guruji taps Join');
  if (!guruToken) throw new Error('Set GURU_MAGIC_TOKEN in .env to run his part.');
  const started = await post(`${API}/api/guru/sessions/${booking.id}/start`, null, null, guruToken);
  if (started.error) {
    say('His tap needs the video room, and it answered:');
    say(`  ${started.error}`);
    stood_in('100ms: his tap, the call and its end could not be shown');
    await query(`update bookings set status = 'completed' where id = $1`, [booking.id]);
  } else {
    say(`The room is open, and her card beside the video reads "${started.devotee.context}"`);
    say(`Her waiting room received: ${(await readSocket(waitingSocket)).join(', ') || 'nothing'}`);

    heading('Guruji taps End');
    const ended = await post(`${API}/api/guru/sessions/${booking.id}/end`, null, null, guruToken);
    say(ended.error ? `It did not end: ${ended.error}` : `They sat for ${ended.minutes} minute(s)`);
    say(`Her screen received: ${(await readSocket(waitingSocket)).join(', ') || 'nothing'}`);
    booking = await one('select * from bookings where id = $1', [booking.id]);
    say(`Her booking is now ${booking.status}`);
  }

  heading('Another devotee cancels in time, and books again with her credit');
  const site = `${API}/api/site`;
  const other = await one(`select d.* from devotees d join bookings b on b.devotee_id = d.id
                            where b.status = 'confirmed' and b.slot_start > now() + interval '5 hours'
                              and b.guru_id = $1 limit 1`, [guru.id]);
  if (!other) { say('Nobody has a time far enough ahead to cancel; skipped'); }
  else {
    await post(`${site}/otp/request?slug=${guru.slug}`, { phone: other.phone });
    const signedIn = await postWithCookies(`${site}/otp/verify?slug=${guru.slug}`, { phone: other.phone, code: process.env.OTP_CODE || '1234' });
    const mine = signedIn.body;
    const toCancel = mine.upcoming.find((b) => !b.cannotCancel);
    const after = await post(`${site}/me/bookings/${toCancel.id}/cancel?slug=${guru.slug}`, null, signedIn.cookie);
    say(after.said);
    const free = after.slots[0];
    const rebooked = await post(`${site}/me/book-with-credit?slug=${guru.slug}`, { slotId: free.id }, signedIn.cookie);
    say(rebooked.said ?? rebooked.error);
  }

  heading('The money screen, with nothing added up by hand');
  const money = await json(`${API}/api/console/money`, { cookie: consoleCookie });
  for (const kind of ['payment', 'refund', 'credit_issued', 'credit_used']) {
    const n = money.entries.filter((e) => e.kind === kind).length;
    if (n) say(`${n} × ${kind.replace('_', ' ')}`);
  }
  say(`Live-sourced bookings this week: ${money.entries.filter((e) => e.source === 'live').length}`);

  heading('What still needs a real account');
  if (notes.length === 0) say('Nothing — every service answered for itself.');
  for (const note of notes) say(`· ${note}`);
  if (problems.length) {
    heading('What went wrong');
    for (const p of problems) say(`· ${p}`);
    process.exitCode = 1;
  }
  console.log('\nThe demo finished. Everything above that is not marked "stood in for" ran for real.\n');
}

// ---- the doors, as the outside world uses them -------------------------------------------------

function inbound(guru, message) {
  return postWebhook(`${API}/webhook`, {
    entry: [{ changes: [{ value: {
      metadata: { display_phone_number: guru.whatsapp_number, phone_number_id: '1' },
      messages: [{ from: PHONE, ...message }],
    } }] }],
  }).then(() => wait(700));
}

function postWebhook(url, body) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return post(url, body);
  const raw = JSON.stringify(body);
  const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return fetch(url, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'X-Hub-Signature-256': signature } }).then(readBody);
}

async function razorpayPaid(paymentLinkId) {
  const body = JSON.stringify({
    event: 'payment_link.paid',
    payload: { payment_link: { entity: { id: paymentLinkId } }, payment: { entity: { id: `pay_demo_${Date.now()}`, amount: 50000 } } },
  });
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
  await fetch(`${API}/razorpay/webhook`, {
    method: 'POST', body,
    headers: { 'content-type': 'application/json', 'X-Razorpay-Signature': signature },
  });
}

// ---- a socket, over polling, so the demo needs no client library --------------------------------

async function openSocket(bookingId, role) {
  const base = `${API}/socket.io/?EIO=4&transport=polling`;
  const opened = await (await fetch(base)).text();
  const sid = JSON.parse(opened.slice(1)).sid;
  await fetch(`${base}&sid=${sid}`, { method: 'POST', body: `40${JSON.stringify({ bookingId, role })}` });
  await readSocket({ base, sid });
  return { base, sid };
}

async function readSocket(socket) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const raw = await (await fetch(`${socket.base}&sid=${socket.sid}`, { signal: controller.signal })).text();
    return [...raw.matchAll(/42\["([a-z.]+)"/g)].map((m) => m[1]);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ---- small helpers ------------------------------------------------------------------------------

async function signInToConsole() {
  const res = await fetch(`${API}/api/console/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(CONSOLE),
  });
  if (!res.ok) throw new Error('The console login was refused; check CONSOLE_PASSWORD in .env');
  return res.headers.get('set-cookie').split(';')[0];
}

async function json(url, { cookie } = {}) {
  return readBody(await fetch(url, { headers: cookie ? { cookie } : undefined }));
}

// The webhooks answer with plain text, everything else with JSON.
async function readBody(res) {
  if (res.status === 204) return {};
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: res.ok, text };
  }
}

async function post(url, body, cookie, guruToken) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(guruToken ? { 'X-Guru-Token': guruToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return readBody(res);
}

async function postWithCookies(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { body: await res.json(), cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] };
}

async function one(sql, params) {
  const { rows } = await query(sql, params);
  return rows[0] ?? null;
}

async function lastOut(phone, kind) {
  return one(`select m.* from messages_log m join devotees d on d.id = m.devotee_id
               where d.phone = $1 and m.direction = 'out' and m.kind = $2 order by m.created_at desc limit 1`, [phone, kind]);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The webhooks answer Meta and Razorpay first and do the work after, and a refused send waits on a
 * network timeout, so the demo watches for the result instead of guessing how long it takes.
 */
async function waitFor(check, seconds = 12) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const found = await check();
    if (found) return found;
    if (Date.now() > until) return null;
    await wait(300);
  }
}

try {
  console.log(`\nExpert Sessions — the whole journey, against ${API}\n`);
  await main();
} catch (err) {
  console.error(`\nThe demo stopped: ${explainDbError(err)}\n`);
  process.exitCode = 1;
}
await close();
