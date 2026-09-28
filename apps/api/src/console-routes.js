// The console's endpoints, all under /api/console, all behind the shared team login.
// Reads come from reports.js. Every change to a booking goes through bookings.js, and every word
// sent to a devotee goes through conversation.js.

import express from 'express';
import { describeSlot } from '@expert-sessions/shared';
import { consoleAuth } from './console-auth.js';
import { findGuruBySlug, validatePattern, validateSite, updatePattern, updateSite } from './gurus.js';
import {
  todayReport, weekReport, moneyReport, todayIst, mondayOf, attentionQueue, waitingBoard, closeDayPreview, bookingDetail, bookingRow,
} from './reports.js';
import { listEvents, createEvent, updateEvent, deleteEvent, validateEvent } from './events.js';
import { listQrCodes, createQrCode, QR_SOURCES } from './qr-codes.js';
import * as bookings from './bookings.js';
import * as devotees from './devotees.js';
import * as razorpay from './razorpay.js';
import { presenceFor } from './realtime.js';
import { BookingRuleError, ProviderError } from './errors.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOT = /^slot:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const SOURCES = ['live', 'ashram', 'poster', 'page', 'direct'];
const ONE_TAP = ['Joining in 5 minutes', 'Joining in 10 minutes', 'Would another time suit you?'];

export function consoleRoutes(env, conversation) {
  const auth = consoleAuth(env);
  const pay = razorpay.client(env);
  const guruSlug = env.CONSOLE_GURU_SLUG || 'guruji';
  const router = express.Router();

  router.post('/login', (req, res) => {
    const token = auth.login(req.body?.username, req.body?.password);
    if (!token) return res.status(401).json({ error: 'That username and password do not match. They are CONSOLE_USER and CONSOLE_PASSWORD in the api .env.' });
    auth.setCookie(res, token);
    res.status(204).end();
  });

  router.post('/logout', (_req, res) => {
    auth.clearCookie(res);
    res.status(204).end();
  });

  // Everything below needs the cookie, and works on the one guru this console manages.
  router.use(auth.requireConsole);
  router.use(handle(async (req, _res, next) => {
    req.guru = await findGuruBySlug(guruSlug);
    if (!req.guru) throw new Error(`No guru with slug ${guruSlug}. Run pnpm seed, or set CONSOLE_GURU_SLUG in .env.`);
    next();
  }));

  router.get('/me', (req, res) => res.json({ user: auth.user, guru: { slug: req.guru.slug, name: req.guru.name } }));

  router.get('/today', handle(async (req, res) => {
    res.json(await todayReport(req.guru, dateParam(req.query.date) ?? todayIst()));
  }));

  router.get('/week', handle(async (req, res) => {
    res.json(await weekReport(req.guru, mondayOf(dateParam(req.query.start) ?? todayIst())));
  }));

  router.get('/money', handle(async (req, res) => {
    res.json(await moneyReport(req.guru, mondayOf(dateParam(req.query.start) ?? todayIst())));
  }));

  router.get('/settings', (req, res) => res.json(settingsView(req.guru)));

  router.put('/settings/pattern', handle(async (req, res) => {
    const problem = validatePattern(req.body);
    if (problem) return res.status(400).json({ error: problem });
    res.json(settingsView(await updatePattern(req.guru.id, req.body)));
  }));

  router.put('/settings/site', handle(async (req, res) => {
    const problem = validateSite(req.body);
    if (problem) return res.status(400).json({ error: problem });
    res.json(settingsView(await updateSite(req.guru.id, req.body)));
  }));

  router.get('/events', handle(async (req, res) => res.json(await listEvents(req.guru.id))));

  router.post('/events', handle(async (req, res) => {
    const problem = validateEvent(req.body);
    if (problem) return res.status(400).json({ error: problem });
    res.status(201).json(await createEvent(req.guru.id, eventFields(req.body)));
  }));

  router.put('/events/:id', handle(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'No such event' });
    const problem = validateEvent(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const row = await updateEvent(req.guru.id, req.params.id, eventFields(req.body));
    if (!row) return res.status(404).json({ error: 'No such event' });
    res.json(row);
  }));

  router.delete('/events/:id', handle(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'No such event' });
    const gone = await deleteEvent(req.guru.id, req.params.id);
    if (!gone) return res.status(404).json({ error: 'No such event' });
    res.status(204).end();
  }));

  // ---- Needs attention, the waiting panel, close a day ------------------------------------------

  router.get('/attention', handle(async (req, res) => res.json(await attentionQueue(req.guru))));

  router.get('/waiting', handle(async (req, res) => res.json({ ...(await waitingBoard(req.guru, presenceFor)), oneTap: ONE_TAP })));

  router.get('/days/:date/close', handle(async (req, res) => {
    if (!YMD.test(req.params.date)) return res.status(400).json({ error: 'Pick a date like 2026-09-17' });
    res.json(await closeDayPreview(req.guru, req.params.date));
  }));

  router.post('/days/:date/close', handle(async (req, res) => {
    const date = req.params.date;
    if (!YMD.test(date) || date < todayIst()) return res.status(400).json({ error: 'Pick today or a day ahead' });
    const moves = Array.isArray(req.body?.moves) ? req.body.moves : [];
    if (moves.some((m) => !UUID.test(m?.bookingId ?? '') || !SLOT.test(m?.slotId ?? ''))) return res.status(400).json({ error: 'Each move needs a booking and a new time' });
    if (moves.some((m) => m.slotId.startsWith(`slot:${date}`))) return res.status(400).json({ error: 'A new time cannot be on the day being closed' });

    const result = await bookings.closeDay({ guru: req.guru, date, moves });
    const told = [];
    for (const m of result.moved) {
      if (!m.booking) continue;
      const devotee = await devotees.findDevoteeById(m.booking.devotee_id);
      told.push(await tell(() => conversation.sendNewTime({ guru: req.guru, devotee, booking: m.booking })));
    }
    res.json({
      date, moved: result.moved.map((m) => ({ bookingId: m.bookingId, slotId: m.slotId, ok: !!m.booking, newBookingId: m.booking?.id ?? null })),
      expiredHolds: result.expiredHolds, notified: told.filter((t) => t.ok).length, notDelivered: told.filter((t) => !t.ok).map((t) => t.reason),
    });
  }));

  // ---- Bookings: search, one booking, book for a caller, and the moves ---------------------------

  router.get('/bookings', handle(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '';
    res.json((await bookings.searchBookings(req.guru.id, q)).map(bookingRow));
  }));

  router.get('/bookings/:id', handle(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'No such booking' });
    const detail = await bookingDetail(req.guru, req.params.id);
    if (!detail) return res.status(404).json({ error: 'No such booking' });
    res.json(detail);
  }));

  // She called: the team holds the time for her and she gets the pay link on WhatsApp.
  router.post('/bookings', handle(async (req, res) => {
    const phone = String(req.body?.phone ?? '').replace(/\D/g, '');
    const { slotId, name, forWhom, question, paidOutside } = req.body ?? {};
    const source = SOURCES.includes(req.body?.source) ? req.body.source : 'direct';
    if (paidOutside != null && paidOutside !== '' && !['cash', 'upi'].includes(paidOutside)) return res.status(400).json({ error: 'Paid outside must be cash or upi' });
    if (phone.length < 10 || phone.length > 15) return res.status(400).json({ error: 'Her WhatsApp number, with country code, like 919876543210' });
    if (!SLOT.test(slotId ?? '')) return res.status(400).json({ error: 'Pick a time' });

    let devotee = await devotees.findOrCreateDevotee(req.guru.id, phone);
    if (name || forWhom) devotee = await devotees.updateDevotee(devotee.id, { name, forWhom });
    // She rang and will pay the link — or the team already has the dakshina in hand and confirms now.
    const booking = paidOutside
      ? await conversation.bookPaidOutside({ guru: req.guru, devotee, slotId, source, method: paidOutside })
      : await conversation.startPayment({ guru: req.guru, devotee, slotId, source, team: true });
    if (!booking) return res.status(409).json({ error: 'That time was just taken. Pick another.' });
    if (typeof question === 'string' && question.trim()) await bookings.setQuestion(booking.id, { text: question.trim() });
    res.status(201).json({ ...bookingRow({ ...booking, phone: devotee.phone, devotee_name: devotee.name }), notDelivered: booking.notDelivered ?? null });
  }));

  router.post('/bookings/:id/reschedule', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    if (!SLOT.test(req.body?.slotId ?? '')) return res.status(400).json({ error: 'Pick the new time' });
    await bookings.assertBookable(req.guru, req.body.slotId, { team: true });
    const moved = await bookings.rescheduleBooking({ bookingId: b.id, slotId: req.body.slotId });
    if (!moved) return res.status(409).json({ error: 'That time was just taken. Pick another.' });
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    const note = await tell(() => conversation.sendNewTime({ guru: req.guru, devotee, booking: moved }));
    res.json({ booking: bookingRow({ ...moved, phone: devotee.phone, devotee_name: devotee.name }), notified: note.ok, notDelivered: note.reason ?? null });
  }));

  // Her WhatsApp name is a start, not a record. The team corrects it, or notes who the time is for.
  router.put('/devotees/:id', handle(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'No such devotee' });
    const devotee = await devotees.findDevoteeById(req.params.id);
    if (!devotee || devotee.guru_id !== req.guru.id) return res.status(404).json({ error: 'No such devotee' });
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
    const forWhom = typeof req.body?.forWhom === 'string' ? req.body.forWhom.trim().slice(0, 120) : '';
    if (!name && !forWhom) return res.status(400).json({ error: 'Type her name, or who the time is for' });
    const updated = await devotees.updateDevotee(devotee.id, { name, forWhom });
    res.json({ id: updated.id, name: updated.name, forWhom: updated.for_whom, phone: updated.phone });
  }));

  // She asked the team to cancel. Same outcome as her own button — the dakshina kept as a credit
  // for thirty days — without the four-hour rule, because the team is making a judgement, not
  // pressing a self-serve button. Cash back stays the separate refund action.
  router.post('/bookings/:id/cancel', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    const { booking, creditPaise } = await bookings.cancelToCredit({ bookingId: b.id });
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    const note = await tell(() => conversation.sendCancelledNote({ guru: req.guru, devotee, booking, amountPaise: creditPaise }));
    res.json({ booking: bookingRow({ ...booking, phone: devotee.phone, devotee_name: devotee.name }), creditPaise, notified: note.ok, notDelivered: note.reason ?? null });
  }));

  // Guruji could not sit. Razorpay first; only when the money has moved do we mark the booking.
  router.post('/bookings/:id/refund', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    bookings.transition(b.status, 'refund'); // throws BookingRuleError before any money moves
    const paid = await bookings.paymentFor(b.id);
    if (!paid) return res.status(409).json({ error: 'Nothing was paid for this booking, so there is nothing to return' });
    // Money Razorpay collected goes back through Razorpay; money the team took by hand is handed
    // back by hand, and the ledger row says so.
    const byHand = paid.kind === 'payment' && String(paid.provider_ref ?? '').startsWith('offline:');
    let providerRef = byHand ? `offline:refund:${b.id}` : null;
    if (paid.kind === 'payment' && !byHand) {
      providerRef = (await pay.refundPayment({ paymentId: paid.provider_ref, amountPaise: paid.amount_paise, bookingId: b.id })).id;
    }
    const refunded = await bookings.refundBooking({ bookingId: b.id, providerRef });
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    const note = await tell(() => conversation.sendRefundNote({ guru: req.guru, devotee, booking: refunded, amountPaise: paid.amount_paise, viaCredit: paid.kind === 'credit_used', byHand }));
    res.json({ booking: bookingRow({ ...refunded, phone: devotee.phone, devotee_name: devotee.name }), amountPaise: paid.amount_paise, viaCredit: paid.kind === 'credit_used', byHand, notified: note.ok, notDelivered: note.reason ?? null });
  }));

  // The team took the dakshina by hand after holding the time. Confirms it and sends her the join link.
  router.post('/bookings/:id/mark-paid', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    const method = req.body?.method;
    if (!['cash', 'upi'].includes(method)) return res.status(400).json({ error: 'Say how she paid: cash or upi' });
    const booking = await bookings.confirmOffline({ bookingId: b.id, method, amountPaise: req.guru.dakshina_paise });
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    const note = await tell(() => conversation.sendConfirmation({ guru: req.guru, devotee, booking }));
    res.json({ booking: bookingRow({ ...booking, phone: devotee.phone, devotee_name: devotee.name }), notified: note.ok, notDelivered: note.reason ?? null });
  }));

  // A note to guruji's own WhatsApp about this sitting, now.
  router.post('/bookings/:id/tell-guru', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    const text = conversation.copy.guruNow({ devoteeName: devotee.name ?? `…${devotee.phone.slice(-4)}`, time: describeSlot(b.slotId), question: b.question_text });
    await conversation.tellGuru({ guru: req.guru, devotee, booking: b, text, kind: 'note.guru' });
    res.json({ told: true });
  }));

  router.post('/bookings/:id/no-show', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    const marked = await bookings.markNoShow(b.id);
    res.json({ booking: bookingRow({ ...marked, phone: b.phone, devotee_name: b.devotee_name }) });
  }));

  // A note to her while she waits: one tap, or typed. Lands in the room or on WhatsApp.
  router.post('/bookings/:id/message', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 300) : '';
    if (!text) return res.status(400).json({ error: 'Write something to send' });
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    res.json(await conversation.sendWaitingMessage({ guru: req.guru, devotee, booking: b, text }));
  }));

  // Her hold expired and the slot is still free: hold it again and send the link again.
  router.post('/bookings/:id/send-link', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    if (b.status !== 'expired') return res.status(409).json({ error: `A ${b.status} booking does not need a new link` });
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    const held = await conversation.startPayment({ guru: req.guru, devotee, slotId: b.slotId, source: b.source, team: true });
    if (!held) return res.status(409).json({ error: 'Someone else has that time now. Offer her another from Bookings.' });
    res.status(201).json({ booking: bookingRow({ ...held, phone: devotee.phone, devotee_name: devotee.name }) });
  }));

  router.get('/qr-codes', handle(async (req, res) => res.json(await listQrCodes(req.guru))));

  router.post('/qr-codes', handle(async (req, res) => {
    const source = req.body?.source;
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    if (!QR_SOURCES.includes(source)) return res.status(400).json({ error: `Source must be one of ${QR_SOURCES.join(', ')}` });
    if (!label) return res.status(400).json({ error: 'Give the QR a label so the team knows where it hangs' });
    if (!req.guru.whatsapp_number) return res.status(400).json({ error: 'Set his WhatsApp number first (gurus.whatsapp_number)' });
    res.status(201).json(await createQrCode(req.guru, { source, label }));
  }));

  // A rule said no, or a provider did: a sentence, not a 500.
  router.use((err, _req, res, next) => {
    if (err instanceof BookingRuleError) return res.status(409).json({ error: err.message });
    if (err instanceof ProviderError) return res.status(502).json({ error: err.message });
    next(err);
  });

  return router;
}

/** The booking in the path, if it is this guru's; otherwise answers 404 and returns null. */
async function ownBooking(req, res) {
  if (!UUID.test(req.params.id)) { res.status(404).json({ error: 'No such booking' }); return null; }
  const b = await bookings.findWithDevotee(req.params.id);
  if (!b || b.guru_id !== req.guru.id) { res.status(404).json({ error: 'No such booking' }); return null; }
  return b;
}

/** Send a WhatsApp note as part of a team action; the action stands even if Meta refuses. */
async function tell(send) {
  try {
    await send();
    return { ok: true };
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    return { ok: false, reason: err.message };
  }
}

// Express 4 does not catch a rejected promise; every async handler goes through here.
function handle(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

function dateParam(value) {
  return typeof value === 'string' && YMD.test(value) ? value : null;
}

function eventFields(b) {
  return { title: b.title.trim(), kind: b.kind, startsAt: new Date(b.startsAt), link: b.link || null, location: b.location || null, notes: b.notes || null };
}

/** The guru row as the Settings screen sees it. */
export function settingsView(g) {
  return {
    id: g.id, slug: g.slug, name: g.name, domain: g.domain, about: g.about, marketing: g.marketing_json,
    dakshinaPaise: g.dakshina_paise, whatsappNumber: g.whatsapp_number, guruPhone: g.guru_phone, pattern: g.pattern_json, closedDates: g.closed_dates,
  };
}
