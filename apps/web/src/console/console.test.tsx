// The console screens render from api-shaped data. These are the fixtures a teammate would recognise.
import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { TodayView, NeedsYou, nextSitting } from './Today';
import { WeekGrid, WeekList } from './Week';
import { MoneyView, entryText } from './Money';
import { askedAbout, groupAttention, stateWord } from './words';
import PatternEditor from './PatternEditor';
import SessionTypesEditor from './SessionTypesEditor';
import { SetupChecklist } from './Today';
import { DevoteesView } from './Devotees';
import { DevoteeView } from './DevoteePage';
import Nav from './Nav';
import Login from './Login';
import { GurusView } from './Gurus';
import { GuruSetupView } from './GuruSetup';
import type { GuruDetail } from './types';
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
  expect(html).toContain('Returned to her account');            // the exceptions list
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
  expect(entryText(money.entries[1])).toBe('Returned to her account');
});

const settings: Settings = {
  id: 'g', slug: 'guruji', name: 'Guruji Vishwanath', domain: 'guruji.com', about: '', marketing: { tagline: '', blocks: [] },
  dakshinaPaise: 50000, whatsappNumber: '15550001234', closedDates: ['2026-09-17'],
  pattern: { slotMinutes: 30, gapMinutes: 10, minimumNoticeMinutes: 60, daysAhead: 7,
    weeklyPattern: { sun: [], mon: [['10:00', '13:00']], tue: [['10:00', '13:00'], ['16:00', '17:30']], wed: [], thu: [], fri: [], sat: [] } },
};

test('the timings editor shows each day with its sittings, and closed days', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/console/settings"><PatternEditor settings={settings} onSaved={() => {}} /></StaticRouter>);
  expect(html).toContain('Tuesday');
  expect((html.match(/type="time"/g) ?? []).length).toBe(6); // Monday 1 window + Tuesday 2 windows, two inputs each
  expect(html).toContain('value="17:30"');
  expect(html).toContain('2026-09-17');
  expect(html).toContain('no sittings');
});

test('the kinds of sitting editor shows each kind with its minutes and dakshina in rupees, and which is the default', () => {
  const withKinds = { ...settings, sessionTypes: [
    { id: 'a', name: 'Quick guidance', minutes: 10, dakshinaPaise: 50000, active: true },
    { id: 'b', name: '', minutes: 30, dakshinaPaise: 150000, active: true },
  ] };
  const html = renderToStaticMarkup(<StaticRouter location="/console/settings"><SessionTypesEditor settings={withKinds} onSaved={() => {}} /></StaticRouter>);
  expect(html).toContain('Kinds of sitting');
  expect(html).toContain('value="500"');
  expect(html).toContain('value="1500"');
  expect(html).toContain('Quick guidance');
  expect(html).toContain('Default');
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
  expect(cancellable).toContain('Cancel and return the dakshina');
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

test('the rail names five places, each with an icon, and nothing is hidden under a more', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/console"><Nav /></StaticRouter>);
  for (const word of ['Today', 'Calendar', 'Devotees', 'Money', 'Settings']) expect(html).toContain(`<span>${word}</span>`);
  expect(html).not.toContain('More');
  expect((html.match(/<svg/g) ?? []).length).toBe(5);
});

test('the go-live checklist ticks what is set and links what is not', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/console"><SetupChecklist setup={{ timings: true, kinds: true, website: false, guruPhone: false, qr: false, firstBooking: false }} /></StaticRouter>);
  expect(html).toContain('Going live: five things to set');
  expect((html.match(/class="done"/g) ?? []).length).toBe(2);
  expect(html).toContain('/console/settings/qr');
});

test('devotees are listed with sittings, last and next, and what they gave; one person shows every time', () => {
  const rows = [
    { id: 'd1', name: 'Kavita J', phone: '919829022334', forWhom: null, visits: 3, givenPaise: 150000, lastSitting: 'slot:2026-09-16T11:00', nextSitting: 'slot:2026-10-08T10:00' },
    { id: 'd2', name: 'Ramesh K', phone: '919829012345', forWhom: 'his son', visits: 0, givenPaise: 0, lastSitting: null, nextSitting: null },
  ];
  const html = renderToStaticMarkup(<StaticRouter location="/console/devotees"><DevoteesView rows={rows} searching={false} /></StaticRouter>);
  expect(html).toContain('Kavita J');
  expect(html).toContain('₹1,500');
  expect(html).toContain('Thursday, 8 October, 10:00 am');
  expect(html).toContain('nothing booked');
  expect(html).toContain('his son');
  const empty = renderToStaticMarkup(<StaticRouter location="/console/devotees"><DevoteesView rows={[]} searching={false} /></StaticRouter>);
  expect(empty).toContain('Nobody has booked yet');
  const person = renderToStaticMarkup(<StaticRouter location="/console/devotees/d1"><DevoteeView d={{ ...rows[0], bookings: [{ id: 'b1', slotId: 'slot:2026-09-16T11:00', time: '11:00 am', date: '2026-09-16', status: 'completed', source: 'live', minutes: 20, dakshinaPaise: 100000, name: 'Kavita J', phone: '919829022334', paid: true, question: null, hasVoiceNote: false }] }} /></StaticRouter>);
  expect(person).toContain('3 sittings with guruji');
  expect(person).toContain('20 min · ₹1,000');
  expect(person).toContain('Book a time for her');
});

test('sign-in asks for a WhatsApp number and a password, offers the code for a first visit, and keeps the admin door small', () => {
  const html = renderToStaticMarkup(<Login onSignedIn={() => {}} />);
  expect(html).toContain('Your WhatsApp number, with country code');
  expect(html).toContain('type="password"');
  expect(html).toContain('First time here, or forgotten your password?');
  expect(html).toContain('Slike admin, shared password');
  expect(html).not.toContain('Username');
});

const draft: GuruDetail = {
  slug: 'bhagwat', name: 'Bhagwat', language: 'hi', status: 'setting_up', domain: null, subdomain: 'bhagwat.samvad.sli.ke',
  subscription: { plan: 'Pilot', feePaise: 999900, status: 'trial', nextDueOn: '2026-11-01' }, business: {}, activatedAt: null,
  payments: { connected: false, keyId: '', mode: null, connectedAt: null, verifiedAt: null, webhookUrl: 'https://samvad.sli.ke/razorpay/webhook/bhagwat', pending: null, canApprove: true, secretsReady: true },
  whatsapp: { status: 'none', displayName: null, number: null, phoneNumberId: false, connectedAt: null, lastError: null, pending: null, canApprove: true, sharedNumber: '15551626471', wabaReady: true },
  readiness: [
    { key: 'identity', done: true, required: true }, { key: 'address', done: true, required: true, detail: 'subdomain' }, { key: 'team', done: false, required: true },
    { key: 'sittings', done: true, required: true }, { key: 'payments', done: false, required: false, detail: 'shared' }, { key: 'whatsapp', done: false, required: false, detail: 'shared' },
    { key: 'distribution', done: false, required: false }, { key: 'business', done: false, required: false }, { key: 'live', done: false, required: false },
  ], done: 3, total: 9, readyToGoLive: false,
  about: 'x', tagline: 't', guruPhone: null, team: [], trail: [{ id: 'a1', who: 'Abhimanyu', action: 'guru.created', detail: {}, at: '2026-10-07T10:00:00Z' }],
};
const me = { user: { id: 'env', name: 'Slike admin', phone: null, role: 'admin' as const }, guru: { slug: 'bhagwat', name: 'Bhagwat' }, gurus: [{ slug: 'bhagwat', name: 'Bhagwat' }] };

test('the Gurus list shows each guru with status, address, setup progress and subscription', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/console/gurus"><GurusView rows={[draft]} /></StaticRouter>);
  expect(html).toContain('Bhagwat');
  expect(html).toContain('Setting up');
  expect(html).toContain('bhagwat.samvad.sli.ke');
  expect(html).toContain('3 of 9 steps done');
  expect(html).toContain('Pilot · ₹9,999 · Trial');
});

test('the Setup page lists nine steps with why and a way in, gates Go live on the required ones, and shows the trail', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/console/gurus/bhagwat"><GuruSetupView g={draft} me={me} onChanged={() => {}} /></StaticRouter>);
  expect((html.match(/class="step /g) ?? []).length).toBe(9);
  expect(html).toContain('3. His team');
  expect(html).toContain('The people who answer the phone and run the day.');
  expect(html).toContain('Slike’s shared account for now');
  expect(html).toMatch(/<button class="primary" disabled="" title="Finish the required steps to go live\.">Go live<\/button>/);
  expect(html).toContain('created');
  expect(html).toContain('Abhimanyu');
});

test('the Payments card asks for the three Razorpay secrets and shows the webhook address; connected, it shows the masked key and the checks', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/console/gurus/bhagwat"><GuruSetupView g={draft} me={me} onChanged={() => {}} /></StaticRouter>);
  expect(html).toContain('His Razorpay account');
  expect(html).toContain('placeholder="rzp_live_…"');
  expect(html).toContain('https://samvad.sli.ke/razorpay/webhook/bhagwat');
  expect(html).toContain('send to guruji for approval');
  const connected = { ...draft, payments: { ...draft.payments, connected: true, keyId: 'rzp_live_…1234', mode: 'live' as const, connectedAt: '2026-10-07T10:00:00Z' } };
  const html2 = renderToStaticMarkup(<StaticRouter location="/console/gurus/bhagwat"><GuruSetupView g={connected} me={me} onChanged={() => {}} /></StaticRouter>);
  expect(html2).toContain('rzp_live_…1234');
  expect(html2).toContain('Check the connection');
  expect(html2).not.toContain('placeholder="rzp_live_…"');
});

test('the WhatsApp card walks the number in: add with a display name, then the code, then guruji; live, it says which number', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/console/gurus/bhagwat"><GuruSetupView g={draft} me={me} onChanged={() => {}} /></StaticRouter>);
  expect(html).toContain('His WhatsApp number');
  expect(html).toContain('value="Samvad · Bhagwat"');
  expect(html).toContain('Add the number to Slike’s account');
  expect(html).toContain('Already registered in Meta’s WhatsApp Manager?');
  const live = { ...draft, whatsapp: { ...draft.whatsapp, status: 'live' as const, displayName: 'Samvad · Bhagwat', number: '919876543210', phoneNumberId: true, connectedAt: '2026-10-07T10:00:00Z' } };
  const html2 = renderToStaticMarkup(<StaticRouter location="/console/gurus/bhagwat"><GuruSetupView g={live} me={me} onChanged={() => {}} /></StaticRouter>);
  expect(html2).toContain('devotees write to +919876543210');
  expect(html2).toContain('Back to the shared number');
});

test('a stretch of five-minute open times reads as one line on Today, not a row per time', () => {
  const opens = ['16:00', '16:05', '16:10', '16:15'].map((t) => ({ slotId: `slot:2026-09-16T${t}`, time: `${Number(t.slice(0, 2)) - 12}:${t.slice(3)} pm`, kind: 'open' as const, booking: null }));
  const report = { ...today, timeline: [...today.timeline.filter((t) => t.booking), ...opens] };
  const html = renderToStaticMarkup(<TodayView report={report} attention={[]} now="slot:2026-09-16T10:30" />);
  expect(html).toContain('4 open times, 4:00 pm to 4:15 pm');
  expect(html.split('open times').length).toBe(2);
});
