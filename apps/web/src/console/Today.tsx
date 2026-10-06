import { useCallback, useState } from 'react';
import { nowInIst, toSlotId } from '@expert-sessions/shared';
import { api, useApi } from './api';
import { todayYmd } from './format';
import { useOnChange } from './changed';
import { useBookForCaller, useOpenBooking } from './open-booking';
import { useWords } from './lang';
import WaitingPanel from './WaitingPanel';
import CloseDay from './CloseDay';
import { ATTENTION_TONE, groupAttention, Initials, StateTag } from './words';
import type { AttentionRow, SessionRow, TodayReport } from './types';

// The operating screen, and nothing else. In the team's order: the next sitting, large; what needs
// a decision, only if anything does; who is waiting, only when someone is; then the day as a list.
// No money here — that is the end-of-week question, and it lives under More.
export default function Today() {
  const W = useWords();
  const today = useApi<TodayReport>('/today');
  const attention = useApi<AttentionRow[]>('/attention');
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'problem' } | null>(null);
  const [closing, setClosing] = useState(false);
  const reloadToday = today.reload;
  const reloadAttention = attention.reload;
  useOnChange(useCallback(() => { reloadToday(); reloadAttention(); }, [reloadToday, reloadAttention]));

  async function sendLink(row: AttentionRow) {
    if (!row.bookingId) return;
    try {
      await api(`/bookings/${row.bookingId}/send-link`, { method: 'POST' });
      setNote({ text: W.today.linkSent(row.name), tone: 'ok' });
      reloadAttention();
      reloadToday();
    } catch (err) {
      setNote({ text: `${row.name}: ${(err as Error).message}`, tone: 'problem' });
    }
  }

  async function tellGuru(b: SessionRow) {
    try {
      await api(`/bookings/${b.id}/tell-guru`, { method: 'POST' });
      setNote({ text: W.today.told, tone: 'ok' });
    } catch (err) {
      setNote({ text: (err as Error).message, tone: 'problem' });
    }
  }

  if (today.error) return <p className="banner problem">{today.error}</p>;
  if (!today.data) return <p className="muted">{W.common.loading}</p>;
  return (
    <>
      {note && <p className={`banner ${note.tone}`}>{note.text}</p>}
      {closing && <CloseDay initialDate={todayYmd()} onDone={(r) => { setClosing(false); setNote({ text: W.closeDay.done({ date: r.date, moved: r.moved.filter((m) => m.ok).length, notified: r.notified, notDelivered: r.notDelivered.length, failed: r.moved.filter((m) => !m.ok).length, expiredHolds: r.expiredHolds }), tone: 'ok' }); reloadToday(); reloadAttention(); }} onCancel={() => setClosing(false)} />}
      <TodayView report={today.data} attention={attention.data ?? []} onSendLink={sendLink} onTellGuru={tellGuru} onCannotSit={() => setClosing(true)} waitingPanel={<WaitingPanel />} />
    </>
  );
}

export function TodayView({ report: r, attention, onSendLink, onTellGuru, onCannotSit, waitingPanel, now = toSlotId(nowInIst()) }: {
  report: TodayReport; attention: AttentionRow[]; onSendLink?: (row: AttentionRow) => void; onTellGuru?: (b: SessionRow) => void; onCannotSit?: () => void; waitingPanel?: React.ReactNode; now?: string;
}) {
  const W = useWords();
  const open = useOpenBooking();
  const bookFor = useBookForCaller();
  const { toDecide } = groupAttention(attention);
  const openSlots = r.timeline.filter((t) => t.kind === 'open').length;
  const sittings = r.timeline.length - openSlots;
  const nextId = nextSitting(r.timeline, now);
  const next = r.timeline.find((t) => t.booking?.id === nextId);

  return (
    <>
      <header className="bar">
        <h1>{W.today.title}</h1>
        <span className="muted">{r.dateLabel}</span>
        <span className="spacer" />
        <span className="muted long">{sittings === 0 ? W.today.noSittings : W.today.count(sittings, openSlots)}</span>
        {onCannotSit && sittings > 0 && <button className="quiet" onClick={onCannotSit}>{W.today.cannotSit}</button>}
      </header>

      {next?.booking && (
        <section className="nextcard" aria-label={W.today.nextSitting}>
          <p className="eyebrow">{W.today.nextSitting} · {next.time}</p>
          <div className="who">
            <Initials name={next.booking.name} size="l" />
            <div>
              <h2>{next.booking.name}{next.booking.forWhom ? <span className="muted"> · {next.booking.forWhom}</span> : null}</h2>
              <p className="muted small">{next.booking.priorVisits > 0 ? W.today.visit(next.booking.priorVisits + 1) : W.today.firstTime}</p>
            </div>
          </div>
          <p className="ask">{next.booking.question ? <>{W.today.wishes}: “{next.booking.question}”</> : next.booking.hasVoiceNote ? W.today.voiceNote : null}</p>
          <div className="row">
            <button className="primary" onClick={() => open(next.booking!.id)}>{W.today.open}</button>
            {onTellGuru && <button onClick={() => onTellGuru(next.booking!)}>{W.today.tellGuru}</button>}
          </div>
        </section>
      )}

      {toDecide.length === 0
        ? <p className="quiet-line">{W.today.nothingNeeds}</p>
        : <NeedsYou rows={toDecide} onSendLink={onSendLink ?? (() => {})} onDecide={open} />}

      {waitingPanel}

      <section className="panel sittings">
        <h2>{W.today.sittings}</h2>
        {r.timeline.length === 0 ? <p className="muted">{W.today.noSittings}</p> : (
          <table className="rows">
            <thead><tr><th>{W.today.time}</th><th>{W.today.who}</th><th>{W.today.state}</th></tr></thead>
            <tbody>
              {r.timeline.map((t) => t.booking ? (
                <tr key={t.slotId} className={`clickable ${t.booking.id === nextId ? 'next' : ''}`} onClick={() => open(t.booking!.id)}>
                  <td className="time">{t.time}</td>
                  <td className="person-cell"><Initials name={t.booking.name} size="s" /><span><b>{t.booking.name}</b>{t.booking.forWhom && <span className="muted"> · {t.booking.forWhom}</span>}{t.booking.minutes ? <span className="muted"> · {W.drawer.minutes(t.booking.minutes)}</span> : null}</span></td>
                  <td><StateTag status={t.booking.status} /></td>
                </tr>
              ) : (
                <tr key={t.slotId} className="clickable open" onClick={() => bookFor(t.slotId)}>
                  <td className="time">{t.time}</td>
                  <td className="muted" colSpan={2}>{W.today.openSlot} · {W.today.bookIt}</td>
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
  const W = useWords();
  return (
    <section className="needs" aria-label={W.today.needsOne}>
      <h2>{rows.length === 1 ? W.today.needsOne : W.today.needsMany(rows.length)}</h2>
      {rows.map((r, i) => (
        <div className="need" key={`${r.kind}-${r.bookingId ?? i}`}>
          <Initials name={r.name} size="m" />
          <div className="what">
            <b>{r.name}</b><span className="muted"> · {r.when}</span>
            <p title={r.why}><span className={`state ${ATTENTION_TONE[r.kind]}`}><i />{W.attention[r.kind]}</span></p>
          </div>
          <div className="do">
            {r.action === 'send_link' && <button onClick={() => onSendLink(r)}>{W.today.sendLinkAgain}</button>}
            {r.action === 'decide' && r.bookingId && <button className="primary" onClick={() => onDecide(r.bookingId!)}>{W.today.decide}</button>}
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

// Older screens import these from here.
export { StateTag as StatusTag, askedAbout } from './words';
