import { useConfirm } from './Confirm';
import { useWords } from './lang';
import { FormEvent, useState } from 'react';
import { describeSlot, instantToSlotId, slotIdToInstant } from '@expert-sessions/shared';
import { api, useApi } from './api';
import type { EventKind, EventRow } from './types';

const KINDS: { value: EventKind; label: string }[] = [
  { value: 'satsang', label: 'Satsang' }, { value: 'live', label: 'YouTube live' }, { value: 'meetup', label: 'Meetup' },
];

type Draft = { title: string; kind: EventKind; when: string; link: string; location: string; notes: string };
const EMPTY: Draft = { title: '', kind: 'satsang', when: '', link: '', location: '', notes: '' };

// His public schedule, shown on his website. Times are typed as IST wall-clock; the api stores real instants.
export default function Meetups() {
  const { data, error, reload } = useApi<EventRow[]>('/events');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const W = useWords();
  const confirmDialog = useConfirm();
  async function remove(e: EventRow) {
    if (!await confirmDialog(W.meetups.confirmRemove(e.title), W.dialog.remove, true)) return;
    try {
      await api(`/events/${e.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setProblem((err as Error).message);
    }
  }

  return (
    <section className="panel" style={{ maxWidth: 820 }}>
      <h2>Satsangs, lives and meetups <i>{data ? `${data.length} on the schedule` : ''}</i></h2>
      {error && <p className="problem">{error}</p>}
      {problem && <p className="problem">{problem}</p>}
      {data && data.length === 0 && <p className="muted">Nothing on his public schedule yet.</p>}
      {data && (
        <table>
          <tbody>
            {data.map((e) => (
              editing === e.id
                ? <tr key={e.id}><td colSpan={4}><EventForm initial={toDraft(e)} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} id={e.id} /></td></tr>
                : (
                  <tr key={e.id}>
                    <td><span className="tag n">{KINDS.find((k) => k.value === e.kind)?.label.toUpperCase()}</span></td>
                    <td><b>{e.title}</b><br /><span className="muted">{describeSlot(instantToSlotId(new Date(e.startsAt)))}{e.location ? ` · ${e.location}` : ''}</span>{e.link && <><br /><a href={e.link} target="_blank" rel="noreferrer" className="muted">{e.link}</a></>}</td>
                    <td className="num"><button className="quiet" onClick={() => setEditing(e.id)}>Edit</button> <button className="quiet" onClick={() => remove(e)}>Remove</button></td>
                  </tr>
                )
            ))}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 14 }}>
        {editing === 'new'
          ? <EventForm initial={EMPTY} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
          : <button onClick={() => setEditing('new')}>Add to his schedule</button>}
      </div>
    </section>
  );
}

function toDraft(e: EventRow): Draft {
  return { title: e.title, kind: e.kind, when: instantToSlotId(new Date(e.startsAt)).slice(5), link: e.link ?? '', location: e.location ?? '', notes: e.notes ?? '' };
}

function EventForm({ initial, id, onDone, onCancel }: { initial: Draft; id?: string; onDone: () => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof Draft) => (e: { target: { value: string } }) => setD({ ...d, [key]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d.when)) return setProblem('Pick the day and time');
    setBusy(true);
    setProblem(null);
    const json = { title: d.title, kind: d.kind, startsAt: slotIdToInstant(`slot:${d.when}`).toISOString(), link: d.link || null, location: d.location || null, notes: d.notes || null };
    try {
      await api(id ? `/events/${id}` : '/events', { method: id ? 'PUT' : 'POST', json });
      onDone();
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="settings block" onSubmit={save}>
      <div className="row">
        <label>Title<input value={d.title} onChange={set('title')} required /></label>
        <label>Kind<select value={d.kind} onChange={set('kind')}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
        <label>When, IST<input type="datetime-local" value={d.when} onChange={set('when')} required /></label>
      </div>
      <div className="row">
        <label>Link, for lives and satsangs<input value={d.link} onChange={set('link')} placeholder="https://youtube.com/…" /></label>
        <label>Place, for meetups<input value={d.location} onChange={set('location')} /></label>
      </div>
      <label>Notes<input value={d.notes} onChange={set('notes')} /></label>
      {problem && <p className="problem">{problem}</p>}
      <div className="row">
        <button className="primary" disabled={busy}>{id ? 'Save changes' : 'Add it'}</button>
        <button type="button" className="quiet" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
