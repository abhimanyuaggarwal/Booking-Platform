// The console screens render from api-shaped data. These are the fixtures a teammate would recognise.
import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { TodayView, NeedsYou, nextSitting } from './Today';
import { WeekGrid, WeekList } from './Week';
import { MoneyView, entryText } from './Money';
import { askedAbout, groupAttention, stateWord } from './words';
import PatternEditor from './PatternEditor';
import type { MoneyReport, Settings, TodayReport, WeekReport } from './types';

const today: TodayReport = {
  date: '2026-09-16', dateLabel: 'Wednesday, 16 September', guru: { name: 'Guruji Vishwanath' },
  attention: [{ kind: 'hold_expired', name: 'Neha S', time: '10:20 am', text: 'a payment hold expired at 10:20 am (Neha S, 4:00 pm) — the slot is open again' }],
  kpis: { collectedTodayPaise: 420000, collectedWeekPaise: 1875000, returnedWeekPaise: 0, dueToSettlePaise: 4130000, settlesOn: 'Friday', settlesOnDate: '2026-09-18', slotsFilled: 24, slotsTotal: 30 },
  timeline: [
    { slotId: 'slot:2026-09-16T10:00', time: '10:00 am', kind: 'booking', booking: { id: '1', slotId: 'slot:2026-09-16T10:00', status: 'completed', source: 'page', name: 'Sunita M', forWhom: null, priorVisits: 0, question: 'her son’s schooling', hasVoiceNote: false, paid: true } },
    { slotId: 'slot:2026-09-16T11:00', time: '11:00 am', kind: 'booking', booking: { id: '2', slotId: 'slot:2026-09-16T11:00', status: 'confirmed', source: 'live', name: 'Ramesh K', forWhom: null, priorVisits: 1, question: 'property dispute', hasVoiceNote: false, paid: true } },
    { slotId: 'slot:2026-09-16T12:00', time: '12:00 pm', kind: 'booking', booking: { id: '3', slotId: 'slot:2026-09-16T12:00', status: 'confirmed', source: 'live', name: 'Kavita J', forWhom: null, priorVisits: 0, question: null, hasVoiceNote: true, paid: true } },
    { slotId: 'slot:2026-09-16T16:00', time: '4:00 pm', kind: 'open', booking: null },
  ],
};

const needs: AttentionRow[] = [
  { kind: 'hold_expired', bookingId: '1', name: 'Neha S', phone: '9', slotId: 's', when: 'today 4:00 pm', why: 'Chose the time, did not finish paying — the slot is open again', action: 'send_link' },
  { kind: 'waited_alone', bookingId: '2', name: 'Prakash V', phone: '9', slotId: 's', when: 'yesterday 11:00 am', why: 'Opened her link and waited; guruji did not sit', action: 'decide' },
  { kind: 'refund_sent', bookingId: '3', name: 'Suresh B', phone: '9', slotId: 's', when: 'Monday 10:00 am', why: 'Guruji could not sit — ₹500 returned', action: 'done' },
];

test('Today is what needs her, with the button on the card, then the sittings with the next one marked — and no money', () => {
  const html = renderToStaticMarkup(<TodayView report={today} attention={needs} now="slot:2026-09-16T10:30" />);
  expect(html).toContain('2 things to do');
  expect(html).toContain('Chose a time, did not pay');
  expect(html).toContain('>Send the link again<');
  expect(html).toContain('Waited, guruji did not sit');
  expect(html).toContain('>Decide<');
  expect(html).not.toContain('Dakshina returned');     // for the record only, never on Today
  expect(html).toContain('2nd visit');
  expect(html).not.toContain('🎙');
  expect(html).toContain('>Done<');
  expect(html).toContain('>Paid<');
  expect(html).toContain('open · book');
  expect(html).toContain('Next sitting · 11:00 am');   // the next paid sitting, large, with her question
  expect(html).toContain('Wishes to speak about: “property dispute”');
  expect(html).toContain('class="avatar');
  expect(html).not.toContain('₹');                     // money has its own screen
  expect(html).not.toMatch(/\d+:\d+ left|countdown/i);
  expect(html).toMatch(/class="clickable next"[^>]*>[^<]*<td class="time">11:00 am</);   // the next paid sitting is marked in the list too
  expect(renderToStaticMarkup(<TodayView report={today} attention={[]} />)).toContain('Nothing to do right now');
});

test('the next sitting is the first paid time at or after now', () => {
  expect(nextSitting(today.timeline, 'slot:2026-09-16T10:30')).toBe('2');
  expect(nextSitting(today.timeline, 'slot:2026-09-16T11:30')).toBe('3');
  expect(nextSitting(today.timeline, 'slot:2026-09-16T18:00')).toBe(null);
});

test('what needs her splits what she must decide from what only informs, and every state has one word', () => {
  const { toDecide, forTheRecord } = groupAttention(needs);
  expect(toDecide.map((r) => r.name)).toEqual(['Neha S', 'Prakash V']);
  expect(forTheRecord.map((r) => r.name)).toEqual(['Suresh B']);
  expect(renderToStaticMarkup(<NeedsYou rows={[needs[0]]} onSendLink={() => {}} onDecide={() => {}} />)).toContain('One thing to do');
  expect(['confirmed', 'held', 'completed', 'no_show', 'rescheduled', 'cancelled', 'refunded', 'expired'].map((s) => stateWord(s)))
    .toEqual(['Paid', 'Paying', 'Done', 'Did not join', 'Moved', 'Cancelled', 'Returned', 'Hold expired']);
});

test('what she asked about is one line, cut short with an ellipsis, never an emoji', () => {
  expect(askedAbout({ question: 'x'.repeat(80), hasVoiceNote: false }, 20)).toBe(`${'x'.repeat(17)}…`);
  expect(askedAbout({ question: null, hasVoiceNote: true })).toBe('voice note');
  expect(askedAbout({ question: null, hasVoiceNote: false })).toBe('—');
});

const week: WeekReport = {
  monday: '2026-09-14', sunday: '2026-09-20', label: '14 – 20 September', times: ['10:00', '10:40', '16:00'], afternoonFrom: '16:00', filled: 3, total: 8,
  events: [{ id: 'e1', title: 'Weekly satsang', kind: 'satsang', date: '2026-09-16', time: '5:00 pm', link: null, location: null }],
  days: [
    { date: '2026-09-14', weekday: 'MON', dayOfMonth: 14, today: false, closed: null, filled: 1, total: 2, extra: [],
      slots: { '10:00': { slotId: 'slot:2026-09-14T10:00', booking: { id: 'a', slotId: 'slot:2026-09-14T10:00', name: 'Meena D', status: 'completed', source: 'page', kind: 'done', note: 'paid' } }, '10:40': { slotId: 'slot:2026-09-14T10:40', booking: null } } },
    { date: '2026-09-15', weekday: 'TUE', dayOfMonth: 15, today: true, closed: null, filled: 2, total: 3, extra: [],
      slots: { '10:00': { slotId: 's', booking: { id: 'b', slotId: 's', name: 'Priya D', status: 'confirmed', source: 'live', kind: 'live', note: 'from the live' } }, '10:40': { slotId: 't', booking: { id: 'c', slotId: 't', name: 'Neha S', status: 'held', source: 'direct', kind: 'hold', note: 'not paid yet' } }, '16:00': { slotId: 'u', booking: null } } },
    { date: '2026-09-16', weekday: 'WED', dayOfMonth: 16, today: false, closed: null, filled: 0, total: 3, extra: [], slots: { '10:00': { slotId: 'v', booking: null }, '10:40': { slotId: 'w', booking: null }, '16:00': { slotId: 'x', booking: null } } },
    { date: '2026-09-17', weekday: 'THU', dayOfMonth: 17, today: false, closed: 'closed', filled: 0, total: 0, extra: [], slots: {} },
    { date: '2026-09-18', weekday: 'FRI', dayOfMonth: 18, today: false, closed: null, filled: 0, total: 0, extra: [], slots: {} },
    { date: '2026-09-19', weekday: 'SAT', dayOfMonth: 19, today: false, closed: null, filled: 0, total: 0, extra: [], slots: {} },
    { date: '2026-09-20', weekday: 'SUN', dayOfMonth: 20, today: false, closed: 'no sittings', filled: 0, total: 0, extra: [], slots: {} },
  ],
};

test('the week grid colours each slot by state only, shows his events on their day, fill counts, closed days and the afternoon divider', () => {
  const html = renderToStaticMarkup(<WeekGrid week={week} />);
  expect(html).toContain('class="ev done"');
  expect(html).toContain('class="ev paid"');            // a booking from a live is paid, like any other
  expect(html).not.toContain('class="ev live"');
  expect(html).toContain('class="ev hold"');
  expect(html).toContain('Paying');
  expect(html).toContain('Satsang 5:00 pm');
  expect(html).toContain('>open<');
  expect(html).toContain('afternoon — rest');
  expect(html).toContain('<i>closed</i>');
  expect(html).toContain('<i>no sittings</i>');
  expect(html).toContain('<i>2 / 3</i>');
  expect(html).toContain('class="shut"');
  expect(html).toContain('>4:00<');
  expect(html).not.toContain('came from a live');
  const list = renderToStaticMarkup(<WeekList week={week} onOpen={() => {}} onBook={() => {}} />);
  expect(list).toContain('Satsang · Weekly satsang · 5:00 pm');
  expect(list).toContain('Priya D');
  expect(list).toContain('open · book');
});

const money: MoneyReport = {
  monday: '2026-09-14', sunday: '2026-09-20', label: '14 – 20 September',
  kpis: { collectedTodayPaise: 100000, collectedWeekPaise: 250000, returnedWeekPaise: 50000, dueToSettlePaise: 200000, settlesOn: 'Friday', settlesOnDate: '2026-09-18' },
  entries: [
    { id: '1', kind: 'payment', amountPaise: 50000, providerRef: 'pay_1', bookingId: 'b1', at: '', date: '2026-09-16', time: '10:41 am', name: 'Kavita J', source: 'live', slotId: 's', slotTime: '12:00 pm', expiresAt: null },
    { id: '2', kind: 'refund', amountPaise: 50000, providerRef: 'rfnd_1', bookingId: 'b2', at: '', date: '2026-09-15', time: '9:30 am', name: 'Suresh B', source: 'page', slotId: 's', slotTime: '10:00 am', expiresAt: null },
    { id: '3', kind: 'credit_issued', amountPaise: 50000, providerRef: null, bookingId: 'b3', at: '', date: '2026-09-15', time: '8:00 am', name: 'Neha S', source: 'direct', slotId: 's', slotTime: '4:00 pm', expiresAt: '2026-10-15' },
  ],
};

test('Money is three numbers, the pilot line, the exceptions, and the full ledger only on request', () => {
  const html = renderToStaticMarkup(<MoneyView report={money} today="2026-09-16" />);
  expect(html).toContain('Collected this week');
  expect(html).toContain('₹2,500');
  expect(html).toContain('Settles Friday');
  expect(html).toContain('From his lives this week: 1 booking · ₹500');
  expect(html).toContain('Returned to her');            // the exceptions list
  expect(html).toContain('Kept as her credit');
  expect(html).toContain('Suresh B');
  expect(html).not.toContain('Paid by UPI');            // payments only in the full ledger
  expect(html).toContain('Show every entry');
  const full = renderToStaticMarkup(<MoneyView report={money} today="2026-09-16" showAllAtFirst />);
  expect(full).toContain('Paid by UPI');
  expect(full).toContain('>live<');
  expect(full).toContain('+ ₹500');
  expect(full).toContain('− ₹500');
  expect(full).toContain('₹500 credit');
  expect(full).toContain('Today');
  expect(full).toContain('Tuesday, 15 September');
  expect(entryText(money.entries[1])).toBe('Returned to her');
});

const settings: Settings = {
  id: 'g', slug: 'guruji', name: 'Guruji Vishwanath', domain: 'guruji.com', about: '', marketing: { tagline: '', blocks: [] },
  dakshinaPaise: 50000, whatsappNumber: '15550001234', closedDates: ['2026-09-17'],
  pattern: { slotMinutes: 30, gapMinutes: 10, minimumNoticeMinutes: 60, daysAhead: 7,
    weeklyPattern: { sun: [], mon: [['10:00', '13:00']], tue: [['10:00', '13:00'], ['16:00', '17:30']], wed: [], thu: [], fri: [], sat: [] } },
};

test('the timings editor shows each day with its sittings, the dakshina in rupees, and closed days', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/console/settings"><PatternEditor settings={settings} onSaved={() => {}} /></StaticRouter>);
  expect(html).toContain('Tuesday');
  expect((html.match(/type="time"/g) ?? []).length).toBe(6); // Monday 1 window + Tuesday 2 windows, two inputs each
  expect(html).toContain('value="17:30"');
  expect(html).toContain('value="500"');
  expect(html).toContain('2026-09-17');
  expect(html).toContain('no sittings');
});

// ---- Session 3 screens ----
import { WaitingPanelView, presenceSentence, landedSentence, saidSentence } from './WaitingPanel';
import { CloseDayPreviewView } from './CloseDay';
import { BookingDetailView, deliveryOf, withoutDoubleReminders } from './BookingDrawer';
import type { AttentionRow, BookingDetail, CloseDayPreview, WaitingBoard } from './types';

const board: WaitingBoard = {
  now: '2026-09-16T05:36:00.000Z',
  running: { bookingId: 'r', name: 'Sunita M', startedAt: '2026-09-16T04:32:00.000Z', slotTime: '10:00 am', minutesLate: 11 },
  oneTap: ['Joining in 5 minutes', 'Joining in 10 minutes', 'Would another time suit you?'],
  suggestions: { laterToday: [{ slotId: 'slot:2026-09-16T16:00', label: 'Today 4:00 pm' }], tomorrow: [{ slotId: 'slot:2026-09-17T10:00', label: 'Tomorrow 10:00 am' }] },
  people: [
    { id: 'a', slotId: 'slot:2026-09-16T11:00', time: '11:00 am', status: 'confirmed', source: 'live', name: 'Ramesh K', forWhom: null, priorVisits: 1, question: 'property dispute', hasVoiceNote: false, paid: true, phone: '919829012345',
      inRoomSince: '2026-09-16T05:30:00.000Z', openedLinkAt: '2026-09-16T05:30:00.000Z',
      messages: [{ text: 'Joining in 10 minutes', landed: 'room', at: '2026-09-16T05:34:00.000Z' }] },
    { id: 'b', slotId: 'slot:2026-09-16T12:00', time: '12:00 pm', status: 'confirmed', source: 'page', name: 'Kavita J', forWhom: null, priorVisits: 0, question: null, hasVoiceNote: true, paid: true, phone: '919811022334',
      inRoomSince: null, openedLinkAt: null, messages: [{ text: 'Joining in 10 minutes', landed: 'whatsapp', at: '2026-09-16T05:34:00.000Z' }] },
  ],
};

test('the waiting panel says who is in the room, who has not opened her link, and where each note landed', () => {
  const html = renderToStaticMarkup(<WaitingPanelView board={board} onChanged={() => {}} dakshinaPaise={50000} />);
  expect(html).toContain('Running 11 minutes late');
  expect(html).toContain('Guruji is with Sunita M');
  expect(html).toContain('In the waiting room · 6 min');
  expect(html).toContain('Link not opened yet — a message goes to WhatsApp');
  expect(html).toContain('shown in Ramesh K&#x27;s waiting room');
  expect(html).toContain('went to her WhatsApp');
  expect(html).toContain('Joining in 5 minutes');
  expect(html).toContain('tel:+919829012345');
  expect(html).toContain('You never enter the session');
  expect(html).not.toMatch(/countdown|\d+:\d\d left/i);
});

test('presence and delivery sentences', () => {
  expect(presenceSentence(board.people[1], board.now)).toBe('Link not opened yet — a message goes to WhatsApp');
  expect(landedSentence('Kavita J', 'Hello', { landed: 'failed', at: board.now })).toBe('“Hello” could not be delivered to Kavita J — call her');
});

test('what she writes from the waiting room reads as hers, not as ours', () => {
  const hers = saidSentence('Ramesh K', { text: 'The picture is a little dark', from: 'devotee', at: board.now });
  expect(hers).toContain('Ramesh K wrote:');
  expect(hers).toContain('The picture is a little dark');
  // Older rows have no `from` at all; they were all ours, and must still read the old way.
  expect(saidSentence('Ramesh K', { text: 'Joining in 5 minutes', landed: 'room', at: board.now }))
    .toContain("shown in Ramesh K's waiting room");
});

const attention: AttentionRow[] = [
  { kind: 'hold_expired', bookingId: '1', name: 'Neha S', phone: '9', slotId: 's', when: 'today 4:00 pm', why: 'Chose the time, did not finish paying — the slot is open again', action: 'send_link' },
  { kind: 'did_not_join', bookingId: '2', name: 'Prakash V', phone: '9', slotId: 's', when: 'yesterday 11:00 am', why: 'Paid, never opened the link — mark it, or offer another time', action: 'decide' },
  { kind: 'refund_sent', bookingId: '3', name: 'Suresh B', phone: '9', slotId: 's', when: 'Monday 10:00 am', why: 'Guruji could not sit on Monday — ₹500 returned, reaches her within a week', action: 'done' },
];

const closePreview: CloseDayPreview = {
  date: '2026-09-15', dateLabel: 'Tuesday, 15 September', heldCount: 1,
  bookings: [
    { id: 'a', slotId: 'slot:2026-09-15T10:00', time: '10:00 am', name: 'Meena D', phone: '9', source: 'page', suggestedSlotId: 'slot:2026-09-16T10:00' },
    { id: 'b', slotId: 'slot:2026-09-15T11:00', time: '11:00 am', name: 'Arun P', phone: '9', source: 'live', suggestedSlotId: 'slot:2026-09-16T11:30' },
  ],
  alternatives: [{ slotId: 'slot:2026-09-16T10:00', label: 'Wed 10:00 am' }, { slotId: 'slot:2026-09-16T11:30', label: 'Wed 11:30 am' }],
};

test('closing a day lists each person with a suggested new time and says what happens', () => {
  const html = renderToStaticMarkup(<CloseDayPreviewView preview={closePreview} choices={{ a: 'slot:2026-09-16T10:00', b: 'slot:2026-09-16T11:30' }} onChoose={() => {}} />);
  expect(html).toContain('2 sittings are booked');
  expect(html).toContain('1 unpaid hold goes back on the shelf');
  expect(html).toContain('Meena D');
  expect(html).toMatch(/<option[^>]*selected[^>]*value="slot:2026-09-16T10:00"|<option[^>]*value="slot:2026-09-16T10:00"[^>]*selected/);
  expect(html).toContain('the dakshina moves with the booking');
});

const detail: BookingDetail = {
  id: 'x', slotId: 'slot:2026-09-16T11:00', time: '11:00 am', date: '2026-09-16', dateLabel: 'Wednesday, 16 September', status: 'confirmed', source: 'live',
  question: 'property dispute', hasVoiceNote: false, paidAt: '2026-09-14T05:00:00.000Z', createdAt: '2026-09-14T04:56:00.000Z', rescheduledFromId: null,
  devotee: { id: 'd', name: 'Ramesh K', phone: '919829012345', forWhom: null },
  paidWith: { kind: 'payment', amountPaise: 50000, providerRef: 'pay_1' },
  ledger: [{ id: 'l1', kind: 'payment', amountPaise: 50000, providerRef: 'pay_1', expiresAt: null, at: '2026-09-14T05:00:00.000Z' }],
  messages: [{ id: 'm1', direction: 'in', kind: 'text', payload: { text: 'Hi — from the live' }, at: '2026-09-14T04:55:00.000Z' }],
  session: null, history: [{ id: 'h', slotId: 'slot:2026-08-01T10:00', status: 'completed', source: 'page' }],
  actions: ['message', 'reschedule', 'refund'],
};

test('a booking opens with who, when, what was paid, what was said, and only the allowed moves', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/console/bookings"><BookingDetailView detail={detail} guruSlug="guruji" onChanged={() => {}} /></StaticRouter>);
  expect(html).toContain('Ramesh K');
  expect(html).toContain('Wednesday, 16 September, 11:00 am');
  expect(html).toContain('₹500 by UPI');
  expect(html).toContain('a live');
  expect(html).toContain('Return the dakshina');
  expect(html).not.toContain('Did not join');           // slot is in the future
  expect(html).not.toContain('keep as credit');         // only when the api lists 'cancel'
  const cancellable = renderToStaticMarkup(<StaticRouter location="/console/bookings"><BookingDetailView detail={{ ...detail, actions: [...detail.actions, 'cancel'] }} guruSlug="guruji" onChanged={() => {}} /></StaticRouter>);
  expect(cancellable).toContain('Cancel, keep as credit');
  expect(html).toContain('Hi — from the live');
  expect(html).toContain('Her other times');
  expect(html).toContain('Edit name or who it is for');
  expect(html.indexOf('Return the dakshina')).toBeLessThan(html.indexOf('Asked about')); // the moves come first
});

test('a message WhatsApp refused is marked, so a silent failure is never mistaken for a sent note', () => {
  expect(deliveryOf({ direction: 'out', payload: { body: 'Your time is confirmed.', delivered: false, reason: 'not in allowed list' } })).toBe('NOT DELIVERED');
  expect(deliveryOf({ direction: 'out', payload: { body: 'Your time is confirmed.', delivered: true } })).toBe(null);
  expect(deliveryOf({ direction: 'in', payload: { text: 'Hi' } })).toBe(null);
  const refused = { ...detail, messages: [{ id: 'm2', direction: 'out' as const, kind: 'reminder.night', payload: { body: 'Namaste. Your time is tomorrow.', delivered: false, reason: 'Meta refused' }, at: '2026-09-15T14:00:00.000Z' }] };
  const html = renderToStaticMarkup(<StaticRouter location="/console/bookings"><BookingDetailView detail={refused} guruSlug="guruji" onChanged={() => {}} /></StaticRouter>);
  expect(html).toContain('NOT DELIVERED');
  expect(html).toContain('Reminder · Namaste. Your time is tomorrow.');
});

import { bandLayout } from './stream-band';

test('the stream band is a lower third with the QR square and three lines beside it', () => {
  const layout = bandLayout({ guruName: 'Guruji Vishwanath', line: 'One to one · 30 minutes · dakshina ₹500', call: 'Scan to book on WhatsApp' });
  expect(layout.width).toBe(1920);
  expect(layout.height).toBe(280);
  expect(layout.qr.side).toBe(208);
  expect(layout.lines.map((l) => l.text)).toEqual(['Guruji Vishwanath', 'One to one · 30 minutes · dakshina ₹500', 'Scan to book on WhatsApp']);
  for (const line of layout.lines) expect(line.x).toBeGreaterThan(layout.qr.x + layout.qr.side);
});

test('a reminder that was sent shows once in the transcript, as a reminder', () => {
  const body = 'Your time with Bhagwat begins in about ten minutes.';
  const rows = [
    { id: '1', direction: 'out' as const, kind: 'text', payload: { body, delivered: true }, at: '2026-09-25T10:20:00.000Z' },
    { id: '2', direction: 'out' as const, kind: 'reminder.soon', payload: { body, delivered: true }, at: '2026-09-25T10:20:00.000Z' },
    { id: '3', direction: 'out' as const, kind: 'text', payload: { body: 'Something else', delivered: true }, at: '2026-09-25T10:21:00.000Z' },
  ];
  expect(withoutDoubleReminders(rows).map((m) => m.id)).toEqual(['2', '3']);
});

import { paymentWords } from './BookingDrawer';

test('money the team took by hand is named by where it went, and stays out of the settlement words', () => {
  expect(paymentWords('pay_ThMshPn7SV7bBw')).toBe('Paid by UPI');
  expect(paymentWords('offline:cash:abc')).toBe('Paid in cash at the ashram');
  expect(paymentWords('offline:upi:abc')).toBe('Paid by UPI to the ashram');
  expect(paymentWords(null)).toBe('Paid by UPI');
});
