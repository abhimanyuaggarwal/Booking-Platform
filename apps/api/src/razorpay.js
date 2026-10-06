// Razorpay. Since 2026-09-28 a booking is paid through an Order and Razorpay Checkout on our own
// page (/pay/:bookingId), because test mode allows thirty Payment Links per account for ever and
// the pilot account used them. Razorpay tells us she paid twice over: the `order.paid` webhook and
// the signed result Checkout hands the page. Payment Links stay readable for the bookings made
// before the switch. Docs: https://razorpay.com/docs/api/orders/ and /docs/payments/payment-gateway/web-integration/standard/

import axios from 'axios';
import crypto from 'node:crypto';
import { ProviderError } from './errors.js';
import { decrypt, secretsKey } from './secrets.js';

/**
 * The client for one guru: his own keys when his account is connected (decrypted here, never
 * returned), otherwise the platform's keys from .env. Every money call goes through this.
 */
export function clientFor(guru, env) {
  if (guru?.razorpay_key_id && guru.razorpay_secret_enc) {
    return client({ RAZORPAY_KEY_ID: guru.razorpay_key_id, RAZORPAY_KEY_SECRET: decrypt(guru.razorpay_secret_enc, secretsKey(env)) });
  }
  return client(env);
}

/** The webhook secret Razorpay signs this guru's deliveries with: his own, or the platform's. */
export function webhookSecretFor(guru, env) {
  if (guru?.razorpay_webhook_secret_enc) return decrypt(guru.razorpay_webhook_secret_enc, secretsKey(env));
  return env.RAZORPAY_WEBHOOK_SECRET;
}

export function client(env) {
  const auth = { username: env.RAZORPAY_KEY_ID, password: env.RAZORPAY_KEY_SECRET };

  return {
    keyId: env.RAZORPAY_KEY_ID,

    /** Do these keys open the account? One cheap read; a wrong secret answers 401. */
    async verifyKeys() {
      try {
        await axios.get('https://api.razorpay.com/v1/orders?count=1', { auth });
        return true;
      } catch (err) {
        if (err.response?.status === 401) return false;
        const detail = err.response ? JSON.stringify(err.response.data) : err.message;
        throw new ProviderError(`Razorpay could not be reached to check the keys: ${detail}`);
      }
    },

    /**
     * One order per hold; Checkout on /pay/:bookingId collects against it.
     * @returns {{id: string}}
     */
    async createOrder({ amountPaise, receipt, notes = {} }) {
      try {
        const res = await axios.post('https://api.razorpay.com/v1/orders', {
          amount: amountPaise, currency: 'INR', receipt, notes,
        }, { auth });
        return { id: res.data.id };
      } catch (err) {
        const detail = err.response ? JSON.stringify(err.response.data) : err.message;
        throw new ProviderError(`Razorpay order failed for booking ${receipt}: ${detail}`);
      }
    },

    /**
     * What Razorpay holds against a reference we stored: an order (order_…) or an older payment link
     * (plink_…). Same shape either way, so reconciliation and the pay page do not care which.
     * @returns {{status: string, payments: {id: string, status: string, amountPaise: number}[], url: string|null}}
     */
    async findPayments(ref) {
      if (!String(ref).startsWith('order_')) return this.getPaymentLink(ref);
      try {
        const [order, list] = await Promise.all([
          axios.get(`https://api.razorpay.com/v1/orders/${ref}`, { auth }),
          axios.get(`https://api.razorpay.com/v1/orders/${ref}/payments`, { auth }),
        ]);
        return {
          status: order.data.status,   // created | attempted | paid
          payments: (list.data.items ?? []).map((p) => ({ id: p.id, status: p.status, amountPaise: p.amount })),
          url: null,
        };
      } catch (err) {
        const detail = err.response ? JSON.stringify(err.response.data) : err.message;
        throw new ProviderError(`Razorpay could not find order ${ref}: ${detail}`);
      }
    },

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
    async refundPayment({ paymentId, amountPaise, bookingId, reason = 'guruji could not sit' }) {
      try {
        const res = await axios.post(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
          amount: amountPaise,
          speed: 'normal',
          notes: { booking_id: bookingId, reason },
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

/**
 * Checkout hands the page an order id, a payment id and a signature: HMAC-SHA256 of
 * "order_id|payment_id" with the key secret. Only a matching triple confirms a booking from the
 * browser; the webhook confirms it independently anyway.
 */
export function isValidCheckout({ orderId, paymentId, signature }, keySecret) {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex'));
  const given = Buffer.from(String(signature));
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, given);
}
