// The Hindi words a devotee receives, checked the same way as the English ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordsFor, describeSlot, slotLabel } from './devotee-words.js';

const ctx = { code: '482913', guruName: 'Bhagwat', slotId: 'slot:2026-09-30T16:10', dakshina: '₹500', minutes: 30, devoteeName: 'Meera', time: '4:10 pm', question: 'My mother is unwell', reason: 'Changes are open until 4 hours before.' };

test('every Hindi sentence builds, has no exclamation mark, and says dakshina rather than fee', () => {
  const W = wordsFor('hi');
  for (const [name, value] of Object.entries(W)) {
    const texts = typeof value === 'function' ? [value(ctx)] : Array.isArray(value) ? value : typeof value === 'object' ? Object.values(value) : [value];
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

test('a cancellation says when the dakshina reaches her, in both languages, and the confirmation says how to change it', () => {
  assert.match(wordsFor('en').cancelled(ctx), /5 to 7 working days/);
  assert.match(wordsFor('hi').cancelled(ctx), /5 से 7 कार्य दिवसों/);
  assert.match(wordsFor('hi').confirmCancel(ctx), /रद्द करें\?/);
  assert.match(wordsFor('hi').confirmed(ctx), /Hi लिखें/);
  assert.ok(wordsFor('hi').changeTime.length <= 20 && wordsFor('hi').yesCancel.length <= 20, 'WhatsApp buttons are twenty characters at most');
});
