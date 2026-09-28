// The Hindi words a devotee receives, checked the same way as the English ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordsFor, describeSlot, slotLabel } from './devotee-words.js';

const ctx = { guruName: 'Bhagwat', slotId: 'slot:2026-09-30T16:10', dakshina: '₹500', minutes: 30, devoteeName: 'Meera', time: '4:10 pm', question: 'My mother is unwell' };

test('every Hindi sentence builds, has no exclamation mark, and says dakshina rather than fee', () => {
  const W = wordsFor('hi');
  for (const [name, value] of Object.entries(W)) {
    const texts = typeof value === 'function' ? [value(ctx)] : Array.isArray(value) ? value : [value];
    for (const t of texts) {
      assert.equal(typeof t, 'string', name);
      assert.ok(!t.includes('!'), `${name} has an exclamation mark`);
      assert.ok(!/\bfee\b/i.test(t), `${name} says fee`);
    }
  }
  assert.match(W.held(ctx), /बुधवार, 30 सितंबर, 4:10 pm/);
  assert.match(W.confirmed(ctx), /दस मिनट पहले/);
  assert.match(W.cancelled(ctx), /दक्षिणा/);
});

test('dates and slot labels read in Hindi', () => {
  assert.equal(describeSlot('slot:2026-09-30T16:10', 'hi'), 'बुधवार, 30 सितंबर, 4:10 pm');
  assert.equal(describeSlot('slot:2026-09-30T16:10', 'en'), 'Wednesday, 30 September, 4:10 pm');
  assert.equal(slotLabel('Today 4:10 pm', 'hi'), 'आज 4:10 pm');
  assert.equal(slotLabel('Tomorrow 10:00 am', 'hi'), 'कल 10:00 am');
  assert.equal(slotLabel('Wed 10:00 am', 'hi'), 'बुध 10:00 am');
  assert.equal(slotLabel('Wed 10:00 am', 'en'), 'Wed 10:00 am');
});

test('the English confirmation points at her booking, and the ten-minute reminder carries the join link', () => {
  const W = wordsFor('en');
  assert.match(W.confirmed(ctx), /see your booking/);
  assert.match(W.confirmed(ctx), /ten minutes before/);
  assert.equal(W.joinNow, 'Join now');
  assert.match(W.soon(ctx), /ten minutes/);
});
