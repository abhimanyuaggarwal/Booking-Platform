// A session is one booking's video room: when it was made, who arrived, when it started and ended.
// Guruji's tap starts it; everyone waiting is told through the socket in the same breath.

import { instantToSlotId, describeSlot } from '@expert-sessions/shared';
import { query } from './db.js';
import { emitToSession, presenceFor } from './realtime.js';
import { completeBooking, findWithDevotee } from './bookings.js';
import { JOIN_OPENS_MINUTES, JOIN_CLOSES_MINUTES } from './guru-day.js';
import { BookingRuleError } from './errors.js';

/**
 * A session left open this long was abandoned, not run: he closed his browser, lost signal, or
 * forgot to tap End. It matters far beyond that one booking — `currentSession` answers "who is he
 * with right now" from the newest unfinished session, so one forgotten session tells every other
 * devotee "guruji is with someone before you" for ever. jobs.js closes them.
 */
export const ABANDON_AFTER_MINUTES = 90;

/** She opened her link (her socket joined the room). First time wins; later opens change nothing. */
export async function noteDevoteeOpened(bookingId) {
  await query(
    `insert into sessions (guru_id, booking_id, devotee_joined_at)
       select guru_id, id, now() from bookings where id = $1
     on conflict (booking_id) do update set devotee_joined_at = coalesce(sessions.devotee_joined_at, now())`,
    [bookingId]);
}

export async function findSessionByBooking(bookingId) {
  const { rows } = await query('select * from sessions where booking_id = $1', [bookingId]);
  return rows[0] ?? null;
}

/** The session guruji is in right now, if any, with who is in it. */
export async function currentSession(guruId) {
  const { rows } = await query(
    `select s.*, b.slot_start, d.name, d.phone
       from sessions s join bookings b on b.id = s.booking_id join devotees d on d.id = b.devotee_id
      where s.guru_id = $1 and s.started_at is not null and s.ended_at is null
      order by s.started_at desc limit 1`,
    [guruId]);
  return rows[0] ?? null;
}

/**
 * Guruji taps Join. The room is made if it does not exist, the session is marked started, and her
 * waiting room becomes the call. Tapping twice returns the same room rather than making another.
 * @returns {{session: object, roomId: string, token: string}}
 */
export async function startSession({ guru, bookingId, video }) {
  const booking = await findWithDevotee(bookingId);
  if (!booking || booking.guru_id !== guru.id) throw new Error(`Booking ${bookingId} not found`);
  if (booking.status !== 'confirmed') throw new BookingRuleError(`A ${booking.status} booking has no session to join`);

  // His screen only offers Join inside this window; a stale tab or a mis-tap must not get past it
  // either, or a session is recorded for a sitting that never happened.
  const minutesAway = (booking.slot_start - Date.now()) / 60000;
  const already = await findSessionByBooking(bookingId);
  if (!already?.started_at && (minutesAway > JOIN_OPENS_MINUTES || minutesAway < -JOIN_CLOSES_MINUTES)) {
    throw new BookingRuleError(`That time is not open to join — it opens ${JOIN_OPENS_MINUTES} minutes before, and closes ${JOIN_CLOSES_MINUTES} minutes after`);
  }

  const existing = already;
  const roomId = existing?.room_id ?? (await video.createRoom({
    bookingId, description: `${guru.name} · ${describeSlot(instantToSlotId(booking.slot_start))}`,
  })).id;
  // Minted before the session is written: if 100ms refuses, nothing has been started and her screen
  // has not been told that he has joined.
  const token = video.authToken({ roomId, userId: `guru-${guru.id}`, who: 'guru' });

  const { rows: [session] } = await query(
    `insert into sessions (guru_id, booking_id, room_id, started_at, guru_joined_at)
       values ($1, $2, $3, now(), now())
     on conflict (booking_id) do update
       set room_id = coalesce(sessions.room_id, excluded.room_id),
           started_at = coalesce(sessions.started_at, excluded.started_at),
           guru_joined_at = coalesce(sessions.guru_joined_at, excluded.guru_joined_at)
     returning *`,
    [guru.id, bookingId, roomId]);

  emitToSession(bookingId, 'session.started', { startedAt: session.started_at.toISOString() });
  return { session, roomId, token };
}

/** Guruji taps End. The booking is completed and her screen becomes the closing one. */
export async function endSession({ guru, bookingId }) {
  const session = await findSessionByBooking(bookingId);
  if (!session || session.guru_id !== guru.id) throw new BookingRuleError('That sitting has no session to end. Reload his day.');
  if (!session.started_at) throw new BookingRuleError('That session has not started');

  const { rows: [ended] } = await query(
    'update sessions set ended_at = coalesce(ended_at, now()) where booking_id = $1 returning *', [bookingId]);
  const booking = await completeBooking(bookingId);
  const minutes = Math.max(1, Math.round((ended.ended_at - ended.started_at) / 60000));
  emitToSession(bookingId, 'session.ended', { endedAt: ended.ended_at.toISOString(), minutes });
  return { session: ended, booking, minutes };
}

/**
 * Close sessions nobody ended. Their bookings complete if they still can — he did sit, he simply
 * never tapped End — and anyone still on the screen is told, so a stale waiting room resolves.
 * @returns {number} how many were closed
 */
export async function closeAbandonedSessions() {
  const { rows } = await query(
    `update sessions s set ended_at = now()
       from bookings b
      where b.id = s.booking_id and s.started_at is not null and s.ended_at is null
        and s.started_at < now() - make_interval(mins => $1::int)
      returning s.booking_id, s.started_at, s.ended_at, b.minutes`,
    [ABANDON_AFTER_MINUTES]);

  for (const row of rows) {
    // Nobody tapped End, so the clock says 90; the sitting was as long as it was booked for.
    const minutes = row.minutes ?? Math.max(1, Math.round((row.ended_at - row.started_at) / 60000));
    // A booking that was cancelled or refunded in the meantime cannot complete; the session is
    // closed either way, which is the part that matters.
    try {
      await completeBooking(row.booking_id);
    } catch (err) {
      if (!(err instanceof BookingRuleError)) throw err;
    }
    emitToSession(row.booking_id, 'session.ended', { endedAt: row.ended_at.toISOString(), minutes });
  }
  return rows.length;
}

/** Her token for the room, once it exists. She is only ever a guest in it. */
export function devoteeToken({ session, devoteeId, video }) {
  if (!session?.room_id || !session.started_at || session.ended_at) return null;
  return video.authToken({ roomId: session.room_id, userId: `devotee-${devoteeId}`, who: 'devotee' });
}

/** Whether she is connected to the waiting room right now (in memory; see realtime.js). */
export function isWaiting(bookingId) {
  return Boolean(presenceFor(bookingId).devoteeSince);
}
