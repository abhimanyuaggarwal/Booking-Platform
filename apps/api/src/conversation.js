// Everything we say to a devotee on WhatsApp, and the two steps it drives: hold a slot and send the
// pay link; confirm and send the join link. The WhatsApp door, the console, and later his website
// all speak through here, so the words are the same wherever a booking comes from.
// Copy rules (CLAUDE.md): "dakshina", "time", plain sentences, no exclamation marks.

import { describeSlot, formatRupees } from '@expert-sessions/shared';
import * as bookings from './bookings.js';
import * as whatsapp from './whatsapp.js';
import * as razorpay from './razorpay.js';
import { logMessage } from './messages-log.js';
import { emitToSession, presenceFor } from './realtime.js';
import { ProviderError, BookingRuleError } from './errors.js';

export const copy = {
  held: ({ guruName, slotId, dakshina }) =>
    `${describeSlot(slotId)} with ${guruName}.\nDakshina ${dakshina}.\n\nThis time is held for you for ${bookings.HOLD_MINUTES} minutes.`,
  confirmed: ({ guruName, slotId }) =>
    `Your time is confirmed.\n${describeSlot(slotId)} with ${guruName}.\n\nOpen this link at your time to join.`,
  askQuestion: ({ guruName }) =>
    `If you wish, tell ${guruName} what you seek guidance on — type it here, or send a voice note. Only he will hear it.`,
  moved: ({ guruName, slotId }) =>
    `Your time with ${guruName} has moved to ${describeSlot(slotId)}. Your dakshina moves with it.\n\nOpen this link at your new time to join.`,
  refunded: ({ guruName, slotId, dakshina }) =>
    `${guruName} could not sit at ${describeSlot(slotId)}. Your dakshina of ${dakshina} is on its way back to you and reaches you within a week.`,
  cancelled: ({ guruName, slotId, dakshina }) =>
    `Your time with ${guruName} on ${describeSlot(slotId)} is cancelled. Your dakshina of ${dakshina} is kept as a credit for thirty days — book any other time with it.`,
  paidTooLate: ({ guruName, slotId, dakshina }) =>
    `Your dakshina of ${dakshina} reached us, but the time you chose — ${describeSlot(slotId)} — was released before it arrived, so nothing is booked.\n\n${guruName}'s team will return your dakshina within a week, or find you another time. They will message you.`,
  // She wrote in while a time is still held and unpaid. She is stuck on paying, not shopping for
  // times — giving her the calendar here invites her to hold a second slot she also will not pay for.
  stillToPay: ({ slotId, dakshina }) =>
    `Your time is still held — ${describeSlot(slotId)}.\n\nThe dakshina is ${dakshina}. Open this to pay, and the time is yours.`,
  // She wrote in just after sitting with him. Whatever she said, a booking calendar is the wrong answer.
  heardAfterSession: ({ guruName }) =>
    `Thank you. ${guruName}'s team will read this.\n\nIf you would like another time, send Hi and they will be offered.`,
  noTimes: ({ guruName }) =>
    `Namaste 🙏 ${guruName} has no open times this week. Please send Hi again in a few days.`,
  slotTaken: () => 'That time was just taken. Here are the next ones:',
  guruNow: ({ devoteeName, time, question }) =>
    `${devoteeName} is booked for ${time}.${question ? `\n\nShe wishes to speak about: ${question}` : ''}\n\nYour team sent this note.`,
  paymentUnavailable: () => 'The payment page could not be opened just now, so nothing is booked. Please send Hi again in a few minutes, or write to his team.',
  refundedAsCredit: ({ guruName, slotId, dakshina }) =>
    `${guruName} could not sit at ${describeSlot(slotId)}. Your dakshina of ${dakshina} is back in your credit — book any other time with it within thirty days.`,
};

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
  async function startPayment({ guru, devotee, slotId, source, notify = true, team = false }) {
    await bookings.assertBookable(guru, slotId, { team }); // BookingRuleError carries the sentence
    const booking = await bookings.holdSlot({ guruId: guru.id, devoteeId: devotee.id, slotId, source });
    if (!booking) return null;
    const dakshina = formatRupees(guru.dakshina_paise);
    let order;
    try {
      order = await pay.createOrder({
        amountPaise: guru.dakshina_paise,
        receipt: booking.id,
        notes: { booking_id: booking.id, guru: guru.slug, time: describeSlot(slotId) },
      });
    } catch (err) {
      await bookings.expireHold(booking.id); // an outage never blocks a slot
      throw err;
    }
    await bookings.attachPaymentLink(booking.id, order.id); // the column holds the order id now
    const payUrl = payLink(booking, guru);
    if (notify) await speak(guru, devotee, booking.id).link(copy.held({ guruName: guru.name, slotId, dakshina }), `Pay ${dakshina}`, payUrl);
    return { ...booking, payUrl };
  }

  /**
   * The team took the dakshina by hand and books the time on her behalf: held and confirmed in one
   * go, no Razorpay, and she gets the same confirmation and join link as anyone who paid online.
   * Returns null if the slot was taken.
   */
  async function bookPaidOutside({ guru, devotee, slotId, source, method }) {
    await bookings.assertBookable(guru, slotId, { team: true });
    const held = await bookings.holdSlot({ guruId: guru.id, devoteeId: devotee.id, slotId, source });
    if (!held) return null;
    const booking = await bookings.confirmOffline({ bookingId: held.id, method, amountPaise: guru.dakshina_paise });
    await sendConfirmation({ guru, devotee, booking });
    return booking;
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

  async function sendConfirmation({ guru, devotee, booking }) {
    const say = speak(guru, devotee, booking.id);
    await say.link(copy.confirmed({ guruName: guru.name, slotId: booking.slotId }), 'Join session', joinLink(booking, guru));
    await say.text(copy.askQuestion({ guruName: guru.name }));
  }

  /** She paid after the hold ran out. Say so plainly: nothing is booked, and the team will settle it. */
  async function sendPaidTooLateNote({ guru, devotee, booking, amountPaise }) {
    await speak(guru, devotee, booking.id).text(copy.paidTooLate({ guruName: guru.name, slotId: booking.slotId, dakshina: formatRupees(amountPaise) }));
  }

  /**
   * She wrote in with a time held but unpaid. Hand her the same payment page again — never a new
   * calendar, which would let her hold a second slot while the first is still waiting on her.
   */
  async function resendPaymentLink({ guru, devotee, booking }) {
    const say = speak(guru, devotee, booking.id);
    await say.link(copy.stillToPay({ slotId: booking.slotId, dakshina: formatRupees(guru.dakshina_paise) }), 'Pay the dakshina', payLink(booking, guru));
  }

  /** She wrote in just after her session. Say we heard her, and leave it for the team to answer. */
  async function sendHeardAfterSession({ guru, devotee, booking }) {
    await speak(guru, devotee, booking.id).text(copy.heardAfterSession({ guruName: guru.name }));
  }

  async function sendNewTime({ guru, devotee, booking }) {
    await speak(guru, devotee, booking.id).link(copy.moved({ guruName: guru.name, slotId: booking.slotId }), 'Join session', joinLink(booking, guru));
  }

  async function sendCancelledNote({ guru, devotee, booking, amountPaise }) {
    await speak(guru, devotee, booking.id).text(copy.cancelled({ guruName: guru.name, slotId: booking.slotId, dakshina: formatRupees(amountPaise) }));
  }

  async function sendRefundNote({ guru, devotee, booking, amountPaise, viaCredit = false }) {
    const words = viaCredit ? copy.refundedAsCredit : copy.refunded;
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

  function linkBase(guru) {
    return env.JOIN_LINK_BASE || (guru?.domain ? `https://${guru.domain}` : env.APP_BASE_URL);
  }

  return { speak, startPayment, sendConfirmation, sendPaidTooLateNote, resendPaymentLink, sendHeardAfterSession, sendNewTime, sendCancelledNote, sendRefundNote, sendWaitingMessage, receiveWaitingMessage, joinLink, payLink, bookPaidOutside, tellGuru, copy };
}
