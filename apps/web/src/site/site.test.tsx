// His website, as the devotee sees it. The pure views, rendered from api-shaped data.
import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { HomeSections } from './HomePage';
import BookSheet, { BookSheetBody } from './BookSheet';
import { ConfirmedView } from './Confirmed';
import { MySessionsView, earlierWords } from './MySessions';
import type { MySessions, PublicGuru, PublicSlot, SitePage } from './types';

const guru: PublicGuru = {
  slug: 'guruji', name: 'Guruji Vishwanath', dakshinaPaise: 50000, slotMinutes: 30,
  about: 'Forty years in the Advaita tradition.',
  marketing: { tagline: 'Satsang every Wednesday, 5:00 pm.', blocks: [{ heading: 'Who he is', body: 'He listens first.' }] },
  whatsappLink: 'https://wa.me/15550001234?text=Hi',
};
const slots: PublicSlot[] = [
  { id: 'slot:2026-09-16T16:00', label: 'Today 4:00 pm', when: 'Wednesday, 16 September, 4:00 pm' },
  { id: 'slot:2026-09-17T10:00', label: 'Tomorrow 10:00 am', when: 'Thursday, 17 September, 10:00 am' },
];
const page: SitePage = {
  guru, nextSlots: slots, openCount: 8,
  events: [{ id: 'e1', title: 'Weekly satsang', kind: 'satsang', startsAt: '2026-09-16T11:30:00Z', when: 'Wednesday, 16 September, 5:00 pm', link: 'https://youtube.com/live', location: null, notes: null }],
};

test('his page states who he is, the dakshina, the next times, and his schedule', () => {
  const html = renderToStaticMarkup(<HomeSections page={page} slots={slots} showAll={false} onSeeAll={() => {}} onChoose={() => {}} />);
  expect(html).toContain('Guruji Vishwanath');
  expect(html).toContain('Forty years in the Advaita tradition.');
  expect(html).toContain('One to one · 30 minutes · dakshina ₹500');
  expect(html).toContain('Today 4:00 pm');
  expect(html).toContain('See other times');
  expect(html).toContain('Book on WhatsApp');
  expect(html).toContain('Weekly satsang');
  expect(html).toContain('Watch it here');
  expect(html).toContain('How a personal time works');
  expect(html).toContain('Good to know');
  expect(html).not.toContain('!');
});

test('with nothing open she is told plainly, and not offered a time', () => {
  const html = renderToStaticMarkup(<HomeSections page={{ ...page, nextSlots: [], openCount: 0 }} slots={[]} showAll={false} onSeeAll={() => {}} onChoose={() => {}} />);
  expect(html).toContain('no open times this week');
  expect(html).not.toContain('class="slot"');
});

test('the booking sheet states the time, the length and the dakshina, and asks only for her number', () => {
  const html = renderToStaticMarkup(<BookSheetBody slot={slots[0]} guru={guru} />);
  expect(html).toContain('Wednesday, 16 September, 4:00 pm');
  expect(html).toContain('30 minutes with Guruji Vishwanath · dakshina ₹500');
});

test('the sheet asks for her number and offers one optional line for what she wishes to speak about', () => {
  const html = renderToStaticMarkup(<BookSheet slot={slots[0]} guru={guru} call={(() => Promise.reject(new Error('not in this test'))) as never} base="/s/guruji" onClose={() => {}} />);
  expect(html).toContain('Your WhatsApp number');
  expect(html).toContain('What you wish to speak about');
  expect(html).toContain('(optional)');
  expect(html).not.toContain('!');
});

test('the confirmed page says the join link went to WhatsApp, with no countdown', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/s/guruji/booked/1">
    <ConfirmedView base="/s/guruji" stillWaiting={false} booking={{ id: '1', slotId: slots[0].id, when: slots[0].when, status: 'confirmed', dakshinaPaise: 50000, guruName: guru.name, joinUrl: 'https://x/join/1' }} />
  </StaticRouter>);
  expect(html).toContain('Your time is confirmed');
  expect(html).toContain('₹500 paid');
  expect(html).toContain('booking is on your WhatsApp');
  expect(html).toContain('ten minutes before your time');
  expect(html).not.toMatch(/\d+ seconds|countdown|\d+:\d\d left/i);
});

test('while the bank is slow she is told in words, and her time is safe', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/s/guruji/booked/1">
    <ConfirmedView base="/s/guruji" stillWaiting booking={{ id: '1', slotId: slots[0].id, when: slots[0].when, status: 'held', dakshinaPaise: 50000, guruName: guru.name, joinUrl: null }} />
  </StaticRouter>);
  expect(html).toContain('still waiting for the bank');
  expect(html).toContain('your time is safe');
});

const sessions: MySessions = {
  devotee: { name: 'Kavita J', phoneTail: '2334' }, guru,
  upcoming: [{ id: 'b1', slotId: slots[0].id, when: 'Wednesday, 16 September, 11:00 am', status: 'confirmed', joinUrl: 'https://x/join/b1', cannotReschedule: null, cannotCancel: null }],
  earlier: [{ id: 'b0', slotId: 'slot:2026-08-12T11:30', when: '12 August, 11:30 am', status: 'completed', joinUrl: null, cannotReschedule: 'x', cannotCancel: 'x' }],
  credit: { balancePaise: 0, expiresAt: null }, slots,
};

test('my sessions offers Join, Reschedule and Cancel on an upcoming time, and lists what came before', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/s/guruji/sessions"><MySessionsView sessions={sessions} base="/s/guruji" onAct={async () => sessions} onSignOut={() => {}} /></StaticRouter>);
  expect(html).toContain('••••••2334');
  expect(html).toContain('>Join<');
  expect(html).toContain('>Reschedule<');
  expect(html).toContain('>Cancel this time<');
  expect(html).toContain('12 August, 11:30 am');
  expect(html).toContain('moved once, up to four hours before');
});

test('too near the time, the buttons are gone and she is told why', () => {
  const near = { ...sessions, upcoming: [{ ...sessions.upcoming[0], cannotReschedule: 'Changes are open until 4 hours before. Ask his team on WhatsApp.', cannotCancel: 'Changes are open until 4 hours before. Ask his team on WhatsApp.' }] };
  const html = renderToStaticMarkup(<StaticRouter location="/s/guruji/sessions"><MySessionsView sessions={near} base="/s/guruji" onAct={async () => near} onSignOut={() => {}} /></StaticRouter>);
  expect(html).not.toContain('>Reschedule<');
  expect(html).not.toContain('>Cancel this time<');
  expect(html).toContain('Ask his team on WhatsApp');
});

test('a credit is offered back to her as a time, with its expiry in words', () => {
  const withCredit = { ...sessions, credit: { balancePaise: 50000, expiresAt: '2026-10-14T00:00:00Z' } };
  const html = renderToStaticMarkup(<StaticRouter location="/s/guruji/sessions"><MySessionsView sessions={withCredit} base="/s/guruji" onAct={async () => withCredit} onSignOut={() => {}} /></StaticRouter>);
  expect(html).toContain('You have a credit of ₹500');
  expect(html).toContain('14 October');
  expect(html).toContain('Book a time with it');
});

test('every earlier status reads as a sentence, not a code', () => {
  expect(earlierWords('cancelled')).toBe('cancelled, dakshina kept as credit');
  expect(earlierWords('refunded')).toBe('he could not sit, dakshina returned');
  expect(earlierWords('no_show')).toBe('not joined');
});


test('his picture, facts, quote and themes appear when his team has filled them in', () => {
  const rich = { ...page, guru: { ...page.guru, marketing: { ...page.guru.marketing,
    hero: { image: '/guruji-hero.jpg', portrait: '/guruji.jpg', credit: 'Photo by a friend' },
    facts: [{ label: 'Tradition', value: 'Advaita Vedanta' }],
    themes: ['Grief and loss'],
    quote: 'Bring one question.',
  } } };
  const html = renderToStaticMarkup(<HomeSections page={rich} slots={slots} showAll={false} onSeeAll={() => {}} onChoose={() => {}} />);
  expect(html).toContain('src="/guruji-hero.jpg"');
  expect(html).toContain('src="/guruji.jpg"');
  expect(html).toContain('Advaita Vedanta');
  expect(html).toContain('Grief and loss');
  expect(html).toContain('Bring one question.');
  expect(html).toContain('Photo by a friend');
  expect(html).not.toContain('!');
});
