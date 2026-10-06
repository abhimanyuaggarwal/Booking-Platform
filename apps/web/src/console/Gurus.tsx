import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { formatRupees } from '@expert-sessions/shared';
import { useApi } from './api';
import { useWords } from './lang';
import type { GuruSummary } from './types';

// Every guru on Samvad, for the admin: where each one stands, and the door into his setup.
export default function Gurus() {
  const W = useWords();
  const { data, error } = useApi<GuruSummary[]>('/admin/gurus');
  return (
    <>
      <header className="bar page">
        <div><h1>{W.gurus.title}</h1><p className="page-line">{W.gurus.line}</p></div>
        <span className="spacer" />
        <Link className="btn primary" to="/console/gurus/new"><Plus size={16} aria-hidden="true" /> {W.gurus.add}</Link>
      </header>
      {error && <p className="banner problem">{error}</p>}
      {!data && !error && <p className="muted">{W.common.loading}</p>}
      {data && <GurusView rows={data} />}
    </>
  );
}

export function StatusBadge({ status }: { status: GuruSummary['status'] }) {
  const W = useWords();
  return <span className={`status-badge ${status}`}>{W.gurus.statusWords[status]}</span>;
}

export function GurusView({ rows }: { rows: GuruSummary[] }) {
  const W = useWords();
  if (rows.length === 0) return <p className="quiet-line">{W.gurus.none}</p>;
  return (
    <section className="panel">
      <table className="rows people">
        <thead><tr><th>{W.gurus.name}</th><th>{W.gurus.status}</th><th className="long">{W.gurus.address}</th><th>{W.gurus.setup}</th><th className="long">{W.gurus.subscription}</th><th></th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.slug}>
              <td><Link to={`/console/gurus/${g.slug}`}><b>{g.name}</b></Link><span className="muted small"> · {g.language === 'hi' ? 'हिंदी' : 'English'}</span></td>
              <td><StatusBadge status={g.status} /></td>
              <td className="long muted">{g.domain ?? g.subdomain ?? `/s/${g.slug}`}</td>
              <td><span className="progress-text">{W.gurus.progress(g.done, g.total)}</span></td>
              <td className="long muted">{g.subscription.plan ? `${g.subscription.plan}${g.subscription.feePaise ? ` · ${formatRupees(g.subscription.feePaise)}` : ''}${g.subscription.status ? ` · ${W.gurus.subStatusWords[g.subscription.status]}` : ''}` : '—'}</td>
              <td><Link className="btn" to={`/console/gurus/${g.slug}`}>{W.gurus.open}</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
