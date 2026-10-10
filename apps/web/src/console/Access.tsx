import { FormEvent, useState } from 'react';
import { api, useApi } from './api';
import { useWords } from './lang';
import { useConfirm } from './Confirm';
import { Initials } from './words';
import type { ConsoleUser, Me, Settings } from './types';

// Who can open this guru's console. An admin adds a person by number; they sign in with a code and
// choose a password. Teams see this read-only; only an admin changes it.
export default function Access({ settings, me }: { settings: Settings; me: Me }) {
  const W = useWords();
  const confirmDialog = useConfirm();
  const admin = me.user.role === 'admin';
  const users = useApi<ConsoleUser[]>(admin ? '/admin/users' : '/me');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'team' | 'admin'>('team');
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'problem' } | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = Array.isArray(users.data) ? users.data : [];
  const team = rows.filter((u) => u.role === 'team' && u.guruSlug === settings.slug && u.active);
  const admins = rows.filter((u) => u.role === 'admin' && u.active);

  async function add(e: FormEvent) {
    e.preventDefault(); setBusy(true); setNote(null);
    try {
      const u = await api<ConsoleUser>('/admin/users', { method: 'POST', json: { name, phone, role, guruSlug: role === 'team' ? settings.slug : undefined } });
      setNote({ text: W.access.added(u.name || u.phone), tone: 'ok' }); setName(''); setPhone(''); users.reload();
    } catch (err) { setNote({ text: (err as Error).message, tone: 'problem' }); } finally { setBusy(false); }
  }
  async function remove(u: ConsoleUser) {
    if (!await confirmDialog(W.access.confirmRemove(u.name || u.phone), W.dialog.removeAccess, true)) return;
    try { await api(`/admin/users/${u.id}`, { method: 'DELETE' }); setNote({ text: W.access.removed, tone: 'ok' }); users.reload(); }
    catch (err) { setNote({ text: (err as Error).message, tone: 'problem' }); }
  }

  if (!admin) return <section className="panel"><h2>{W.access.title}</h2><p className="muted">{W.access.hint}</p></section>;
  return (
    <div className="settings">
      {note && <p className={`banner ${note.tone}`}>{note.text}</p>}
      <People title={W.access.team(settings.name)} rows={team} onRemove={remove} />
      <People title={W.access.admins} rows={admins} onRemove={remove} />
      <form className="panel" onSubmit={add}>
        <h2>{W.access.add}</h2>
        <div className="row">
          <label>{W.access.name}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
          <label>{W.access.phone}<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="91 98765 43210" required /></label>
          <label>{W.access.role}<select value={role} onChange={(e) => setRole(e.target.value as 'team' | 'admin')}><option value="team">{W.access.roleTeam}</option><option value="admin">{W.access.roleAdmin}</option></select></label>
        </div>
        <p className="muted">{W.access.hint}</p>
        <div className="row"><button className="primary" disabled={busy}>{W.access.add}</button></div>
      </form>
    </div>
  );
}

function People({ title, rows, onRemove }: { title: string; rows: ConsoleUser[]; onRemove: (u: ConsoleUser) => void }) {
  const W = useWords();
  return (
    <section className="panel">
      <h2>{title}</h2>
      {rows.length === 0 ? <p className="muted">—</p> : (
        <table className="rows">
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="person-cell"><Initials name={u.name || u.phone} size="s" /><span><b>{u.name || u.phone}</b><span className="muted small"> +{u.phone}</span></span></td>
                <td className="muted">{u.lastLoginAt ? `${W.access.lastSeen} ${new Date(u.lastLoginAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : W.access.neverSignedIn}</td>
                <td><button className="quiet" onClick={() => onRemove(u)}>{W.access.remove}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
