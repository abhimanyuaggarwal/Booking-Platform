// Run with: pnpm test   (node --test picks up every *.test.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableSlots, describeSlot, describeDate, slotIdToInstant, instantToSlotId } from './slots.js';

const availability = {
  slotMinutes: 30, gapMinutes: 10, minimumNoticeMinutes: 60, daysAhead: 3,
  weeklyPattern: { sun: [], mon: [['10:00', '11:30']], tue: [['10:00', '11:30'], ['16:00', '17:00']], wed: [['10:00', '11:30']], thu: [], fri: [], sat: [] },
  closedDates: ['2026-09-16'],
};

// Monday 14 Sep 2026, 9:00 am IST (stored as UTC fields — see slots.js)
const mondayMorning = new Date(Date.UTC(2026, 8, 14, 9, 0));

test('a 90-minute window with 30-minute slots and a 10-minute gap yields two slots (a third would overrun)', () => {
  const s = availableSlots(availability, new Set(), mondayMorning).filter((x) => x.id.includes('2026-09-14'));
  assert.deepEqual(s.map((x) => x.id), ['slot:2026-09-14T10:00', 'slot:2026-09-14T10:40']);
});

test('slots inside the minimum-notice window are not offered', () => {
  const nineThirty = new Date(Date.UTC(2026, 8, 14, 9, 30)); // 60 min notice -> nothing before 10:30
  const s = availableSlots(availability, new Set(), nineThirty).filter((x) => x.id.includes('2026-09-14'));
  assert.deepEqual(s.map((x) => x.id), ['slot:2026-09-14T10:40']);
});

test('held or confirmed slots disappear from the offer', () => {
  const taken = new Set(['slot:2026-09-14T10:00']);
  const s = availableSlots(availability, taken, mondayMorning);
  assert.ok(!s.some((x) => x.id === 'slot:2026-09-14T10:00'));
});

test('a closed date offers nothing', () => {
  const s = availableSlots(availability, new Set(), mondayMorning);
  assert.ok(!s.some((x) => x.id.includes('2026-09-16')));
});

test('labels read Today / Tomorrow / weekday, in 12-hour time', () => {
  const s = availableSlots(availability, new Set(), mondayMorning);
  assert.equal(s[0].label, 'Today 10:00 am');
  assert.ok(s.some((x) => x.label === 'Tomorrow 4:00 pm'));
});

test('confirmation text is a full sentence', () => {
  assert.equal(describeSlot('slot:2026-09-16T16:00'), 'Wednesday, 16 September, 4:00 pm');
});

test('a slot id is IST wall-clock; the real instant is 5h30m earlier', () => {
  assert.equal(slotIdToInstant('slot:2026-09-16T16:00').toISOString(), '2026-09-16T10:30:00.000Z');
});

test('instant -> slot id -> instant round-trips, so bookings.slot_start and slot ids agree', () => {
  const tenAmIst = new Date('2026-09-16T04:30:00.000Z');
  assert.equal(instantToSlotId(tenAmIst), 'slot:2026-09-16T10:00');
  assert.equal(slotIdToInstant(instantToSlotId(tenAmIst)).getTime(), tenAmIst.getTime());
});

test('a date reads as a full day name for console headers', () => {
  assert.equal(describeDate('2026-09-16'), 'Wednesday, 16 September');
});
