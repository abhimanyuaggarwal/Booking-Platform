// Everything we say to a devotee on WhatsApp, and the two steps it drives: hold a slot and send the
// pay link; confirm and send the join link. The WhatsApp door, the console, and later his website
// all speak through here, so the words are the same wherever a booking comes from.
// Copy rules (CLAUDE.md): "dakshina", "time", plain sentences, no exclamation marks.

import { describeSlot, formatRupees, slotIdToInstant } from '@expert-sessions/shared';
import { SOON_MINUTES } from './reminders.js';
import { JOIN_CLOSES_MINUTES } from './guru-day.js';
import * as bookings from './bookings.js';
import * as whatsapp from './whatsapp.js';
import * as razorpay from './razorpay.js';
import { logMessage } from './messages-log.js';
import { emitToSession, presenceFor } from './realtime.js';
import { ProviderError, BookingRuleError } from './errors.js';
import { wordsFor } from './devotee-words.js';

// The words themselves live in devotee-words.js, in both languages. `copy` is the English set,
// kept here for the tests and for anything that has no guru at hand.
export const copy = wordsFor('en');

export function createConversation(env) {
  const wa = whatsapp.client(env);
  const pay = razorpay.client(env);

  /**
   * Talk to one devotee and keep the record: every message becomes a messages_log row, delivered or
   * not. A refusal from Meta is written down and then thrown, so the caller still knows it failed
   * and the team can see what we tried to say.
   */
  function speak(guru, devotee, bookingId = null) {
    const to = devotee.phone;
    const record = (kind, payload) =>
      logMessage({ guruId: guru.id, devoteeId: devotee.id, bookingId, direction: 'out', kind, payload });

    async function attempt(kind, payload, send) {
      try {
        await send();
      } catch (err) {
        if (!(err instanceof ProviderError)) throw err;
        await record(kind, { ...payload, delivered: false, reason: err.message });
        throw err;
      }
      await record(kind, { ...payload, delivered: true });
    }

    return {
      text(body) { return attempt('text', { body }, () => wa.text(to, body)); },
      buttons(body, buttons) { return attempt('buttons', { body, buttons }, () => wa.buttons(to, body, buttons)); },
      list(body, buttonLabel, sections) { return attempt('list', { body, sections }, () => wa.list(to, body, buttonLabel, sections)); },
      link(body, buttonLabel, href) { return attempt('link', { body, buttonLabel, href }, () => wa.link(to, body, buttonLabel, href)); },
    };
  }

  /**
   * Hold the slot and make her pay link. Returns the held booking with `payUrl`, or null if the slot
   * was taken. `notify` sends her the link on WhatsApp too — true from the WhatsApp door and the
   * console, false from his website, where she is already looking at the payment page.
   * `callbackUrlFor(booking)` brings her browser back to us after UPI.
   * If Razorpay refuses, the hold is released at once — nobody should lose a slot to our outage —
   * and the ProviderError says why.
   */
  async function startPayment({ guru, devotee, slotId, source, type = null, notify = true, team = false }) {
    await bookings.assertBookable(guru, slotId, { team, type }); // BookingRuleError carries the sentence
    const booking = await bookings.holdSlot({ guruId: guru.id, devoteeId: devotee.id, slotId, source, type });
    if (!booking) return null;
    const dakshina = formatRupees(booking.dakshina_paise);
    let order;
    try {
      order = await pay.createOrder({
        amountPaise: booking.dakshina_paise,
        receipt: booking.id,
        notes: { booking_id: booking.id, guru: guru.slug, time: describeSlot(slotId) },
      });
    } catch (err) {
      await bookings.expireHold(booking.id); // an outage never blocks a slot
      throw err;
    }
    await bookings.attachPaymentLink(booking.id, order.id); // the column holds the order id now
    const payUrl = payLink(booking, guru);
    const W = wordsFor(guru.language);
    if (notify) await speak(guru, devotee, booking.id).link(W.held({ guruName: guru.name, slotId, dakshina }), W.pay({ dakshina }), payUrl);
    return { ...booking, payUrl };
  }

  /**
   * The team took the dakshina by hand and books the time on her behalf: held and confirmed in one
   * go, no Razorpay, and she gets the same confirmation and join link as anyone who paid online.
   * Returns null if the slot was taken.
   */
  async function bookPaidOutside({ guru, devotee, slotId, source, method, type = null }) {
    await bookings.assertBookable(guru, slotId, { team: true, type });
    const held = await bookings.holdSlot({ guruId: guru.id, devoteeId: devotee.id, slotId, source, type });
    if (!held) return null;
    const booking = await bookings.confirmOffline({ bookingId: held.id, method });
    // The team's booking stands whether or not WhatsApp reaches her; the refusal is recorded and returned.
    try {
      await sendConfirmation({ guru, devotee, booking });
      return { ...booking, notDelivered: null };
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      return { ...booking, notDelivered: err.message };
    }
  }

  /**
   * A short note to guruji's own WhatsApp about one sitting: from the ten-minute reminder, or from
   * the console when his team wants him to know now. Recorded against the booking (kind
   * `reminder.guru` or `note.guru`) so it is sent once and shows in the drawer. Throws
   * BookingRuleError when he has no number yet.
   */
  async function tellGuru({ guru, devotee, booking, text, kind = 'note.guru' }) {
    if (!guru.guru_phone) throw new BookingRuleError('Guruji has no WhatsApp number yet. Add it in Settings, His website, and try again.');
    const payload = { body: text, to: 'guru' };
    try {
      await wa.text(guru.guru_phone, text);
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      await logMessage({ guruId: guru.id, devoteeId: devotee.id, bookingId: booking.id, direction: 'out', kind, payload: { ...payload, delivered: false, reason: err.message } });
      throw err;
    }
    await logMessage({ guruId: guru.id, devoteeId: devotee.id, bookingId: booking.id, direction: 'out', kind, payload: { ...payload, delivered: true } });
  }

  // Her confirmation points at her booking page (see it, move it, cancel it). The join link comes
  // ten minutes before her time, from reminders.js, so nobody opens a waiting room a day early.
  async function sendConfirmation({ guru, devotee, booking, now = new Date() }) {
    const W = wordsFor(guru.language);
    const say = speak(guru, devotee, booking.id);
    // Booked minutes before the time (the doors offer starts every few minutes when his team wants
    // that): the ten-minutes-before reminder would come too late or never, so the confirmation
    // itself carries the join link, and is recorded as that reminder so it is not sent twice.
    if (startsWithin(booking, now)) {
      await say.link(W.confirmedSoon({ guruName: guru.name, slotId: booking.slotId }), W.joinNow, joinLink(booking, guru));
      await logMessage({ guruId: guru.id, devoteeId: devotee.id, bookingId: booking.id, direction: 'out', kind: 'reminder.soon', payload: { text: W.confirmedSoon({ guruName: guru.name, slotId: booking.slotId }), delivered: true, withConfirmation: true } });
      await say.text(W.askQuestion({ guruName: guru.name }));
      await tellGuruSoon({ guru, devotee, booking });
      return;
    }
    await say.link(W.confirmed({ guruName: guru.name, slotId: booking.slotId }), W.seeBooking, bookingLink(booking, guru));
    await say.text(W.askQuestion({ guruName: guru.name }));
  }

  /** Guruji hears of a sitting booked minutes before it, if his team gave his number. A refusal is recorded by tellGuru, not raised. */
  async function tellGuruSoon({ guru, devotee, booking }) {
    if (!guru.guru_phone) return;
    const W = wordsFor(guru.language);
    try {
      await tellGuru({
        guru, devotee, booking, kind: 'reminder.guru',
        text: W.guruSoon({ devoteeName: devotee.name ?? `…${devotee.phone.slice(-4)}`, time: describeSlot(booking.slotId).split(', ').pop(), question: booking.question_text ?? null }),
      });
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
    }
  }

  /** She paid after the hold ran out. Say so plainly: nothing is booked, and the team will settle it. */
  async function sendPaidTooLateNote({ guru, devotee, booking, amountPaise }) {
    await speak(guru, devotee, booking.id).text(wordsFor(guru.language).paidTooLate({ guruName: guru.name, slotId: booking.slotId, dakshina: formatRupees(amountPaise) }));
  }

  /**
   * She wrote in with a time held but unpaid. Hand her the same payment page again — never a new
   * calendar, which would let her hold a second slot while the first is still waiting on her.
   */
  async function resendPaymentLink({ guru, devotee, booking }) {
    const W = wordsFor(guru.language);
    const say = speak(guru, devotee, booking.id);
    await say.link(W.stillToPay({ slotId: booking.slotId, dakshina: formatRupees(booking.dakshina_paise ?? guru.dakshina_paise) }), W.payTheDakshina, payLink(booking, guru));
  }

  /** She wrote in just after her session. Say we heard her, and leave it for the team to answer. */
  async function sendHeardAfterSession({ guru, devotee, booking }) {
    await speak(guru, devotee, booking.id).text(wordsFor(guru.language).heardAfterSession({ guruName: guru.name }));
  }

  async function sendNewTime({ guru, devotee, booking }) {
    const W = wordsFor(guru.language);
    await speak(guru, devotee, booking.id).link(W.moved({ guruName: guru.name, slotId: booking.slotId }), W.seeBooking, bookingLink(booking, guru));
  }

  /** `how` is cancellations.js's answer: online (Razorpay returns it), byHand, credit, or none. */
  async function sendCancelledNote({ guru, devotee, booking, amountPaise, how = 'online' }) {
    const W = wordsFor(guru.language);
    const words = how === 'byHand' ? W.cancelledByHand : how === 'credit' ? W.cancelledCredit : how === 'none' ? W.cancelledFree : W.cancelled;
    await speak(guru, devotee, booking.id).text(words({ guruName: guru.name, slotId: booking.slotId, dakshina: formatRupees(amountPaise) }));
  }

  async function sendRefundNote({ guru, devotee, booking, amountPaise, viaCredit = false, byHand = false }) {
    const W = wordsFor(guru.language);
    const words = viaCredit ? W.refundedAsCredit : byHand ? W.refundedByHand : W.refunded;
    await speak(guru, devotee, booking.id).text(words({ guruName: guru.name, slotId: booking.slotId, dakshina: formatRupees(amountPaise) }));
  }

  /**
   * A note from the team while she waits. Lands in her waiting room if she has it open, otherwise
   * on WhatsApp. Never throws: the result says where it landed, or that it could not be delivered.
   * @returns {{ landed: 'room' | 'whatsapp' | 'failed', reason?: string, at: string }}
   */
  async function sendWaitingMessage({ guru, devotee, booking, text }) {
    const at = new Date().toISOString();
    let result;
    if (presenceFor(booking.id).devoteeSince) {
      emitToSession(booking.id, 'waiting.message', { text, at, from: 'team' });
      result = { landed: 'room', at };
    } else {
      try {
        await wa.text(devotee.phone, text);
        result = { landed: 'whatsapp', at };
      } catch (err) {
        if (!(err instanceof ProviderError)) throw err;
        result = { landed: 'failed', reason: err.message, at };
      }
    }
    await logMessage({ guruId: guru.id, devoteeId: devotee.id, bookingId: booking.id, direction: 'out', kind: 'waiting.message', payload: { text, from: 'team', ...result } });
    return result;
  }

  /**
   * Her own words, written from the waiting room. Recorded like everything else she sends, and
   * pushed into the booking's room so the console's waiting panel shows it without waiting for
   * its next poll. Nothing is sent to WhatsApp: she is looking at the screen she wrote it on.
   * @returns {string} when it was written, so her screen can show it in order
   */
  async function receiveWaitingMessage({ guru, devotee, booking, text }) {
    const at = new Date().toISOString();
    await logMessage({
      guruId: guru.id, devoteeId: devotee.id, bookingId: booking.id, direction: 'in',
      kind: 'waiting.message', payload: { text, from: 'devotee', at },
    });
    emitToSession(booking.id, 'waiting.message', { text, at, from: 'devotee' });
    return at;
  }

  /**
   * Her waiting room lives on his own site (CLAUDE.md: guruji.com/join/:bookingId). JOIN_LINK_BASE
   * overrides it while the pilot runs behind ngrok or on localhost, where his domain resolves nowhere.
   */
  function joinLink(booking, guru) {
    return `${linkBase(guru)}/join/${booking.id}`;
  }

  /** Our own payment page, on the same origin as her join link. */
  function payLink(booking, guru) {
    return `${linkBase(guru)}/pay/${booking.id}`;
  }

  /** Her booking on his website: the details, and the moves she may make. */
  function bookingLink(booking, guru) {
    const ownDomain = !env.JOIN_LINK_BASE && guru?.domain;
    return ownDomain ? `https://${guru.domain}/booked/${booking.id}` : `${linkBase(guru)}/s/${guru.slug}/booked/${booking.id}`;
  }

  function linkBase(guru) {
    return env.JOIN_LINK_BASE || (guru?.domain ? `https://${guru.domain}` : env.APP_BASE_URL);
  }

  return { speak, startPayment, sendConfirmation, sendPaidTooLateNote, resendPaymentLink, sendHeardAfterSession, sendNewTime, sendCancelledNote, sendRefundNote, sendWaitingMessage, receiveWaitingMessage, joinLink, payLink, bookingLink, bookPaidOutside, tellGuru, copy, wordsFor };
}

/** Pure. True when the time begins within the ten-minute reminder window, or has begun and can still be joined. */
export function startsWithin(booking, now = new Date()) {
  const minutesAway = (slotIdToInstant(booking.slotId) - now) / 60000;
  return minutesAway <= SOON_MINUTES && minutesAway > -JOIN_CLOSES_MINUTES;
}
