import { useCallback, useState } from 'react';
import { nowInIst, toSlotId } from '@expert-sessions/shared';
import { api, useApi } from './api';
import { todayYmd } from './format';
import { useOnChange } from './changed';
import { useBookForCaller, useOpenBooking } from './open-booking';
import { useWords } from './lang';
import { collapseOpen } from './runs';
import { rowKeys } from './a11y';
import WaitingPanel from './WaitingPanel';
import CloseDay from './CloseDay';
import { Link } from 'react-router-dom';
import { CalendarClock, Users, AlertCircle, Check, Circle } from 'lucide-react';
import { ATTENTION_TONE, groupAttention, Initials, StateTag } from './words';
import type { AttentionRow, SessionRow, SetupState, TodayReport } from './types';

// The operating screen, and nothing else. In the team's order: the next sitting, large; what needs
// a decision, only if anything does; who is waiting, only when someone is; then the day as a list.
// No money here — that is the end-of-week question, and it lives under More.
export default function Today() {
  const W = useWords();
  const today = useApi<TodayReport>('/today');
  const attention = useApi<AttentionRow[]>('/attention');
  const setup = useApi<SetupState>('/setup');
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
      <TodayView report={today.data} attention={attention.data ?? []} setup={setup.data ?? undefined} onSendLink={sendLink} onHandedBack={async (id) => { await api(`/bookings/${id}/handed-back`, { method: 'POST' }); reloadAttention(); }} onTellGuru={tellGuru} onCannotSit={() => setClosing(true)} waitingPanel={<WaitingPanel />} />
    </>
  );
}

export function TodayView({ report: r, attention, setup, onSendLink, onTellGuru, onCannotSit, onHandedBack, waitingPanel, now = toSlotId(nowInIst()) }: {
  report: TodayReport; attention: AttentionRow[]; setup?: SetupState; onSendLink?: (row: AttentionRow) => void; onTellGuru?: (b: SessionRow) => void; onCannotSit?: () => void; onHandedBack?: (bookingId: string) => void; waitingPanel?: React.ReactNode; now?: string;
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
      <header className="bar page">
        <div><h1>{W.today.title}</h1><p className="page-line">{r.dateLabel}</p></div>
        <span className="spacer" />
        {onCannotSit && sittings > 0 && <button className="quiet" onClick={onCannotSit}>{W.today.cannotSit}</button>}
      </header>

      <section className="now" aria-label={W.now.next}>
        <div className="tile"><CalendarClock size={18} aria-hidden="true" /><div><span className="muted small">{W.now.next}</span><b>{next?.booking ? `${next.time} · ${next.booking.name}` : W.now.none}</b></div></div>
        <div className={`tile ${toDecide.length ? 'warm' : ''}`}><AlertCircle size={18} aria-hidden="true" /><div><span className="muted small">{W.now.needs}</span><b>{toDecide.length || W.now.nothing}</b></div></div>
        <div className="tile"><Users size={18} aria-hidden="true" /><div><span className="muted small">{W.now.sittings}</span><b>{W.now.of(sittings, openSlots)}</b></div></div>
      </section>

      {setup && Object.entries(setup).some(([k, v]) => k !== 'firstBooking' && !v) && <SetupChecklist setup={setup} />}

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
            <button onClick={() => open(next.booking!.id)}>{W.today.open}</button>
            {onTellGuru && <button onClick={() => onTellGuru(next.booking!)}>{W.today.tellGuru}</button>}
          </div>
        </section>
      )}

      {toDecide.length === 0
        ? <p className="quiet-line">{W.today.nothingNeeds}</p>
        : <NeedsYou rows={toDecide} onSendLink={onSendLink ?? (() => {})} onDecide={open} onHandedBack={onHandedBack} />}

      {waitingPanel}

      <section className="panel sittings">
        <h2>{W.today.sittings}</h2>
        {r.timeline.length === 0 ? <p className="muted">{W.today.noSittings}</p> : (
          <table className="rows">
            <thead><tr><th>{W.today.time}</th><th>{W.today.who}</th><th>{W.today.state}</th></tr></thead>
            <tbody>
              {collapseOpen(r.timeline).map((g) => g.kind === 'one' ? (
                <tr key={g.item.slotId} className={`clickable ${g.item.booking!.id === nextId ? 'next' : ''}`} onClick={() => open(g.item.booking!.id)} {...rowKeys(() => open(g.item.booking!.id))}>
                  <td className="time">{g.item.time}</td>
                  <td className="person-cell"><Initials name={g.item.booking!.name} size="s" /><span><b>{g.item.booking!.name}</b>{g.item.booking!.forWhom && <span className="muted"> · {g.item.booking!.forWhom}</span>}{g.item.booking!.minutes ? <span className="muted"> · {W.drawer.minutes(g.item.booking!.minutes)}</span> : null}</span></td>
                  <td><StateTag status={g.item.booking!.status} /></td>
                </tr>
              ) : (
                <tr key={g.items[0].slotId} className="clickable open" onClick={() => bookFor(g.items[0].slotId)} {...rowKeys(() => bookFor(g.items[0].slotId))}>
                  <td className="time">{g.items[0].time}</td>
                  <td className="muted" colSpan={2}>{g.items.length === 1 ? W.today.openSlot : W.today.openRun(g.items[0].time, g.items[g.items.length - 1].time, g.items.length)} · {W.today.bookIt}</td>
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
export function NeedsYou({ rows, onSendLink, onDecide, onHandedBack = () => {} }: { rows: AttentionRow[]; onSendLink: (r: AttentionRow) => void; onDecide: (bookingId: string) => void; onHandedBack?: (bookingId: string) => void }) {
  const W = useWords();
  return (
    <section className="needs" aria-label={W.today.needsOne}>
      <h2>{rows.length === 1 ? W.today.needsOne : W.today.needsMany(rows.length)}</h2>
      {rows.map((r, i) => (
        <div className="need" key={`${r.kind}-${r.bookingId ?? i}`}>
          <Initials name={r.name} size="m" />
          <div className="what">
            <b>{r.name}</b><span className="muted"> · {r.when}</span>
            <p><span className={`state ${ATTENTION_TONE[r.kind]}`}><i />{W.attention[r.kind]}</span></p>
            <p className="muted small why">{r.why}</p>
          </div>
          <div className="do">
            {r.action === 'send_link' && <button onClick={() => onSendLink(r)}>{W.today.sendLinkAgain}</button>}
            {r.action === 'decide' && r.bookingId && <button onClick={() => onDecide(r.bookingId!)}>{W.today.decide}</button>}
            {r.action === 'handed_back' && r.bookingId && <button onClick={() => onHandedBack(r.bookingId!)}>{W.today.handedBack}</button>}
          </div>
        </div>
      ))}
    </section>
  );
}

/** The five things a new guru's team sets before the first live. Shown on Today until all are done. */
export function SetupChecklist({ setup }: { setup: SetupState }) {
  const W = useWords();
  const steps: { key: keyof SetupState; to: string }[] = [
    { key: 'kinds', to: '/console/settings/kinds' }, { key: 'timings', to: '/console/settings/timings' },
    { key: 'website', to: '/console/settings/website' }, { key: 'guruPhone', to: '/console/settings/messages' }, { key: 'qr', to: '/console/settings/qr' },
  ];
  return (
    <section className="panel checklist" aria-label={W.setup.title}>
      <h2>{W.setup.title}</h2>
      <ul>
        {steps.map(({ key, to }) => (
          <li key={key} className={setup[key] ? 'done' : ''}>
            {setup[key] ? <Check size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
            <Link to={to}>{W.setup[key as 'kinds' | 'timings' | 'website' | 'guruPhone' | 'qr']}</Link>
            <span className="muted small">{setup[key] ? W.setup.done : W.setup.todo}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">{W.setup.foot}</p>
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
