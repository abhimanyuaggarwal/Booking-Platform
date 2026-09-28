// His day. Times, what is at them, and rest where there is nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guruDay, contextLine } from './guru-day.js';

// IST wall-clock in UTC fields, the convention everywhere in this repo.
const at = (hhmm) => new Date(Date.UTC(2026, 8, 16, Number(hhmm.split(':')[0]), Number(hhmm.split(':')[1])));
const session = (hhmm, extra = {}) => ({ kind: 'session', at: at(hhmm), time: hhmm, minutes: 30, name: 'Ramesh K', status: 'confirmed', startedAt: null, endedAt: null, ...extra });
const event = (hhmm, title) => ({ kind: 'event', at: at(hhmm), time: hhmm, title, minutes: 60 });

test('a morning sitting and an evening satsang leave the afternoon named as rest', () => {
  const { items, sessions } = guruDay([event('17:00', 'Weekly satsang'), session('11:00')], at('09:00'));
  assert.deepEqual(items.map((i) => i.kind), ['session', 'rest', 'event']);
  assert.equal(items[1].when, 'afternoon');
  assert.equal(sessions, 1);
});

test('sittings back to back are not called rest', () => {
  const { items } = guruDay([session('10:00'), session('10:40'), session('11:20')], at('09:00'));
  assert.deepEqual(items.map((i) => i.kind), ['session', 'session', 'session']);
});

test('Join appears ten minutes before her time and not before', () => {
  assert.equal(guruDay([session('11:00')], at('10:45')).items[0].canJoin, false);
  const open = guruDay([session('11:00')], at('10:52')).items[0];
  assert.equal(open.canJoin, true);
  assert.equal(open.joinWords, 'Join at 11:00');
});

test('once he has started it, the button takes him back rather than starting again', () => {
  const running = guruDay([session('11:00', { startedAt: new Date() })], at('11:05')).items[0];
  assert.equal(running.joinWords, 'Return to the room');
});

test('a finished sitting offers nothing to press', () => {
  const done = guruDay([session('11:00', { status: 'completed', startedAt: at('11:00'), endedAt: at('11:30') })], at('12:00')).items[0];
  assert.equal(done.canJoin, false);
  assert.equal(done.done, true);
});

test('long past her time, the button is gone; the team handles what is left', () => {
  assert.equal(guruDay([session('11:00')], at('13:00')).items[0].canJoin, false);
});

test('the context line is what the notebook could never do', () => {
  assert.equal(contextLine({ priorVisits: 1, question: 'A property dispute with my brother', hasVoiceNote: false, forWhom: null }),
    'Second visit · wishes to speak about a property dispute with my brother');
  assert.equal(contextLine({ priorVisits: 0, question: null, hasVoiceNote: true, forWhom: null }),
    'First time · has sent a message to hear');
  assert.equal(contextLine({ priorVisits: 0, question: null, hasVoiceNote: false, forWhom: 'for my mother' }),
    'First time · for my mother');
  assert.equal(contextLine({ priorVisits: 2, question: null, hasVoiceNote: false, forWhom: null }), 'Third visit');
});

test('a short topic finishes our sentence; an initialism keeps its capitals', () => {
  const line = (question) => contextLine({ priorVisits: 0, question, hasVoiceNote: false, forWhom: null });
  assert.equal(line('A transfer to Pune'), 'First time · wishes to speak about a transfer to Pune');
  assert.equal(line('How do I stay steady when the people around me are anxious'),
    'First time · “How do I stay steady when the people around me are anxious”');
  assert.equal(line('Should I sell the house?'), 'First time · “Should I sell the house?”');
  assert.equal(line('EMI payments'), 'First time · wishes to speak about EMI payments');
});

test('a sentence of her own is quoted, not grafted into ours', () => {
  const line = (question) => contextLine({ priorVisits: 0, question, hasVoiceNote: false, forWhom: null });
  assert.equal(line('I lost my father in March. The anger has not gone.'), 'First time · “I lost my father in March.”');
  assert.equal(line('My son is 26 and will not settle'), 'First time · “My son is 26 and will not settle”');
});

test('a long answer is cut where it can be read at a glance', () => {
  const long = 'A property dispute with my brother that has run for eleven years and taken in three courts and most of the family';
  const line = contextLine({ priorVisits: 0, question: long, hasVoiceNote: false, forWhom: null });
  assert.ok(line.length < 110, line);
  assert.ok(line.endsWith('…”'), line);
});

test('nothing on his day carries an amount', () => {
  const { items } = guruDay([session('11:00'), event('17:00', 'Weekly satsang')], at('09:00'));
  assert.equal(JSON.stringify(items).includes('₹'), false);
  assert.equal(JSON.stringify(items).match(/paise|amount|dakshina/i), null);
});
