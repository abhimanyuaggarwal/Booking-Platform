// A payment we never heard about. Razorpay's webhook is retried, but not for ever, and a laptop
// that sleeps or a tunnel that drops loses it for good (the 18 September message). Without this,
// there is no ledger row and Needs attention tells the team she did not finish paying, when she did.
// Once an hour: every link we made that has no payment against it is asked about directly.

import * as bookings from './bookings.js';
import { settlePaidLink } from './paid-link.js';
import { ProviderError } from './errors.js';

/**
 * Pure. The payment that actually went through on a fetched link, or null if none did.
 * Razorpay lists every attempt on the link; only a captured one is money we hold.
 */
export function capturedPayment(link) {
  if (!link || link.status !== 'paid') return null;
  return link.payments?.find((p) => p.status === 'captured') ?? null;
}

/**
 * @returns {{ asked: number, settled: number, failed: number }}
 */
export async function reconcilePayments({ pay, conversation }) {
  const links = await bookings.unreconciledPaymentLinks();
  const result = { asked: links.length, settled: 0, failed: 0 };
  for (const row of links) {
    let link;
    try {
      link = await pay.getPaymentLink(row.payment_link_id);
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      result.failed += 1;
      console.error(err.message); // the next hour asks again
      continue;
    }
    const payment = capturedPayment(link);
    if (!payment) continue;
    await settlePaidLink({ paymentLinkId: row.payment_link_id, providerRef: payment.id, amountPaise: payment.amountPaise, conversation });
    result.settled += 1;
  }
  return result;
}
