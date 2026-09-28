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
import { logMessage } from './messages-log.js';
import { copy } from './conversation.js';
import { settlePaidLink } from './paid-link.js';

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
      const devotee = await devotees.findOrCreateDevotee(guru.id, msg.from, { name: msg.profileName });
      await logMessage({ guruId: guru.id, devoteeId: devotee.id, direction: 'in', kind: msg.kind, payload: msg });
      const say = conversation.speak(guru, devotee);

      const tapped = msg.kind === 'button' || msg.kind === 'list';
      if (tapped && msg.id === 'more') return await sendMoreTimes(guru, say);
      if (tapped && msg.id.startsWith('slot:')) return await holdAndAskForPayment(guru, devotee, say, msg.id);
      if (msg.kind === 'audio') return await attachVoiceNote(guru, devotee, say, msg.mediaId);
      if (msg.kind === 'text' && !isGreeting(msg.text) && await answerFromWhereSheStands(guru, devotee, say, msg.text)) return;
      // "Hi", or a message from someone with nothing in flight: she wants a time.
      await sendNearestSlots(guru, devotee, say, sourceFromText(msg.text));
    } catch (err) {
      console.error(err.message);
    }
  });

  async function sendNearestSlots(guru, devotee, say, source) {
    const open = availableSlots(gurus.availabilityOf(guru), await bookings.takenSlotIds(guru.id));
    if (open.length === 0) return say.text(copy.noTimes({ guruName: guru.name }));
    pendingSource.set(devotee.phone, source);
    const buttons = open.slice(0, 2).map((s) => ({ id: s.id, title: s.label }));
    buttons.push({ id: 'more', title: 'Other times' });
    await say.buttons(
      `Namaste 🙏\nBook time with ${guru.name} — ${guru.pattern_json.slotMinutes} minutes, dakshina ${formatRupees(guru.dakshina_paise)}.\nNext available:`,
      buttons);
  }

  async function sendMoreTimes(guru, say) {
    const open = availableSlots(gurus.availabilityOf(guru), await bookings.takenSlotIds(guru.id)).slice(0, 10);
    const byDay = new Map();
    for (const s of open) {
      const day = s.label.split(' ')[0];                 // "Today" | "Tomorrow" | "Thu"
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push({ id: s.id, title: s.label.replace(`${day} `, '') });
    }
    const sections = [...byDay].map(([title, rows]) => ({ title, rows }));
    await say.list('Choose a time that suits you.', 'See times', sections);
  }

  async function holdAndAskForPayment(guru, devotee, say, slotId) {
    const source = pendingSource.get(devotee.phone) || 'direct';
    let booking;
    try {
      booking = await conversation.startPayment({ guru, devotee, slotId, source });
    } catch (err) {
      if (err instanceof ProviderError) { console.error(err.message); return say.text(copy.paymentUnavailable()); }
      if (err instanceof BookingRuleError) { await say.text(err.message); return sendNearestSlots(guru, devotee, say, source); }
      throw err;
    }
    if (!booking) {
      await say.text(copy.slotTaken());
      return sendNearestSlots(guru, devotee, say, source);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Razorpay tells us she paid.
  // ---------------------------------------------------------------------------
  router.post('/razorpay/webhook', async (req, res) => {
    const signature = req.header('X-Razorpay-Signature');
    if (!razorpay.isValidWebhook(req.rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET)) {
      return res.status(400).send('Bad signature — check RAZORPAY_WEBHOOK_SECRET matches the Razorpay dashboard');
    }
    res.sendStatus(200);

    if (req.body.event !== 'payment_link.paid') return;
    const paymentLinkId = req.body.payload?.payment_link?.entity?.id;
    const payment = req.body.payload?.payment?.entity;
    if (!paymentLinkId || !payment) return console.error('payment_link.paid webhook without payment_link and payment entities; nothing confirmed');

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
    await say.text(`Received. ${guru.name} will hear this before your session.`);
  }

  async function attachTextQuestion(guru, devotee, say, text) {
    await bookings.attachQuestion({ guruId: guru.id, devoteeId: devotee.id, text });
    await say.text(`Noted. ${guru.name} will read this before your session.`);
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

  // "Hi" always means she wants a time, whatever else is in flight.
  function isGreeting(text = '') {
    return /^\s*hi\b/i.test(text);
  }

  // "Hi — from the live" / "Hi — ashram" come from the QR's pre-filled text (qr-codes.js GREETINGS).
  function sourceFromText(text = '') {
    const t = text.toLowerCase();
    if (t.includes('live')) return 'live';
    if (t.includes('ashram')) return 'ashram';
    if (t.includes('poster')) return 'poster';
    if (t.includes('page')) return 'page';
    return 'direct';
  }

  return router;
}
