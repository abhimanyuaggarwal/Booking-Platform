import { FormEvent, useState } from 'react';
import { api } from './api';
import type { SessionType, Settings } from './types';

const MAX = 3;

// The kinds of sitting he offers: up to three, each a length and a dakshina. The first active one is
// the default — the website's headline and what WhatsApp offers when there is only one. A kind that
// is switched off disappears from the doors but keeps every booking that was made with it.
export default function SessionTypesEditor({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [types, setTypes] = useState<SessionType[]>(settings.sessionTypes?.length ? settings.sessionTypes.map((t) => ({ ...t })) : [{ name: '', minutes: settings.pattern.slotMinutes, dakshinaPaise: settings.dakshinaPaise, active: true }]);
  const [status, setStatus] = useState<{ ok?: string; problem?: string }>({});
  const [busy, setBusy] = useState(false);

  function set(i: number, patch: Partial<SessionType>) { setTypes(types.map((t, j) => (j === i ? { ...t, ...patch } : t))); }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= types.length) return;
    const next = [...types]; [next[i], next[j]] = [next[j], next[i]]; setTypes(next);
  }
  function add() { if (types.length < MAX) setTypes([...types, { name: '', minutes: 15, dakshinaPaise: 50000, active: true }]); }
  function remove(i: number) { setTypes(types.filter((_, j) => j !== i)); }

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setStatus({});
    try {
      await api('/settings/session-types', { method: 'PUT', json: { types: types.map((t) => ({ id: t.id, name: t.name, minutes: t.minutes, dakshinaPaise: t.dakshinaPaise, active: t.active })) } });
      setStatus({ ok: 'Saved. WhatsApp and his website offer these from now.' });
      onSaved();
    } catch (err) {
      setStatus({ problem: (err as Error).message });
    } finally { setBusy(false); }
  }

  const firstActive = types.findIndex((t) => t.active);
  return (
    <form className="settings" onSubmit={save}>
      <section className="panel">
        <h2>Kinds of sitting</h2>
        <p className="muted">Up to three. A devotee picks one on WhatsApp or the website, then a time. The first one is the default.</p>
        <div className="kinds-editor">
          {types.map((t, i) => (
            <div className={`kind-row ${t.active ? '' : 'off'}`} key={t.id ?? `new-${i}`}>
              <div className="order">
                <button type="button" className="quiet" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="quiet" aria-label="Move down" disabled={i === types.length - 1} onClick={() => move(i, 1)}>↓</button>
              </div>
              <label>Minutes<input type="number" min={5} max={180} step={5} value={t.minutes} onChange={(e) => set(i, { minutes: Number(e.target.value) })} required /></label>
              <label>Dakshina, rupees<input type="number" min={0} step={1} value={Math.round(t.dakshinaPaise / 100)} onChange={(e) => set(i, { dakshinaPaise: Math.round(Number(e.target.value) * 100) })} required /></label>
              <label>Name, optional<input value={t.name} maxLength={40} placeholder="Quick guidance" onChange={(e) => set(i, { name: e.target.value })} /></label>
              <label className="check"><input type="checkbox" checked={t.active} onChange={(e) => set(i, { active: e.target.checked })} /> Offered</label>
              <span className="muted small">{i === firstActive ? 'Default' : ''}</span>
              {!t.id && <button type="button" className="quiet" onClick={() => remove(i)}>Remove</button>}
            </div>
          ))}
        </div>
        {types.length < MAX && <button type="button" onClick={add}>Add a kind</button>}
        <p className="muted" style={{ marginTop: 10 }}>On WhatsApp a kind shows as "10 min · ₹500". A kind that is not offered stays on the bookings already made with it.</p>
      </section>
      <div className="row">
        <button className="primary" disabled={busy}>Save kinds of sitting</button>
        {status.ok && <span className="status">{status.ok}</span>}
        {status.problem && <span className="problem">{status.problem}</span>}
      </div>
    </form>
  );
}
