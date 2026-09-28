import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PayView } from './types';
import './site.css';

// Her payment page. One sentence about what she is paying for, one button that opens Razorpay's
// UPI screen against this booking's order, and the truth afterwards. The booking id is the only key,
// like the join link, so the page works from WhatsApp on any device.
const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void } } }

const NOT_OPEN: Record<string, string> = {
  expired: 'This time was not paid for within ten minutes and is no longer held. Choose a time again.',
  cancelled: 'This time was cancelled.',
  rescheduled: 'This time was moved. The newer link on your WhatsApp is the one to use.',
  refunded: 'Guruji could not sit at this time, and the dakshina was returned.',
  completed: 'This session has already taken place.',
  no_show: 'This time has passed.',
};

export default function Pay() {
  const { bookingId, guruSlug } = useParams<{ bookingId: string; guruSlug?: string }>();
  const [view, setView] = useState<PayView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'ready' | 'opening' | 'confirming' | 'paid'>('ready');
  const [note, setNote] = useState<string | null>(null);
  const base = guruSlug ? `/s/${guruSlug}` : '';

  const load = async () => {
    const res = await fetch(`/api/pay/${bookingId}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? 'This payment link is not valid.'); return null; }
    setView(body);
    return body as PayView;
  };
  useEffect(() => { load(); }, [bookingId]);

  // After Checkout reports success, the api confirms with Razorpay; if the bank is still settling,
  // the page asks again every few seconds rather than leaving her guessing.
  useEffect(() => {
    if (phase !== 'confirming') return;
    const t = setInterval(async () => { const v = await load(); if (v?.status === 'confirmed') setPhase('paid'); }, 3000);
    return () => clearInterval(t);
  }, [phase]);

  async function payNow() {
    if (!view?.orderId) return;
    setPhase('opening');
    setNote(null);
    try {
      await loadCheckout();
      const rz = new window.Razorpay!({
        key: view.keyId,
        order_id: view.orderId,
        amount: view.amountPaise,
        currency: 'INR',
        name: view.guru.name,
        description: `Dakshina · ${view.when}`,
        prefill: { contact: `+${view.phone}` },
        theme: { color: '#9C5A2C' },
        // UPI first; the dashboard decides which other methods exist at all.
        config: { display: { blocks: { upi: { name: 'Pay by UPI', instruments: [{ method: 'upi' }] } }, sequence: ['block.upi'], preferences: { show_default_blocks: true } } },
        modal: { ondismiss: () => { setPhase('ready'); setNote('Nothing was paid. This time stays held for you for a few minutes more.'); } },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          setPhase('confirming');
          const res = await fetch(`/api/pay/${bookingId}/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body.status === 'confirmed') setPhase('paid');
          else if (!res.ok) { setPhase('ready'); setNote(body.error ?? 'The payment could not be confirmed just now.'); }
        },
      });
      rz.open();
    } catch (err) {
      setPhase('ready');
      setNote((err as Error).message);
    }
  }

  if (error) return <Shell><h1>This link is not open</h1><p className="muted">{error}</p></Shell>;
  if (!view) return <Shell><p className="muted">One moment.</p></Shell>;
  if (view.status === 'confirmed' || phase === 'paid') {
    return (
      <Shell>
        <div className="tick">✓</div>
        <h1>Your time is confirmed</h1>
        <p>{view.when} with {view.guru.name}. {view.dakshina} paid.</p>
        <p className="muted">Your booking is on your WhatsApp. The join link comes there ten minutes before your time.</p>
        <Link className="primary" to={`${base}/booked/${bookingId}`}>See the details</Link>
      </Shell>
    );
  }
  if (view.status !== 'held') {
    return <Shell><h1>This link is no longer open</h1><p className="muted">{NOT_OPEN[view.status] ?? 'This payment link is no longer open.'}</p><Link className="ghost" to={`/s/${view.guru.slug}`}>Choose a time</Link></Shell>;
  }
  return (
    <Shell>
      <p className="eyebrow">Dakshina</p>
      <h1>{view.dakshina}</h1>
      <p>{view.when} with {view.guru.name}.</p>
      {phase === 'confirming'
        ? <p className="ok">Confirming with the bank. This takes a moment.</p>
        : <button className="primary" disabled={phase === 'opening'} onClick={payNow}>{phase === 'opening' ? 'Opening UPI' : `Pay ${view.dakshina} by UPI`}</button>}
      {note && <p className="muted">{note}</p>}
      <p className="held">This time is held for you for {view.holdMinutes} minutes. Nothing is booked until the dakshina is paid.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="site"><main className="wrap session pay">{children}</main></div>;
}

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CHECKOUT_SCRIPT;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('The payment screen could not be loaded. Check your connection and try again.'));
    document.head.appendChild(s);
  });
}
