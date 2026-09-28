import { useCallback, useState } from 'react';
import { nowInIst, toSlotId } from '@expert-sessions/shared';
import { api, useApi } from './api';
import { ordinal } from './format';
import { useOnChange } from './changed';
import { useBookForCaller, useOpenBooking } from './open-booking';
import WaitingPanel from './WaitingPanel';
import { askedAbout, ATTENTION_TONE, ATTENTION_WORDS, groupAttention, StateTag } from './words';
import type { AttentionRow, SessionRow, TodayReport } from './types';

// The operating screen, and nothing else. In her order: what needs her, with the button on the
// card; who is waiting, only when someone is; then the day's sittings with the next one marked.
// No money here — that is the end-of-week question, and it has its own screen.
export default function Today() {
  const today = useApi<TodayReport>('/today');
  const attention = useApi<AttentionRow[]>('/attention');
  const [note, setNote] = useState<string | null>(null);
  const reloadToday = today.reload;
  const reloadAttention = attention.reload;
  useOnChange(useCallback(() => { reloadToday(); reloadAttention(); }, [reloadToday, reloadAttention]));

  async function sendLink(row: AttentionRow) {
    if (!row.bookingId) return;
    try {
      await api(`/bookings/${row.bookingId}/send-link`, { method: 'POST' });
      setNote(`${row.name} has the pay link again; the time is held for ten minutes.`);
      reloadAttention();
      reloadToday();
    } catch (err) {
      setNote(`${row.name}: ${(err as Error).message}`);
    }
  }

  if (today.error) return <p className="banner problem">{today.error}</p>;
  if (!today.data) return <p className="muted">Loading today.</p>;
  return (
    <>
      {note && <p className={`banner ${note.includes(':') ? 'problem' : 'ok'}`}>{note}</p>}
      <TodayView report={today.data} attention={attention.data ?? []} onSendLink={sendLink} waitingPanel={<WaitingPanel />} />
    </>
  );
}

export function TodayView({ report: r, attention, onSendLink, waitingPanel, now = toSlotId(nowInIst()) }: {
  report: TodayReport; attention: AttentionRow[]; onSendLink?: (row: AttentionRow) => void; waitingPanel?: React.ReactNode; now?: string;
}) {
  const open = useOpenBooking();
  const bookFor = useBookForCaller();
  const { toDecide } = groupAttention(attention);
  const openSlots = r.timeline.filter((t) => t.kind === 'open').length;
  const sittings = r.timeline.length - openSlots;
  const nextId = nextSitting(r.timeline, now);

  return (
    <>
      <header className="bar">
        <h1>Today</h1>
        <span className="muted">{r.dateLabel}</span>
        <span className="spacer" />
        <span className="muted">{sittings === 0 ? 'No sittings today' : `${sittings} ${sittings === 1 ? 'sitting' : 'sittings'} · ${openSlots} open`}</span>
      </header>

      {toDecide.length === 0
        ? <p className="quiet-line">Nothing needs you right now.</p>
        : <NeedsYou rows={toDecide} onSendLink={onSendLink ?? (() => {})} onDecide={open} />}

      {waitingPanel}

      <section className="panel sittings">
        <h2>Today's sittings</h2>
        {r.timeline.length === 0 ? <p className="muted">He has no sittings today.</p> : (
          <table className="rows">
            <thead><tr><th>Time</th><th>Who</th><th>Asked about</th><th>State</th></tr></thead>
            <tbody>
              {r.timeline.map((t) => t.booking ? (
                <tr key={t.slotId} className={`clickable ${t.booking.id === nextId ? 'next' : ''}`} onClick={() => open(t.booking!.id)}>
                  <td className="time">{t.time}{t.booking.id === nextId && <span className="nextmark">next</span>}</td>
                  <td>{who(t.booking)}</td>
                  <td className="muted">{askedAbout(t.booking)}</td>
                  <td><StateTag status={t.booking.status} /></td>
                </tr>
              ) : (
                <tr key={t.slotId} className="clickable open" onClick={() => bookFor(t.slotId)} title="Hold this time for a caller">
                  <td className="time">{t.time}</td>
                  <td className="muted">open</td>
                  <td className="muted">book for a caller</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

// Each card is one decision with its button on it. She never has to go somewhere else to act.
export function NeedsYou({ rows, onSendLink, onDecide }: { rows: AttentionRow[]; onSendLink: (r: AttentionRow) => void; onDecide: (bookingId: string) => void }) {
  return (
    <section className="needs" aria-label="Needs you">
      <h2>{rows.length === 1 ? 'One thing needs you' : `${rows.length} things need you`}</h2>
      {rows.map((r, i) => (
        <div className="need" key={`${r.kind}-${r.bookingId ?? i}`}>
          <div className="what">
            <span className={`tag ${ATTENTION_TONE[r.kind]}`}>{ATTENTION_WORDS[r.kind]}</span>
            <b>{r.name}</b><span className="muted"> · {r.when}</span>
            <p className="muted">{r.why}</p>
          </div>
          <div className="do">
            {r.action === 'send_link' && <button onClick={() => onSendLink(r)}>Send the link again</button>}
            {r.action === 'decide' && r.bookingId && <button className="primary" onClick={() => onDecide(r.bookingId!)}>Decide</button>}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Pure. The first paid sitting at or after now, so the eye lands on it. */
export function nextSitting(timeline: TodayReport['timeline'], now: string): string | null {
  const next = timeline.find((t) => t.booking && t.booking.status === 'confirmed' && t.slotId >= now);
  return next?.booking?.id ?? null;
}

function who(b: SessionRow) {
  const parts = [b.name];
  if (b.priorVisits > 0) parts.push(`${ordinal(b.priorVisits + 1)} visit`);
  if (b.forWhom) parts.push(b.forWhom);
  return parts.join(' · ');
}

// Older screens import these from here.
export { StateTag as StatusTag, askedAbout } from './words';
