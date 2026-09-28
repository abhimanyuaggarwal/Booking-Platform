import { useEffect, useRef, useState } from 'react';
import { formatRupees } from '@expert-sessions/shared';
import { api, useApi } from './api';
import { useOnChange } from './changed';
import { useOpenBooking } from './open-booking';
import type { MessageResult, WaitingBoard, WaitingPerson } from './types';

// She can write back now, so this is a conversation someone is waiting on, not a status board.
const REFRESH_MS = 5000;

// Who is around a session right now, and the one-tap ways to speak to her. The team never enters the session.
export default function WaitingPanel({ dakshinaPaise }: { dakshinaPaise?: number }) {
  const { data, error, reload } = useApi<WaitingBoard>('/waiting');
  useEffect(() => {
    const t = setInterval(reload, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);
  useOnChange(reload);
  useNewWordsAlert(data);
  if (error) return <section className="panel"><h2>Waiting now</h2><p className="banner problem">{error}</p></section>;
  if (!data) return <section className="panel"><h2>Waiting now</h2><p className="muted">Looking.</p></section>;
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
  const count = board.people.length;
  if (count === 0 && !board.running) {
    return <p className="quiet-line">Nobody is waiting. When someone opens her link she appears here, and you can speak to her before she wonders.</p>;
  }
  return (
    <section className="panel">
      <h2>Waiting now <i>{count === 0 ? 'nobody yet' : `${count} ${count === 1 ? 'person' : 'people'}`}</i></h2>
      {board.running && (
        <p className="banner warn">
          {board.running.minutesLate > 0 ? `Running ${board.running.minutesLate} minutes late. ` : ''}Guruji is with {board.running.name} ({board.running.slotTime}).
        </p>
      )}
      {count === 0 && <p className="muted">Nobody is waiting for him yet.</p>}
      {board.people.map((p) => <PersonRow key={p.id} person={p} board={board} onChanged={onChanged} dakshinaPaise={dakshinaPaise} />)}
      {count > 0 && <p className="muted foot">You can speak to the waiting room or call. You never enter the session.</p>}
    </section>
  );
}

function PersonRow({ person: p, board, onChanged, dakshinaPaise }: { person: WaitingPerson; board: WaitingBoard; onChanged: () => void; dakshinaPaise?: number }) {
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
    if (!window.confirm(`Move ${p.name} to ${label}? She is told on WhatsApp at once.`)) return;
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
    if (!window.confirm(`Return ${p.name}'s dakshina? Razorpay sends it back; she is told on WhatsApp.`)) return;
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
  return (
    <div className={`person ${inRoom ? 'here' : ''}`}>
      <div className="row between">
        <div>
          <button className="linklike" onClick={() => open(p.id)}><b>{p.name}</b></button> <span className="muted">· {p.time}</span>
          <div className="muted small">{presenceSentence(p, board.now)}</div>
        </div>
        <a className="btn" href={`tel:+${p.phone}`}>Call</a>
      </div>
      <div className="row">
        {board.oneTap.map((t) => <button key={t} className="small" disabled={busy} onClick={() => send(t)}>{t}</button>)}
      </div>
      <div className="row">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Write a message" onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) send(custom.trim()); }} />
        <button disabled={busy || !custom.trim()} onClick={() => send(custom.trim())}>Send</button>
      </div>
      {p.messages.length > 0 && (
        <ul className="said-list">
          {p.messages.map((m, i) => (
            <li key={i} className={m.from === 'devotee' ? 'fromher' : undefined}>{saidSentence(p.name, m)}</li>
          ))}
        </ul>
      )}
      {note && <p className={`banner ${note.includes('did not') || note.includes('failed') || note.includes('could not') ? 'problem' : 'ok'}`}>{note}</p>}
      <button className="quiet small" onClick={() => setShowWaysOut(!showWaysOut)}>{showWaysOut ? 'Hide the ways out' : `If he cannot get to ${p.name.split(' ')[0]}`}</button>
      {showWaysOut && (
        <table className="plain">
          <tbody>
            <tr><td>Later today</td><td>{board.suggestions.laterToday.length === 0 ? <span className="muted">nothing free today</span> : board.suggestions.laterToday.map((s) => <button key={s.slotId} className="small" disabled={busy} onClick={() => move(s.slotId, s.label)}>{s.label.replace('Today ', '')}</button>)}</td></tr>
            <tr><td>Tomorrow</td><td>{board.suggestions.tomorrow.length === 0 ? <span className="muted">nothing free tomorrow</span> : board.suggestions.tomorrow.map((s) => <button key={s.slotId} className="small" disabled={busy} onClick={() => move(s.slotId, s.label)}>{s.label.replace('Tomorrow ', '')}</button>)}</td></tr>
            <tr><td>Return the dakshina</td><td><button className="small danger" disabled={busy} onClick={refund}>{dakshinaPaise ? formatRupees(dakshinaPaise) : 'Return it'}</button></td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export function presenceSentence(p: WaitingPerson, now: string): string {
  if (p.inRoomSince) return `In the waiting room · ${minutesBetween(p.inRoomSince, now)} min`;
  if (p.openedLinkAt) return 'Opened her link earlier, not in the room now — a message goes to WhatsApp';
  return 'Link not opened yet — a message goes to WhatsApp';
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
