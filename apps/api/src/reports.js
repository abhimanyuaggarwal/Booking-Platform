// Read-only views of the same booking and ledger rows, shaped for the console: Today, the week grid,
// Money. Nothing here writes. Money is paise; every time crosses to IST through slot ids.

import {
  DAY_KEYS, availableSlots, slotIdToInstant, instantToSlotId, parseSlotId, formatTime, formatRupees, isoDate, nowInIst,
  describeDate, addDays, dayRange,
} from '@expert-sessions/shared';
import { query } from './db.js';
import { sittingGridOf } from './gurus.js';
import * as bookings from './bookings.js';
import { currentSession, findSessionByBooking } from './sessions.js';
import { listEvents } from './events.js';

const DAY = 86400000;
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ON_CALENDAR = ['held', 'confirmed', 'completed', 'no_show']; // statuses that occupy a slot

// ---- dates ('YYYY-MM-DD', IST) ----------------------------------------------------------------

export function todayIst() {
  return isoDate(nowInIst());
}

export { addDays, dayRange };

export function mondayOf(date) {
  const wall = parseSlotId(`slot:${date}T00:00`);
  return addDays(date, -((wall.getUTCDay() + 6) % 7));
}

// Settlement estimate for the pilot's bookkeeping: what came in since the last Friday (today, if
// Friday) is "due to settle". Replace with Razorpay's settlements API when that is wired.
export function settlementStart(date) {
  const wall = parseSlotId(`slot:${date}T00:00`);
  return addDays(date, -((wall.getUTCDay() - 5 + 7) % 7));
}

/** "9 – 14 September" or "28 September – 4 October" */
export function rangeLabel(from, to) {
  const a = parseSlotId(`slot:${from}T00:00`);
  const b = parseSlotId(`slot:${to}T00:00`);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} – ${b.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

// ---- shared row shapes -------------------------------------------------------------------------

async function bookingsBetween(guruId, start, end, statuses) {
  const { rows } = await query(
    `select b.id, b.slot_start, b.status, b.source, b.question_text, b.question_media_id, b.paid_at, b.created_at,
            d.name, d.phone, d.for_whom,
            (select count(*)::int from bookings x
              where x.devotee_id = b.devotee_id and x.status = 'completed' and x.slot_start < b.slot_start) as prior_visits
       from bookings b join devotees d on d.id = b.devotee_id
      where b.guru_id = $1 and b.slot_start >= $2 and b.slot_start < $3 and b.status = any($4)
      order by b.slot_start`,
    [guruId, start, end, statuses]);
  return rows;
}

function displayName(row) {
  return row.name ?? `…${String(row.phone).slice(-4)}`;
}

function ordinal(n) {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

function timeOf(instant) {
  return formatTime(parseSlotId(instantToSlotId(instant)));
}

// ---- Today ---------------------------------------------------------------------------------------

export async function todayReport(guru, date) {
  const [start, end] = dayRange(date);
  const [rows, week, money, attention] = await Promise.all([
    bookingsBetween(guru.id, start, end, ON_CALENDAR),
    weekReport(guru, mondayOf(date)),
    moneyKpis(guru.id, { today: todayIst(), monday: mondayOf(date) }),
    attentionQueue(guru),
  ]);

  const taken = new Set(rows.map((r) => instantToSlotId(r.slot_start)));
  // Sittings still open on this date from now on — the doors' maths on the sitting grid, so a
  // start the doors would refuse (too close to a booking) is never shown as open here either.
  const open = availableSlots(sittingGridOf(guru), taken, nowInIst()).filter((s) => s.id.startsWith(`slot:${date}`));

  const timeline = [
    ...rows.map((r) => ({ slotId: instantToSlotId(r.slot_start), kind: 'booking', booking: sessionRow(r) })),
    ...open.map((s) => ({ slotId: s.id, kind: 'open', booking: null })),
  ].sort((a, b) => a.slotId.localeCompare(b.slotId))
    .map((t) => ({ ...t, time: formatTime(parseSlotId(t.slotId)) }));

  return {
    date, dateLabel: describeDate(date), guru: { name: guru.name },
    attention: attentionStrip(attention),
    kpis: { ...money, slotsFilled: week.filled, slotsTotal: week.total },
    timeline,
  };
}

/**
 * Pure. The sentence fragments for Today's strip: only what she must decide, each one naming the
 * person, the time and the why, so the strip reads "Two things need you: Neha S, today 4:00 pm:
 * chose the time, did not finish paying — the slot is open again, and ...".
 */
export function attentionStrip(rows) {
  return rows
    .filter((a) => a.action === 'decide' || a.action === 'send_link')
    .map((a) => ({ kind: a.kind, name: a.name, time: a.when, text: `${a.name}, ${a.when}: ${a.why.charAt(0).toLowerCase()}${a.why.slice(1)}` }));
}

function sessionRow(r) {
  return {
    id: r.id, slotId: instantToSlotId(r.slot_start), status: r.status, source: r.source,
    minutes: r.minutes, dakshinaPaise: r.dakshina_paise, complimentary: !!r.complimentary,
    name: displayName(r), forWhom: r.for_whom, priorVisits: r.prior_visits,
    question: r.question_text, hasVoiceNote: !!r.question_media_id, paid: !!r.paid_at,
  };
}

// ---- Needs attention -----------------------------------------------------------------------------

/**
 * Where money used to leak: holds that expired with the slot still ahead, people who paid and never
 * opened their link, refunds on their way. Each item names the one action the team can take.
 */
export async function attentionQueue(guru) {
  const [expired, paidTooLate, missed, refunds, alone, waited, asked, taken] = await Promise.all([
    query(
      `select b.id, b.slot_start, b.created_at, b.source, b.payment_link_id, d.name, d.phone
         from bookings b join devotees d on d.id = b.devotee_id
        where b.guru_id = $1 and b.status = 'expired' and b.created_at > now() - interval '2 days' and b.slot_start > now()
          and not exists (select 1 from ledger_entries l where l.booking_id = b.id and l.kind = 'payment')
        order by b.created_at desc`, [guru.id]),
    // She paid after the ten minutes ran out. We hold her money and she has no time: the most
    // urgent row on this screen. Not limited to future slots — the dakshina outlives the slot.
    query(
      `select b.id, b.slot_start, l.amount_paise, l.provider_ref, l.created_at, d.name, d.phone
         from bookings b
         join ledger_entries l on l.booking_id = b.id and l.kind = 'payment'
         join devotees d on d.id = b.devotee_id
        where b.guru_id = $1 and b.status = 'expired' and l.created_at > now() - interval '7 days'
        order by l.created_at desc`, [guru.id]),
    // Paid and never opened her link. For the first hour after her time this is still hers to
    // decide; after that bookings.markNoShows has recorded it and the row only informs.
    query(
      `select b.id, b.slot_start, b.status, b.source, d.name, d.phone
         from bookings b join devotees d on d.id = b.devotee_id
         left join sessions s on s.booking_id = b.id
        where b.guru_id = $1 and b.slot_start > now() - interval '7 days'
          and (b.status = 'no_show'
               or (b.status = 'confirmed' and s.devotee_joined_at is null and s.started_at is null
                   and b.slot_start + make_interval(mins => b.minutes) < now()))
        order by b.slot_start desc`, [guru.id]),
    query(
      `select l.id, l.amount_paise, l.created_at, l.provider_ref, b.id as booking_id, b.slot_start, d.name, d.phone
         from ledger_entries l join devotees d on d.id = l.devotee_id left join bookings b on b.id = l.booking_id
        where l.guru_id = $1 and l.kind = 'refund' and l.created_at > now() - interval '7 days'
        order by l.created_at desc`, [guru.id]),
    // She opened her link and sat in the waiting room; the time passed and guruji never started.
    // This is his absence, not hers, so it is never marked a no-show: the team returns the
    // dakshina or offers another time.
    query(
      `select b.id, b.slot_start, s.devotee_joined_at, d.name, d.phone
         from bookings b join devotees d on d.id = b.devotee_id
         join sessions s on s.booking_id = b.id
        where b.guru_id = $1 and b.status = 'confirmed'
          and s.devotee_joined_at is not null and s.started_at is null
          and b.slot_start + make_interval(mins => b.minutes) < now() and b.slot_start > now() - interval '7 days'
        order by b.slot_start desc`, [guru.id]),
    // She waited ten minutes, he did not come, and she chose. Both choices are the team's to settle.
    query(
      `select m.id, m.payload_json, m.created_at, m.booking_id, b.slot_start, b.status, d.name, d.phone
         from messages_log m join devotees d on d.id = m.devotee_id left join bookings b on b.id = m.booking_id
        where m.guru_id = $1 and m.kind = 'escape.choice' and m.created_at > now() - interval '2 days'
          and b.status = 'confirmed'
        order by m.created_at desc`, [guru.id]),
    // She asked on WhatsApp to change or cancel inside the four hours, or a second time: the team decides.
    query(
      `select m.id, m.created_at, m.booking_id, b.slot_start, d.name, d.phone
         from messages_log m join bookings b on b.id = m.booking_id join devotees d on d.id = m.devotee_id
        where m.guru_id = $1 and m.kind = 'asked.team' and m.created_at > now() - interval '2 days'
          and b.status = 'confirmed' and b.slot_start > now() - interval '1 hour'
        order by m.created_at desc`, [guru.id]),
    bookings.takenSlotIds(guru.id),
  ]);

  return [
    ...asked.rows.map((r) => ({
      kind: 'asked_team', bookingId: r.booking_id, name: displayName(r), phone: r.phone,
      slotId: instantToSlotId(r.slot_start), when: whenLabel(r.slot_start),
      why: 'Asked on WhatsApp to change or cancel this time, inside the four hours. Call her, then move or cancel it here',
      action: 'decide',
    })),
    ...paidTooLate.rows.map((r) => ({
      kind: 'paid_too_late', bookingId: r.id, name: displayName(r), phone: r.phone,
      slotId: instantToSlotId(r.slot_start), when: whenLabel(r.slot_start),
      amountPaise: r.amount_paise, providerRef: r.provider_ref,
      why: `Paid ${formatRupees(r.amount_paise)} after the hold ran out — the time was not kept. Return the dakshina, or offer another time`,
      action: 'decide',
    })),
    ...expired.rows.map((r) => {
      const slotId = instantToSlotId(r.slot_start);
      const slotFree = !taken.has(slotId);
      return {
        kind: 'hold_expired', bookingId: r.id, name: displayName(r), phone: r.phone, slotId, when: whenLabel(r.slot_start),
        expiredAt: timeOf(new Date(r.created_at.getTime() + bookings.HOLD_MINUTES * 60000)),
        why: !r.payment_link_id ? 'Chose the time, but our payment page could not be opened — send her the link again'
          : slotFree ? 'Chose the time, did not finish paying — the slot is open again' : 'Chose the time, did not finish paying — someone else has the slot now',
        action: slotFree ? 'send_link' : 'none',
      };
    }),
    ...alone.rows.map((r) => ({
      kind: 'waited_alone', bookingId: r.id, name: displayName(r), phone: r.phone, slotId: instantToSlotId(r.slot_start), when: whenLabel(r.slot_start),
      why: 'Opened her link and waited; guruji did not sit — return the dakshina, or offer another time', action: 'decide',
    })),
    ...missed.rows.map((r) => ({
      kind: 'did_not_join', bookingId: r.id, name: displayName(r), phone: r.phone, slotId: instantToSlotId(r.slot_start), when: whenLabel(r.slot_start),
      why: r.status === 'no_show'
        ? 'Paid, never opened the link — marked as did not join, the dakshina stands'
        : 'Paid, never opened the link — becomes a no-show an hour after her time unless you offer another',
      action: r.status === 'no_show' ? 'done' : 'decide',
    })),
    ...waited.rows.map((r) => ({
      kind: 'waited_and_chose', bookingId: r.booking_id, name: displayName(r), phone: r.phone,
      slotId: r.slot_start ? instantToSlotId(r.slot_start) : null, when: whenLabel(r.created_at),
      why: r.payload_json.choice === 'another_time'
        ? 'Waited, guruji did not come, and asked for another time'
        : 'Waited, guruji did not come, and asked for the dakshina back',
      action: 'decide',
    })),
    ...refunds.rows.map((r) => ({
      kind: 'refund_sent', bookingId: r.booking_id, name: displayName(r), phone: r.phone, slotId: r.slot_start ? instantToSlotId(r.slot_start) : null,
      when: whenLabel(r.created_at), amountPaise: r.amount_paise, providerRef: r.provider_ref,
      why: String(r.provider_ref ?? '').startsWith('offline:refund')
        ? `${formatRupees(r.amount_paise)} to be handed back to her by the team${r.slot_start ? ` for ${describeDate(instantToSlotId(r.slot_start).slice(5, 15)).split(',')[0]}` : ''}`
        : `${formatRupees(r.amount_paise)} returned${r.slot_start ? ` for ${describeDate(instantToSlotId(r.slot_start).slice(5, 15)).split(',')[0]}` : ''}, reaches her in 5 to 7 working days`,
      action: String(r.provider_ref ?? '').startsWith('offline:refund') ? 'decide' : 'done',
    })),
  ];
}

/** "today 4:00 pm", "yesterday 11:00 am", "Wednesday 10:00 am" */
function whenLabel(instant) {
  const date = instantToSlotId(instant).slice(5, 15);
  const today = todayIst();
  const day = date === today ? 'today' : date === addDays(today, -1) ? 'yesterday' : date === addDays(today, 1) ? 'tomorrow' : describeDate(date).split(',')[0];
  return `${day} ${timeOf(instant)}`;
}

// ---- The waiting panel ---------------------------------------------------------------------------

/**
 * Who is around a session right now: bookings from two hours ago to three hours ahead, whether each
 * has opened her link (ever, and right now), what the team has told her, and the ways out if guruji
 * cannot get to her.
 */
export async function waitingBoard(guru, presenceFor) {
  const now = new Date();
  const from = new Date(now.getTime() - 2 * 3600000);
  const to = new Date(now.getTime() + 3 * 3600000);
  const [rows, running, notes] = await Promise.all([
    bookingsBetween(guru.id, from, to, ['confirmed']),
    currentSession(guru.id),
    query(
      `select m.booking_id, m.payload_json, m.created_at from messages_log m
        where m.guru_id = $1 and m.kind = 'waiting.message' and m.created_at > $2 order by m.created_at`, [guru.id, from]),
  ]);
  const sessions = await Promise.all(rows.map((r) => findSessionByBooking(r.id)));

  const people = rows.map((r, i) => {
    const presence = presenceFor(r.id);
    const opened = sessions[i]?.devotee_joined_at ?? null;
    return {
      ...sessionRow(r), time: timeOf(r.slot_start), phone: r.phone,
      inRoomSince: presence.devoteeSince ? presence.devoteeSince.toISOString() : null,
      openedLinkAt: opened ? opened.toISOString() : null,
      messages: notes.rows.filter((n) => n.booking_id === r.id).map((n) => ({ ...n.payload_json, at: n.created_at.toISOString() })),
    };
  });

  const today = todayIst();
  const open = availableSlots(sittingGridOf(guru), await bookings.takenSlotIds(guru.id), nowInIst());
  const pick = (date) => open.filter((s) => s.id.startsWith(`slot:${date}`)).slice(0, 3).map((s) => ({ slotId: s.id, label: s.label }));

  return {
    now: now.toISOString(),
    running: running ? {
      bookingId: running.booking_id, name: displayName(running), startedAt: running.started_at.toISOString(),
      slotTime: timeOf(running.slot_start), minutesLate: Math.max(0, Math.round((now - running.slot_start) / 60000) - (running.minutes ?? slotMinutesOf(guru))),
    } : null,
    people,
    suggestions: { laterToday: pick(today), tomorrow: pick(addDays(today, 1)) },
  };
}

function slotMinutesOf(guru) {
  return guru.pattern_json.slotMinutes ?? 30;
}

// ---- Close a day -----------------------------------------------------------------------------------

/** Everyone booked on `date`, each with the nearest free time after it, and how many unpaid holds would go. */
export async function closeDayPreview(guru, date) {
  const onDay = await bookings.bookingsOn(guru.id, date);
  const confirmed = onDay.filter((b) => b.status === 'confirmed');
  const held = onDay.filter((b) => b.status === 'held');
  const openLater = availableSlots(sittingGridOf(guru), await bookings.takenSlotIds(guru.id), nowInIst())
    .filter((s) => !s.id.startsWith(`slot:${date}`));
  const plan = suggestMoves(confirmed.map((b) => b.slotId), openLater.map((s) => s.id));
  return {
    date, dateLabel: describeDate(date),
    bookings: confirmed.map((b, i) => ({
      id: b.id, slotId: b.slotId, time: timeOf(b.slot_start), name: b.devotee_name ?? `…${String(b.phone).slice(-4)}`,
      phone: b.phone, source: b.source, suggestedSlotId: plan[i],
    })),
    alternatives: openLater.slice(0, 12).map((s) => ({ slotId: s.id, label: s.label })),
    heldCount: held.length,
  };
}

/**
 * Pure: for bookings in time order, the earliest open slot each can move to, no two the same.
 * Nearest first keeps the same order of the day where it can.
 */
export function suggestMoves(bookingSlotIds, openSlotIds) {
  const free = [...openSlotIds].sort();
  return bookingSlotIds.map(() => free.shift() ?? null);
}

// ---- One booking, fully ----------------------------------------------------------------------------

export async function bookingDetail(guru, id) {
  const b = await bookings.findWithDevotee(id);
  if (!b || b.guru_id !== guru.id) return null;
  const [ledger, messages, session, history, paid] = await Promise.all([
    query('select id, kind, amount_paise, provider_ref, expires_at, created_at from ledger_entries where booking_id = $1 order by created_at', [id]),
    query('select id, direction, kind, payload_json, created_at from messages_log where booking_id = $1 order by created_at desc limit 30', [id]),
    findSessionByBooking(id),
    bookings.listForDevotee(b.devotee_id),
    bookings.paymentFor(id),
  ]);
  return {
    id: b.id, slotId: b.slotId, time: timeOf(b.slot_start), date: b.slotId.slice(5, 15), dateLabel: describeDate(b.slotId.slice(5, 15)),
    status: b.status, source: b.source, question: b.question_text, hasVoiceNote: !!b.question_media_id,
    minutes: b.minutes, dakshinaPaise: b.dakshina_paise, complimentary: !!b.complimentary, sessionTypeId: b.session_type_id,
    paidAt: b.paid_at ? b.paid_at.toISOString() : null, createdAt: b.created_at.toISOString(), rescheduledFromId: b.rescheduled_from_id,
    devotee: { id: b.devotee_id, name: b.devotee_name, phone: b.phone, forWhom: b.for_whom },
    paidWith: paid ? { kind: paid.kind, amountPaise: paid.amount_paise, providerRef: paid.provider_ref } : null,
    ledger: ledger.rows.map((l) => ({ id: l.id, kind: l.kind, amountPaise: l.amount_paise, providerRef: l.provider_ref, expiresAt: l.expires_at, at: l.created_at.toISOString() })),
    messages: messages.rows.map((m) => ({ id: m.id, direction: m.direction, kind: m.kind, payload: m.payload_json, at: m.created_at.toISOString() })),
    session: session ? {
      devoteeJoinedAt: session.devotee_joined_at?.toISOString() ?? null, guruJoinedAt: session.guru_joined_at?.toISOString() ?? null,
      startedAt: session.started_at?.toISOString() ?? null, endedAt: session.ended_at?.toISOString() ?? null,
    } : null,
    history: history.filter((h) => h.id !== b.id).map((h) => ({ id: h.id, slotId: h.slotId, status: h.status, source: h.source })),
    actions: allowedActions(b),
  };
}

/** What the team may do to this booking right now — the state machine, read from the console's side. */
export function allowedActions(b) {
  const past = b.slot_start < new Date();
  const actions = [];
  if (b.status === 'confirmed') actions.push('message', 'reschedule', 'refund');
  if (b.status === 'confirmed' && !past) actions.push('cancel');
  if (b.status === 'confirmed' && past) actions.push('no_show');
  if (b.status === 'expired' && b.slot_start > new Date()) actions.push('send_link');
  if (b.status === 'held') actions.push('mark_paid');           // the team took the dakshina by hand
  if (b.status === 'confirmed' && !past) actions.push('tell_guru'); // a note to his own WhatsApp
  return actions;
}

/** A search hit or list row. */
export function bookingRow(b) {
  return {
    id: b.id, slotId: b.slotId, time: timeOf(b.slot_start), date: b.slotId.slice(5, 15), status: b.status, source: b.source,
    minutes: b.minutes, dakshinaPaise: b.dakshina_paise, complimentary: !!b.complimentary,
    name: b.devotee_name ?? `…${String(b.phone).slice(-4)}`, phone: b.phone, paid: !!b.paid_at, question: b.question_text, hasVoiceNote: !!b.question_media_id,
  };
}

// ---- Week grid -----------------------------------------------------------------------------------

export async function weekReport(guru, monday) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const [start] = dayRange(dates[0]);
  const [, end] = dayRange(dates[6]);
  const [rows, allEvents] = await Promise.all([bookingsBetween(guru.id, start, end, ON_CALENDAR), listEvents(guru.id)]);
  const week = buildWeek(guru, dates, rows, todayIst());
  // His satsangs, lives and meetups sit in the same seven columns, so his week is one picture.
  week.events = allEvents
    .map((e) => ({ id: e.id, title: e.title, kind: e.kind, date: instantToSlotId(new Date(e.startsAt)).slice(5, 15), time: timeOf(new Date(e.startsAt)), link: e.link, location: e.location }))
    .filter((e) => e.date >= dates[0] && e.date <= dates[6]);
  return week;
}

/** Pure: lays booking rows onto the pattern's slots for seven dates. Tested without a database. */
export function buildWeek(guru, dates, rows, today) {
  const availability = sittingGridOf(guru);
  const dayPattern = { ...availability, minimumNoticeMinutes: 0, daysAhead: 1 };

  const byDate = new Map(dates.map((d) => [d, []]));
  for (const r of rows) {
    const slotId = instantToSlotId(r.slot_start);
    byDate.get(slotId.slice(5, 15))?.push(gridBooking(r, slotId));
  }

  const times = new Set();
  const days = dates.map((date) => {
    const wall = parseSlotId(`slot:${date}T00:00`);
    const windows = availability.weeklyPattern[DAY_KEYS[wall.getUTCDay()]] ?? [];
    const closed = availability.closedDates.includes(date) ? 'closed' : windows.length === 0 ? 'no sittings' : null;
    const slotIds = closed ? [] : availableSlots(dayPattern, new Set(), wall).map((s) => s.id);
    const bookings = byDate.get(date);

    const slots = {};
    for (const id of slotIds) {
      const hhmm = id.slice(16);
      times.add(hhmm);
      slots[hhmm] = { slotId: id, booking: bookings.find((b) => b.slotId === id) ?? null };
    }
    // Booked off the grid — a five-minute start from a door, or before the timings changed — gets
    // its own row on an open day, so the grid still shows everyone in time order.
    for (const b of bookings) {
      const hhmm = b.slotId.slice(16);
      if (closed || slots[hhmm]) continue;
      times.add(hhmm);
      slots[hhmm] = { slotId: b.slotId, booking: b };
    }
    // Booked on a day since closed: still shown, never hidden.
    const extra = closed ? bookings : [];

    return {
      date, weekday: WEEKDAYS[wall.getUTCDay()], dayOfMonth: wall.getUTCDate(), today: date === today,
      closed, filled: bookings.length, total: slotIds.length, slots, extra,
    };
  });

  const sorted = [...times].sort();
  return {
    monday: dates[0], sunday: dates[6], label: rangeLabel(dates[0], dates[6]),
    times: sorted, afternoonFrom: sorted.find((t) => t >= '14:00') ?? null,
    days, filled: days.reduce((n, d) => n + d.filled, 0), total: days.reduce((n, d) => n + d.total, 0),
  };
}

// How a booking is coloured and captioned on the grid. Legend: paid · payment not finished ·
// came from a live · completed · open · day closed.
function gridBooking(r, slotId) {
  const minutes = r.minutes;
  const kind = r.status === 'completed' ? 'done'
    : r.status === 'no_show' ? 'noshow'
    : r.status === 'held' ? 'hold'
    : r.source === 'live' ? 'live' : 'paid';
  const note = kind === 'hold' ? 'not paid yet'
    : kind === 'noshow' ? 'did not join'
    : kind === 'live' ? 'from the live'
    : r.question_media_id ? 'voice note'
    : r.prior_visits > 0 ? `${ordinal(r.prior_visits + 1)} visit` : 'paid';
  return { id: r.id, slotId, name: displayName(r), status: r.status, source: r.source, kind, note, minutes };
}

// ---- Money ---------------------------------------------------------------------------------------

export async function moneyReport(guru, monday) {
  const sunday = addDays(monday, 6);
  const [start] = dayRange(monday);
  const [, end] = dayRange(sunday);
  const [kpis, { rows }] = await Promise.all([
    moneyKpis(guru.id, { today: todayIst(), monday }),
    query(
      `select l.id, l.kind, l.amount_paise, l.provider_ref, l.created_at, l.booking_id, l.expires_at,
              b.slot_start, b.source, d.name, d.phone
         from ledger_entries l
         join devotees d on d.id = l.devotee_id
         left join bookings b on b.id = l.booking_id
        where l.guru_id = $1 and l.created_at >= $2 and l.created_at < $3
        order by l.created_at desc`,
      [guru.id, start, end]),
  ]);
  const entries = rows.map((r) => ({
    id: r.id, kind: r.kind, amountPaise: r.amount_paise, providerRef: r.provider_ref, bookingId: r.booking_id,
    at: r.created_at.toISOString(), date: instantToSlotId(r.created_at).slice(5, 15), time: timeOf(r.created_at),
    name: displayName(r), source: r.source, slotId: r.slot_start ? instantToSlotId(r.slot_start) : null,
    slotTime: r.slot_start ? timeOf(r.slot_start) : null, expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
  }));
  return { monday, sunday, label: rangeLabel(monday, sunday), kpis, entries };
}

async function moneyKpis(guruId, { today, monday }) {
  const [todayStart, todayEnd] = dayRange(today);
  const [weekStart] = dayRange(monday);
  const [, weekEnd] = dayRange(addDays(monday, 6));
  const [settleStart] = dayRange(settlementStart(today));
  const { rows: [k] } = await query(
    `select
       coalesce(sum(amount_paise) filter (where kind = 'payment' and created_at >= $2 and created_at < $3), 0)::int as collected_today,
       coalesce(sum(amount_paise) filter (where kind = 'payment' and created_at >= $4 and created_at < $5), 0)::int as collected_week,
       coalesce(sum(amount_paise) filter (where kind = 'refund'  and created_at >= $4 and created_at < $5), 0)::int as returned_week,
       coalesce(sum(case kind when 'payment' then amount_paise when 'refund' then -amount_paise else 0 end)
                filter (where created_at >= $6 and coalesce(provider_ref, '') not like 'offline:%'), 0)::int as due_to_settle
     from ledger_entries where guru_id = $1`,
    [guruId, todayStart, todayEnd, weekStart, weekEnd, settleStart]);
  return {
    collectedTodayPaise: k.collected_today, collectedWeekPaise: k.collected_week, returnedWeekPaise: k.returned_week,
    dueToSettlePaise: k.due_to_settle, settlesOn: 'Friday', settlesOnDate: addDays(settlementStart(today), 7),
  };
}

// ---- Devotees ------------------------------------------------------------------------------------

/**
 * Everyone who ever booked with this guru, with the three things the team asks about a name: how
 * many times she has sat with him, when last, when next, and what she has given. Search by name or
 * number; empty lists everyone, most recent first.
 */
export async function listDevotees(guru, q = '', limit = 200) {
  const text = q.trim();
  const digits = text.replace(/\D/g, '');
  const { rows } = await query(
    `select d.id, d.name, d.phone, d.for_whom,
            count(b.id) filter (where b.status = 'completed') as visits,
            max(b.slot_start) filter (where b.status = 'completed') as last_sitting,
            min(b.slot_start) filter (where b.status = 'confirmed' and b.slot_start > now()) as next_sitting,
            max(b.slot_start) as latest,
            coalesce((select sum(l.amount_paise) from ledger_entries l where l.devotee_id = d.id and l.kind = 'payment'), 0)
              - coalesce((select sum(l.amount_paise) from ledger_entries l where l.devotee_id = d.id and l.kind = 'refund'), 0) as given_paise
       from devotees d left join bookings b on b.devotee_id = d.id
      where d.guru_id = $1
        and ($2 = '' or d.name ilike '%' || $2 || '%' or ($3 <> '' and d.phone like '%' || $3 || '%'))
      group by d.id
      order by latest desc nulls last, d.name
      limit $4`, [guru.id, text, digits, limit]);
  return rows.map(devoteeRow);
}

/** One person: who she is, every time she booked, and what she has given. */
export async function devoteeDetail(guru, id) {
  const { rows: [d] } = await query('select * from devotees where id = $1 and guru_id = $2', [id, guru.id]);
  if (!d) return null;
  const [list, history] = await Promise.all([listDevotees(guru, d.phone, 1), bookings.listForDevotee(d.id)]);
  return {
    ...(list[0] ?? devoteeRow({ ...d, visits: 0, given_paise: 0 })),
    bookings: history.map((b) => bookingRow({ ...b, phone: d.phone, devotee_name: d.name })),
  };
}

function devoteeRow(r) {
  return {
    id: r.id, name: r.name ?? `…${String(r.phone).slice(-4)}`, phone: r.phone, forWhom: r.for_whom ?? null,
    visits: Number(r.visits ?? 0), givenPaise: Number(r.given_paise ?? 0),
    lastSitting: r.last_sitting ? instantToSlotId(r.last_sitting) : null,
    nextSitting: r.next_sitting ? instantToSlotId(r.next_sitting) : null,
  };
}

// ---- Going live: the few things a new guru's team must set --------------------------------------

/** Pure. Which of the go-live steps are done, from the guru row, his kinds, his QR codes and his bookings. */
export function setupSteps({ guru, sessionTypes, qrCount, bookingCount }) {
  const windows = Object.values(guru.pattern_json?.weeklyPattern ?? {}).flat();
  return {
    timings: windows.length > 0,
    kinds: sessionTypes.some((t) => t.active),
    website: Boolean((guru.about ?? '').trim()) && Boolean(guru.marketing_json?.tagline),
    guruPhone: Boolean(guru.guru_phone),
    qr: qrCount > 0,
    firstBooking: bookingCount > 0,
  };
}

/**
 * Pure. The admin's nine-step readiness for a guru. `required` steps gate "go live"; the rest inform.
 * Payments and WhatsApp read "shared" until each guru has his own (D3, D4).
 */
export function readiness({ guru, sessionTypes, qrCount, teamCount, publicHost }) {
  const steps = setupSteps({ guru, sessionTypes, qrCount, bookingCount: 0 });
  const biz = guru.business_json ?? {};
  return [
    { key: 'identity', done: Boolean(guru.name?.trim()) && Boolean((guru.about ?? '').trim()) && Boolean(guru.marketing_json?.tagline), required: true },
    { key: 'address', done: true, required: true, detail: guru.domain ? 'domain' : publicHost ? 'subdomain' : 'preview' },
    { key: 'team', done: teamCount > 0, required: true },
    { key: 'sittings', done: steps.kinds && steps.timings, required: true },
    { key: 'payments', done: Boolean(guru.razorpay_connected_at), required: false, detail: guru.razorpay_connected_at ? (guru.razorpay_mode ?? 'own') : 'shared' },
    { key: 'whatsapp', done: false, required: false, detail: 'shared' },
    { key: 'distribution', done: steps.qr, required: false },
    { key: 'business', done: Boolean(biz.legalName), required: false },
    { key: 'live', done: guru.status === 'live', required: false },
  ];
}

export async function setupState(guru) {
  const [types, qr, count] = await Promise.all([
    query('select active from session_types where guru_id = $1', [guru.id]),
    query('select count(*)::int as n from qr_codes where guru_id = $1', [guru.id]),
    query('select count(*)::int as n from bookings where guru_id = $1', [guru.id]),
  ]);
  return setupSteps({ guru, sessionTypes: types.rows, qrCount: qr.rows[0].n, bookingCount: count.rows[0].n });
}
