// When each reminder is due, and what it says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotIdToInstant } from '@expert-sessions/shared';
import { reminderDue, copy, SOON_MINUTES } from './reminders.js';

const ist = (slotId) => slotIdToInstant(slotId);
const due = (slot, nowSlot) => reminderDue({ slotStart: ist(slot), now: ist(nowSlot) });

test('ten minutes before her time, she is reminded', () => {
  assert.equal(SOON_MINUTES, 12);
  assert.equal(due('slot:2026-09-16T11:00', 'slot:2026-09-16T10:50'), 'soon');
  assert.equal(due('slot:2026-09-16T11:00', 'slot:2026-09-16T10:59'), 'soon');
});

test('half an hour before is too early, and after her time has begun it is too late', () => {
  assert.equal(due('slot:2026-09-16T11:00', 'slot:2026-09-16T10:30'), null);
  assert.equal(due('slot:2026-09-16T11:00', 'slot:2026-09-16T11:01'), null);
});

test('the evening before, once, between seven and nine', () => {
  assert.equal(due('slot:2026-09-16T11:00', 'slot:2026-09-15T19:30'), 'night');
  assert.equal(due('slot:2026-09-16T11:00', 'slot:2026-09-15T18:30'), null);
  assert.equal(due('slot:2026-09-16T11:00', 'slot:2026-09-15T21:30'), null);
});

test('two evenings before is not the evening before', () => {
  assert.equal(due('slot:2026-09-16T11:00', 'slot:2026-09-14T19:30'), null);
});

test('a time later the same evening gets the ten-minute reminder, not the night one', () => {
  assert.equal(due('slot:2026-09-15T19:40', 'slot:2026-09-15T19:30'), 'soon');
});

test('the words say when and what to open, and never shout', () => {
  const night = copy.night({ guruName: 'Guruji Vishwanath', slotId: 'slot:2026-09-16T16:00' });
  assert.match(night, /tomorrow, 16 September, 4:00 pm/);
  assert.match(night, /Open the link we sent you/);
  const soon = copy.soon({ guruName: 'Guruji Vishwanath' });
  assert.match(soon, /begins in about ten minutes/);
  for (const text of [night, soon]) {
    assert.ok(!text.includes('!'));
    assert.ok(!/\bfee\b/i.test(text));
  }
});
