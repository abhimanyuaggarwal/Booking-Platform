import { FormEvent, useState } from 'react';
import { api } from './api';
import SlotPicker from './SlotPicker';
import type { BookingRow, Source } from './types';

// She rang instead of tapping. The team holds the time; the pay link goes to her WhatsApp.
// Opens over any screen, with the slot already chosen when she came from an open slot.
export default function BookForCaller({ guruSlug, initialSlotId, onDone, onCancel }: {
  guruSlug: string; initialSlotId?: string; onDone: (b: BookingRow) => void; onCancel: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [forWhom, setForWhom] = useState('');
  const [slotId, setSlotId] = useState(initialSlotId ?? '');
  const [source, setSource] = useState<Source>('direct');
  const [question, setQuestion] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onDone(await api<BookingRow>('/bookings', { method: 'POST', json: { phone, name, forWhom, slotId, source, question } }));
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="sheet" onSubmit={submit} aria-label="Book for a caller">
        <header className="sheet-head">
          <h2>Book for a caller</h2>
          <button type="button" className="quiet" onClick={onCancel}>Close</button>
        </header>
        <div className="fields">
          <label>Her WhatsApp number, with country code<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="91 98765 43210" inputMode="tel" required autoFocus /></label>
          <div className="two">
            <label>Her name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>For whom, if not her<input value={forWhom} onChange={(e) => setForWhom(e.target.value)} placeholder="for my mother" /></label>
          </div>
          <div className="two">
            <label>Time<SlotPicker guruSlug={guruSlug} value={slotId} onChange={setSlotId} /></label>
            <label>How she heard
              <select value={source} onChange={(e) => setSource(e.target.value as Source)}>
                <option value="direct">Called or messaged directly</option>
                <option value="live">From a live</option>
                <option value="ashram">At the ashram</option>
                <option value="poster">Saw a poster</option>
              </select>
            </label>
          </div>
          <label>What she wants to ask, if she said<input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} /></label>
        </div>
        <p className="muted">The time is held for ten minutes and she gets a Pay button on WhatsApp. Once she pays, it is confirmed like any other booking.</p>
        {problem && <p className="banner problem">{problem}</p>}
        <footer className="sheet-foot">
          <button type="button" className="quiet" onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={busy || !slotId}>{busy ? 'Holding the time' : 'Hold the time and send the pay link'}</button>
        </footer>
      </form>
    </div>
  );
}
