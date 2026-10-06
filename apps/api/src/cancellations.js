// A cancelled time gives the dakshina back (policy of 6 October 2026: no credits held against the
// devotee). Whoever presses the button — she on WhatsApp or the website, or the team in the console —
// the money moves the same way: Razorpay returns what Razorpay collected, the team hands back what it
// took by hand, a credit goes back to being a credit, and a complimentary sitting has nothing to
// return. The ledger row says which, and the words to her say when it reaches her.

import * as bookings from './bookings.js';

export const REFUND_DAYS = '5 to 7 working days';

/**
 * @param {{booking: object, pay: {refundPayment: Function}, reason?: string}} args
 * @returns {Promise<{booking: object, amountPaise: number, how: 'online'|'byHand'|'credit'|'none'}>}
 */
export async function cancelAndRefund({ booking, pay, reason = 'cancelled by the devotee' }) {
  bookings.transition(booking.status, 'cancel');         // throws BookingRuleError before any money moves
  const paid = await bookings.paymentFor(booking.id);
  const how = !paid || paid.amount_paise === 0 ? 'none'
    : paid.kind === 'credit_used' ? 'credit'
    : String(paid.provider_ref ?? '').startsWith('offline:') ? 'byHand' : 'online';
  if (how === 'credit') {
    const { booking: cancelled, creditPaise } = await bookings.cancelToCredit({ bookingId: booking.id });
    return { booking: cancelled, amountPaise: creditPaise, how };
  }
  let providerRef = null;
  if (how === 'online') providerRef = (await pay.refundPayment({ paymentId: paid.provider_ref, amountPaise: paid.amount_paise, bookingId: booking.id, reason })).id;
  if (how === 'byHand') providerRef = `offline:refund:${booking.id}`;
  const { booking: cancelled, amountPaise } = await bookings.cancelWithRefund({ bookingId: booking.id, providerRef });
  return { booking: cancelled, amountPaise, how };
}
