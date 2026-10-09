// Run with: pnpm test   (node --test picks up every *.test.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableSlots, sittingStep, describeSlot, describeDate, slotIdToInstant, instantToSlotId, isValidSlotId, isValidYmd } from './slots.js';

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

test('with a five-minute step, every five-minute mark that fits a whole sitting is offered', () => {
  const fine = { ...availability, stepMinutes: 5, minimumNoticeMinutes: 0 };
  const s = availableSlots(fine, new Set(), mondayMorning).filter((x) => x.id.includes('2026-09-14'));
  assert.equal(s.length, 13);                                              // 10:00, 10:05 ... 11:00 (11:05 would overrun 11:30)
  assert.deepEqual(s.slice(0, 3).map((x) => x.id), ['slot:2026-09-14T10:00', 'slot:2026-09-14T10:05', 'slot:2026-09-14T10:10']);
});

test('a five-minute start is hidden while a sitting plus its gap would overlap a taken one, both ways', () => {
  const fine = { ...availability, stepMinutes: 5, minimumNoticeMinutes: 0 };
  const taken = new Set(['slot:2026-09-14T10:20']);
  const ids = availableSlots(fine, taken, mondayMorning).filter((x) => x.id.includes('2026-09-14')).map((x) => x.id);
  assert.ok(!ids.includes('slot:2026-09-14T10:20'));
  assert.ok(!ids.includes('slot:2026-09-14T10:00'), 'a 10:00 sitting would still be running at 10:20');
  assert.ok(!ids.includes('slot:2026-09-14T10:55'), 'guruji is with the 10:20 person until 10:50 and rests ten minutes');
  assert.ok(ids.includes('slot:2026-09-14T11:00'));
});

test('a sitting of its own length: twenty minutes fits where thirty would overrun, and blocks only twenty', () => {
  const fine = { ...availability, stepMinutes: 5, minimumNoticeMinutes: 0 };
  const twenty = availableSlots(fine, new Set(), mondayMorning, { minutes: 20 }).filter((x) => x.id.includes('2026-09-14')).map((x) => x.id);
  assert.ok(twenty.includes('slot:2026-09-14T11:10'), 'a 20-minute sitting at 11:10 ends at 11:30');
  assert.ok(!twenty.includes('slot:2026-09-14T11:15'));
  // a ten-minute booking at 10:20 (plus the ten-minute gap) frees 10:40 for anyone; a thirty-minute one would not
  const taken = [{ id: 'slot:2026-09-14T10:20', minutes: 10 }];
  const ids = availableSlots(fine, taken, mondayMorning).filter((x) => x.id.includes('2026-09-14')).map((x) => x.id);
  assert.ok(ids.includes('slot:2026-09-14T10:40'));
  assert.ok(!ids.includes('slot:2026-09-14T10:35'));
});

test('a window limited to some session types is skipped for the others', () => {
  const typed = { ...availability, minimumNoticeMinutes: 0,
    weeklyPattern: { ...availability.weeklyPattern, mon: [['10:00', '11:30', ['short']], ['16:00', '17:00']] } };
  const short = availableSlots(typed, new Set(), mondayMorning, { typeId: 'short' }).filter((x) => x.id.includes('2026-09-14'));
  const long = availableSlots(typed, new Set(), mondayMorning, { typeId: 'long' }).filter((x) => x.id.includes('2026-09-14'));
  assert.ok(short.some((x) => x.id === 'slot:2026-09-14T10:00'));
  assert.ok(!long.some((x) => x.id === 'slot:2026-09-14T10:00'), 'the morning is for short sittings only');
  assert.ok(long.some((x) => x.id === 'slot:2026-09-14T16:00'), 'the afternoon window names no types, so it is for all');
});

test('the sitting step is the sitting plus the gap, and is the default offer step', () => {
  assert.equal(sittingStep(availability), 40);
  const explicit = availableSlots({ ...availability, stepMinutes: 40 }, new Set(), mondayMorning);
  assert.deepEqual(explicit.map((x) => x.id), availableSlots(availability, new Set(), mondayMorning).map((x) => x.id));
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

test('a slot id or a date must exist on the calendar, not merely look right', () => {
  assert.equal(isValidSlotId('slot:2026-09-17T10:30'), true);
  assert.equal(isValidSlotId('slot:2026-13-45T99:99'), false);
  assert.equal(isValidSlotId('slot:2026-02-30T10:00'), false);
  assert.equal(isValidSlotId('2026-09-17T10:30'), false);
  assert.equal(isValidYmd('2026-09-17'), true);
  assert.equal(isValidYmd('2026-13-01'), false);
  assert.equal(isValidYmd('2026-99-99'), false);
});
