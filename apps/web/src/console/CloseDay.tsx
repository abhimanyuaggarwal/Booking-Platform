import { useEffect, useState } from 'react';
import { api } from './api';
import { addDays, todayYmd } from './format';
import { useWords } from './lang';
import { useConfirm } from './Confirm';
import { Initials } from './words';
import type { CloseDayPreview, CloseDayResult } from './types';

// Guruji cannot sit: pick the day, see who is booked and the nearest time for each, move them all.
// From Today the day is today; from Week it is any day ahead.
export default function CloseDay({ initialDate, onDone, onCancel }: { initialDate?: string; onDone: (r: CloseDayResult) => void; onCancel: () => void }) {
  const W = useWords();
  const confirmDialog = useConfirm();
  const [date, setDate] = useState(initialDate ?? addDays(todayYmd(), 1));
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
    if (!await confirmDialog(W.closeDay.confirm(preview.dateLabel, moves.length, unmoved), W.dialog.closeDay, true)) return;
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
    <section className="panel closeday">
      <h2>{W.closeDay.title} <i>{W.closeDay.sub}</i></h2>
      <div className="row">
        <label>{W.closeDay.whichDay}<input type="date" value={date} min={todayYmd()} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {problem && <p className="problem">{problem}</p>}
      {!preview && !problem && <p className="muted">{W.closeDay.looking}</p>}
      {preview && <CloseDayPreviewView preview={preview} choices={choices} onChoose={(id, slotId) => setChoices({ ...choices, [id]: slotId })} />}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={busy || !preview} onClick={apply}>
          {preview && preview.bookings.length > 0 ? W.closeDay.moveAndTell(preview.bookings.filter((b) => choices[b.id]).length) : W.closeDay.closeTheDay}
        </button>
        <button className="quiet" onClick={onCancel}>{W.closeDay.cancel}</button>
      </div>
    </section>
  );
}

export function CloseDayPreviewView({ preview, choices, onChoose }: { preview: CloseDayPreview; choices: Record<string, string>; onChoose: (id: string, slotId: string) => void }) {
  const W = useWords();
  const n = preview.bookings.length;
  return (
    <>
      <p>
        <b>{preview.dateLabel}.</b>{' '}
        {n === 0 ? W.closeDay.nobody : W.closeDay.booked(n)}{' '}
        {preview.heldCount > 0 && W.closeDay.holds(preview.heldCount)}
      </p>
      {n > 0 && (
        <table>
          <tbody>
            {preview.bookings.map((b) => (
              <tr key={b.id}>
                <td className="person-cell"><Initials name={b.name} size="s" /><span><b>{b.name}</b> <span className="muted">· {b.time}</span></span></td>
                <td>→</td>
                <td>
                  <select value={choices[b.id] ?? ''} onChange={(e) => onChoose(b.id, e.target.value)}>
                    <option value="">{W.closeDay.leave}</option>
                    {preview.alternatives.map((a) => <option key={a.slotId} value={a.slotId}>{a.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted" style={{ marginBottom: 0 }}>{W.closeDay.note}</p>
    </>
  );
}
