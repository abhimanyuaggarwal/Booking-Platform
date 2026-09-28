import { useEffect, useRef, useState } from 'react';
import { formatRupees } from '@expert-sessions/shared';
import { api, useApi } from './api';
import { useOnChange } from './changed';
import { useOpenBooking } from './open-booking';
import { useWords } from './lang';
import { Initials } from './words';
import type { MessageResult, WaitingBoard, WaitingPerson } from './types';

// She can write back, so this is a conversation someone is waiting on, not a status board.
const REFRESH_MS = 5000;

// Who is around a session right now, and the one-tap ways to speak to her. The team never enters the session.
export default function WaitingPanel({ dakshinaPaise }: { dakshinaPaise?: number }) {
  const W = useWords();
  const { data, error, reload } = useApi<WaitingBoard>('/waiting');
  useEffect(() => {
    const t = setInterval(reload, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);
  useOnChange(reload);
  useNewWordsAlert(data);
  if (error) return <section className="panel"><h2>{W.waiting.title}</h2><p className="banner problem">{error}</p></section>;
  if (!data) return null;
  return <WaitingPanelView board={data} onChanged={reload} dakshinaPaise={dakshinaPaise} />;
}

// A devotee who writes from the waiting room is waiting on a reply. A short sound and a mark on the
// tab title mean the assistant does not have to stare at this panel to know.
function useNewWordsAlert(board: WaitingBoard | null) {
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!board) return;
    const hers = board.people.reduce((n, p) => n + p.messages.filter((m) => m.from === 'devotee').length, 0);
    if (seen.current !== null && hers > seen.current) {
      chime();
      if (!document.title.startsWith('● ')) document.title = `● ${document.title}`;
    }
    seen.current = hers;
  }, [board]);
  useEffect(() => {
    const clear = () => { if (document.title.startsWith('● ')) document.title = document.title.slice(2); };
    window.addEventListener('focus', clear);
    document.addEventListener('visibilitychange', clear);
    return () => { window.removeEventListener('focus', clear); document.removeEventListener('visibilitychange', clear); };
  }, []);
}

function chime() {
  try {
    const ctx = new AudioContext();
    const tone = (at: number, hz: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.08, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + 0.2);
    };
    tone(ctx.currentTime, 660); tone(ctx.currentTime + 0.2, 880);
  } catch {
    // The browser may refuse sound before the first click; the title mark still shows.
  }
}

export function WaitingPanelView({ board, onChanged, dakshinaPaise }: { board: WaitingBoard; onChanged: () => void; dakshinaPaise?: number }) {
  const W = useWords();
  const count = board.people.length;
  if (count === 0 && !board.running) return <p className="quiet-line">{W.waiting.nobody}</p>;
  return (
    <section className="panel waiting">
      <h2>{W.waiting.title} <i>{count === 0 ? '' : W.waiting.people(count)}</i></h2>
      {board.running && (
        <p className="banner warn">
          {board.running.minutesLate > 0 ? W.waiting.late(board.running.minutesLate) : ''}{W.waiting.running(board.running.name, board.running.slotTime)}
        </p>
      )}
      {board.people.map((p) => <PersonRow key={p.id} person={p} board={board} onChanged={onChanged} dakshinaPaise={dakshinaPaise} />)}
      {count > 0 && <p className="muted foot">{W.waiting.foot}</p>}
    </section>
  );
}

function PersonRow({ person: p, board, onChanged, dakshinaPaise }: { person: WaitingPerson; board: WaitingBoard; onChanged: () => void; dakshinaPaise?: number }) {
  const W = useWords();
  const open = useOpenBooking();
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showWaysOut, setShowWaysOut] = useState(false);

  async function send(text: string) {
    setBusy(true);
    setNote(null);
    try {
      const r = await api<MessageResult>(`/bookings/${p.id}/message`, { method: 'POST', json: { text } });
      setNote(landedSentence(p.name, text, r));
      setCustom('');
      onChanged();
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(slotId: string, label: string) {
    if (!window.confirm(W.waiting.moveConfirm(p.name, label))) return;
    setBusy(true);
    try {
      const r = await api<{ notified: boolean; notDelivered: string | null }>(`/bookings/${p.id}/reschedule`, { method: 'POST', json: { slotId } });
      setNote(r.notified ? `${p.name} moved to ${label} and told on WhatsApp.` : `${p.name} moved to ${label}. WhatsApp did not deliver — call her.`);
      onChanged();
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refund() {
    if (!window.confirm(W.waiting.refundConfirm(p.name))) return;
    setBusy(true);
    try {
      const r = await api<{ amountPaise: number; notified: boolean }>(`/bookings/${p.id}/refund`, { method: 'POST' });
      setNote(`${formatRupees(r.amountPaise)} is on its way back to ${p.name}.${r.notified ? '' : ' WhatsApp did not deliver — call her.'}`);
      onChanged();
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const inRoom = Boolean(p.inRoomSince);
  const recent = p.messages.slice(-3);
  return (
    <div className={`person ${inRoom ? 'here' : ''}`}>
      <div className="row between">
        <div className="person-cell">
          <Initials name={p.name} size="m" />
          <div>
            <button className="linklike" onClick={() => open(p.id)}><b>{p.name}</b></button> <span className="muted">· {p.time}</span>
            <div className="muted small">{presenceSentence(p, board.now, W)}</div>
          </div>
        </div>
        <a className="btn" href={`tel:+${p.phone}`}>{W.waiting.call}</a>
      </div>
      <div className="row">
        {board.oneTap.map((t) => <button key={t} className="small" disabled={busy} onClick={() => send(t)}>{t}</button>)}
      </div>
      <div className="row">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={W.waiting.write} onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) send(custom.trim()); }} />
        <button disabled={busy || !custom.trim()} onClick={() => send(custom.trim())}>{W.waiting.send}</button>
      </div>
      {recent.length > 0 && (
        <ul className="said-list">
          {recent.map((m, i) => (
            <li key={i} className={m.from === 'devotee' ? 'fromher' : undefined}>{saidSentence(p.name, m)}</li>
          ))}
        </ul>
      )}
      {note && <p className={`banner ${note.includes('did not') || note.includes('failed') || note.includes('could not') ? 'problem' : 'ok'}`}>{note}</p>}
      <button className="quiet small" onClick={() => setShowWaysOut(!showWaysOut)}>{showWaysOut ? W.waiting.hideWays : W.waiting.waysOut(p.name.split(' ')[0])}</button>
      {showWaysOut && (
        <table className="plain">
          <tbody>
            <tr><td>{W.waiting.laterToday}</td><td>{board.suggestions.laterToday.length === 0 ? <span className="muted">{W.waiting.nothingToday}</span> : board.suggestions.laterToday.map((s) => <button key={s.slotId} className="small" disabled={busy} onClick={() => move(s.slotId, s.label)}>{s.label.replace('Today ', '')}</button>)}</td></tr>
            <tr><td>{W.waiting.tomorrow}</td><td>{board.suggestions.tomorrow.length === 0 ? <span className="muted">{W.waiting.nothingTomorrow}</span> : board.suggestions.tomorrow.map((s) => <button key={s.slotId} className="small" disabled={busy} onClick={() => move(s.slotId, s.label)}>{s.label.replace('Tomorrow ', '')}</button>)}</td></tr>
            <tr><td>{W.waiting.returnDakshina}</td><td><button className="small danger" disabled={busy} onClick={refund}>{dakshinaPaise ? formatRupees(dakshinaPaise) : W.waiting.returnDakshina}</button></td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

type WaitingWords = { waiting: { inRoom: (m: number) => string; openedEarlier: string; notOpened: string } };
const EN: WaitingWords = { waiting: { inRoom: (m) => `In the waiting room · ${m} min`, openedEarlier: 'Opened her link earlier, not in the room now — a message goes to WhatsApp', notOpened: 'Link not opened yet — a message goes to WhatsApp' } };

export function presenceSentence(p: WaitingPerson, now: string, W: WaitingWords = EN): string {
  if (p.inRoomSince) return W.waiting.inRoom(minutesBetween(p.inRoomSince, now));
  if (p.openedLinkAt) return W.waiting.openedEarlier;
  return W.waiting.notOpened;
}

/** One line of the waiting-room conversation, from whichever side wrote it. */
export function saidSentence(name: string, m: { text: string; from?: 'team' | 'devotee'; landed?: string; reason?: string; at: string }): string {
  if (m.from === 'devotee') return `${name} wrote: “${m.text}” at ${clockOf(m.at)}`;
  return landedSentence(name, m.text, { landed: m.landed ?? 'room', reason: m.reason, at: m.at });
}

function clockOf(at: string) {
  return new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).toLowerCase();
}

export function landedSentence(name: string, text: string, r: { landed: string; reason?: string; at: string }): string {
  const at = clockOf(r.at);
  if (r.landed === 'room') return `“${text}” shown in ${name}'s waiting room at ${at}`;
  if (r.landed === 'whatsapp') return `${name} has not opened her link — “${text}” went to her WhatsApp at ${at}`;
  return `“${text}” could not be delivered to ${name} — call her`;
}

function minutesBetween(from: string, to: string) {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
}
