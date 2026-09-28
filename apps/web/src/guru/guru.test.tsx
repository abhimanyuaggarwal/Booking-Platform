// His day. Times, who is coming, what she carries — and no money anywhere.
import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Day from './Day';
import { DevoteeStrip } from './GuruRoom';
import { afterwards } from './GuruShell';
import type { GuruDay, SessionItem } from './types';

const sitting = (over: Partial<SessionItem> = {}): SessionItem => ({
  kind: 'session', id: 'b1', time: '11:00 am', minutes: 30, name: 'Ramesh K',
  context: 'Second visit · wishes to speak about a property dispute',
  voiceNote: '/api/guru/media/m1', status: 'confirmed', startedAt: null, endedAt: null,
  waiting: false, canJoin: true, joinWords: 'Join at 11:00 am', done: false, ...over,
});

const day: GuruDay = {
  date: '2026-09-16', dateLabel: 'WEDNESDAY, 16 SEPTEMBER', greeting: 'Namaste, Guruji', summary: 'Two sessions today',
  items: [
    sitting(),
    { kind: 'rest', when: 'afternoon' },
    { kind: 'event', id: 'e1', time: '5:00 pm', minutes: 60, title: 'Weekly satsang', eventKind: 'satsang', link: 'https://youtube.com/live', location: null, notes: 'Goes out on YouTube as always' },
  ],
};

test('his morning: the date, his name, and what the day holds', () => {
  const html = renderToStaticMarkup(<Day day={day} said={null} onJoin={() => {}} />);
  expect(html).toContain('WEDNESDAY, 16 SEPTEMBER');
  expect(html).toContain('Namaste, Guruji');
  expect(html).toContain('Two sessions today');
  expect(html).toContain('Your team looks after bookings, payments and questions');
});

test('each sitting shows the time, who is coming, and the one line about her', () => {
  const html = renderToStaticMarkup(<Day day={day} said={null} onJoin={() => {}} />);
  expect(html).toContain('11:00 am');
  expect(html).toContain('One to one · 30 min');
  expect(html).toContain('Ramesh K');
  expect(html).toContain('Second visit · wishes to speak about a property dispute');
  expect(html).toContain('Play her message');
  expect(html).toContain('Join at 11:00 am');
});

test('an empty stretch says rest, and the satsang is on the same timeline', () => {
  const html = renderToStaticMarkup(<Day day={day} said={null} onJoin={() => {}} />);
  expect(html).toContain('>afternoon<');
  expect(html).toContain('>rest<');
  expect(html).toContain('Satsang · open to all');
  expect(html).toContain('Weekly satsang');
});

test('no rupee, no dakshina, no payment status ever reaches his screen', () => {
  // The one mention of money is the footer, which tells him the team handles it — the opposite of showing it.
  const html = renderToStaticMarkup(<Day day={day} said={null} onJoin={() => {}} />)
    .replace('Your team looks after bookings, payments and questions.', '');
  expect(html).not.toContain('₹');
  expect(html).not.toMatch(/dakshina|paid|payment|refund|credit|seats/i);
});

test('before her time there is nothing to press; when she is waiting, he is told', () => {
  const early = { ...day, items: [sitting({ canJoin: false, joinWords: null })] };
  expect(renderToStaticMarkup(<Day day={early} said={null} onJoin={() => {}} />)).not.toContain('class="join"');
  const waiting = { ...day, items: [sitting({ waiting: true })] };
  expect(renderToStaticMarkup(<Day day={waiting} said={null} onJoin={() => {}} />)).toContain('She is waiting for you.');
});

test('a finished sitting is marked complete and offers nothing', () => {
  const done = { ...day, items: [sitting({ done: true, canJoin: false, joinWords: null, status: 'completed' })] };
  const html = renderToStaticMarkup(<Day day={done} said={null} onJoin={() => {}} />);
  expect(html).toContain('Complete.');
  expect(html).not.toContain('class="join"');
});

test('in the room her card sits beside the video, with only End to press', () => {
  const html = renderToStaticMarkup(<DevoteeStrip devotee={{ name: 'Ramesh K', context: 'Second visit · property dispute', time: '11:00 am' }} onEnd={() => {}} />);
  expect(html).toContain('Ramesh K');
  expect(html).toContain('Second visit · property dispute');
  expect(html).toContain('>End<');
  expect(html).not.toMatch(/₹|dakshina/i);
});

test('after End he is told it is done, and who is next', () => {
  expect(afterwards(32, { ...day, items: [sitting({ done: true }), sitting({ id: 'b2', name: 'Kavita J', time: '12:00 pm', done: false })] }))
    .toBe('That is done — 32 minutes. Next is Kavita J at 12:00 pm.');
  expect(afterwards(30, { ...day, items: [sitting({ done: true })] })).toBe('That is done — 30 minutes. Nothing more today.');
});
