// Razorpay said a payment link was paid. Whether that news arrives by webhook (whatsapp-door.js)
// or is fetched an hour later because the webhook never came (reconcile.js), the same thing must
// happen: the booking confirms if its hold still stands, the money is recorded either way, and she
// is told the truth about which of the two it was.

import { formatRupees } from '@expert-sessions/shared';
import * as bookings from './bookings.js';
import * as gurus from './gurus.js';
import * as devotees from './devotees.js';

/**
 * @returns {'confirmed' | 'too_late' | 'unknown_link'} what happened, for the caller's log
 */
export async function settlePaidLink({ paymentLinkId, providerRef, amountPaise, conversation }) {
  const booking = await bookings.confirmByPayment({ paymentLinkId, providerRef, amountPaise });
  if (!booking) {
    console.error(`Paid link ${paymentLinkId} matches no booking`);
    return 'unknown_link';
  }
  const guru = await gurus.findGuruById(booking.guru_id);
  const devotee = await devotees.findDevoteeById(booking.devotee_id);
  // confirmByPayment does not revive an expired hold: it records the money and hands the booking
  // back unchanged. Never tell her a time is confirmed without checking.
  if (booking.status !== 'confirmed') {
    await conversation.sendPaidTooLateNote({ guru, devotee, booking, amountPaise });
    console.error(`Paid link ${paymentLinkId} arrived after the hold expired; ${formatRupees(amountPaise)} recorded against booking ${booking.id} for the team to settle`);
    return 'too_late';
  }
  await conversation.sendConfirmation({ guru, devotee, booking });
  return 'confirmed';
}
