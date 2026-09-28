import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRupees } from '@expert-sessions/shared';
import { siteApi, useSite } from './api';
import SignIn from './SignIn';
import PickTime from './PickTime';
import type { MyBooking, MySessions as Sessions } from './types';

// Her own sessions: join, move once, cancel, and her history. This is also where she books again.
export default function MySessions({ call, base }: { call: ReturnType<typeof siteApi>; base: string }) {
  const { data, error, status, reload } = useSite<Sessions>(call, '/me');
  const [after, setAfter] = useState<Sessions | null>(null);
  const sessions = after ?? data;

  // The first /me answered 401 before she signed in. Once her code is accepted her sessions arrive
  // with that answer, so a filled `after` outranks the stale status and its error sentence.
  if (!sessions) {
    if (status === 401) return <SignIn call={call} onSignedIn={setAfter} />;
    if (error) return <main className="wrap"><p className="problem" style={{ paddingTop: 44 }}>{error}</p></main>;
    return <main className="wrap"><p className="muted" style={{ paddingTop: 44 }}>One moment.</p></main>;
  }

  return (
    <MySessionsView
      sessions={sessions}
      base={base}
      onAct={async (path, json) => {
        const next = await call<Sessions>(path, { method: 'POST', json });
        setAfter(next);
        reload();
        return next;
      }}
      onSignOut={async () => { await call('/signout', { method: 'POST' }); window.location.assign(base || '/'); }}
    />
  );
}

type Act = (path: string, json?: unknown) => Promise<Sessions>;

export function MySessionsView({ sessions: s, base, onAct, onSignOut }: { sessions: Sessions; base: string; onAct: Act; onSignOut: () => void }) {
  const [moving, setMoving] = useState<MyBooking | null>(null);
  const [booking, setBooking] = useState(false);
  const [said, setSaid] = useState<string | null>(s.said ?? null);
  const [problem, setProblem] = useState<string | null>(null);

  async function act(path: string, json?: unknown) {
    setProblem(null);
    try {
      const next = await onAct(path, json);
      setSaid(next.said ?? null);
      setMoving(null);
      setBooking(false);
    } catch (err) {
      setProblem((err as Error).message);
    }
  }

  async function cancel(b: MyBooking) {
    if (!window.confirm(`Cancel ${b.when}? Your dakshina is kept as a credit for thirty days.`)) return;
    await act(`/me/bookings/${b.id}/cancel`);
  }

  return (
    <main className="wrap" style={{ paddingTop: 30 }}>
      <p className="muted" style={{ fontSize: 14 }}>
        Signed in as ••••••{s.devotee.phoneTail} · <button className="plain" onClick={onSignOut}>Sign out</button>
      </p>
      {said && <p className="ok">{said}</p>}
      {problem && <p className="problem">{problem}</p>}

      {s.credit.balancePaise > 0 && (
        <div className="credit">
          <b>You have a credit of {formatRupees(s.credit.balancePaise)}.</b>
          <p className="muted" style={{ margin: '4px 0 10px', fontSize: 14 }}>
            It is good for any time with {s.guru.name}{s.credit.expiresAt ? `, until ${new Date(s.credit.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}` : ''}.
          </p>
          {!booking && <button className="primary" onClick={() => setBooking(true)}>Book a time with it</button>}
        </div>
      )}

      {booking && (
        <PickTime
          title="Book with your credit"
          note={`Your credit of ${formatRupees(s.credit.balancePaise)} covers this time. Nothing more to pay.`}
          slots={s.slots}
          confirmLabel="Confirm this time"
          onConfirm={(slotId) => act('/me/book-with-credit', { slotId })}
          onCancel={() => setBooking(false)}
        />
      )}

      <section style={{ borderTop: 0 }}>
        <p className="eyebrow">Upcoming</p>
        {s.upcoming.length === 0 && <p className="muted">Nothing booked just now. <Link to={base || '/'}>See his open times</Link></p>}
        {s.upcoming.map((b) => (
          <div className="card" key={b.id}>
            <h3 style={{ marginBottom: 2 }}>{b.when}</h3>
            <p className="muted" style={{ fontSize: 14 }}>One to one · {s.guru.slotMinutes} minutes · dakshina paid</p>
            {b.joinUrl && <a className="primary" href={b.joinUrl}>Join</a>}
            {!b.cannotReschedule && <button className="ghost" onClick={() => setMoving(b)}>Reschedule</button>}
            {!b.cannotCancel && <button className="ghost" onClick={() => cancel(b)}>Cancel this time</button>}
            {b.cannotReschedule && <p className="muted" style={{ fontSize: 14, margin: '10px 0 0' }}>{b.cannotReschedule}</p>}
            {b.cannotCancel && b.cannotCancel !== b.cannotReschedule && <p className="muted" style={{ fontSize: 14, margin: '6px 0 0' }}>{b.cannotCancel}</p>}
          </div>
        ))}
      </section>

      {moving && (
        <PickTime
          title={`Move ${moving.when}`}
          note="Pick a new time. Your dakshina moves with the booking."
          slots={s.slots}
          confirmLabel="Confirm new time"
          onConfirm={(slotId) => act(`/me/bookings/${moving.id}/reschedule`, { slotId })}
          onCancel={() => setMoving(null)}
        />
      )}

      {s.earlier.length > 0 && (
        <section>
          <p className="eyebrow">Earlier</p>
          {s.earlier.map((b) => (
            <p key={b.id} style={{ marginBottom: 8 }}>
              {b.when} <span className="muted">· {earlierWords(b.status)}</span>
            </p>
          ))}
        </section>
      )}
      <p className="muted" style={{ fontSize: 14 }}>A time may be moved once, up to four hours before. Nearer than that, write to his team on WhatsApp.</p>
    </main>
  );
}

export function earlierWords(status: string) {
  return ({
    completed: 'completed', cancelled: 'cancelled, dakshina kept as credit', refunded: 'he could not sit, dakshina returned',
    no_show: 'not joined', rescheduled: 'moved to another time', confirmed: 'past', held: 'not paid', expired: 'not paid in time',
  } as Record<string, string>)[status] ?? status;
}
