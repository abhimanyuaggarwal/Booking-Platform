// Starting and ending a session, against a real Postgres, with a stubbed 100ms so the test needs
// no account. Creates a throwaway database and drops it; skips itself when Postgres is not running.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const ADMIN_URL = (process.env.DATABASE_URL || 'postgres://es:es@localhost:5432/expert_sessions').replace(/\/[^/]*$/, '/postgres');
const DB_NAME = `expert_sessions_sessions_${process.pid}`;

// What video.js gives us, without 100ms: one room per booking, and tokens we can read back.
const video = {
  rooms: [],
  createRoom({ bookingId }) { this.rooms.push(bookingId); return Promise.resolve({ id: `room-for-${bookingId}` }); },
  authToken({ roomId, userId, who }) { return `token:${who}:${userId}@${roomId}`; },
};

let admin; let reachable = false; let db; let sessions; let bookings; let guru; let devotee;

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL });
  try { await admin.connect(); reachable = true; } catch { return; }
  await admin.query(`create database ${DB_NAME}`);
  process.env.DATABASE_URL = ADMIN_URL.replace(/\/postgres$/, `/${DB_NAME}`);
  db = await import('./db.js');
  sessions = await import('./sessions.js');
  bookings = await import('./bookings.js');
  await db.migrate();
  ({ rows: [guru] } = await db.query(
    `insert into gurus (slug, name, dakshina_paise, pattern_json) values ('t', 'Test Guru', 50000, '{"slotMinutes":30}') returning *`));
  await db.query(`insert into session_types (guru_id, minutes, dakshina_paise) values ($1, 30, 50000)`, [guru.id]);
  ({ rows: [devotee] } = await db.query(
    `insert into devotees (guru_id, phone, name) values ($1, '919999000002', 'Test Devotee') returning *`, [guru.id]));
});

after(async () => {
  if (!reachable) return;
  await db.close();
  await admin.query(`drop database ${DB_NAME}`);
  await admin.end();
});

function dbTest(name, fn) {
  test(name, async (t) => {
    if (!reachable) return t.skip('Postgres not running');
    await fn(t);
  });
}

/**
 * A confirmed booking at her time, or a given number of minutes from now. The api only opens Join
 * near her time, so these sit at the current moment; slot maths is tested in packages/shared.
 */
async function confirmedBooking(minutesFromNow = 0) {
  const { rows: [b] } = await db.query(
    `insert into bookings (guru_id, devotee_id, slot_start, status, source, paid_at, minutes, dakshina_paise)
     values ($1, $2, now() + make_interval(mins => $3::int), 'confirmed', 'page', now(), 30, 50000) returning *`,
    [guru.id, devotee.id, minutesFromNow]);
  return b;
}

dbTest('guruji taps Join: a room is made, the session starts, and he gets the host token', async () => {
  const b = await confirmedBooking();
  const { roomId, token, session } = await sessions.startSession({ guru, bookingId: b.id, video });
  assert.equal(roomId, `room-for-${b.id}`);
  assert.equal(token, `token:guru:guru-${guru.id}@${roomId}`);
  assert.ok(session.started_at);
  assert.ok(session.guru_joined_at);
});

dbTest('tapping Join twice keeps the same room rather than making another', async () => {
  const b = await confirmedBooking();
  const first = await sessions.startSession({ guru, bookingId: b.id, video });
  const roomsBefore = video.rooms.length;
  const again = await sessions.startSession({ guru, bookingId: b.id, video });
  assert.equal(again.roomId, first.roomId);
  assert.equal(video.rooms.length, roomsBefore, 'no second room was made');
  assert.equal(again.session.started_at.getTime(), first.session.started_at.getTime(), 'the start time does not move');
});

dbTest('her token only exists while the room does, and is only ever a guest', async () => {
  const b = await confirmedBooking();
  const before = await sessions.findSessionByBooking(b.id);
  assert.equal(sessions.devoteeToken({ session: before, devoteeId: devotee.id, video }), null);

  await sessions.startSession({ guru, bookingId: b.id, video });
  const running = await sessions.findSessionByBooking(b.id);
  assert.equal(sessions.devoteeToken({ session: running, devoteeId: devotee.id, video }), `token:devotee:devotee-${devotee.id}@room-for-${b.id}`);

  await sessions.endSession({ guru, bookingId: b.id });
  const ended = await sessions.findSessionByBooking(b.id);
  assert.equal(sessions.devoteeToken({ session: ended, devoteeId: devotee.id, video }), null, 'the room closes behind them');
});

dbTest('ending the session completes the booking and reports how long they sat', async () => {
  const b = await confirmedBooking();
  await sessions.startSession({ guru, bookingId: b.id, video });
  await db.query(`update sessions set started_at = now() - interval '32 minutes' where booking_id = $1`, [b.id]);
  const { minutes, booking } = await sessions.endSession({ guru, bookingId: b.id });
  assert.equal(minutes, 32);
  assert.equal(booking.status, 'completed');
  assert.equal((await bookings.findById(b.id)).status, 'completed');
});

dbTest('a session cannot start on a booking that is not confirmed, or end before it starts', async () => {
  const b = await confirmedBooking();
  await db.query(`update bookings set status = 'cancelled' where id = $1`, [b.id]);
  await assert.rejects(() => sessions.startSession({ guru, bookingId: b.id, video }), /cancelled booking has no session/);

  const fresh = await confirmedBooking();
  await assert.rejects(() => sessions.endSession({ guru, bookingId: fresh.id }), /has no session/);
});

dbTest('opening her link is remembered even if she opens it many times', async () => {
  const b = await confirmedBooking();
  await sessions.noteDevoteeOpened(b.id);
  const first = await sessions.findSessionByBooking(b.id);
  await sessions.noteDevoteeOpened(b.id);
  const second = await sessions.findSessionByBooking(b.id);
  assert.ok(first.devotee_joined_at);
  assert.equal(second.devotee_joined_at.getTime(), first.devotee_joined_at.getTime(), 'the first time she opened it stands');
});

dbTest('the session guruji is in right now is the one the team can see, until it ends', async () => {
  await db.query('update sessions set ended_at = now() where ended_at is null'); // the earlier tests left theirs open
  const b = await confirmedBooking();
  await sessions.startSession({ guru, bookingId: b.id, video });
  const now = await sessions.currentSession(guru.id);
  assert.equal(now.booking_id, b.id);
  assert.equal(now.name, 'Test Devotee');
  await sessions.endSession({ guru, bookingId: b.id });
  assert.equal(await sessions.currentSession(guru.id), null, 'nothing is running once it ends');
});

dbTest('a session cannot be started for a time that has not come, or is long past', async () => {
  const tomorrow = await confirmedBooking(60 * 24);
  await assert.rejects(() => sessions.startSession({ guru, bookingId: tomorrow.id, video }), /not open to join/);

  const longGone = await confirmedBooking(-120);
  await assert.rejects(() => sessions.startSession({ guru, bookingId: longGone.id, video }), /not open to join/);

  // But a session already running can always be rejoined, however late he comes back to it.
  const now = await confirmedBooking();
  await sessions.startSession({ guru, bookingId: now.id, video });
  await db.query(`update bookings set slot_start = now() - interval '5 hours' where id = $1`, [now.id]);
  await assert.doesNotReject(() => sessions.startSession({ guru, bookingId: now.id, video }));
});

dbTest('a session nobody ended is closed, so it stops telling everyone else he is busy', async () => {
  // Earlier tests in this file leave sessions open on purpose; clear them so "who is he with"
  // means what it says here.
  await db.query(`update sessions set ended_at = now() where ended_at is null`);
  const b = await confirmedBooking();
  await sessions.startSession({ guru, bookingId: b.id, video });
  assert.equal((await sessions.currentSession(guru.id))?.booking_id, b.id, 'he is in it');

  // He closed his browser an hour and a half ago and never tapped End.
  await db.query(`update sessions set started_at = now() - interval '100 minutes' where booking_id = $1`, [b.id]);
  assert.equal(await sessions.closeAbandonedSessions(), 1);

  assert.equal(await sessions.currentSession(guru.id), null, 'he is no longer with anyone');
  assert.equal((await bookings.findById(b.id)).status, 'completed');
  assert.equal(await sessions.closeAbandonedSessions(), 0, 'closing twice changes nothing');
});
