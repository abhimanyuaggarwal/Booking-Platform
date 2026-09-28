// The console's date maths and the week grid, as usage examples. No database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotIdToInstant } from '@expert-sessions/shared';
import { mondayOf, addDays, dayRange, settlementStart, rangeLabel, buildWeek, suggestMoves, allowedActions, attentionStrip } from './reports.js';

test('the week starts on Monday, whichever day you ask from', () => {
  assert.equal(mondayOf('2026-09-16'), '2026-09-14'); // a Wednesday
  assert.equal(mondayOf('2026-09-14'), '2026-09-14'); // Monday itself
  assert.equal(mondayOf('2026-09-20'), '2026-09-14'); // Sunday belongs to the week before
});

test('a day range is IST midnight to midnight, as UTC instants', () => {
  const [start, end] = dayRange('2026-09-16');
  assert.equal(start.toISOString(), '2026-09-15T18:30:00.000Z');
  assert.equal(end.toISOString(), '2026-09-16T18:30:00.000Z');
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
});

test('money due to settle counts from the most recent Friday, today included', () => {
  assert.equal(settlementStart('2026-09-16'), '2026-09-11'); // Wednesday -> last Friday
  assert.equal(settlementStart('2026-09-18'), '2026-09-18'); // Friday -> today
  assert.equal(settlementStart('2026-09-19'), '2026-09-18'); // Saturday -> yesterday
});

test('week labels read like a person wrote them', () => {
  assert.equal(rangeLabel('2026-09-14', '2026-09-20'), '14 – 20 September');
  assert.equal(rangeLabel('2026-09-28', '2026-10-04'), '28 September – 4 October');
});

const guru = {
  dakshina_paise: 50000,
  pattern_json: { slotMinutes: 30, gapMinutes: 10, minimumNoticeMinutes: 60, daysAhead: 7,
    weeklyPattern: { sun: [], mon: [['10:00', '11:30']], tue: [['10:00', '11:30'], ['16:00', '17:00']], wed: [['10:00', '11:30']], thu: [['10:00', '11:30']], fri: [], sat: [], } },
  closed_dates: ['2026-09-17'],
};
const dates = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
const row = (slotId, status, source, extra = {}) => ({
  id: slotId, slot_start: slotIdToInstant(slotId), status, source, name: 'Ramesh K', phone: '919829012345',
  question_media_id: null, prior_visits: 0, paid_at: status === 'held' ? null : new Date(), ...extra,
});

test('the grid has a column per day, a row per slot time, and an afternoon divider before the evening', () => {
  const week = buildWeek(guru, dates, [], '2026-09-16');
  assert.equal(week.label, '14 – 20 September');
  assert.deepEqual(week.times, ['10:00', '10:40', '16:00']);
  assert.equal(week.afternoonFrom, '16:00');
  assert.equal(week.days[2].today, true);
  assert.equal(week.days[3].closed, 'closed');        // Thursday is a closed date
  assert.equal(week.days[6].closed, 'no sittings');   // Sunday has no windows
  assert.equal(week.days[0].total, 2);
  assert.equal(week.total, 2 + 3 + 2);                // Mon, Tue (with evening), Wed; Thu closed
});

test('each booking is coloured by state: paid, hold, live, done, did not join', () => {
  const rows = [
    row('slot:2026-09-14T10:00', 'completed', 'live'),
    row('slot:2026-09-14T10:40', 'no_show', 'page'),
    row('slot:2026-09-15T10:00', 'confirmed', 'live'),
    row('slot:2026-09-15T10:40', 'held', 'direct'),
    row('slot:2026-09-15T16:00', 'confirmed', 'ashram', { prior_visits: 1 }),
    row('slot:2026-09-16T10:00', 'confirmed', 'poster', { question_media_id: 'm1' }),
  ];
  const week = buildWeek(guru, dates, rows, '2026-09-16');
  const kind = (d, t) => week.days[d].slots[t].booking.kind;
  const note = (d, t) => week.days[d].slots[t].booking.note;
  assert.equal(kind(0, '10:00'), 'done');
  assert.equal(kind(0, '10:40'), 'noshow');
  assert.equal(kind(1, '10:00'), 'live');
  assert.equal(note(1, '10:00'), 'from the live');
  assert.equal(kind(1, '10:40'), 'hold');
  assert.equal(note(1, '10:40'), 'not paid yet');
  assert.equal(kind(1, '16:00'), 'paid');
  assert.equal(note(1, '16:00'), '2nd visit');
  assert.equal(note(2, '10:00'), 'voice note');
  assert.equal(week.days[1].filled, 3);
  assert.equal(week.filled, 6);
});

test('a booking outside the current pattern is listed, not lost', () => {
  const rows = [row('slot:2026-09-14T14:00', 'confirmed', 'page')]; // Monday has no afternoon window
  const week = buildWeek(guru, dates, rows, '2026-09-16');
  assert.equal(week.days[0].extra.length, 1);
  assert.equal(week.days[0].filled, 1);
});

test('a devotee without a name shows as the last four digits of her phone', () => {
  const week = buildWeek(guru, dates, [row('slot:2026-09-14T10:00', 'confirmed', 'page', { name: null })], '2026-09-16');
  assert.equal(week.days[0].slots['10:00'].booking.name, '…2345');
});

test('closing a day offers each booking the next free time, none twice, in order', () => {
  const booked = ['slot:2026-09-15T10:00', 'slot:2026-09-15T11:00', 'slot:2026-09-15T12:00'];
  const open = ['slot:2026-09-16T11:30', 'slot:2026-09-16T10:00', 'slot:2026-09-17T10:00'];
  assert.deepEqual(suggestMoves(booked, open), ['slot:2026-09-16T10:00', 'slot:2026-09-16T11:30', 'slot:2026-09-17T10:00']);
  assert.deepEqual(suggestMoves(booked, ['slot:2026-09-16T10:00']), ['slot:2026-09-16T10:00', null, null]);
});

test("Today's strip names only what she must decide, as person, time and why", () => {
  const rows = [
    { kind: 'hold_expired', name: 'Neha S', when: 'today 4:00 pm', why: 'Chose the time, did not finish paying — the slot is open again', action: 'send_link' },
    { kind: 'did_not_join', name: 'Ramesh K', when: 'Friday 10:00 am', why: 'Paid, never opened the link — marked as did not join, the dakshina stands', action: 'done' },
    { kind: 'waited_alone', name: 'Kavita J', when: 'yesterday 11:00 am', why: 'Opened her link and waited; guruji did not sit — return the dakshina, or offer another time', action: 'decide' },
  ];
  assert.deepEqual(attentionStrip(rows).map((a) => a.text), [
    'Neha S, today 4:00 pm: chose the time, did not finish paying — the slot is open again',
    'Kavita J, yesterday 11:00 am: opened her link and waited; guruji did not sit — return the dakshina, or offer another time',
  ]);
});

test('the console only offers moves the state machine allows', () => {
  const future = new Date(Date.now() + 3600000);
  const past = new Date(Date.now() - 3600000);
  assert.deepEqual(allowedActions({ status: 'confirmed', slot_start: future }), ['message', 'reschedule', 'refund', 'cancel', 'tell_guru']); // cancel-to-credit only while the time is ahead
  assert.deepEqual(allowedActions({ status: 'confirmed', slot_start: past }), ['message', 'reschedule', 'refund', 'no_show']);
  assert.deepEqual(allowedActions({ status: 'expired', slot_start: future }), ['send_link']);
  assert.deepEqual(allowedActions({ status: 'completed', slot_start: past }), []);
  assert.deepEqual(allowedActions({ status: 'held', slot_start: future }), ['mark_paid']); // the team may confirm money it took by hand
});

test('a held time can be confirmed by hand, and a coming sitting can be told to guruji', () => {
  const soon = new Date(Date.now() + 3600000);
  assert.deepEqual(allowedActions({ status: 'held', slot_start: soon }), ['mark_paid']);
  assert.ok(allowedActions({ status: 'confirmed', slot_start: soon }).includes('tell_guru'));
  assert.ok(!allowedActions({ status: 'confirmed', slot_start: new Date(Date.now() - 3600000) }).includes('tell_guru'));
});
