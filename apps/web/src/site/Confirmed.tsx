import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { formatRupees, slotIdToInstant } from '@expert-sessions/shared';
import { siteApi } from './api';
import type { BookingStatus } from './types';

const ASK_EVERY_MS = 2000;
const GIVE_UP_AFTER_MS = 40000;

// She has paid and Razorpay has sent her back. The payment reaches us by webhook a moment later,
// so this page asks until it has, and says where things stand in words rather than a timer.
export default function Confirmed({ call, base }: { call: ReturnType<typeof siteApi>; base: string }) {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [search] = useSearchParams();
  const paid = search.get('paid') === '1';   // she has just come back from the payment page: the webhook may be seconds behind
  const [booking, setBooking] = useState<BookingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stillWaiting, setStillWaiting] = useState(false);

  useEffect(() => {
    let live = true;
    const startedAt = Date.now();
    const ask = async () => {
      try {
        const b = await call<BookingStatus>(`/bookings/${bookingId}`);
        if (!live) return;
        setBooking(b);
        if (b.status !== 'held' || !paid) return;   // only a payment in flight is worth asking about again
        if (Date.now() - startedAt > GIVE_UP_AFTER_MS) return setStillWaiting(true);
        setTimeout(ask, ASK_EVERY_MS);
      } catch (err) {
        if (live) setError((err as Error).message);
      }
    };
    ask();
    return () => { live = false; };
  }, [call, bookingId]);

  if (error) return <main className="wrap"><p className="problem" style={{ paddingTop: 44 }}>{error}</p></main>;
  if (!booking) return <main className="wrap"><p className="muted" style={{ paddingTop: 44 }}>One moment.</p></main>;
  return <ConfirmedView booking={booking} base={base} stillWaiting={stillWaiting} paid={paid} />;
}

const ENDINGS: Record<string, { title: string; line: (b: BookingStatus) => string }> = {
  expired: { title: 'This time was not paid for in time', line: () => 'The ten minutes ran out, so the time is open again. You can choose another.' },
  cancelled: { title: 'This time was cancelled', line: (b) => `Your dakshina comes back to your account in ${b.refundDays ?? '5 to 7 working days'}.` },
  rescheduled: { title: 'This time was moved', line: () => 'The new time is under My sessions, and on your WhatsApp.' },
  refunded: { title: 'Guruji could not sit at this time', line: () => 'Your dakshina is on its way back to you.' },
  completed: { title: 'This sitting is complete', line: () => 'Thank you for your time with him.' },
  no_show: { title: 'This time has passed', line: () => 'If you wish to book another, choose a time below.' },
};

export function ConfirmedView({ booking, base, stillWaiting, paid = false }: { booking: BookingStatus; base: string; stillWaiting: boolean; paid?: boolean }) {
  const done = booking.status === 'confirmed';
  const ending = ENDINGS[booking.status];
  const heldUnpaid = booking.status === 'held' && !paid;
  return (
    <main className="wrap" style={{ paddingTop: 44 }}>
      {done ? (
        <>
          <div className="tick">✓</div>
          <h1>Your time is confirmed</h1>
        </>
      ) : ending ? (
        <h1>{ending.title}</h1>
      ) : heldUnpaid ? (
        <h1>Your time is held</h1>
      ) : (
        <h1>{stillWaiting ? 'We are still waiting for the bank' : 'Confirming your payment'}</h1>
      )}

      <div className="card">
        <dl>
          <dt>With</dt><dd>{booking.guruName}</dd>
          <dt>When</dt><dd>{booking.when}</dd>
          <dt>Dakshina</dt><dd>{formatRupees(booking.dakshinaPaise)}{done ? ' paid' : ''}</dd>
        </dl>
      </div>

      {done ? (
        <>
          <p>Your booking is on your WhatsApp. The join link comes there ten minutes before your time.</p>
          <p className="muted">If you wish, tell him on WhatsApp what you seek guidance on. Only he will hear it.</p>
          {booking.joinUrl && joinIsNear(booking.slotId) && <a className="primary" href={booking.joinUrl}>Open the waiting room</a>}
          <Link className="ghost" to={`${base}/sessions`}>See my sessions</Link>
        </>
      ) : ending ? (
        <>
          <p>{ending.line(booking)}</p>
          {['expired', 'no_show'].includes(booking.status)
            ? <Link className="primary" to={base || '/'}>Choose a time</Link>
            : <Link className="ghost" to={`${base}/sessions`}>See my sessions</Link>}
        </>
      ) : heldUnpaid ? (
        <>
          <p>Pay the dakshina within ten minutes to make it yours. Nothing is booked until then.</p>
          {booking.payUrl && <a className="primary" href={booking.payUrl}>Pay {formatRupees(booking.dakshinaPaise)}</a>}
        </>
      ) : stillWaiting ? (
        <>
          <p>Banks are sometimes slow to tell us. If the dakshina has left your account, your time is safe and the confirmation will reach your WhatsApp.</p>
          <Link className="ghost" to={`${base}/sessions`}>See my sessions</Link>
        </>
      ) : (
        <p className="muted">This takes a few seconds.</p>
      )}
    </main>
  );
}

/** Pure. The waiting room is offered from an hour before her time until an hour after. */
export function joinIsNear(slotId: string, now: Date = new Date()): boolean {
  const start = slotIdToInstant(slotId).getTime();
  return now.getTime() >= start - 60 * 60000 && now.getTime() <= start + 60 * 60000;
}
