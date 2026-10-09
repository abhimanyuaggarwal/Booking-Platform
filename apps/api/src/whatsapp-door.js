// The WhatsApp booking door — the whole conversation, top to bottom:
//   she sends anything  -> two nearest slots + "Other times"
//   she taps a slot     -> we hold it 10 minutes and send a "Pay ₹500" button
//   Razorpay says paid  -> we confirm and send the join link
//   she sends a voice note or text afterwards -> attached to her booking for guruji
//
// Which guru she is writing to comes from the number she wrote to (gurus.whatsapp_number).
// The words we send, and the hold/pay/confirm steps, live in conversation.js.

import express from 'express';
import { availableSlots, formatRupees } from '@expert-sessions/shared';
import * as bookings from './bookings.js';
import * as devotees from './devotees.js';
import * as gurus from './gurus.js';
import * as whatsapp from './whatsapp.js';
import * as razorpay from './razorpay.js';
import { ProviderError, BookingRuleError } from './errors.js';
import { wordsFor, slotLabel } from './devotee-words.js';
import { listSessionTypes, findSessionType, typeLabel } from './session-types.js';
import { logMessage, alreadySeen } from './messages-log.js';
import { copy } from './conversation.js';
import { settlePaidLink } from './paid-link.js';
import { cancelAndRefund } from './cancellations.js';
import * as approvals from './approvals.js';
import { secretsKey } from './secrets.js';
import { audit } from './audit.js';

export function whatsappDoor(env, conversation) {
  const router = express.Router();
  const pendingSource = new Map(); // phone -> source, remembered until she picks a slot (in memory; lost on restart)

  // ---------------------------------------------------------------------------
  // 1. Meta verifies the webhook once, when you click "Verify and save".
  // ---------------------------------------------------------------------------
  router.get('/webhook', (req, res) => {
    const tokenMatches = req.query['hub.verify_token'] === env.WHATSAPP_VERIFY_TOKEN;
    if (req.query['hub.mode'] === 'subscribe' && tokenMatches) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    res.status(403).send('Verify token does not match WHATSAPP_VERIFY_TOKEN in .env');
  });

  // ---------------------------------------------------------------------------
  // 2. Every WhatsApp message lands here.
  // ---------------------------------------------------------------------------
  router.post('/webhook', async (req, res) => {
    // Meta signs every delivery with the app secret. With WHATSAPP_APP_SECRET set, an unsigned or
    // mis-signed post is refused; without it (the first days of a pilot) anyone who knows the URL
    // could hold slots or send messages as any devotee, so set it.
    if (env.WHATSAPP_APP_SECRET && !whatsapp.isSignedByMeta(req.rawBody, req.header('X-Hub-Signature-256'), env.WHATSAPP_APP_SECRET)) {
      console.error('Refused a /webhook post whose X-Hub-Signature-256 did not match WHATSAPP_APP_SECRET (Meta app → App settings → Basic → App secret).');
      return res.sendStatus(403);
    }
    res.sendStatus(200); // acknowledge first; Meta retries if we are slow

    const msg = whatsapp.parseInbound(req.body);
    if (!msg) return;

    try {
      const guru = await gurus.findGuruByWhatsappNumber(msg.to);
      if (!guru) {
        console.error(`Message to ${msg.to}, but no guru has that whatsapp_number. ` +
          'Set WHATSAPP_DISPLAY_NUMBER in .env and run pnpm seed, or fix gurus.whatsapp_number.');
        return;
      }
      // Guruji's own Yes or No to a change his team asked for: only from his number, nothing else happens.
      if ((msg.kind === 'button') && /^(approve|reject):/.test(msg.id)) return await decideApproval(guru, msg);
      const devotee = await devotees.findOrCreateDevotee(guru.id, msg.from, { name: msg.profileName });
      if (msg.wamid && await alreadySeen(msg.wamid)) return;   // Meta redelivers when our 200 was slow; one answer per message
      await logMessage({ guruId: guru.id, devoteeId: devotee.id, direction: 'in', kind: msg.kind, payload: msg });
      const say = conversation.speak(guru, devotee);
      // A guru who is not live yet, or paused: one plain sentence, nothing booked.
      if (guru.status && guru.status !== 'live') return await say.text(wordsFor(guru.language).notOpen({ guruName: guru.name }));

      const tapped = msg.kind === 'button' || msg.kind === 'list';
      // Button ids carry everything the next step needs, so nothing is remembered between taps:
      //   type:<id>                 she chose a kind of sitting -> the two nearest times for it
      //   more:<typeId>             -> up to ten more times for it
      //   t:<typeId>|slot:<slotId>  she chose a time -> hold it and ask for the dakshina
      if (tapped && msg.id.startsWith('type:')) return await sendNearestSlots(guru, devotee, say, pendingSource.get(devotee.phone) || 'direct', await typeOrDefault(guru, msg.id.slice(5)));
      if (tapped && msg.id.startsWith('more')) return await sendMoreTimes(guru, say, await typeOrDefault(guru, msg.id.split(':')[1]));
      if (tapped && /^(t:[^|]+\|)?slot:/.test(msg.id)) return await holdAndAskForPayment(guru, devotee, say, msg.id);
      //   move:<bookingId>            -> the open times for that sitting's kind
      //   mv:<bookingId>|slot:<slot>  -> moved
      //   cancel:<bookingId>          -> "are you sure", with what happens to the dakshina
      //   cancel-yes:<bookingId>      -> cancelled and refunded
      //   keep / new / tell:<bookingId>
      if (tapped && msg.id.startsWith('move:')) return await offerNewTimes(guru, devotee, say, msg.id.slice(5));
      if (tapped && msg.id.startsWith('mv:')) return await moveBooking(guru, devotee, say, msg.id);
      if (tapped && msg.id.startsWith('cancel-yes:')) return await cancelBooking(guru, devotee, say, msg.id.slice(11));
      if (tapped && msg.id.startsWith('cancel:')) return await askBeforeCancel(guru, devotee, say, msg.id.slice(7));
      if (tapped && msg.id === 'keep') return await say.text(wordsFor(guru.language).kept);
      if (tapped && msg.id.startsWith('tell:')) return await tellTheTeam(guru, devotee, say, msg.id.slice(5));
      if (tapped && msg.id === 'new') return await sendNearestSlots(guru, devotee, say, 'direct');
      if (msg.kind === 'audio') return await attachVoiceNote(guru, devotee, say, msg.mediaId);
      if (msg.kind === 'text' && !isGreeting(msg.text) && await answerFromWhereSheStands(guru, devotee, say, msg.text)) return;
      // "Hi" with a time ahead: her booking, and what she may do with it. Otherwise she wants a time.
      if (await offerHoldAgain(guru, devotee, say)) return;
      if (await sendBookingOptions(guru, devotee, say)) return;
      await sendNearestSlots(guru, devotee, say, sourceFromText(msg.text));
    } catch (err) {
      console.error(err.message);
    }
  });

  /** The active types; a tapped id that no longer matches one falls back to the default. */
  async function typeOrDefault(guru, id) {
    const types = await listSessionTypes(guru.id, { activeOnly: true });
    return types.find((t) => t.id === id) ?? types[0];
  }

  /**
   * "Hi": with one kind of sitting, straight to the two nearest times; with more, the kinds as
   * buttons first ("10 मिनट · ₹500"), then the times for the one she tapped.
   */
  async function sendNearestSlots(guru, devotee, say, source, type = null) {
    const W = wordsFor(guru.language);
    pendingSource.set(devotee.phone, source);
    if (!type) {
      const types = await listSessionTypes(guru.id, { activeOnly: true });
      if (types.length > 1) {
        return say.buttons(W.chooseType({ guruName: guru.name }), types.map((t) => ({ id: `type:${t.id}`, title: typeLabel(t, guru.language) })));
      }
      type = types[0];
    }
    const open = openFor(guru, type, await bookings.takenIntervals(guru.id));
    if (open.length === 0) return say.text(W.noTimes({ guruName: guru.name }));
    const buttons = open.slice(0, 2).map((s) => ({ id: `t:${type.id}|${s.id}`, title: slotLabel(s.label, guru.language) }));
    buttons.push({ id: `more:${type.id}`, title: W.otherTimes });
    await say.buttons(W.greeting({ guruName: guru.name, minutes: type.minutes, dakshina: formatRupees(type.dakshina_paise) }), buttons);
  }

  function openFor(guru, type, taken) {
    return availableSlots(gurus.availabilityOf(guru), taken, undefined, { minutes: type.minutes, typeId: type.id });
  }

  async function sendMoreTimes(guru, say, type) {
    const open = openFor(guru, type, await bookings.takenIntervals(guru.id)).slice(0, 10);
    const byDay = new Map();
    for (const s of open) {
      const day = s.label.split(' ')[0];                 // "Today" | "Tomorrow" | "Thu"
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push({ id: `t:${type.id}|${s.id}`, title: s.label.replace(`${day} `, '') });
    }
    const W = wordsFor(guru.language);
    for (const [day, rows] of [...byDay]) {
      byDay.delete(day); byDay.set(slotLabel(day, guru.language).trim(), rows);
    }
    const sections = [...byDay].map(([title, rows]) => ({ title, rows }));
    await say.list(W.chooseTime, W.seeTimes, sections);
  }

  async function holdAndAskForPayment(guru, devotee, say, tappedId) {
    const source = pendingSource.get(devotee.phone) || 'direct';
    const [, typeId, slotId] = tappedId.match(/^(?:t:([^|]+)\|)?(slot:.+)$/);
    const type = await typeOrDefault(guru, typeId);
    let booking;
    try {
      booking = await conversation.startPayment({ guru, devotee, slotId, source, type });
    } catch (err) {
      if (err instanceof ProviderError) { console.error(err.message); return say.text(wordsFor(guru.language).paymentUnavailable()); }
      if (err instanceof BookingRuleError) { await say.text(ruleWords(guru, err)); return sendNearestSlots(guru, devotee, say, source); }
      throw err;
    }
    if (!booking) {
      await say.text(wordsFor(guru.language).slotTaken());
      return sendNearestSlots(guru, devotee, say, source);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Razorpay tells us she paid.
  // ---------------------------------------------------------------------------
  // The platform's webhook, and one per guru (/razorpay/webhook/<slug>) signed with his own secret.
  router.post(['/razorpay/webhook', '/razorpay/webhook/:slug'], async (req, res) => {
    const signature = req.header('X-Razorpay-Signature');
    const guru = req.params.slug ? await gurus.findGuruBySlug(req.params.slug) : null;
    if (req.params.slug && !guru) return res.status(404).send('No guru at this webhook address');
    if (!razorpay.isValidWebhook(req.rawBody, signature, razorpay.webhookSecretFor(guru, env))) {
      return res.status(400).send(guru ? `Bad signature — the webhook secret in ${guru.name}'s Razorpay dashboard must match the one connected in the console` : 'Bad signature — check RAZORPAY_WEBHOOK_SECRET matches the Razorpay dashboard');
    }
    res.sendStatus(200);

    // order.paid is today's event; payment_link.paid still arrives for links made before the switch.
    const { event, payload } = req.body;
    const paymentLinkId = event === 'order.paid' ? payload?.order?.entity?.id
      : event === 'payment_link.paid' ? payload?.payment_link?.entity?.id : null;
    if (!paymentLinkId) return; // payment.captured and friends: not ours to act on
    const payment = payload?.payment?.entity;
    if (!payment) return console.error(`${event} webhook without a payment entity; nothing confirmed`);

    try {
      // The same settlement the hourly reconciliation uses, so a lost webhook and a delivered one
      // end in exactly the same rows and the same words to her (paid-link.js).
      await settlePaidLink({ paymentLinkId, providerRef: payment.id, amountPaise: payment.amount, conversation });
    } catch (err) {
      console.error(err.message);
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Her question, after paying.
  // ---------------------------------------------------------------------------
  async function attachVoiceNote(guru, devotee, say, mediaId) {
    const booking = await bookings.attachQuestion({ guruId: guru.id, devoteeId: devotee.id, mediaId });
    if (!booking) return sendNearestSlots(guru, devotee, say, 'direct');
    await say.text(wordsFor(guru.language).received({ guruName: guru.name }));
  }

  async function attachTextQuestion(guru, devotee, say, text) {
    await bookings.attachQuestion({ guruId: guru.id, devoteeId: devotee.id, text });
    await say.text(wordsFor(guru.language).noted({ guruName: guru.name }));
  }

  /**
   * We cannot read her message, so we answer from where she stands with him. Sending the calendar
   * to everyone we do not understand is the wrong default: it meets "thank you, that helped" with
   * a booking form, and meets "how do I pay?" by inviting her to hold a second slot.
   * @returns {boolean} whether this was answered; false means she wants a time.
   */
  async function answerFromWhereSheStands(guru, devotee, say, text) {
    const { kind, booking } = await bookings.whereSheStands(guru.id, devotee.id);

    if (kind === 'awaiting_session') {
      await attachTextQuestion(guru, devotee, say, text);
      return true;
    }
    if (kind === 'awaiting_payment' && booking.payment_link_id) {
      await conversation.resendPaymentLink({ guru, devotee, booking });
      return true;
    }
    if (kind === 'just_finished') {
      await conversation.sendHeardAfterSession({ guru, devotee, booking });
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // 5. Her own booking: change the time or cancel, two taps each (policy: once, up to four hours
  //    before; inside that, the team decides, so the button becomes "tell the team").
  // ---------------------------------------------------------------------------
  async function sendBookingOptions(guru, devotee, say) {
    const { kind, booking } = await bookings.whereSheStands(guru.id, devotee.id);
    if (kind !== 'awaiting_session' || new Date(booking.slot_start) <= new Date()) return false;
    const W = wordsFor(guru.language);
    await say.buttons(W.myBooking({ guruName: guru.name, slotId: booking.slotId, minutes: booking.minutes }), [
      { id: `move:${booking.id}`, title: W.changeTime },
      { id: `cancel:${booking.id}`, title: W.cancelIt },
      { id: 'new', title: W.newBooking },
    ]);
    return true;
  }

  async function herBooking(guru, devotee, bookingId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(bookingId))) return null;   // a crafted or broken id is simply not hers
    const b = await bookings.findById(bookingId);
    return b && b.guru_id === guru.id && b.devotee_id === devotee.id ? b : null;
  }

  async function offerNewTimes(guru, devotee, say, bookingId) {
    const b = await herBooking(guru, devotee, bookingId);
    if (!b) return sendNearestSlots(guru, devotee, say, 'direct');
    const W = wordsFor(guru.language);
    const problem = bookings.whyCannotReschedule(b);
    if (problem) return say.buttons(W.cannotChange({ reason: W.rules[problem] ?? problem }), [{ id: `tell:${b.id}`, title: W.tellTeam }, { id: 'keep', title: W.keepIt }]);
    const type = { id: b.session_type_id, minutes: b.minutes };
    const open = openFor(guru, type, await bookings.takenIntervals(guru.id)).slice(0, 10);
    if (open.length === 0) return say.text(W.noTimes({ guruName: guru.name }));
    const byDay = new Map();
    for (const s of open) {
      const day = slotLabel(s.label.split(' ')[0], guru.language);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push({ id: `mv:${b.id}|${s.id}`, title: s.label.split(' ').slice(1).join(' ') });
    }
    await say.list(W.chooseNewTime, W.seeTimes, [...byDay].map(([title, rows]) => ({ title, rows })));
  }

  async function moveBooking(guru, devotee, say, tappedId) {
    const [, bookingId, slotId] = tappedId.match(/^mv:([^|]+)\|(slot:.+)$/) ?? [];
    const b = bookingId && await herBooking(guru, devotee, bookingId);
    if (!b) return sendNearestSlots(guru, devotee, say, 'direct');
    const W = wordsFor(guru.language);
    const problem = bookings.whyCannotReschedule(b);
    if (problem) return say.buttons(W.cannotChange({ reason: W.rules[problem] ?? problem }), [{ id: `tell:${b.id}`, title: W.tellTeam }, { id: 'keep', title: W.keepIt }]);
    try {
      await bookings.assertBookable(guru, slotId, { type: { id: b.session_type_id, minutes: b.minutes } });
    } catch (err) {
      if (!(err instanceof BookingRuleError)) throw err;
      await say.text(W.slotTaken());
      return offerNewTimes(guru, devotee, say, b.id);
    }
    const moved = await bookings.rescheduleBooking({ bookingId: b.id, slotId });
    if (!moved) { await say.text(W.slotTaken()); return offerNewTimes(guru, devotee, say, b.id); }
    await logMessage({ guruId: guru.id, devoteeId: devotee.id, bookingId: moved.id, direction: 'in', kind: 'devotee.moved', payload: { from: b.slotId, to: moved.slotId } });
    await conversation.sendNewTime({ guru, devotee, booking: moved });
  }

  async function askBeforeCancel(guru, devotee, say, bookingId) {
    const b = await herBooking(guru, devotee, bookingId);
    if (!b) return sendNearestSlots(guru, devotee, say, 'direct');
    const W = wordsFor(guru.language);
    const problem = bookings.whyCannotCancel(b);
    if (problem) return say.buttons(W.cannotChange({ reason: W.rules[problem] ?? problem }), [{ id: `tell:${b.id}`, title: W.tellTeam }, { id: 'keep', title: W.keepIt }]);
    const paid = await bookings.paymentFor(b.id);
    const dakshina = formatRupees(paid?.amount_paise ?? 0);
    const words = !paid || paid.amount_paise === 0 ? W.confirmCancelFree
      : String(paid.provider_ref ?? '').startsWith('offline:') ? W.confirmCancelByHand : W.confirmCancel;
    await say.buttons(words({ slotId: b.slotId, dakshina }), [{ id: `cancel-yes:${b.id}`, title: W.yesCancel }, { id: 'keep', title: W.keepIt }]);
  }

  async function cancelBooking(guru, devotee, say, bookingId) {
    const b = await herBooking(guru, devotee, bookingId);
    if (!b) return sendNearestSlots(guru, devotee, say, 'direct');
    const W = wordsFor(guru.language);
    const problem = bookings.whyCannotCancel(b);
    if (problem) return say.buttons(W.cannotChange({ reason: W.rules[problem] ?? problem }), [{ id: `tell:${b.id}`, title: W.tellTeam }, { id: 'keep', title: W.keepIt }]);
    let result;
    try {
      result = await cancelAndRefund({ booking: b, pay: razorpay.clientFor(guru, env) });
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      console.error(`Cancel of ${b.id} asked on WhatsApp, but the refund could not be started: ${err.message}`);
      await logMessage({ guruId: guru.id, devoteeId: devotee.id, bookingId: b.id, direction: 'in', kind: 'asked.team', payload: { text: 'Asked on WhatsApp to cancel; the refund could not be started, cancel it here' } });
      return say.text(W.cancelFailed());
    }
    await logMessage({ guruId: guru.id, devoteeId: devotee.id, bookingId: b.id, direction: 'in', kind: 'devotee.cancelled', payload: { amountPaise: result.amountPaise, how: result.how } });
    await conversation.sendCancelledNote({ guru, devotee, booking: result.booking, amountPaise: result.amountPaise, how: result.how });
  }

  /** Inside the four hours, or moved once already: the team decides. The ask lands on Today under Needs you. */
  async function tellTheTeam(guru, devotee, say, bookingId) {
    const b = await herBooking(guru, devotee, bookingId);
    if (!b) return say.text(wordsFor(guru.language).notYours());
    await logMessage({ guruId: guru.id, devoteeId: devotee.id, bookingId: b.id, direction: 'in', kind: 'asked.team', payload: { text: 'Asked on WhatsApp to change or cancel this time' } });
    await say.text(wordsFor(guru.language).teamWillCall({ guruName: guru.name }));
  }

  // ---------------------------------------------------------------------------
  // 6. Guruji approves a change to his money or his number (approvals.js). The tap must come from
  //    his own phone; the request was sent there by the console.
  // ---------------------------------------------------------------------------
  async function decideApproval(guru, msg) {
    const [, verb, id] = msg.id.match(/^(approve|reject):(.+)$/);
    const from = String(msg.from).replace(/\D/g, '');
    if (!guru.guru_phone || from !== String(guru.guru_phone).replace(/\D/g, '')) return;
    const decision = await approvals.decide({ id, approved: verb === 'approve', key: secretsKey(env) });
    const W = wordsFor(guru.language);
    const reply = whatsapp.clientFor(guru, env);
    if (!decision) return reply.text(from, W.approvalGone());
    if (decision.approved && decision.kind === 'payments') await gurus.connectRazorpay(guru.id, decision.payload);
    if (decision.approved && decision.kind === 'whatsapp') await gurus.goLiveOnNumber(guru.id, decision.payload);
    await audit({ guruId: guru.id, user: { id: 'guruji', name: guru.name }, action: decision.approved ? `${decision.kind}.approved` : `${decision.kind}.rejected`, detail: {} });
    await reply.text(from, decision.approved ? W.approvalThanks() : W.approvalDeclined());
  }

  /** A booking rule, in her language; an unknown code keeps its English sentence rather than going silent. */
  function ruleWords(guru, err) {
    return wordsFor(guru.language).rules[err.code] ?? err.message;
  }

  /** She wrote while a hold of hers still stands: the same pay link again, never a second hold. */
  async function offerHoldAgain(guru, devotee, say) {
    const hold = await bookings.openHoldFor(guru.id, devotee.id);
    if (!hold || !hold.payment_link_id) return false;
    const W = wordsFor(guru.language);
    const dakshina = formatRupees(hold.dakshina_paise);
    await say.link(W.holdAgain({ guruName: guru.name, slotId: hold.slotId, dakshina }), W.pay({ dakshina }), conversation.payLink(hold, guru));
    return true;
  }

  // "Hi" always means she wants a time, whatever else is in flight.
  function isGreeting(text = '') {
    return /^\s*hi\b/i.test(text);
  }

  // "Hi — from the live" / "Hi — ashram" come from the QR's pre-filled text (qr-codes.js GREETINGS).
  function sourceFromText(text = '') {
    const m = /^\s*hi\s*[—–-]\s*(?:from\s+(?:the|his)\s+)?(live|ashram|poster|page)\b/i.exec(text);
    return m ? m[1].toLowerCase() : 'direct';
  }

  return router;
}
