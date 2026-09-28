import { useState } from 'react';
import TimeChooser from './TimeChooser';
import type { PublicSlot } from './types';

// The same sheet for moving a time and for spending a credit: pick one of his open times.
export default function PickTime({ title, note, slots, confirmLabel, onConfirm, onCancel }: {
  title: string; note: string; slots: PublicSlot[]; confirmLabel: string;
  onConfirm: (slotId: string) => void | Promise<void>; onCancel: () => void;
}) {
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const chosenSlot = slots.find((s) => s.id === chosen) ?? null;

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="sheet">
        <div className="grab" />
        <h2>{title}</h2>
        <p className="muted">{note}</p>
        {slots.length === 0 && <p className="muted">He has no open times just now. Please write to his team on WhatsApp.</p>}
        <TimeChooser slots={slots} chosen={chosen} onChoose={(s) => setChosen(s.id)} />
        <p className="picked">{chosenSlot ? chosenSlot.when : slots.length > 0 ? 'Choose a time above.' : ''}</p>
        <button className="primary" disabled={!chosen || busy} onClick={async () => { setBusy(true); await onConfirm(chosen); setBusy(false); }}>{confirmLabel}</button>
        <button className="ghost" onClick={onCancel}>Not now</button>
      </div>
    </div>
  );
}
