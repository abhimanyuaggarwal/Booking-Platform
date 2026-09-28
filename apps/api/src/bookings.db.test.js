// The state machine against a real Postgres, in a throwaway database that is created and dropped
// here. Skips itself with a note when Postgres is not running, so `pnpm test` passes anywhere.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { slotIdToInstant } from '@expert-sessions/shared';

const ADMIN_URL = (process.env.DATABASE_URL || 'postgres://es:es@localhost:5432/expert_sessions').replace(/\/[^/]*$/, '/postgres');
const DB_NAME = `expert_sessions_test_${process.pid}`;

let admin;
let reachable = false;
let db;        // ./db.js, imported after DATABASE_URL points at the throwaway database
let bookings;  // ./bookings.js
let guru;
let devotee;

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await admin.connect();
    reachable = true;
  } catch {
    console.log(`# Postgres not reachable at ${ADMIN_URL}; skipping the database tests (start it with brew services or pnpm db:up)`);
    return;
  }
  await admin.query(`create database ${DB_NAME}`);
  process.env.DATABASE_URL = ADMIN_URL.replace(/\/postgres$/, `/${DB_NAME}`);
  db = await import('./db.js');
  bookings = await import('./bookings.js');
  await db.migrate();
  ({ rows: [guru] } = await db.query(
    `insert into gurus (slug, name, dakshina_paise, pattern_json) values ('t', 'Test Guru', 50000, '{"slotMinutes":30}') returning *`));
  ({ rows: [devotee] } = await db.query(
    `insert into devotees (guru_id, phone, name) values ($1, '919999000001', 'Test Devotee') returning *`, [guru.id]));
});

after(async () => {
  if (!reachable) return;
  await db.close();
  await admin.query(`drop database ${DB_NAME}`);
  await admin.end();
});

// node:test evaluates a static `skip` option before `before()` runs, so the check happens inside.
function dbTest(name, fn) {
  test(name, async (t) => {
    if (!reachable) return t.skip('Postgres not running');
    await fn(t);
  });
}

async function heldBooking(slotId) {
  return bookings.holdSlot({ guruId: guru.id, devoteeId: devotee.id, slotId, source: 'live' });
}

async function paidBooking(slotId, linkId = `plink_${slotId.replace(/\D/g, '')}`) {
  const held = await heldBooking(slotId);
  await bookings.attachPaymentLink(held.id, linkId);
  return bookings.confirmByPayment({ paymentLinkId: linkId, providerRef: `pay_${linkId}`, amountPaise: 50000 });
}

dbTest('holding a slot twice fails the second time, and the first hold can be paid once', async () => {
  const first = await heldBooking('slot:2030-01-07T10:00');
  assert.equal(first.status, 'held');
  assert.equal(await heldBooking('slot:2030-01-07T10:00'), null);

  await bookings.attachPaymentLink(first.id, 'plink_a');
  const paid = await bookings.confirmByPayment({ paymentLinkId: 'plink_a', providerRef: 'pay_a', amountPaise: 50000 });
  assert.equal(paid.status, 'confirmed');
  const again = await bookings.confirmByPayment({ paymentLinkId: 'plink_a', providerRef: 'pay_a', amountPaise: 50000 });
  assert.equal(again.status, 'confirmed');
  const { rows } = await db.query(`select count(*)::int as n from ledger_entries where booking_id = $1 and kind = 'payment'`, [first.id]);
  assert.equal(rows[0].n, 1, 'paying twice writes one ledger row');
});

dbTest('a payment after the hold ran out does not buy the time, but the money is written down', async () => {
  const held = await heldBooking('slot:2030-01-07T10:40');
  await db.query(`update bookings set created_at = now() - interval '11 minutes' where id = $1`, [held.id]);
  assert.equal(await bookings.expireStaleHolds(), 1);
  await bookings.attachPaymentLink(held.id, 'plink_late');

  const after = await bookings.confirmByPayment({ paymentLinkId: 'plink_late', providerRef: 'pay_late', amountPaise: 50000 });
  assert.equal(after.status, 'expired', 'she does not get the time she was too slow to pay for');

  const { rows } = await db.query(`select kind, amount_paise from ledger_entries where booking_id = $1`, [held.id]);
  assert.deepEqual(rows, [{ kind: 'payment', amount_paise: 50000 }], 'her dakshina is visible to the team');

  // Razorpay retries anything it thinks we missed; the second delivery must not double the money.
  await bookings.confirmByPayment({ paymentLinkId: 'plink_late', providerRef: 'pay_late', amountPaise: 50000 });
  const { rows: again } = await db.query(`select count(*)::int as n from ledger_entries where booking_id = $1`, [held.id]);
  assert.equal(again[0].n, 1);

  // And the slot she let go is free for someone else.
  assert.ok(!(await bookings.takenSlotIds(guru.id)).has('slot:2030-01-07T10:40'));
});

dbTest('rescheduling marks the old row, creates a new confirmed row that points back, and the payment follows', async () => {
  const paid = await paidBooking('slot:2030-01-08T10:00');
  const moved = await bookings.rescheduleBooking({ bookingId: paid.id, slotId: 'slot:2030-01-09T10:00' });
  assert.equal(moved.status, 'confirmed');
  assert.equal(moved.rescheduled_from_id, paid.id);
  assert.equal(moved.slotId, 'slot:2030-01-09T10:00');
  assert.equal((await bookings.findById(paid.id)).status, 'rescheduled');
  assert.ok((await bookings.takenSlotIds(guru.id)).has('slot:2030-01-09T10:00'));
  assert.ok(!(await bookings.takenSlotIds(guru.id)).has('slot:2030-01-08T10:00'), 'the old slot is free again');
  const money = await bookings.paymentFor(moved.id);
  assert.equal(money.kind, 'payment');
  assert.equal(money.booking_id, paid.id, 'the payment stays on the booking that was paid');
});

dbTest('rescheduling onto a taken slot changes nothing and says so', async () => {
  const a = await paidBooking('slot:2030-01-10T10:00');
  const b = await paidBooking('slot:2030-01-10T10:40');
  assert.equal(await bookings.rescheduleBooking({ bookingId: a.id, slotId: b.slotId }), null);
  assert.equal((await bookings.findById(a.id)).status, 'confirmed');
});

dbTest('a refund marks the booking and writes one refund row for the paid amount', async () => {
  const paid = await paidBooking('slot:2030-01-11T10:00');
  const refunded = await bookings.refundBooking({ bookingId: paid.id, providerRef: 'rfnd_1' });
  assert.equal(refunded.status, 'refunded');
  const { rows } = await db.query(`select kind, amount_paise, provider_ref from ledger_entries where booking_id = $1 order by created_at`, [paid.id]);
  assert.deepEqual(rows.map((r) => r.kind), ['payment', 'refund']);
  assert.equal(rows[1].amount_paise, 50000);
  assert.equal(rows[1].provider_ref, 'rfnd_1');
  await assert.rejects(() => bookings.refundBooking({ bookingId: paid.id, providerRef: 'rfnd_2' }), /refunded booking cannot refund/);
});

dbTest('a booking paid with a credit gets the credit back on refund instead of cash', async () => {
  const held = await heldBooking('slot:2030-01-11T10:40');
  await db.query(`update bookings set status = 'confirmed', paid_at = now() where id = $1`, [held.id]);
  await db.query(`insert into ledger_entries (guru_id, booking_id, devotee_id, kind, amount_paise) values ($1, $2, $3, 'credit_used', 50000)`, [guru.id, held.id, devotee.id]);
  await bookings.refundBooking({ bookingId: held.id, providerRef: null });
  const { rows } = await db.query(`select kind, expires_at from ledger_entries where booking_id = $1 order by created_at`, [held.id]);
  assert.deepEqual(rows.map((r) => r.kind), ['credit_used', 'credit_issued']);
  assert.ok(rows[1].expires_at > new Date(), 'the new credit has an expiry ahead');
});

dbTest('no-show only after her time has passed', async () => {
  const future = await paidBooking('slot:2030-01-12T10:00');
  await assert.rejects(() => bookings.markNoShow(future.id), /has not come yet/);
  const past = await paidBooking('slot:2030-01-12T10:40');
  await db.query(`update bookings set slot_start = now() - interval '2 hours' where id = $1`, [past.id]);
  assert.equal((await bookings.markNoShow(past.id)).status, 'no_show');
});

dbTest('an hour after her time, a paid booking whose link was never opened becomes a no-show on its own', async () => {
  const neverOpened = await paidBooking('slot:2030-03-02T10:00');
  const waited = await paidBooking('slot:2030-03-02T10:40');
  const recent = await paidBooking('slot:2030-03-02T11:20');
  const sat = await paidBooking('slot:2030-03-02T12:00');
  // One live booking per slot is a database fact, so each past time is a minute apart.
  await db.query(`update bookings set slot_start = now() - interval '90 minutes' where id = $1`, [neverOpened.id]);
  await db.query(`update bookings set slot_start = now() - interval '91 minutes' where id = $1`, [waited.id]);
  await db.query(`update bookings set slot_start = now() - interval '92 minutes' where id = $1`, [sat.id]);
  await db.query(`update bookings set slot_start = now() - interval '30 minutes' where id = $1`, [recent.id]);
  await db.query(`insert into sessions (guru_id, booking_id, devotee_joined_at) values ($1, $2, now() - interval '80 minutes')`, [guru.id, waited.id]);
  await db.query(`insert into sessions (guru_id, booking_id, room_id, started_at, guru_joined_at) values ($1, $2, 'room', now() - interval '80 minutes', now() - interval '80 minutes')`, [guru.id, sat.id]);

  assert.equal(await bookings.markNoShows(), 1);
  const status = async (b) => (await db.query('select status from bookings where id = $1', [b.id])).rows[0].status;
  assert.equal(await status(neverOpened), 'no_show');
  assert.equal(await status(waited), 'confirmed', 'she waited and he did not come: the team decides, not the clock');
  assert.equal(await status(recent), 'confirmed', 'only half an hour past: not yet');
  assert.equal(await status(sat), 'confirmed', 'a started session is closed by sessions.js, never marked a no-show');
  assert.equal(await bookings.markNoShows(), 0, 'nothing is marked twice');
});

dbTest('links nobody paid on, old enough to ask Razorpay about, are listed once and never after a payment lands', async () => {
  const before = (await bookings.unreconciledPaymentLinks()).length;
  const held = await heldBooking('slot:2030-03-03T10:00');
  await bookings.attachPaymentLink(held.id, 'plink_quiet');
  assert.equal((await bookings.unreconciledPaymentLinks()).length, before, 'made a moment ago: too soon to ask');
  await db.query(`update bookings set created_at = now() - interval '40 minutes' where id = $1`, [held.id]);
  const listed = await bookings.unreconciledPaymentLinks();
  assert.ok(listed.some((r) => r.payment_link_id === 'plink_quiet'), 'forty minutes without a payment: ask');
  await bookings.confirmByPayment({ paymentLinkId: 'plink_quiet', providerRef: 'pay_quiet', amountPaise: 50000 });
  assert.ok(!(await bookings.unreconciledPaymentLinks()).some((r) => r.payment_link_id === 'plink_quiet'), 'paid: nothing left to ask');
});

dbTest('closing a day moves the confirmed, voids the held, and closes the date', async () => {
  const a = await paidBooking('slot:2030-02-03T10:00');
  const b = await paidBooking('slot:2030-02-03T10:40');
  const held = await heldBooking('slot:2030-02-03T11:20');
  const result = await bookings.closeDay({
    guru, date: '2030-02-03',
    moves: [{ bookingId: a.id, slotId: 'slot:2030-02-04T10:00' }, { bookingId: b.id, slotId: 'slot:2030-02-04T10:40' }],
  });
  assert.equal(result.moved.filter((m) => m.booking).length, 2);
  assert.equal(result.expiredHolds, 1);
  assert.equal((await bookings.findById(held.id)).status, 'expired');
  assert.deepEqual((await bookings.bookingsOn(guru.id, '2030-02-03')), []);
  const { rows: [g] } = await db.query(`select closed_dates::text[] as closed from gurus where id = $1`, [guru.id]);
  assert.deepEqual(g.closed, ['2030-02-03']);
  await bookings.closeDay({ guru, date: '2030-02-03', moves: [] });
  const { rows: [g2] } = await db.query(`select closed_dates::text[] as closed from gurus where id = $1`, [guru.id]);
  assert.deepEqual(g2.closed, ['2030-02-03'], 'closing twice does not duplicate the date');
});

dbTest('search finds her by part of her name or her phone digits', async () => {
  const byName = await bookings.searchBookings(guru.id, 'devot');
  assert.ok(byName.length > 0);
  const byPhone = await bookings.searchBookings(guru.id, '000001');
  assert.equal(byPhone.length, byName.length);
  assert.equal((await bookings.searchBookings(guru.id, 'nobody')).length, 0);
});

dbTest('slot_start round-trips through slot ids exactly', async () => {
  const b = await heldBooking('slot:2030-03-01T16:40');
  assert.equal(b.slot_start.getTime(), slotIdToInstant('slot:2030-03-01T16:40').getTime());
});
