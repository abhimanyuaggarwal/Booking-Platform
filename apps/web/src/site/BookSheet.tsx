import { useEscape } from './useEscape';
import { FormEvent, useState } from 'react';
import { formatRupees } from '@expert-sessions/shared';
import { siteApi } from './api';
import type { HeldBooking, PublicGuru, PublicSessionType, PublicSlot } from './types';

// A short sheet, not a new page: the time, the dakshina, and her WhatsApp number.
// Nothing to sign up for. No code before paying — the payment is the proof of intent.
export default function BookSheet({ slot, type, guru, call, base, onClose }: {
  slot: PublicSlot; type?: PublicSessionType | null; guru: PublicGuru; call: ReturnType<typeof siteApi>; base: string; onClose: () => void;
}) {
  useEscape(onClose);
  const minutes = type?.minutes ?? guru.slotMinutes;
  const dakshinaPaise = type?.dakshinaPaise ?? guru.dakshinaPaise;
  const [phone, setPhone] = useState('');
  const [question, setQuestion] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const held = await call<HeldBooking>('/hold', { method: 'POST', json: { phone, slotId: slot.id, typeId: type?.id, question: question.trim() || undefined } });
      // Razorpay hands off to Google Pay or PhonePe and comes back to /booked/:id.
      window.sessionStorage.setItem('es_last_booking', `${base}/booked/${held.bookingId}`);
      window.location.assign(held.payUrl);
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="sheet" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Book this time">
        <div className="grab" />
        <BookSheetBody slot={slot} guru={guru} minutes={minutes} dakshinaPaise={dakshinaPaise} />
        <div className="field">
          <label htmlFor="phone">Your WhatsApp number</label>
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91 98765 43210" autoFocus required />
        </div>
        <p className="muted" style={{ fontSize: 14 }}>Your confirmation and the join link come to this number on WhatsApp.</p>
        <div className="field">
          <label htmlFor="question">What you wish to speak about <span className="muted">(optional)</span></label>
          <input id="question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder="One line is enough. Only he will read it." />
        </div>
        {problem && <p className="problem">{problem}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Opening the payment page' : `Pay ${formatRupees(dakshinaPaise)} and confirm`}</button>
        <p className="held">The payment page holds this time for ten minutes. Once you pay, it is yours.</p>
        <button type="button" className="ghost" onClick={onClose}>Choose another time</button>
      </form>
    </div>
  );
}

export function BookSheetBody({ slot, guru, minutes, dakshinaPaise }: { slot: PublicSlot; guru: PublicGuru; minutes?: number; dakshinaPaise?: number }) {
  return (
    <>
      <h2>{slot.when}</h2>
      <p className="muted">{minutes ?? guru.slotMinutes} minutes with {guru.name} · dakshina {formatRupees(dakshinaPaise ?? guru.dakshinaPaise)}</p>
    </>
  );
}
