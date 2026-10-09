import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePattern, validateSite, validateNewGuru, validateSetup, findGuruBySubdomain, validateRazorpayKeys, validateNumberRequest } from './gurus.js';

const good = {
  pattern: { slotMinutes: 30, gapMinutes: 10, minimumNoticeMinutes: 60, daysAhead: 7,
    weeklyPattern: { sun: [], mon: [['10:00', '13:00']], tue: [['10:00', '13:00'], ['16:00', '17:30']], wed: [], thu: [], fri: [], sat: [] } },
  closedDates: ['2026-09-17'],
  dakshinaPaise: 50000,
};

test('the seeded pattern shape is accepted', () => {
  assert.equal(validatePattern(good), null);
});

test('a window that ends before it starts is named, with the day', () => {
  const bad = structuredClone(good); bad.pattern.weeklyPattern.mon = [['13:00', '10:00']];
  assert.match(validatePattern(bad), /Monday window ends before it starts/);
});

test('times must look like HH:MM and dates like YYYY-MM-DD', () => {
  const bad = structuredClone(good); bad.pattern.weeklyPattern.tue = [['10am', '1pm']];
  assert.match(validatePattern(bad), /like 10:00 and 13:00/);
  const badDate = structuredClone(good); badDate.closedDates = ['17/09/2026'];
  assert.match(validatePattern(badDate), /2026-09-17/);
});

test('numbers are bounded so a typo cannot make a 0-minute slot or a negative dakshina', () => {
  assert.match(validatePattern({ ...good, pattern: { ...good.pattern, slotMinutes: 0 } }), /Slot length/);
  assert.match(validatePattern({ ...good, dakshinaPaise: -1 }), /Dakshina/);
  assert.match(validatePattern({ ...good, dakshinaPaise: 500.5 }), /Dakshina/);
});

test('times may be offered every five minutes, and the step is optional for an older editor', () => {
  assert.equal(validatePattern({ ...good, pattern: { ...good.pattern, stepMinutes: 5 } }), null);
  assert.equal(validatePattern({ ...good, pattern: { ...good.pattern, stepMinutes: undefined } }), null);
  assert.match(validatePattern({ ...good, pattern: { ...good.pattern, stepMinutes: 2 } }), /every 5 to 180/);
});

test('website content needs a name, a plausible domain, a tagline and well-formed blocks', () => {
  const site = { name: 'Guruji Vishwanath', domain: 'guruji.com', about: '', marketing: { tagline: 'x', blocks: [{ heading: 'a', body: 'b' }] } };
  assert.equal(validateSite(site), null);
  assert.equal(validateSite({ ...site, domain: '' }), null);
  assert.match(validateSite({ ...site, name: ' ' }), /name/);
  assert.match(validateSite({ ...site, domain: 'not a domain' }), /guruji.com/);
  assert.match(validateSite({ ...site, marketing: { tagline: 'x', blocks: [{ heading: 'a' }] } }), /heading and a body/);
});

test('a timing window may name the kinds of sitting it is for; the dakshina no longer has to be sent', () => {
  const typed = { ...good, pattern: { ...good.pattern, weeklyPattern: { ...good.pattern.weeklyPattern, mon: [['10:00', '13:00', ['a-type-id']]] } } };
  assert.equal(validatePattern(typed), null);
  assert.equal(validatePattern({ ...good, dakshinaPaise: undefined }), null);
  assert.match(validatePattern({ ...good, pattern: { ...good.pattern, weeklyPattern: { ...good.pattern.weeklyPattern, mon: [['10:00', '13:00', 'short']] } } }), /list of ids/);
});

test('a new guru needs a name, a short address name and a language; his subdomain is found from the host', async () => {
  assert.equal(validateNewGuru({ name: 'Bhagwat', slug: 'bhagwat', language: 'hi' }), null);
  assert.match(validateNewGuru({ name: 'Bhagwat', slug: 'Bhagwat Ji', language: 'hi' }), /lowercase/);
  assert.match(validateNewGuru({ name: '', slug: 'x1', language: 'en' }), /name/);
  assert.equal(validateSetup({ subscription: { plan: 'Pilot', feePaise: 999900, status: 'trial', nextDueOn: '2026-11-01' } }), null);
  assert.match(validateSetup({ subscription: { status: 'free' } }), /trial, active/);
  assert.equal(await findGuruBySubdomain('samvad.sli.ke', 'samvad.sli.ke'), null, 'the platform host itself is nobody');
  assert.equal(await findGuruBySubdomain('www.samvad.sli.ke', 'samvad.sli.ke'), null);
  assert.equal(await findGuruBySubdomain('guruji.com', 'samvad.sli.ke'), null);
});

test('Razorpay keys are checked for shape before anyone is asked', () => {
  assert.equal(validateRazorpayKeys({ keyId: 'rzp_live_AbCdEfGh1234', keySecret: 'x'.repeat(24), webhookSecret: 'whsec-1' }), null);
  assert.match(validateRazorpayKeys({ keyId: 'key_123', keySecret: 'x'.repeat(24), webhookSecret: 'whsec-1' }), /rzp_live/);
  assert.match(validateRazorpayKeys({ keyId: 'rzp_test_AbCdEfGh1234', keySecret: 'short', webhookSecret: 'whsec-1' }), /secret/);
});

test('a new WhatsApp number comes with the name devotees will see and the digits with a country code', () => {
  assert.equal(validateNumberRequest({ displayName: 'Samvad · Bhagwat', phone: '+91 98765 43210' }), null);
  assert.match(validateNumberRequest({ displayName: 'B', phone: '919876543210' }), /display name/);
  assert.match(validateNumberRequest({ displayName: 'Samvad · Bhagwat', phone: '98765' }), /country code/);
});
