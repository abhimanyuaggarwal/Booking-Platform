import { FormEvent, useState } from 'react';
import { api } from './api';
import SlotPicker from './SlotPicker';
import { useWords } from './lang';
import type { BookingRow, Source } from './types';

// She rang, or walked in. The team books the time; she pays the link on WhatsApp, or the team
// already has the dakshina in hand and the time is confirmed at once. Opens over any screen, with
// the slot already chosen when she came from an open slot.
export default function BookForCaller({ guruSlug, initialSlotId, onDone, onCancel }: {
  guruSlug: string; initialSlotId?: string; onDone: (b: BookingRow) => void; onCancel: () => void;
}) {
  const W = useWords();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [forWhom, setForWhom] = useState('');
  const [slotId, setSlotId] = useState(initialSlotId ?? '');
  const [source, setSource] = useState<Source>('direct');
  const [question, setQuestion] = useState('');
  const [pays, setPays] = useState<'link' | 'cash' | 'upi'>('link');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onDone(await api<BookingRow>('/bookings', { method: 'POST', json: { phone, name, forWhom, slotId, source, question, paidOutside: pays === 'link' ? '' : pays } }));
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="sheet" onSubmit={submit} aria-label={W.booking.title}>
        <header className="sheet-head">
          <h2>{W.booking.title}</h2>
          <button type="button" className="quiet" onClick={onCancel}>{W.booking.close}</button>
        </header>
        <div className="fields">
          <label>{W.booking.phone}<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="91 98765 43210" inputMode="tel" required autoFocus /></label>
          <div className="two">
            <label>{W.booking.name}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>{W.booking.forWhom}<input value={forWhom} onChange={(e) => setForWhom(e.target.value)} /></label>
          </div>
          <div className="two">
            <label>{W.booking.time}<SlotPicker guruSlug={guruSlug} value={slotId} onChange={setSlotId} /></label>
            <label>{W.booking.heard}
              <select value={source} onChange={(e) => setSource(e.target.value as Source)}>
                {(['direct', 'live', 'ashram', 'poster'] as const).map((s) => <option key={s} value={s}>{W.booking.sources[s]}</option>)}
              </select>
            </label>
          </div>
          <label>{W.booking.question}<input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} /></label>
          <label>{W.booking.pays}
            <select value={pays} onChange={(e) => setPays(e.target.value as 'link' | 'cash' | 'upi')}>
              <option value="link">{W.booking.payLink}</option>
              <option value="cash">{W.booking.cash}</option>
              <option value="upi">{W.booking.upi}</option>
            </select>
          </label>
        </div>
        <p className="muted">{pays === 'link' ? W.booking.hintLink : W.booking.hintPaid}</p>
        {problem && <p className="banner problem">{problem}</p>}
        <footer className="sheet-foot">
          <button type="button" className="quiet" onClick={onCancel}>{W.booking.cancel}</button>
          <button className="primary" disabled={busy || !slotId}>{busy ? W.booking.busy : pays === 'link' ? W.booking.submitLink : W.booking.submitPaid}</button>
        </footer>
      </form>
    </div>
  );
}
