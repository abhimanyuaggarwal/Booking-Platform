import { useEffect, useState } from 'react';
import { api } from './api';
import { addDays, todayYmd } from './format';
import type { CloseDayPreview, CloseDayResult } from './types';

// Guruji is travelling: pick the day, see who is booked and the nearest time for each, move them all.
export default function CloseDay({ onDone, onCancel }: { onDone: (r: CloseDayResult) => void; onCancel: () => void }) {
  const [date, setDate] = useState(addDays(todayYmd(), 1));
  const [preview, setPreview] = useState<CloseDayPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setPreview(null);
    setProblem(null);
    api<CloseDayPreview>(`/days/${date}/close`)
      .then((p) => { if (!live) return; setPreview(p); setChoices(Object.fromEntries(p.bookings.map((b) => [b.id, b.suggestedSlotId ?? '']))); })
      .catch((err: Error) => { if (live) setProblem(err.message); });
    return () => { live = false; };
  }, [date]);

  async function apply() {
    if (!preview) return;
    const moves = preview.bookings.filter((b) => choices[b.id]).map((b) => ({ bookingId: b.id, slotId: choices[b.id] }));
    const unmoved = preview.bookings.length - moves.length;
    const warning = unmoved > 0 ? ` ${unmoved} of them ${unmoved === 1 ? 'has' : 'have'} no new time chosen and will stay booked on a closed day.` : '';
    if (!window.confirm(`Close ${preview.dateLabel}, move ${moves.length} ${moves.length === 1 ? 'person' : 'people'} and tell them on WhatsApp?${warning}`)) return;
    setBusy(true);
    setProblem(null);
    try {
      onDone(await api<CloseDayResult>(`/days/${date}/close`, { method: 'POST', json: { moves } }));
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <h2>Close a day <i>guruji is travelling</i></h2>
      <div className="row">
        <label>Which day<input type="date" value={date} min={todayYmd()} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {problem && <p className="problem">{problem}</p>}
      {!preview && !problem && <p className="muted">Looking at that day.</p>}
      {preview && <CloseDayPreviewView preview={preview} choices={choices} onChoose={(id, slotId) => setChoices({ ...choices, [id]: slotId })} />}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={busy || !preview} onClick={apply}>
          {preview && preview.bookings.length > 0 ? `Move ${preview.bookings.filter((b) => choices[b.id]).length} and tell them` : 'Close the day'}
        </button>
        <button className="quiet" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

export function CloseDayPreviewView({ preview, choices, onChoose }: { preview: CloseDayPreview; choices: Record<string, string>; onChoose: (id: string, slotId: string) => void }) {
  const n = preview.bookings.length;
  return (
    <>
      <p>
        <b>{preview.dateLabel}.</b>{' '}
        {n === 0 ? 'Nobody is booked. ' : `${n === 1 ? 'One session is' : `${n} sessions are`} booked. These are the nearest times that suit each of them. `}
        {preview.heldCount > 0 && `${preview.heldCount} unpaid ${preview.heldCount === 1 ? 'hold goes' : 'holds go'} back on the shelf.`}
      </p>
      {n > 0 && (
        <table>
          <tbody>
            {preview.bookings.map((b) => (
              <tr key={b.id}>
                <td><b>{b.name}</b> <span className="muted">· {b.time}</span></td>
                <td>→</td>
                <td>
                  <select value={choices[b.id] ?? ''} onChange={(e) => onChoose(b.id, e.target.value)}>
                    <option value="">Leave for now</option>
                    {preview.alternatives.map((a) => <option key={a.slotId} value={a.slotId}>{a.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted" style={{ marginBottom: 0 }}>Each one gets a fresh confirmation on WhatsApp with the new time. Nobody is called, and the dakshina moves with the booking.</p>
    </>
  );
}
