import { useEffect, useState } from 'react';
import { describeSlot, formatRupees } from '@expert-sessions/shared';
import { api, useApi } from './api';
import SlotPicker from './SlotPicker';
import { useWords } from './lang';
import { Initials, StateTag, sourceWords } from './words';
import type { BookingDetail } from './types';

// One booking, fully. The moves the state machine allows come first, under her name, because that
// is what the drawer was opened for; then who, what was paid, what was said. Opens over any screen
// (ConsoleShell) and is the only place a booking is acted on.
export default function BookingDrawer({ id, guruSlug, onClose, onChanged }: { id: string; guruSlug: string; onClose: () => void; onChanged: () => void }) {
  const W = useWords();
  const { data, error, reload } = useApi<BookingDetail>(`/bookings/${id}`);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="scrim drawer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" aria-label="Booking">
        {error && <><header className="drawer-head"><h2>{W.drawer.booking}</h2><button className="quiet" onClick={onClose}>{W.drawer.close}</button></header><p className="banner problem">{error}</p></>}
        {!data && !error && <header className="drawer-head"><h2 className="muted">{W.drawer.opening}</h2><button className="quiet" onClick={onClose}>{W.drawer.close}</button></header>}
        {data && <BookingDetailView detail={data} guruSlug={guruSlug} onClose={onClose} onChanged={() => { reload(); onChanged(); }} />}
      </aside>
    </div>
  );
}

export function BookingDetailView({ detail: d, guruSlug, onChanged, onClose }: { detail: BookingDetail; guruSlug: string; onChanged: () => void; onClose?: () => void }) {
  const W = useWords();
  const [slotId, setSlotId] = useState('');
  const [text, setText] = useState('');
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'problem' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const can = (a: BookingDetail['actions'][number]) => d.actions.includes(a);

  async function act(label: string, fn: () => Promise<string>) {
    setBusy(true);
    setNote(null);
    try {
      const said = await fn();
      setNote({ text: said, tone: /could not|did not deliver/.test(said) ? 'problem' : 'ok' });
      onChanged();
    } catch (err) {
      setNote({ text: `${label}: ${(err as Error).message}`, tone: 'problem' });
    } finally {
      setBusy(false);
    }
  }

  const name = d.devotee.name ?? `…${d.devotee.phone.slice(-4)}`;
  return (
    <>
      <header className="drawer-head">
        <div className="person-cell">
          <Initials name={name} size="l" />
          <div>
            <h2>{name} <StateTag status={d.status} /></h2>
            <p className="muted">{d.dateLabel}, {d.time} · {sourceWords(d.source)}</p>
          </div>
        </div>
        {onClose && <button className="quiet" onClick={onClose}>{W.drawer.close}</button>}
      </header>

      <div className="drawer-body">
        {d.actions.length > 0 && (
          <section>
            {can('message') && (
              <div className="row">
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder={W.drawer.note} />
                <button disabled={busy || !text.trim()} onClick={() => act('Message', async () => {
                  const r = await api<{ landed: string }>(`/bookings/${d.id}/message`, { method: 'POST', json: { text: text.trim() } });
                  setText('');
                  return r.landed === 'room' ? 'Shown in her waiting room.' : r.landed === 'whatsapp' ? 'Sent to her WhatsApp.' : 'Could not be delivered. Call her.';
                })}>{W.drawer.send}</button>
              </div>
            )}
            {can('reschedule') && (
              <div className="row">
                <SlotPicker guruSlug={guruSlug} value={slotId} onChange={setSlotId} />
                <button disabled={busy || !slotId} onClick={() => {
                  if (!window.confirm(`Move ${name} to ${describeSlot(slotId)}? She is told on WhatsApp and the dakshina moves with the booking.`)) return;
                  act('Move', async () => {
                    const r = await api<{ notified: boolean }>(`/bookings/${d.id}/reschedule`, { method: 'POST', json: { slotId } });
                    return `Moved to ${describeSlot(slotId)}.${r.notified ? ' She has the new time on WhatsApp.' : ' WhatsApp did not deliver. Call her.'}`;
                  });
                }}>{W.drawer.move}</button>
              </div>
            )}
            <div className="row">
              {can('cancel') && <button disabled={busy} onClick={() => { if (window.confirm(`Cancel ${name}'s time? The dakshina is kept as a credit for thirty days and she is told on WhatsApp.`)) act('Cancel', async () => {
                const r = await api<{ creditPaise: number; notified: boolean }>(`/bookings/${d.id}/cancel`, { method: 'POST' });
                return `Cancelled. ${formatRupees(r.creditPaise)} is kept as her credit.${r.notified ? '' : ' WhatsApp did not deliver. Call her.'}`;
              }); }}>{W.drawer.cancelKeep}</button>}
              {can('refund') && <button className="danger" disabled={busy} onClick={() => { if (window.confirm(d.paidWith?.providerRef?.startsWith('offline:') ? `Return ${name}'s dakshina? The team hands it back; she is told on WhatsApp. This cannot be undone.` : `Return ${name}'s dakshina? Razorpay sends it back and she is told on WhatsApp. This cannot be undone.`)) act('Refund', async () => {
                const r = await api<{ amountPaise: number; notified: boolean; viaCredit: boolean; byHand?: boolean }>(`/bookings/${d.id}/refund`, { method: 'POST' });
                return `${formatRupees(r.amountPaise)} ${r.viaCredit ? 'returned as a credit' : r.byHand ? 'to be handed back to her by the team' : 'is on its way back'}.${r.notified ? '' : ' WhatsApp did not deliver. Call her.'}`;
              }); }}>{W.drawer.refund}</button>}
              {can('no_show') && <button disabled={busy} onClick={() => { if (window.confirm(`Mark ${name} as did not join? The dakshina stands.`)) act('No-show', async () => {
                await api(`/bookings/${d.id}/no-show`, { method: 'POST' });
                return 'Marked as did not join.';
              }); }}>{W.drawer.noShow}</button>}
              {can('mark_paid') && ['cash', 'upi'].map((method) => (
                <button key={method} disabled={busy} onClick={() => { if (window.confirm(`Confirm ${name}'s time as paid ${method === 'cash' ? 'in cash' : 'by UPI to the ashram'}? She gets the join link on WhatsApp.`)) act('Mark paid', async () => {
                  const r = await api<{ notified: boolean }>(`/bookings/${d.id}/mark-paid`, { method: 'POST', json: { method } });
                  return `Confirmed, paid ${method === 'cash' ? 'in cash' : 'by UPI to the ashram'}.${r.notified ? ' She has the join link on WhatsApp.' : ' WhatsApp did not deliver. Call her.'}`;
                }); }}>{method === 'cash' ? W.drawer.paidCash : W.drawer.paidUpi}</button>
              ))}
              {can('tell_guru') && <button disabled={busy} onClick={() => act('Tell guruji', async () => {
                await api(`/bookings/${d.id}/tell-guru`, { method: 'POST' });
                return 'Guruji has a note about this sitting on his WhatsApp.';
              })}>{W.drawer.tellGuru}</button>}
              {can('send_link') && <button disabled={busy} onClick={() => act('Send link', async () => {
                await api(`/bookings/${d.id}/send-link`, { method: 'POST' });
                return 'The time is held again and the pay link is on her WhatsApp.';
              })}>{W.drawer.sendLink}</button>}
            </div>
            {note && <p className={`banner ${note.tone}`}>{note.text}</p>}
          </section>
        )}

        <section>
          <dl className="kv">
            <dt>{W.drawer.phone}</dt><dd><a href={`tel:+${d.devotee.phone}`}>+{d.devotee.phone}</a></dd>
            {d.devotee.forWhom && <><dt>{W.drawer.forWhom}</dt><dd>{d.devotee.forWhom}</dd></>}
            <dt>{W.drawer.askedAbout}</dt><dd>{d.question ?? (d.hasVoiceNote ? W.drawer.voiceNote : <span className="muted">{W.drawer.nothingYet}</span>)}</dd>
            <dt>{W.drawer.dakshina}</dt><dd>{d.paidWith ? `${formatRupees(d.paidWith.amountPaise)} ${d.paidWith.kind === 'credit_used' ? W.drawer.byCredit : paymentWords(d.paidWith.providerRef).replace('Paid ', '')}` : <span className="muted">{W.drawer.notPaid}</span>}</dd>
            {d.session?.devoteeJoinedAt && <><dt>{W.drawer.openedLink}</dt><dd>{when(d.session.devoteeJoinedAt)}</dd></>}
            {d.rescheduledFromId && <><dt>{W.drawer.moved}</dt><dd>{W.drawer.fromEarlier}</dd></>}
          </dl>
          {editing
            ? <EditDevotee detail={d} onDone={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />
            : <button className="quiet small" onClick={() => setEditing(true)}>{W.drawer.edit}</button>}
        </section>

        {d.ledger.length > 0 && (
          <section>
            <h3>{W.drawer.money}</h3>
            <table className="plain"><tbody>
              {d.ledger.map((l) => <tr key={l.id}><td className="muted">{when(l.at)}</td><td>{ledgerWords(l.kind, l.providerRef)}</td><td className="num">{formatRupees(l.amountPaise)}</td></tr>)}
            </tbody></table>
          </section>
        )}

        {d.messages.length > 0 && (
          <section>
            <h3>{W.drawer.said}</h3>
            <table className="plain said"><tbody>
              {withoutDoubleReminders(d.messages).map((m) => (
                <tr key={m.id}>
                  <td className="muted">{when(m.at)}</td>
                  <td><span className={`tag ${m.direction === 'in' ? 'g' : 'n'}`}>{m.direction === 'in' ? W.drawer.her : W.drawer.us}</span></td>
                  <td>
                    {messageWords(m.kind, m.payload)}
                    {deliveryOf(m) && <span className="tag r" title={String(m.payload.reason ?? '')}>{deliveryOf(m)}</span>}
                  </td>
                </tr>
              ))}
            </tbody></table>
          </section>
        )}

        {d.history.length > 0 && (
          <section>
            <h3>{W.drawer.otherTimes}</h3>
            <table className="plain"><tbody>
              {d.history.map((h) => <tr key={h.id}><td>{describeSlot(h.slotId)}</td><td><StateTag status={h.status} /></td></tr>)}
            </tbody></table>
          </section>
        )}
      </div>
    </>
  );
}

// Her WhatsApp name is a start, not a record. The team corrects it, or notes who the time is for.
function EditDevotee({ detail: d, onDone, onCancel }: { detail: BookingDetail; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(d.devotee.name ?? '');
  const [forWhom, setForWhom] = useState(d.devotee.forWhom ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      await api(`/devotees/${d.devotee.id}`, { method: 'PUT', json: { name, forWhom } });
      onDone();
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="edit">
      <div className="row">
        <label>Her name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus /></label>
        <label>Who the time is for<input value={forWhom} onChange={(e) => setForWhom(e.target.value)} maxLength={120} placeholder="for my mother" /></label>
      </div>
      {problem && <p className="banner problem">{problem}</p>}
      <div className="row">
        <button className="primary" disabled={busy} onClick={save}>Save</button>
        <button className="quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/**
 * Pure. A reminder is logged twice: once as the sent text and once as the `reminder.*` marker that
 * stops it being sent again. The transcript shows the sentence once, under the marker's kind so it
 * still reads "Reminder · …".
 */
export function withoutDoubleReminders(messages: BookingDetail['messages']) {
  const reminderBodies = new Set(messages.filter((m) => m.kind.startsWith('reminder')).map((m) => String(m.payload.body ?? m.payload.text ?? '')));
  return messages.filter((m) => !(m.direction === 'out' && !m.kind.startsWith('reminder') && reminderBodies.has(String(m.payload.body ?? m.payload.text ?? ''))));
}

/** Pure. "NOT DELIVERED" for an outbound message Meta refused; null otherwise. */
export function deliveryOf(m: { direction: 'in' | 'out'; payload: Record<string, unknown> }) {
  if (m.direction !== 'out') return null;
  if (m.payload.delivered === false || m.payload.landed === 'failed') return 'NOT DELIVERED';
  return null;
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).toLowerCase();
}

export { sourceWords };

export function ledgerWords(kind: BookingDetail['ledger'][number]['kind'], providerRef: string | null = null) {
  if (kind === 'payment') return paymentWords(providerRef);
  return { refund: 'Returned', credit_issued: 'Credit issued', credit_used: 'Credit used' }[kind];
}

/** Pure. Where a payment came from, from its provider reference. */
export function paymentWords(providerRef: string | null | undefined) {
  if (providerRef?.startsWith('offline:cash')) return 'Paid in cash at the ashram';
  if (providerRef?.startsWith('offline:upi')) return 'Paid by UPI to the ashram';
  return 'Paid by UPI';
}

export function messageWords(kind: string, payload: Record<string, unknown>) {
  const prefix = kind.startsWith('reminder') ? 'Reminder · ' : '';
  if (typeof payload.text === 'string') return prefix + payload.text;
  if (typeof payload.body === 'string') return prefix + payload.body.split('\n')[0];
  if (kind === 'audio') return 'voice note';
  return kind;
}
