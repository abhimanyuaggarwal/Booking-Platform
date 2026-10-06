// His own website: who he is, his schedule, booking, and her own sessions.
// Public — no console login. The tenant comes from the Host header (tenancy.js). Her identity, where
// she has one, is the devotee cookie. Every word sent to her goes through conversation.js, and every
// change to a booking through bookings.js, exactly as on the other doors.

import express from 'express';
import { availableSlots, describeSlot, instantToSlotId, slotIdToInstant, formatRupees } from '@expert-sessions/shared';
import { withGuru } from './tenancy.js';
import { devoteeAuth, normalisePhone } from './devotee-auth.js';
import { availabilityOf } from './gurus.js';
import { creditFor } from './credits.js';
import { cancelAndRefund, REFUND_DAYS } from './cancellations.js';
import * as razorpay from './razorpay.js';
import { listSessionTypes, findSessionType, defaultSessionType, publicType } from './session-types.js';
import { listEvents } from './events.js';
import { waLink, GREETINGS } from './qr-codes.js';
import * as bookings from './bookings.js';
import * as devotees from './devotees.js';
import { BookingRuleError, ProviderError } from './errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOT = /^slot:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function siteRoutes(env, conversation) {
  const auth = devoteeAuth(env);
  const pay = razorpay.client(env);
  const router = express.Router();
  router.use(withGuru);

  // ---- The page itself -------------------------------------------------------------------------

  router.get('/', handle(async (req, res) => {
    const types = await listSessionTypes(req.guru.id, { activeOnly: true });
    const [open, events] = await Promise.all([openSlots(req.guru, types[0]), listEvents(req.guru.id)]);
    res.json({
      guru: publicGuru(req.guru),
      open: !req.guru.status || req.guru.status === 'live',   // false while he is being set up or paused
      sessionTypes: types.map(publicType),
      events: events.filter((e) => new Date(e.startsAt) > new Date()).map(publicEvent),
      nextSlots: open.slice(0, 3).map(publicSlot),
      openCount: open.length,
    });
  }));

  // Times for one kind of sitting (?type=<id>); the default kind when none is named.
  router.get('/slots', handle(async (req, res) => {
    const type = await typeFrom(req);
    res.json({ type: publicType(type), slots: (await openSlots(req.guru, type)).map(publicSlot) });
  }));

  // ---- Booking: her number, then pay. No account, no OTP before paying. ------------------------

  router.post('/hold', handle(async (req, res) => {
    const phone = normalisePhone(req.body?.phone);
    const { slotId, question } = req.body ?? {};
    if (!phone) return res.status(400).json({ error: 'Your WhatsApp number, with the country code' });
    if (!SLOT.test(slotId ?? '')) return res.status(400).json({ error: 'Choose a time' });
    if (req.guru.status && req.guru.status !== 'live') return res.status(409).json({ error: 'Booking is not open just now. Please write to his team on WhatsApp.' });
    const type = await typeFrom(req);

    const devotee = await devotees.findOrCreateDevotee(req.guru.id, phone);
    const held = await conversation.startPayment({
      guru: req.guru, devotee, slotId, type, source: 'page',
      notify: false,                      // she is about to see the payment page; the confirmation follows it
    });
    if (!held) return res.status(409).json({ error: 'That time was just taken. Please choose another.' });
    if (typeof question === 'string' && question.trim()) await bookings.setQuestion(held.id, { text: question.trim() });
    res.status(201).json({ bookingId: held.id, payUrl: held.payUrl, holdMinutes: bookings.HOLD_MINUTES });
  }));

  // The confirmed page asks this until the Razorpay webhook has landed.
  router.get('/bookings/:id', handle(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'This booking link is not valid' });
    const b = await bookings.findById(req.params.id);
    if (!b || b.guru_id !== req.guru.id) return res.status(404).json({ error: 'This booking link is not valid' });
    res.json({
      id: b.id, slotId: b.slotId, when: describeSlot(b.slotId), status: b.status,
      minutes: b.minutes, dakshinaPaise: b.dakshina_paise, guruName: req.guru.name,
      joinUrl: b.status === 'confirmed' ? conversation.joinLink(b, req.guru) : null,
    });
  }));

  // ---- Sign in: her number and a code, nothing else --------------------------------------------

  router.post('/otp/request', handle(async (req, res) => {
    const phone = normalisePhone(req.body?.phone);
    if (!phone) return res.status(400).json({ error: 'Your WhatsApp number, with the country code' });
    res.json(auth.requestCode(req.guru.id, phone));
  }));

  router.post('/otp/verify', handle(async (req, res) => {
    const phone = normalisePhone(req.body?.phone);
    if (!phone) return res.status(400).json({ error: 'Your WhatsApp number, with the country code' });
    if (!auth.verifyCode(req.guru.id, phone, req.body?.code)) {
      return res.status(401).json({ error: 'That code does not match. Ask for another.' });
    }
    // Signing in creates her row if she has never booked, so "my sessions" opens either way.
    const devotee = await devotees.findOrCreateDevotee(req.guru.id, phone);
    auth.setCookie(res, auth.tokenFor(devotee.id));
    req.devotee = devotee;
    res.json(await mySessions(req));
  }));

  router.post('/signout', (_req, res) => { auth.clearCookie(res); res.status(204).end(); });

  // ---- Her own sessions -------------------------------------------------------------------------

  router.get('/me', requireDevotee, handle(async (req, res) => res.json(await mySessions(req))));

  router.post('/me/bookings/:id/cancel', requireDevotee, handle(async (req, res) => {
    const b = await herBooking(req, res); if (!b) return;
    const problem = bookings.whyCannotCancel(b);
    if (problem) return res.status(409).json({ error: problem });
    const { booking, amountPaise, how } = await cancelAndRefund({ booking: b, pay });
    const note = await tell(() => conversation.sendCancelledNote({ guru: req.guru, devotee: req.devotee, booking, amountPaise, how }));
    const said = how === 'online' ? `That time is cancelled. Your dakshina of ${formatRupees(amountPaise)} comes back to your account in ${REFUND_DAYS}.`
      : how === 'byHand' ? `That time is cancelled. His team will return your dakshina of ${formatRupees(amountPaise)} to you directly.`
      : how === 'credit' ? `That time is cancelled. Your credit of ${formatRupees(amountPaise)} is back with you for thirty days.`
      : 'That time is cancelled.';
    res.json({ ...(await mySessions(req)), said, notified: note.ok });
  }));

  router.post('/me/bookings/:id/reschedule', requireDevotee, handle(async (req, res) => {
    const b = await herBooking(req, res); if (!b) return;
    const problem = bookings.whyCannotReschedule(b);
    if (problem) return res.status(409).json({ error: problem });
    if (!SLOT.test(req.body?.slotId ?? '')) return res.status(400).json({ error: 'Choose the new time' });
    await bookings.assertBookable(req.guru, req.body.slotId, { type: { id: b.session_type_id, minutes: b.minutes } }); // the same kind of sitting moves
    const moved = await bookings.rescheduleBooking({ bookingId: b.id, slotId: req.body.slotId });
    if (!moved) return res.status(409).json({ error: 'That time was just taken. Please choose another.' });
    const note = await tell(() => conversation.sendNewTime({ guru: req.guru, devotee: req.devotee, booking: moved }));
    res.json({ ...(await mySessions(req)), said: `Your time has moved to ${describeSlot(moved.slotId)}. Your dakshina moved with it.`, notified: note.ok });
  }));

  // She cancelled earlier and books again with the credit: confirmed at once, no payment page.
  router.post('/me/book-with-credit', requireDevotee, handle(async (req, res) => {
    if (!SLOT.test(req.body?.slotId ?? '')) return res.status(400).json({ error: 'Choose a time' });
    const type = await typeFrom(req);
    const credit = await creditFor(req.guru.id, req.devotee.id);
    if (credit.balancePaise < type.dakshina_paise) return res.status(409).json({ error: 'Your credit does not cover this dakshina. Please book and pay as usual.' });
    await bookings.assertBookable(req.guru, req.body.slotId, { type });
    const booked = await bookings.confirmWithCredit({
      guruId: req.guru.id, devoteeId: req.devotee.id, slotId: req.body.slotId, source: 'page', amountPaise: type.dakshina_paise, type,
    });
    if (!booked) return res.status(409).json({ error: 'That time was just taken. Please choose another.' });
    const note = await tell(() => conversation.sendConfirmation({ guru: req.guru, devotee: req.devotee, booking: booked }));
    res.json({ ...(await mySessions(req)), said: `Your time is confirmed for ${describeSlot(booked.slotId)}, with your credit.`, notified: note.ok });
  }));

  router.use((err, _req, res, next) => {
    if (err instanceof BookingRuleError) return res.status(409).json({ error: err.message });
    if (err instanceof ProviderError) {
      console.error(`Payment page could not be opened for ${req.method} ${req.path}: ${err.message}`);
      return res.status(502).json({ error: 'The payment page could not be opened just now. Please try again, or book on WhatsApp.' });
    }
    next(err);
  });

  // ---- pieces ------------------------------------------------------------------------------------

  function requireDevotee(req, res, next) {
    const id = auth.devoteeIdFrom(req.headers.cookie);
    if (!id) return res.status(401).json({ error: 'Sign in with your number to see your sessions' });
    devotees.findDevoteeById(id)
      .then((devotee) => {
        if (!devotee || devotee.guru_id !== req.guru.id) return res.status(401).json({ error: 'Sign in with your number to see your sessions' });
        req.devotee = devotee;
        next();
      })
      .catch(next);
  }

  async function herBooking(req, res) {
    if (!UUID.test(req.params.id)) { res.status(404).json({ error: 'No such time' }); return null; }
    const b = await bookings.findById(req.params.id);
    if (!b || b.devotee_id !== req.devotee.id || b.guru_id !== req.guru.id) { res.status(404).json({ error: 'No such time' }); return null; }
    return b;
  }

  async function mySessions(req) {
    const types = await listSessionTypes(req.guru.id, { activeOnly: true });
    const [rows, credit, open] = await Promise.all([
      bookings.listForDevoteeWithGuru(req.guru.id, req.devotee.id),
      creditFor(req.guru.id, req.devotee.id),
      openSlots(req.guru, types[0]),
    ]);
    const now = new Date();
    const mine = rows.map((b) => ({
      id: b.id, slotId: b.slotId, when: describeSlot(b.slotId), status: b.status, minutes: b.minutes, dakshinaPaise: b.dakshina_paise,
      joinUrl: b.status === 'confirmed' ? conversation.joinLink(b, req.guru) : null,
      cannotReschedule: bookings.whyCannotReschedule(b, now),
      cannotCancel: bookings.whyCannotCancel(b, now),
    }));
    return {
      devotee: { name: req.devotee.name, phoneTail: req.devotee.phone.slice(-4) },
      guru: publicGuru(req.guru),
      upcoming: mine.filter((b) => new Date(slotIdToInstant(b.slotId)) > now && b.status === 'confirmed'),
      // A hold that is still paying, or one that lapsed, is not a session she had: it stays off this page.
      earlier: mine.filter((b) => (new Date(slotIdToInstant(b.slotId)) <= now || b.status !== 'confirmed') && b.status !== 'held' && b.status !== 'expired'),
      credit: { balancePaise: credit.balancePaise, expiresAt: credit.vouchers[0]?.expiresAt ?? null },
      sessionTypes: types.map(publicType),
      slots: open.map(publicSlot),
    };
  }

  async function openSlots(guru, type) {
    return availableSlots(availabilityOf(guru), await bookings.takenIntervals(guru.id), undefined, { minutes: type.minutes, typeId: type.id });
  }

  /** The kind of sitting a request names (?type= or body.typeId), or the guru's default. An unknown or inactive id is refused. */
  async function typeFrom(req) {
    const id = req.query.type ?? req.body?.typeId;
    if (!id) return defaultSessionType(req.guru.id);
    const type = await findSessionType(req.guru.id, String(id));
    if (!type || !type.active) throw new BookingRuleError('That kind of sitting is not offered any more. Please choose again.');
    return type;
  }

  return router;
}

/** Only what the page needs. Never the id, never anything about money beyond the dakshina. */
function publicGuru(g) {
  return {
    slug: g.slug, name: g.name, about: g.about, marketing: g.marketing_json,
    dakshinaPaise: g.dakshina_paise, slotMinutes: g.pattern_json.slotMinutes,
    whatsappLink: g.whatsapp_number ? waLink(g.whatsapp_number, GREETINGS.page) : null,
  };
}

function publicEvent(e) {
  return { id: e.id, title: e.title, kind: e.kind, startsAt: e.startsAt, when: describeSlot(instantToSlotId(new Date(e.startsAt))), link: e.link, location: e.location, notes: e.notes };
}

function publicSlot(s) {
  return { id: s.id, label: s.label, when: describeSlot(s.id) };
}

function siteOrigin(req) {
  const host = req.query.host ?? req.headers.host;
  return `${req.headers['x-forwarded-proto'] ?? req.protocol}://${host}`;
}

// On his own domain the site is at the root; the internal preview is under /s/<slug>.
function sitePath(req) {
  return typeof req.query.slug === 'string' ? `/s/${req.query.slug}` : '';
}

function handle(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

async function tell(send) {
  try {
    await send();
    return { ok: true };
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    return { ok: false, reason: err.message };
  }
}
