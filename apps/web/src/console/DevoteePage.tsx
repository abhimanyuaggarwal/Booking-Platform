import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { describeSlot, formatRupees } from '@expert-sessions/shared';
import { useApi } from './api';
import { useOnChange } from './changed';
import { useBookForCaller, useOpenBooking } from './open-booking';
import { useWords } from './lang';
import { Initials, StateTag } from './words';
import type { DevoteeDetail } from './types';

// One person: who she is, every time she booked, and a button to book her next one with her number
// already typed. Each row opens the same booking drawer as everywhere else.
export default function DevoteePage() {
  const { id } = useParams();
  const { data, error, reload } = useApi<DevoteeDetail>(`/devotees/${id}`);
  useOnChange(reload);
  if (error) return <p className="banner problem">{error}</p>;
  if (!data) return <p className="muted">…</p>;
  return <DevoteeView d={data} />;
}

export function DevoteeView({ d }: { d: DevoteeDetail }) {
  const W = useWords();
  const open = useOpenBooking();
  const bookFor = useBookForCaller();
  return (
    <>
      <p className="crumb"><Link to="/console/devotees"><ArrowLeft size={14} aria-hidden="true" /> {W.devotees.back}</Link></p>
      <header className="person-head">
        <Initials name={d.name} size="l" />
        <div className="who">
          <h1>{d.name}</h1>
          <p className="muted">+{d.phone}{d.forWhom ? ` · ${W.devotees.forWhom} ${d.forWhom}` : ''} · {W.devotees.visitsOf(d.visits)} · {formatRupees(d.givenPaise)}</p>
        </div>
        <button className="primary" onClick={() => bookFor(undefined, d.phone)}>{W.devotees.book}</button>
      </header>
      <section className="panel">
        <h2>{W.devotees.history}</h2>
        {d.bookings.length === 0 ? <p className="muted">{W.devotees.never}</p> : (
          <table className="rows">
            <tbody>
              {d.bookings.map((b) => (
                <tr key={b.id} className="clickable" onClick={() => open(b.id)}>
                  <td className="time">{describeSlot(b.slotId)}</td>
                  <td className="muted">{b.minutes ? W.drawer.minutes(b.minutes) : ''}{b.complimentary ? ` · ${W.drawer.complimentary}` : b.dakshinaPaise != null ? ` · ${formatRupees(b.dakshinaPaise)}` : ''}</td>
                  <td><StateTag status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
