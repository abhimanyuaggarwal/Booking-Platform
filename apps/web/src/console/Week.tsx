import { Fragment, useState } from 'react';
import { useApi } from './api';
import { addDays, shortTime, todayYmd } from './format';
import { useOnChange } from './changed';
import { useBookForCaller, useOpenBooking } from './open-booking';
import CloseDay from './CloseDay';
import Meetups from './Meetups';
import { askedAbout, chipClass, stateWord } from './words';
import type { CloseDayResult, GridDay, WeekEvent, WeekReport } from './types';

// His week is one picture: every sitting, every open time, and his satsangs, lives and meetups in
// the same seven columns. Every name opens its booking; every open time can be held for a caller.
// The same week as a list, grouped by day, for scanning or a phone.
export default function Week() {
  const [start, setStart] = useState(todayYmd());
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [closing, setClosing] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const { data, error, reload } = useApi<WeekReport>(`/week?start=${start}`);
  useOnChange(reload);
  const open = useOpenBooking();
  const bookFor = useBookForCaller();

  function closed(r: CloseDayResult) {
    setClosing(false);
    const moved = r.moved.filter((m) => m.ok).length;
    const failed = r.moved.length - moved;
    setDone(`${r.date} is closed. ${moved} moved and ${r.notified} told on WhatsApp` +
      (r.notDelivered.length ? `; ${r.notDelivered.length} could not be reached — call them` : '') +
      (failed ? `; ${failed} could not be moved because the time was taken — see the list` : '') +
      (r.expiredHolds ? `; ${r.expiredHolds} unpaid hold released` : '') + '.');
    reload();
  }

  return (
    <>
      <header className="bar">
        <h1>Week</h1>
        <span className="muted">{data ? `${data.label} · ${data.filled} of ${data.total} filled` : ''}</span>
        <span className="spacer" />
        <div className="segmented long" role="tablist">
          <button role="tab" aria-selected={view === 'grid'} className={view === 'grid' ? 'on' : undefined} onClick={() => setView('grid')}>Grid</button>
          <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : undefined} onClick={() => setView('list')}>List</button>
        </div>
        {!closing && <button onClick={() => { setClosing(true); setDone(null); }}>Close a day</button>}
        <div className="segmented">
          <button onClick={() => data && setStart(addDays(data.monday, -7))} disabled={!data} aria-label="Previous week">‹</button>
          <button onClick={() => setStart(todayYmd())}>This week</button>
          <button onClick={() => data && setStart(addDays(data.monday, 7))} disabled={!data} aria-label="Next week">›</button>
        </div>
      </header>
      {closing && <CloseDay onDone={closed} onCancel={() => setClosing(false)} />}
      {done && <p className="banner ok">{done}</p>}
      {error && <p className="banner problem">{error}</p>}
      {!data && !error && <p className="muted">Loading the week.</p>}
      {data && view === 'grid' && <WeekGrid week={data} onOpen={open} onBook={bookFor} />}
      {data && <WeekList week={data} onOpen={open} onBook={bookFor} phoneOnly={view === 'grid'} />}

      <section className="panel">
        <h2>His schedule <i>{data ? `${data.events?.length ?? 0} this week` : ''}</i></h2>
        <p className="muted small" style={{ margin: '0 0 8px' }}>Satsangs, lives and meetups appear on his website and, in the week above, on their day.</p>
        {schedule
          ? <><Meetups /><button className="quiet small" onClick={() => setSchedule(false)}>Hide</button></>
          : <button className="small" onClick={() => setSchedule(true)}>Add or change a satsang, live or meetup</button>}
      </section>
    </>
  );
}

export function WeekGrid({ week, onOpen = () => {}, onBook = () => {} }: { week: WeekReport; onOpen?: (bookingId: string) => void; onBook?: (slotId: string) => void }) {
  const extras = week.days.flatMap((d) => d.extra.map((b) => ({ day: d, b })));
  const events = week.events ?? [];
  return (
    <div className="gcal">
      <table>
        <thead>
          <tr>
            <th />
            {week.days.map((d) => (
              <th key={d.date} className={d.closed ? 'cl' : d.today ? 'today' : ''}>
                {d.weekday}<b>{d.dayOfMonth}</b><i>{d.closed ?? `${d.filled} / ${d.total}`}</i>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.length > 0 && (
            <tr className="events">
              <td className="tcol">his</td>
              {week.days.map((d) => (
                <td key={d.date}>
                  {events.filter((e) => e.date === d.date).map((e) => <span key={e.id} className={`evchip ${e.kind}`} title={e.title}>{eventWord(e)} {e.time}</span>)}
                </td>
              ))}
            </tr>
          )}
          {week.times.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>No sittings this week.</td></tr>}
          {week.times.map((t) => (
            <Fragment key={t}>
              {t === week.afternoonFrom && <tr className="divider"><td colSpan={8}>afternoon — rest</td></tr>}
              <tr>
                <td className="tcol">{shortTime(t)}</td>
                {week.days.map((d) => {
                  if (d.closed) return <td key={d.date} className="shut" />;
                  const slot = d.slots[t];
                  if (!slot) return <td key={d.date} className="none" />;
                  if (!slot.booking) return <td key={d.date}><button className="open" onClick={() => onBook(slot.slotId)} title="Hold this time for a caller">open</button></td>;
                  return (
                    <td key={d.date}>
                      <button className={`ev ${chipClass(slot.booking.status)}`} onClick={() => onOpen(slot.booking!.id)} title={`${slot.booking.name} · ${stateWord(slot.booking.status)}`}>
                        <b>{slot.booking.name}</b>{stateWord(slot.booking.status)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      {extras.length > 0 && (
        <p className="muted foot">
          Also booked outside his current timings: {extras.map(({ day, b }) => `${b.name} (${day.weekday} ${day.dayOfMonth}, ${shortTime(b.slotId.slice(16))})`).join(', ')}.
        </p>
      )}
      <p className="legend">
        <span><i className="paid" />paid</span><span><i className="hold" />paying</span><span><i className="done" />done</span><span><i className="noshow" />did not join</span>
        <span><i className="open" />open</span><span><i className="shut" />day closed</span>
      </p>
    </div>
  );
}

// The same week as a list, grouped by day. Shown on request on a laptop, always on a phone.
export function WeekList({ week, onOpen, onBook, phoneOnly = false }: { week: WeekReport; onOpen: (id: string) => void; onBook: (slotId: string) => void; phoneOnly?: boolean }) {
  return (
    <div className={`glist ${phoneOnly ? 'phone-only' : ''}`}>
      {week.days.map((d) => <DayCard key={d.date} day={d} times={week.times} events={(week.events ?? []).filter((e) => e.date === d.date)} onOpen={onOpen} onBook={onBook} />)}
    </div>
  );
}

function DayCard({ day: d, times, events, onOpen, onBook }: { day: GridDay; times: string[]; events: WeekEvent[]; onOpen: (id: string) => void; onBook: (slotId: string) => void }) {
  const slots = times.map((t) => d.slots[t]).filter(Boolean);
  const all = [...slots.map((s) => s.booking).filter(Boolean), ...d.extra];
  return (
    <section className={`panel day ${d.today ? 'today' : ''}`}>
      <h2>{d.weekday} {d.dayOfMonth} <i>{d.closed ?? `${d.filled} / ${d.total}`}</i></h2>
      {events.map((e) => <p key={e.id} className="muted small dayevent">{eventWord(e)} · {e.title} · {e.time}</p>)}
      {d.closed && <p className="muted">{d.closed === 'closed' ? 'Closed. Nobody is booked.' : 'No sittings.'}</p>}
      {!d.closed && slots.map((s) => s.booking ? (
        <button key={s.slotId} className={`line ev ${chipClass(s.booking.status)}`} onClick={() => onOpen(s.booking!.id)}>
          <span className="time">{shortTime(s.slotId.slice(16))}</span><b>{s.booking.name}</b><span className="muted">{stateWord(s.booking.status)}</span>
        </button>
      ) : (
        <button key={s.slotId} className="line open" onClick={() => onBook(s.slotId)}>
          <span className="time">{shortTime(s.slotId.slice(16))}</span><span className="muted">open · book for a caller</span>
        </button>
      ))}
      {d.extra.map((b) => (
        <button key={b.id} className={`line ev ${chipClass(b.status)}`} onClick={() => onOpen(b.id)} title="Outside his current timings">
          <span className="time">{shortTime(b.slotId.slice(16))}</span><b>{b.name}</b><span className="muted">{stateWord(b.status)}</span>
        </button>
      ))}
      {all.length === 0 && !d.closed && slots.length === 0 && <p className="muted">No sittings.</p>}
    </section>
  );
}

function eventWord(e: WeekEvent) {
  return e.kind === 'live' ? 'Live' : e.kind === 'meetup' ? 'Meetup' : 'Satsang';
}

// Kept for the people list that other screens may link to.
export { askedAbout };
