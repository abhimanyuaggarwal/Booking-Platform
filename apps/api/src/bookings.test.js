// The state machine, as usage examples. Runs without a database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transition, whyCannotCancel, whyCannotReschedule, ruleSentence, HOLD_MINUTES, SELF_SERVE_HOURS } from './bookings.js';

test('a held slot becomes confirmed when she pays', () => {
  assert.equal(transition('held', 'pay'), 'confirmed');
});

test('a held slot expires when the ten-minute hold runs out', () => {
  assert.equal(HOLD_MINUTES, 10);
  assert.equal(transition('held', 'expire'), 'expired');
});

test('a confirmed booking can end, move, be cancelled, be refunded, or be marked no-show', () => {
  assert.equal(transition('confirmed', 'end'), 'completed');
  assert.equal(transition('confirmed', 'reschedule'), 'rescheduled');
  assert.equal(transition('confirmed', 'cancel'), 'cancelled');
  assert.equal(transition('confirmed', 'refund'), 'refunded');
  assert.equal(transition('confirmed', 'no_show'), 'no_show');
});

test('a confirmed booking cannot be paid again, and a held one cannot be cancelled or refunded', () => {
  assert.throws(() => transition('confirmed', 'pay'), /confirmed booking cannot pay/);
  assert.throws(() => transition('held', 'cancel'), /held booking cannot cancel/);
  assert.throws(() => transition('held', 'refund'));
});

test('completed, no_show, rescheduled, cancelled, refunded and expired are final', () => {
  const events = ['pay', 'expire', 'end', 'reschedule', 'cancel', 'refund', 'no_show'];
  for (const status of ['completed', 'no_show', 'rescheduled', 'cancelled', 'refunded', 'expired']) {
    for (const event of events) assert.throws(() => transition(status, event), new RegExp(`${status} booking cannot ${event}`));
  }
});

const hoursAway = (h) => ({ status: 'confirmed', slot_start: new Date(Date.now() + h * 3600000), rescheduled_from_id: null });

test('she may move or cancel her own time up to four hours before', () => {
  assert.equal(SELF_SERVE_HOURS, 4);
  assert.equal(whyCannotReschedule(hoursAway(5)), null);
  assert.equal(whyCannotCancel(hoursAway(5)), null);
});

test('nearer than four hours she is sent to the team, in a sentence', () => {
  assert.match(ruleSentence(whyCannotReschedule(hoursAway(3))), /open until 4 hours before. Ask his team/);
  assert.match(ruleSentence(whyCannotCancel(hoursAway(3))), /Ask his team/);
});

test('a time already moved once cannot be moved again, but can still be cancelled', () => {
  const moved = { ...hoursAway(5), rescheduled_from_id: 'earlier-booking' };
  assert.match(ruleSentence(whyCannotReschedule(moved)), /already been moved once/);
  assert.equal(whyCannotCancel(moved), null);
});

test('only a confirmed time is hers to change', () => {
  for (const status of ['held', 'completed', 'cancelled', 'refunded', 'no_show', 'expired', 'rescheduled']) {
    assert.match(ruleSentence(whyCannotReschedule({ ...hoursAway(5), status })), /not open to changes/);
    assert.match(ruleSentence(whyCannotCancel({ ...hoursAway(5), status })), /not open to changes/);
  }
});
