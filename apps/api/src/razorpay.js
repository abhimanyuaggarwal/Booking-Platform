// Razorpay Payment Links: we create a link, send it as a WhatsApp button,
// and Razorpay calls our webhook when it is paid.
// Docs: https://razorpay.com/docs/api/payments/payment-links/

import axios from 'axios';
import crypto from 'node:crypto';
import { ProviderError } from './errors.js';

export function client(env) {
  const auth = { username: env.RAZORPAY_KEY_ID, password: env.RAZORPAY_KEY_SECRET };

  return {
    /**
     * @returns {{id: string, url: string}}
     */
    async createPaymentLink({ amountPaise, description, phone, referenceId, callbackUrl = null }) {
      try {
        const res = await axios.post('https://api.razorpay.com/v1/payment_links', {
          amount: amountPaise,
          currency: 'INR',
          description,
          reference_id: referenceId,
          customer: { contact: `+${phone}` },
          notify: { sms: false, email: false }, // we message her on WhatsApp ourselves
          reminder_enable: false,
          notes: { booking_id: referenceId },
          // Only web bookings pass this; it returns her browser to the confirmed page after UPI.
          ...(callbackUrl ? { callback_url: callbackUrl, callback_method: 'get' } : {}),
        }, { auth });
        return { id: res.data.id, url: res.data.short_url };
      } catch (err) {
        const detail = err.response ? JSON.stringify(err.response.data) : err.message;
        throw new ProviderError(`Razorpay payment link failed for booking ${referenceId}: ${detail}`);
      }
    },

    /**
     * The hosted page for a link we made earlier. We keep only the link id, so when she writes in
     * still unpaid this is how we hand her the same page again rather than a second booking.
     * @returns {{url: string, status: string}}
     */
    async getPaymentLink(id) {
      try {
        const res = await axios.get(`https://api.razorpay.com/v1/payment_links/${id}`, { auth });
        return {
          url: res.data.short_url,
          status: res.data.status,   // created | partially_paid | paid | expired | cancelled
          payments: (res.data.payments ?? []).map((p) => ({ id: p.payment_id, status: p.status, amountPaise: p.amount })),
        };
      } catch (err) {
        const detail = err.response ? JSON.stringify(err.response.data) : err.message;
        throw new ProviderError(`Razorpay could not find payment link ${id}: ${detail}`);
      }
    },

    /**
     * Return a payment in full. Razorpay processes refunds asynchronously; "in flight" for a few days.
     * @returns {{id: string, status: string}}
     */
    async refundPayment({ paymentId, amountPaise, bookingId }) {
      try {
        const res = await axios.post(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
          amount: amountPaise,
          speed: 'normal',
          notes: { booking_id: bookingId, reason: 'guruji could not sit' },
        }, { auth });
        return { id: res.data.id, status: res.data.status };
      } catch (err) {
        const detail = err.response ? JSON.stringify(err.response.data) : err.message;
        throw new ProviderError(`Razorpay refund failed for payment ${paymentId}: ${detail}. Check the keys in .env are the same mode (test/live) as the payment.`);
      }
    },
  };
}

/**
 * Razorpay signs each webhook with HMAC-SHA256 of the raw body using your webhook secret.
 * Reject anything that does not match — otherwise anyone could "confirm" a booking.
 */
export function isValidWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !rawBody) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(signatureHeader);
  // timingSafeEqual throws on different lengths; a wrong-length header is simply a bad signature.
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, given);
}
