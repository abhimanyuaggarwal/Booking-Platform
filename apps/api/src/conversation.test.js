// The words devotees receive, checked against the copy rules in CLAUDE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copy, startsWithin } from './conversation.js';

const ctx = { guruName: 'Guruji Vishwanath', slotId: 'slot:2026-09-16T16:00', dakshina: '₹500' };

test('every sentence names the time in words and never uses an exclamation mark', () => {
  for (const [name, value] of Object.entries(copy)) {
    // Sentence builders, button labels and the one-tap notes all live in one table now.
    const texts = typeof value === 'function' ? [value(ctx)] : Array.isArray(value) ? value : typeof value === 'object' ? Object.values(value) : [value];
    for (const text of texts) {
      assert.equal(typeof text, 'string', name);
      assert.ok(!text.includes('!'), `${name} has an exclamation mark`);
      assert.ok(!/\bfee\b/i.test(text), `${name} says fee`);
    }
  }
});

test('the hold message states the time, the dakshina, and the ten minutes', () => {
  assert.equal(copy.held(ctx), 'Wednesday, 16 September, 4:00 pm with Guruji Vishwanath.\nDakshina ₹500.\n\nThis time is held for you for 10 minutes.');
});

test('a moved booking is told the new time and that the dakshina moves with it', () => {
  assert.match(copy.moved(ctx), /moved to Wednesday, 16 September, 4:00 pm/);
  assert.match(copy.moved(ctx), /dakshina moves with it/);
});

test('a refund says when it reaches her', () => {
  assert.match(copy.refunded(ctx), /₹500 is on its way back to you and reaches you within a week/);
});

test('paying after the hold ran out is told plainly: the money arrived, nothing is booked', () => {
  const text = copy.paidTooLate(ctx);
  assert.match(text, /₹500 reached us/);
  assert.match(text, /nothing is booked/);
  assert.match(text, /return your dakshina within a week, or find you another time/);
  assert.ok(!/confirmed/i.test(text), 'she must never read the word confirmed here');
});

test('a message while a time is still held offers the same payment page, not a new calendar', () => {
  const text = copy.stillToPay({ slotId: 'slot:2026-09-16T16:00', dakshina: '₹500' });
  assert.match(text, /still held/);
  assert.match(text, /Wednesday, 16 September, 4:00 pm/);
  assert.match(text, /₹500/);
});

test('a message just after her session is heard, and does not offer her a calendar', () => {
  const text = copy.heardAfterSession({ guruName: 'Guruji Vishwanath' });
  assert.match(text, /Guruji Vishwanath's team will read this/);
  assert.ok(!/available|choose a time|these times/i.test(text), 'she is not shown times she did not ask for');
});

test('a time booked minutes before it begins is confirmed with the join link, and the words say so', () => {
  const now = new Date('2026-09-16T10:30:00.000Z');                       // 4:00 pm IST
  assert.ok(startsWithin({ slotId: 'slot:2026-09-16T16:05' }, now), 'five minutes away');
  assert.ok(startsWithin({ slotId: 'slot:2026-09-16T15:58' }, now), 'began two minutes ago, still joinable');
  assert.ok(!startsWithin({ slotId: 'slot:2026-09-16T16:30' }, now), 'half an hour away: the reminder will come');
  assert.ok(!startsWithin({ slotId: 'slot:2026-09-16T14:00' }, now), 'long over');
  const text = copy.confirmedSoon(ctx);
  assert.match(text, /begins in a few minutes/);
  assert.ok(!/ten minutes before/.test(text), 'no promise of a reminder that would never come');
});
