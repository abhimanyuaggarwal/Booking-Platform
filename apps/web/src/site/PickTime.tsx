import { useState } from 'react';
import type { PublicSlot } from './types';

// The same sheet for moving a time and for spending a credit: pick one of his open times.
export default function PickTime({ title, note, slots, confirmLabel, onConfirm, onCancel }: {
  title: string; note: string; slots: PublicSlot[]; confirmLabel: string;
  onConfirm: (slotId: string) => void | Promise<void>; onCancel: () => void;
}) {
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="sheet">
        <div className="grab" />
        <h2>{title}</h2>
        <p className="muted">{note}</p>
        {slots.length === 0 && <p className="muted">He has no open times just now. Please write to his team on WhatsApp.</p>}
        {slots.map((s) => (
          <button key={s.id} className="slot" onClick={() => setChosen(s.id)} style={chosen === s.id ? { borderColor: 'var(--accent)', background: '#F7EDE3' } : undefined}>
            <b>{s.label}</b><i>{chosen === s.id ? 'chosen' : 'available'}</i>
          </button>
        ))}
        <button className="primary" disabled={!chosen || busy} onClick={async () => { setBusy(true); await onConfirm(chosen); setBusy(false); }}>{confirmLabel}</button>
        <button className="ghost" onClick={onCancel}>Not now</button>
      </div>
    </div>
  );
}
