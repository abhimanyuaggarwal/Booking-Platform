import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { describeSlot, formatRupees } from '@expert-sessions/shared';
import { api } from './api';
import { useWords } from './lang';
import { Initials } from './words';
import type { DevoteeRow } from './types';

// Who are our regulars. Everyone who ever booked, most recent first, with the three things the team
// asks about a name: how many sittings, when last, when next, and what she has given.
export default function Devotees() {
  const W = useWords();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<DevoteeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api<DevoteeRow[]>(`/devotees?q=${encodeURIComponent(q.trim())}`).then((r) => { if (live) setRows(r); }).catch((e: Error) => { if (live) setError(e.message); });
    }, q ? 220 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  return (
    <>
      <header className="bar page">
        <div><h1>{W.devotees.title}</h1><p className="page-line">{W.devotees.line}</p></div>
        <span className="spacer" />
        <label className="searchbox"><Search size={16} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={W.devotees.search} aria-label={W.devotees.search} /></label>
      </header>
      {error && <p className="banner problem">{error}</p>}
      {!rows && !error && <p className="muted">{W.common.loading}</p>}
      {rows && <DevoteesView rows={rows} searching={q.trim().length > 0} />}
    </>
  );
}

export function DevoteesView({ rows, searching }: { rows: DevoteeRow[]; searching: boolean }) {
  const W = useWords();
  if (rows.length === 0) return <p className="quiet-line">{searching ? W.devotees.noMatch : W.devotees.none}</p>;
  return (
    <section className="panel">
      <table className="rows people">
        <thead><tr><th>{W.devotees.name}</th><th>{W.devotees.visits}</th><th className="long">{W.devotees.last}</th><th>{W.devotees.next}</th><th className="long">{W.devotees.given}</th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="person-cell"><Initials name={d.name} size="s" /><span><Link to={`/console/devotees/${d.id}`}><b>{d.name}</b></Link><span className="muted small"> +{d.phone}</span>{d.forWhom && <span className="muted"> · {d.forWhom}</span>}</span></td>
              <td>{d.visits}</td>
              <td className="long muted">{d.lastSitting ? describeSlot(d.lastSitting) : W.devotees.never}</td>
              <td>{d.nextSitting ? describeSlot(d.nextSitting) : <span className="muted">{W.devotees.nothingAhead}</span>}</td>
              <td className="long">{formatRupees(d.givenPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
