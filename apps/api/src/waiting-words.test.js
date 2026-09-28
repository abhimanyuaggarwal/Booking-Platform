// Her waiting room speaks in sentences. These are the sentences.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitingWords } from './waiting-words.js';

const now = new Date('2026-09-16T05:32:00Z');           // 11:02 am IST
const at = (min) => new Date(now.getTime() + min * 60000);
const base = { status: 'confirmed', slotStart: at(-2), slotMinutes: 30, session: null, running: null, now };

test('waiting while he is with the person before her, she is told she is next and roughly how long', () => {
  const w = waitingWords({ ...base, running: { startedAt: at(-25) }, ahead: 1 }); // 5 of his 30 minutes left
  assert.equal(w.state, 'queued');
  assert.equal(w.sentence, 'Guruji is with someone before you. You are next — about 5 minutes.');
});

test('when his session is already over its length, she is told she is next without a number', () => {
  const w = waitingWords({ ...base, running: { startedAt: at(-32) }, ahead: 1 });
  assert.equal(w.sentence, 'Guruji is with someone before you. You are next.');
});

test('with more than one before her, she is told how many, not a time', () => {
  const w = waitingWords({ ...base, slotStart: at(60), running: { startedAt: at(-5) }, ahead: 3 });
  assert.equal(w.sentence, 'Guruji is with someone. There are 3 before you.');
});

test('opened long before her time, the screen names the time instead of "at your time"', () => {
  const w = waitingWords({ ...base, slotStart: new Date('2026-09-22T04:30:00Z') }); // tomorrow 10:00 am IST
  assert.equal(w.state, 'early');
  assert.equal(w.sentence, 'Your time with guruji is Tuesday, 22 September, 10:00 am. Come back to this screen then.');
  assert.equal(waitingWords({ ...base, slotStart: at(59) }).sentence, 'Guruji will join you at your time. You can stay on this screen.');
});

test('before her time, and at it, she is simply told to stay', () => {
  assert.equal(waitingWords({ ...base, slotStart: at(20) }).state, 'early');
  assert.match(waitingWords({ ...base, slotStart: at(20) }).sentence, /at your time/);
  assert.match(waitingWords(base).sentence, /join you shortly/);
});

test('ten minutes past her time she is offered the way out, without chasing anyone', () => {
  const w = waitingWords({ ...base, slotStart: at(-10) });
  assert.equal(w.state, 'late');
  assert.equal(w.canLeave, true);
  assert.match(w.sentence, /You do not need to wait, or call anyone/);
});

test('once he joins, the screen is the room and says who can see it', () => {
  const w = waitingWords({ ...base, session: { startedAt: at(-1) } });
  assert.equal(w.state, 'running');
  assert.match(w.sentence, /Only the two of you. Nothing is recorded/);
});

test('afterwards it is complete, and there is nothing to leave', () => {
  const w = waitingWords({ ...base, session: { startedAt: at(-32), endedAt: at(-1) } });
  assert.equal(w.state, 'ended');
  assert.equal(w.canLeave, false);
});

test('a link for a booking that is not confirmed sends her to his team', () => {
  assert.match(waitingWords({ ...base, status: 'cancelled' }).sentence, /cancelled.*credit/);
  assert.match(waitingWords({ ...base, status: 'expired' }).sentence, /not paid for in time/);
  assert.match(waitingWords({ ...base, status: 'rescheduled' }).sentence, /moved/);
  assert.equal(waitingWords({ ...base, status: 'no_show' }).state, 'not_yours');
});

test('no sentence is ever a countdown', () => {
  const screens = [
    waitingWords(base),
    waitingWords({ ...base, slotStart: at(20) }),
    waitingWords({ ...base, running: { startedAt: at(-25) }, ahead: 1 }),
    waitingWords({ ...base, slotStart: at(-10) }),
    waitingWords({ ...base, session: { startedAt: at(-1) } }),
  ];
  for (const s of screens) {
    assert.ok(!/\d+:\d\d/.test(s.sentence), `${s.state} shows a clock`);
    assert.ok(!/second/i.test(s.sentence), `${s.state} counts seconds`);
    assert.ok(!s.sentence.includes('!'), `${s.state} has an exclamation mark`);
  }
});
