// The booking state machine and every write to the bookings table live here.
// Nothing outside this file changes a booking's status. Calendar and ledger are views of these rows.

import { instantToSlotId, slotIdToInstant, dayRange } from '@expert-sessions/shared';
import { query, transaction } from './db.js';
import { BookingRuleError } from './errors.js';
import { availableSlots } from '@expert-sessions/shared';
import { availabilityOf } from './gurus.js';
import { defaultSessionType } from './session-types.js';

/**
 * The one check every door makes before a slot is written. A devotee may only take a time his
 * pattern offers and nobody holds (a stale tab or an old WhatsApp list must not book yesterday, or
 * a Sunday). His team may book any time that has not passed — a sitting outside the pattern is
 * their judgement. Throws BookingRuleError with the sentence to show.
 */
export async function assertBookable(guru, slotId, { team = false, type = null } = {}) {
  if (team) {
    if (slotIdToInstant(slotId) < new Date()) throw Object.assign(new BookingRuleError(RULES.passed), { code: 'passed' });
    return;
  }
  const open = availableSlots(availabilityOf(guru), await takenIntervals(guru.id), undefined, { minutes: type?.minutes, typeId: type?.id });
  if (!open.some((s) => s.id === slotId)) throw Object.assign(new BookingRuleError(RULES.slot_gone), { code: 'slot_gone' });
}

export const HOLD_MINUTES = 10;
// She may change her own booking up to four hours before. Nearer than that the slot cannot be
// resold, so the team handles it as a judgement rather than a button (CLAUDE.md, walkthrough tab 2).
export const SELF_SERVE_HOURS = 4;

// held --pay--> confirmed --session ends--> completed
// held --10 min--> expired
// confirmed --team/devotee--> rescheduled (new booking row, old marked)
// confirmed --devotee cancels >=4h before--> cancelled (refund; cancellations.js)
// confirmed --guru cannot sit--> refunded
// confirmed --no join--> no_show
const TRANSITIONS = {
  held: { pay: 'confirmed', expire: 'expired' },
  confirmed: { end: 'completed', reschedule: 'rescheduled', cancel: 'cancelled', refund: 'refunded', no_show: 'no_show' },
};

/** The status after `event`, or a thrown error if that move is not allowed. Pure; the only rulebook. */
export function transition(status, event) {
  const next = TRANSITIONS[status]?.[event];
  if (!next) throw new BookingRuleError(`A ${status} booking cannot ${event}`);
  return next;
}

// Rows carry slot_start (a real instant); callers speak in slot ids for copy and comparisons.
function withSlotId(row) {
  return { ...row, slotId: instantToSlotId(row.slot_start) };
}

/** Every sitting nobody else may collide with right now — held or confirmed — with its length, for availableSlots(). */
export async function takenIntervals(guruId) {
  const { rows } = await query(
    `select slot_start, minutes from bookings where guru_id = $1 and status in ('held', 'confirmed')`, [guruId]);
  return rows.map((r) => ({ id: instantToSlotId(r.slot_start), minutes: r.minutes }));
}

/** The same sittings as a set of start ids, for callers that only ask "is this start taken". */
export async function takenSlotIds(guruId) {
  return new Set((await takenIntervals(guruId)).map((t) => t.id));
}

/**
 * Reserve a slot for a devotee while she pays. Returns null if someone else holds or has
 * confirmed it — the unique index bookings_one_per_slot decides, not a check we do first.
 */
export async function holdSlot({ guruId, devoteeId, slotId, source, type = null }) {
  const t = type ?? await defaultSessionType(guruId);   // the length and price this sitting is made with
  try {
    const { rows } = await query(
      `insert into bookings (guru_id, devotee_id, slot_start, status, source, session_type_id, minutes, dakshina_paise)
       values ($1, $2, $3, 'held', $4, $5, $6, $7) returning *`,
      [guruId, devoteeId, slotIdToInstant(slotId), source, t.id, t.minutes, t.dakshina_paise]);
    return withSlotId(rows[0]);
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'bookings_one_per_slot') return null;
    throw err;
  }
}

export async function attachPaymentLink(bookingId, paymentLinkId) {
  const { rowCount } = await query(
    'update bookings set payment_link_id = $2 where id = $1', [bookingId, paymentLinkId]);
  if (rowCount === 0) throw new Error(`Booking ${bookingId} not found; cannot attach payment link ${paymentLinkId}`);
}

/**
 * Called from the Razorpay webhook. Idempotent: the same payment arriving twice confirms once
 * and writes one ledger row. Returns null if no booking has this payment link.
 * Throws if the booking is no longer held (for example the hold expired before she paid) —
 * the money has moved, so the team must decide, and the webhook log says so.
 */
export async function confirmByPayment({ paymentLinkId, providerRef, amountPaise }) {
  const found = await query('select * from bookings where payment_link_id = $1', [paymentLinkId]);
  const booking = found.rows[0];
  if (!booking) return null;
  if (booking.status === 'confirmed') return { ...withSlotId(booking), alreadyConfirmed: true };   // a second delivery: nothing to say again

  // She paid after the ten minutes ran out. The time is not hers — an expired hold is never
  // revived, or two people could hold the same slot. But the money is real, and a dakshina no one
  // in the team can see is worse than a lost slot: record it, and Needs attention offers it back.
  // The caller must check the status it gets back before telling her anything is confirmed.
  if (booking.status === 'expired') {
    await recordPayment(booking, { providerRef, amountPaise });
    return withSlotId(booking);
  }

  const next = transition(booking.status, 'pay');
  const updated = await query(
    `update bookings set status = $2, paid_at = now() where id = $1 and status = 'held' returning *`,
    [booking.id, next]);
  if (updated.rowCount === 0) return findById(booking.id); // a concurrent delivery got there first

  await recordPayment(booking, { providerRef, amountPaise });
  return withSlotId(updated.rows[0]);
}

/**
 * The team took the dakshina by hand — cash at the ashram, or UPI straight to its account — and
 * confirms the held time themselves. Same transition as a Razorpay payment, same ledger row; the
 * provider reference says it never touched Razorpay, so Money keeps it out of the settlement.
 * `method` is 'cash' or 'upi', or 'complimentary' when guruji asked for this one to be free: then
 * the ledger row is ₹0 and the booking says so. The amount is the booking's own dakshina unless
 * the caller says otherwise. Returns the booking, confirmed; throws BookingRuleError if not held.
 */
export async function confirmOffline({ bookingId, method, amountPaise = null }) {
  const booking = await findById(bookingId);
  if (!booking) throw new BookingRuleError('No such booking');
  if (booking.status === 'confirmed') return booking;
  const next = transition(booking.status, 'pay');
  const complimentary = method === 'complimentary';
  const updated = await query(
    `update bookings set status = $2, paid_at = now(), complimentary = $3 where id = $1 and status = 'held' returning *`,
    [booking.id, next, complimentary]);
  if (updated.rowCount === 0) return findById(booking.id);
  await recordPayment(booking, {
    providerRef: complimentary ? `complimentary:${booking.id}` : `offline:${method}:${booking.id}`,
    amountPaise: complimentary ? 0 : (amountPaise ?? booking.dakshina_paise),
  });
  return withSlotId(updated.rows[0]);
}

/**
 * Razorpay retries any webhook it thinks we missed, so the same payment can arrive twice.
 * Keyed on the provider's own payment id, a second delivery writes nothing.
 */
async function recordPayment(booking, { providerRef, amountPaise }) {
  await query(
    `insert into ledger_entries (guru_id, booking_id, devotee_id, kind, amount_paise, provider_ref)
     select $1, $2, $3, 'payment', $4, $5
      where not exists (select 1 from ledger_entries where kind = 'payment' and provider_ref = $5)`,
    [booking.guru_id, booking.id, booking.devotee_id, amountPaise, providerRef]);
}

/**
 * After paying, she may send her question as text or a voice note. It goes on the upcoming time
 * she paid for most recently — the one she has just been asked about. Returns null if she has none.
 */
export async function attachQuestion({ guruId, devoteeId, text = null, mediaId = null }) {
  const { rows } = await query(
    `update bookings
       set question_text = case when $3::text is null then question_text
                                when question_text is null or question_text = '' then $3::text
                                else question_text || E'\n' || $3::text end,
           question_media_id = coalesce($4, question_media_id)
     where id = (select id from bookings
                 where guru_id = $1 and devotee_id = $2 and status = 'confirmed' and slot_start > now()
                 order by paid_at desc nulls last, created_at desc limit 1)
     returning *`,
    [guruId, devoteeId, text, mediaId]);
  return rows[0] ? withSlotId(rows[0]) : null;
}

/** A session that ended this long ago still counts as "she has just been with him". */
export const JUST_FINISHED_HOURS = 24;

/**
 * Where a devotee stands with this guru right now. The WhatsApp door uses it to answer a message
 * it cannot read: CLAUDE.md rules out interpreting free text, so we answer from what she was
 * doing rather than from what she wrote. Checked in this order because a nearer commitment
 * always explains a message better than an older one.
 * @returns {{ kind: 'awaiting_session'|'awaiting_payment'|'just_finished'|'nothing', booking: object|null }}
 */
export async function whereSheStands(guruId, devoteeId) {
  const upcoming = await firstRow(
    `select * from bookings where guru_id = $1 and devotee_id = $2 and status = 'confirmed'
       and slot_start > now() - interval '1 hour' order by slot_start asc limit 1`, [guruId, devoteeId]);
  if (upcoming) return { kind: 'awaiting_session', booking: withSlotId(upcoming) };

  const holding = await firstRow(
    `select * from bookings where guru_id = $1 and devotee_id = $2 and status = 'held'
       order by created_at desc limit 1`, [guruId, devoteeId]);
  if (holding) return { kind: 'awaiting_payment', booking: withSlotId(holding) };

  const finished = await firstRow(
    `select * from bookings where guru_id = $1 and devotee_id = $2 and status = 'completed'
       and slot_start > now() - make_interval(hours => $3) order by slot_start desc limit 1`,
    [guruId, devoteeId, JUST_FINISHED_HOURS]);
  if (finished) return { kind: 'just_finished', booking: withSlotId(finished) };

  return { kind: 'nothing', booking: null };
}

async function firstRow(sql, params) {
  const { rows } = await query(sql, params);
  return rows[0] ?? null;
}

export async function hasConfirmedBooking(guruId, devoteeId) {
  const { rowCount } = await query(
    `select 1 from bookings where guru_id = $1 and devotee_id = $2 and status = 'confirmed' limit 1`,
    [guruId, devoteeId]);
  return rowCount > 0;
}

/** Holds older than HOLD_MINUTES go back on the shelf. jobs.js runs this every minute. */
export async function expireStaleHolds() {
  const { rowCount } = await query(
    `update bookings set status = $1
     where status = 'held' and created_at < now() - make_interval(mins => $2::int)`,
    [transition('held', 'expire'), HOLD_MINUTES]);
  return rowCount;
}

export async function findById(id) {
  const { rows } = await query('select * from bookings where id = $1', [id]);
  return rows[0] ? withSlotId(rows[0]) : null;
}

/** The booking with who booked it, for messages and the console. */
export async function findWithDevotee(id) {
  const { rows } = await query(
    `select b.*, d.phone, d.name as devotee_name, d.for_whom
       from bookings b join devotees d on d.id = b.devotee_id where b.id = $1`, [id]);
  return rows[0] ? withSlotId(rows[0]) : null;
}

/** The team typed her question while booking for her on the phone. */
export async function setQuestion(bookingId, { text = null, mediaId = null }) {
  const { rows } = await query(
    `update bookings set question_text = coalesce($2, question_text), question_media_id = coalesce($3, question_media_id)
     where id = $1 returning *`, [bookingId, text, mediaId]);
  if (!rows[0]) throw new Error(`Booking ${bookingId} not found`);
  return withSlotId(rows[0]);
}

/**
 * Move a confirmed booking to another slot. The old row is marked rescheduled; a new confirmed row
 * points back at it and the payment stays on the old row (paymentFor walks the chain).
 * Returns the new booking, or null if the new slot was taken meanwhile.
 */
export async function rescheduleBooking({ bookingId, slotId }) {
  return transaction(async (q) => {
    const { rows: [old] } = await q('select * from bookings where id = $1 for update', [bookingId]);
    if (!old) throw new Error(`Booking ${bookingId} not found`);
    const oldNext = transition(old.status, 'reschedule');
    let created;
    try {
      ({ rows: [created] } = await q(
        `insert into bookings (guru_id, devotee_id, slot_start, status, source, question_text, question_media_id, rescheduled_from_id, paid_at,
                               session_type_id, minutes, dakshina_paise, complimentary)
         values ($1, $2, $3, 'confirmed', $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
        [old.guru_id, old.devotee_id, slotIdToInstant(slotId), old.source, old.question_text, old.question_media_id, old.id, old.paid_at,
          old.session_type_id, old.minutes, old.dakshina_paise, old.complimentary]));
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'bookings_one_per_slot') return null;
      throw err;
    }
    await q('update bookings set status = $2 where id = $1', [old.id, oldNext]);
    return withSlotId(created);
  });
}

/**
 * The money behind a booking: its payment or credit_used row, following reschedules back to the
 * booking that was actually paid. Null if nothing was ever paid (a hold).
 */
export async function paymentFor(bookingId) {
  const { rows } = await query(
    `with recursive chain as (
       select id, rescheduled_from_id from bookings where id = $1
       union all
       select b.id, b.rescheduled_from_id from bookings b join chain c on b.id = c.rescheduled_from_id
     )
     select l.* from ledger_entries l join chain on chain.id = l.booking_id
      where l.kind in ('payment', 'credit_used') order by l.created_at desc limit 1`, [bookingId]);
  return rows[0] ?? null;
}

/**
 * Guruji could not sit: the booking is refunded. Call Razorpay first (the route does); this records
 * the outcome. A booking paid with a credit gets the credit back for another 30 days instead.
 */
export async function refundBooking({ bookingId, providerRef }) {
  return transaction(async (q) => {
    const { rows: [b] } = await q('select * from bookings where id = $1 for update', [bookingId]);
    if (!b) throw new Error(`Booking ${bookingId} not found`);
    const next = transition(b.status, 'refund');
    const paid = await paymentFor(b.id);
    if (!paid) throw new BookingRuleError('Nothing was paid for this booking, so there is nothing to return');
    await q('update bookings set status = $2 where id = $1', [b.id, next]);
    if (paid.kind === 'credit_used') {
      await q(
        `insert into ledger_entries (guru_id, booking_id, devotee_id, kind, amount_paise, expires_at)
         values ($1, $2, $3, 'credit_issued', $4, now() + interval '30 days')`,
        [b.guru_id, b.id, b.devotee_id, paid.amount_paise]);
    } else {
      await q(
        `insert into ledger_entries (guru_id, booking_id, devotee_id, kind, amount_paise, provider_ref)
         values ($1, $2, $3, 'refund', $4, $5)`,
        [b.guru_id, b.id, b.devotee_id, paid.amount_paise, providerRef]);
    }
    return withSlotId({ ...b, status: next });
  });
}

/** The session ended: the booking is done. Called from sessions.js when guruji leaves the room. */
export async function completeBooking(bookingId) {
  const { rows: [b] } = await query('select * from bookings where id = $1', [bookingId]);
  if (!b) throw new Error(`Booking ${bookingId} not found`);
  const next = transition(b.status, 'end');
  const { rows } = await query('update bookings set status = $2 where id = $1 and status = $3 returning *', [b.id, next, b.status]);
  return rows[0] ? withSlotId(rows[0]) : withSlotId(b);
}

/** She paid and never came. The dakshina stands (agreed policy). Only after her time has passed. */
export async function markNoShow(bookingId) {
  const { rows: [b] } = await query('select * from bookings where id = $1', [bookingId]);
  if (!b) throw new Error(`Booking ${bookingId} not found`);
  const next = transition(b.status, 'no_show');
  if (b.slot_start > new Date()) throw new BookingRuleError('Her time has not come yet; mark no-show once the slot has passed');
  const { rows } = await query('update bookings set status = $2 where id = $1 and status = $3 returning *', [b.id, next, b.status]);
  return withSlotId(rows[0]);
}

// The agreed policy: the dakshina stands on a no-show. So a paid time that passed with her link
// never opened needs no decision, only a record. An hour after her time, not at it: the ten-minute
// escape and a late sitting both fit inside.
export const NO_SHOW_AFTER_MINUTES = 60;

/**
 * Mark the no-shows nobody needs to decide: confirmed, an hour past, and she never opened her
 * link. A booking where she did open it and waited is NOT touched — that one is guruji's absence,
 * not hers, and Needs attention raises it for the team (reports.js `waited_alone`).
 * A booking whose session started is not touched either; sessions.js completes those.
 * @returns {number} how many were marked
 */
export async function markNoShows({ afterMinutes = NO_SHOW_AFTER_MINUTES } = {}) {
  const { rowCount } = await query(
    `update bookings b set status = $2
      where b.status = 'confirmed'
        and b.slot_start < now() - make_interval(mins => $1::int)
        and not exists (select 1 from sessions s where s.booking_id = b.id
                           and (s.devotee_joined_at is not null or s.started_at is not null))`,
    [afterMinutes, transition('confirmed', 'no_show')]);
  return rowCount;
}

/**
 * Payment links we made that no payment has ever been recorded against: a lost webhook looks
 * exactly like an unpaid link until Razorpay is asked. Quarter of an hour old at least, so a
 * payment still in flight is not asked about, and three days at most, past which the link itself
 * has expired on Razorpay's side.
 */
export async function unreconciledPaymentLinks() {
  const { rows } = await query(
    `select b.id, b.guru_id, b.payment_link_id, b.status
       from bookings b
      where b.payment_link_id is not null and b.payment_link_id not like 'plink_seed_%' and b.status in ('held', 'expired')
        and b.created_at between now() - interval '3 days' and now() - interval '15 minutes'
        and not exists (select 1 from ledger_entries l where l.booking_id = b.id and l.kind = 'payment')
      order by b.created_at`);
  return rows;
}

/** An unpaid hold on a day being closed is void. */
export async function expireHold(bookingId) {
  const { rows } = await query(
    `update bookings set status = $2 where id = $1 and status = 'held' returning *`,
    [bookingId, transition('held', 'expire')]);
  return rows[0] ? withSlotId(rows[0]) : null;
}

/**
 * Guruji is travelling: move every confirmed booking on `date` to the slot chosen for it, void the
 * unpaid holds, and close the date so nothing new lands on it. Each move is its own transaction, so
 * one slot taken meanwhile does not undo the others; the result says which moved.
 */
export async function closeDay({ guru, date, moves }) {
  const moved = [];
  for (const { bookingId, slotId } of moves) {
    const booking = await rescheduleBooking({ bookingId, slotId });
    moved.push({ bookingId, slotId, booking });
  }
  const [start, end] = dayRange(date);
  const { rowCount: expiredHolds } = await query(
    `update bookings set status = $4 where guru_id = $1 and status = 'held' and slot_start >= $2 and slot_start < $3`,
    [guru.id, start, end, transition('held', 'expire')]);
  await query(
    `update gurus set closed_dates = array_append(closed_dates, $2::date) where id = $1 and not ($2::date = any(closed_dates))`,
    [guru.id, date]);
  return { moved, expiredHolds };
}

/** Bookings on one date that still occupy a slot, with who booked, for Close a day. */
export async function bookingsOn(guruId, date, statuses = ['confirmed', 'held']) {
  const [start, end] = dayRange(date);
  const { rows } = await query(
    `select b.*, d.phone, d.name as devotee_name, d.for_whom
       from bookings b join devotees d on d.id = b.devotee_id
      where b.guru_id = $1 and b.slot_start >= $2 and b.slot_start < $3 and b.status = any($4)
      order by b.slot_start`, [guruId, start, end, statuses]);
  return rows.map(withSlotId);
}

/** Search by her name or phone digits. Empty query lists the newest. */
export async function searchBookings(guruId, q, limit = 50) {
  const text = q.trim();
  const digits = text.replace(/\D/g, '');
  const { rows } = await query(
    `select b.*, d.phone, d.name as devotee_name, d.for_whom
       from bookings b join devotees d on d.id = b.devotee_id
      where b.guru_id = $1
        and ($2 = '' or d.name ilike '%' || $2 || '%' or ($3 <> '' and d.phone like '%' || $3 || '%'))
      order by b.slot_start desc limit $4`, [guruId, text, digits, limit]);
  return rows.map(withSlotId);
}

/** Everything one devotee ever booked, newest first. */
export async function listForDevotee(devoteeId) {
  const { rows } = await query('select * from bookings where devotee_id = $1 order by slot_start desc', [devoteeId]);
  return rows.map(withSlotId);
}

// ---- What she may do herself -------------------------------------------------------------------

/**
 * Pure. Why she cannot move this booking herself, or null if she can.
 * One move only: a booking that is itself the product of a reschedule cannot be moved again.
 */
export function whyCannotReschedule(booking, now = new Date()) {
  if (booking.status !== 'confirmed') return 'not_open';
  if (booking.rescheduled_from_id) return 'moved_once';
  return tooLate(booking, now);
}

/** Pure. Why she cannot cancel this booking herself (a rule code), or null if she can. */
export function whyCannotCancel(booking, now = new Date()) {
  if (booking.status !== 'confirmed') return 'not_open';
  return tooLate(booking, now);
}

function tooLate(booking, now) {
  const hoursAway = (new Date(booking.slot_start) - now) / 3600000;
  if (hoursAway < SELF_SERVE_HOURS) return 'too_late';
  return null;
}

/**
 * The rules, as codes, so each door words them in its own language: the WhatsApp door through
 * devotee-words `rules`, the site and console through these English sentences.
 */
export const RULES = {
  slot_gone: 'That time is not open any more. Please choose one of the times shown.',
  passed: 'That time has already passed. Pick a later one.',
  not_open: 'This time is not open to changes.',
  moved_once: 'This time has already been moved once. Ask his team if you need another.',
  too_late: `Changes are open until ${SELF_SERVE_HOURS} hours before. Ask his team on WhatsApp.`,
};

/** The English sentence for a rule code; null stays null. */
export function ruleSentence(code) {
  return code ? (RULES[code] ?? code) : null;
}

/**
 * A confirmed time is given up and the dakshina becomes a credit valid thirty days with this guru.
 * Her own button (inside the four-hour rule, checked by the caller) and the team's (any time, a
 * judgement) both land here, so a cancellation reads the same whoever pressed it. No cash goes
 * back; that stays a separate team action (refundBooking).
 * @returns {{booking: object, creditPaise: number}}
 */
export async function cancelToCredit({ bookingId }) {
  return transaction(async (q) => {
    const { rows: [b] } = await q('select * from bookings where id = $1 for update', [bookingId]);
    if (!b) throw new Error(`Booking ${bookingId} not found`);
    const next = transition(b.status, 'cancel');
    const paid = await paymentFor(b.id);
    if (!paid) throw new BookingRuleError('Nothing was paid for this time, so there is no credit to keep');
    await q('update bookings set status = $2 where id = $1', [b.id, next]);
    await q(
      `insert into ledger_entries (guru_id, booking_id, devotee_id, kind, amount_paise, expires_at)
       values ($1, $2, $3, 'credit_issued', $4, now() + interval '30 days')`,
      [b.guru_id, b.id, b.devotee_id, paid.amount_paise]);
    return { booking: withSlotId({ ...b, status: next }), creditPaise: paid.amount_paise };
  });
}

/**
 * A confirmed time is given up and the dakshina goes back (cancellations.js moves the money first and
 * passes the provider's reference; nothing paid means no ledger row). The state change and the
 * refund row are one transaction, so the books never show a cancellation without its refund.
 * @returns {{booking: object, amountPaise: number}}
 */
export async function cancelWithRefund({ bookingId, providerRef = null }) {
  return transaction(async (q) => {
    const { rows: [b] } = await q('select * from bookings where id = $1 for update', [bookingId]);
    if (!b) throw new Error(`Booking ${bookingId} not found`);
    const next = transition(b.status, 'cancel');
    const paid = await paymentFor(b.id);
    await q('update bookings set status = $2 where id = $1', [b.id, next]);
    if (paid && paid.amount_paise > 0) {
      await q(
        `insert into ledger_entries (guru_id, booking_id, devotee_id, kind, amount_paise, provider_ref)
         values ($1, $2, $3, 'refund', $4, $5)`,
        [b.guru_id, b.id, b.devotee_id, paid.amount_paise, providerRef]);
    }
    return { booking: withSlotId({ ...b, status: next }), amountPaise: paid?.amount_paise ?? 0 };
  });
}

/**
 * She has a credit from a cancelled time and spends it on a new one: held and confirmed in the same
 * breath, with a credit_used row instead of a payment. Returns null if the slot was taken.
 * The caller checks she has the credit; this writes the row that spends it.
 */
export async function confirmWithCredit({ guruId, devoteeId, slotId, source, amountPaise, type = null }) {
  const t = type ?? await defaultSessionType(guruId);
  return transaction(async (q) => {
    let created;
    try {
      ({ rows: [created] } = await q(
        `insert into bookings (guru_id, devotee_id, slot_start, status, source, paid_at, session_type_id, minutes, dakshina_paise)
         values ($1, $2, $3, 'confirmed', $4, now(), $5, $6, $7) returning *`,
        [guruId, devoteeId, slotIdToInstant(slotId), source, t.id, t.minutes, t.dakshina_paise]));
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'bookings_one_per_slot') return null;
      throw err;
    }
    await q(
      `insert into ledger_entries (guru_id, booking_id, devotee_id, kind, amount_paise)
       values ($1, $2, $3, 'credit_used', $4)`,
      [guruId, created.id, devoteeId, amountPaise ?? t.dakshina_paise]);
    return withSlotId(created);
  });
}

/** Her times with one guru, newest first, for "my sessions". */
export async function listForDevoteeWithGuru(guruId, devoteeId) {
  const { rows } = await query(
    `select * from bookings where guru_id = $1 and devotee_id = $2 and status <> 'expired' order by slot_start desc`,
    [guruId, devoteeId]);
  return rows.map(withSlotId);
}

/** Newest first, with who booked. For the raw team view until the console exists. */
export async function listRecent(limit) {
  const { rows } = await query(
    `select b.*, d.phone, d.name as devotee_name
       from bookings b join devotees d on d.id = b.devotee_id
      order by b.slot_start desc limit $1`, [limit]);
  return rows.map(withSlotId);
}


/** Her hold that is still inside its ten minutes, if she has one: "Hi" should offer the pay link again, not a second time. */
export async function openHoldFor(guruId, devoteeId) {
  const { rows } = await query(
    `select * from bookings where guru_id = $1 and devotee_id = $2 and status = 'held'
        and created_at > now() - make_interval(mins => $3::int) order by created_at desc limit 1`,
    [guruId, devoteeId, HOLD_MINUTES]);
  return rows[0] ? withSlotId(rows[0]) : null;
}
