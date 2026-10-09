// Her payment page, /pay/:bookingId, on the same origin as her join link. The page asks what to
// collect, opens Razorpay Checkout against the booking's order, and hands back the signed result.
// The booking id is the only key, as with the join link. No tenant lookup: the booking knows its guru.

import express from 'express';
import { describeSlot, formatRupees } from '@expert-sessions/shared';
import * as bookings from './bookings.js';
import * as gurus from './gurus.js';
import * as devotees from './devotees.js';
import * as razorpay from './razorpay.js';
import { settlePaidLink } from './paid-link.js';
import { resolveGuru } from './tenancy.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function payRoutes(env, conversation) {
  const router = express.Router();

  router.get('/api/pay/:id', handle(async (req, res) => {
    const b = await find(req, res); if (!b) return;
    const guru = await gurus.findGuruById(b.guru_id);
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    // On his own domain her pages are at the root; on the platform's host they live under /s/<slug>.
    const hostGuru = await resolveGuru(req).catch(() => null);
    const amount = b.complimentary ? 0 : b.dakshina_paise;
    res.json({
      status: b.status,
      orderId: b.status === 'held' ? b.payment_link_id : null,
      keyId: razorpay.clientFor(guru, env).keyId,   // his account's key when connected, the platform's otherwise
      amountPaise: amount,
      dakshina: formatRupees(amount),
      minutes: b.minutes,
      guru: { name: guru.name, slug: guru.slug },
      siteBase: hostGuru?.id === guru.id ? '' : `/s/${guru.slug}`,
      when: describeSlot(b.slotId),
      phone: b.status === 'held' ? devotee.phone : null,   // only while she is the one paying; the id travels further than she does
      holdMinutes: bookings.HOLD_MINUTES,
    });
  }));

  // Checkout's result, from her browser. Verified with the key secret, then confirmed with Razorpay
  // itself before anything is written; the order.paid webhook does the same work independently and
  // the settlement is idempotent, so whichever arrives first wins and the other changes nothing.
  router.post('/api/pay/:id/confirm', handle(async (req, res) => {
    const b = await find(req, res); if (!b) return;
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body ?? {};
    if (orderId !== b.payment_link_id) return res.status(400).json({ error: 'This payment does not belong to this booking.' });
    const guru = await gurus.findGuruById(b.guru_id);
    const pay = razorpay.clientFor(guru, env);
    const keySecret = guru.razorpay_secret_enc ? (await import('./secrets.js')).decrypt(guru.razorpay_secret_enc, (await import('./secrets.js')).secretsKey(env)) : env.RAZORPAY_KEY_SECRET;
    if (!razorpay.isValidCheckout({ orderId, paymentId, signature }, keySecret)) {
      return res.status(400).json({ error: 'The payment could not be verified. If money left your account it is confirmed within the hour, and his team can see it.' });
    }
    const found = await pay.findPayments(orderId);
    const payment = found.payments.find((p) => p.id === paymentId && p.status === 'captured');
    if (!payment) return res.status(202).json({ status: b.status, note: 'The bank has not confirmed yet.' });
    const outcome = await settlePaidLink({ paymentLinkId: orderId, providerRef: payment.id, amountPaise: payment.amountPaise, conversation });
    const after = await bookings.findById(b.id);
    res.json({ status: after.status, outcome });
  }));

  async function find(req, res) {
    if (!UUID.test(req.params.id)) { res.status(404).json({ error: 'This payment link is not valid.' }); return null; }
    const b = await bookings.findById(req.params.id);
    if (!b) { res.status(404).json({ error: 'This payment link is not valid.' }); return null; }
    return b;
  }

  return router;
}

function handle(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}
