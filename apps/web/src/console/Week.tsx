import { Fragment, useState } from 'react';
import { useApi } from './api';
import { addDays, shortTime, todayYmd } from './format';
import { useOnChange } from './changed';
import { useBookForCaller, useOpenBooking } from './open-booking';
import CloseDay from './CloseDay';
import Meetups from './Meetups';
import { useWords } from './lang';
import { askedAbout, chipClass, StateTag } from './words';
import type { CloseDayResult, GridDay, WeekEvent, WeekReport } from './types';

// His week is one picture: every sitting, every open time, and his satsangs, lives and meetups in
// the same seven columns. Every name opens its booking; every open time can be held for a caller.
// The same week as a list, grouped by day, for scanning or a phone.
export default function Week() {
  const W = useWords();
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
    setDone(W.closeDay.done({ date: r.date, moved, notified: r.notified, notDelivered: r.notDelivered.length, failed: r.moved.length - moved, expiredHolds: r.expiredHolds }));
    reload();
  }

  return (
    <>
      <header className="bar">
        <h1>{W.week.title}</h1>
        <span className="muted">{data ? `${data.label} · ${W.week.filled(data.filled, data.total)}` : ''}</span>
        <span className="spacer" />
        <div className="segmented long" role="tablist">
          <button role="tab" aria-selected={view === 'grid'} className={view === 'grid' ? 'on' : undefined} onClick={() => setView('grid')}>{W.week.grid}</button>
          <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : undefined} onClick={() => setView('list')}>{W.week.list}</button>
        </div>
        {!closing && <button onClick={() => { setClosing(true); setDone(null); }}>{W.week.cannotSit}</button>}
        <div className="segmented">
          <button onClick={() => data && setStart(addDays(data.monday, -7))} disabled={!data} aria-label="Previous week">‹</button>
          <button onClick={() => setStart(todayYmd())}>{W.week.thisWeek}</button>
          <button onClick={() => data && setStart(addDays(data.monday, 7))} disabled={!data} aria-label="Next week">›</button>
        </div>
      </header>
      {closing && <CloseDay onDone={closed} onCancel={() => setClosing(false)} />}
      {done && <p className="banner ok">{done}</p>}
      {error && <p className="banner problem">{error}</p>}
      {!data && !error && <p className="muted">{W.week.loading}</p>}
      {data && view === 'grid' && <WeekGrid week={data} onOpen={open} onBook={bookFor} />}
      {data && <WeekList week={data} onOpen={open} onBook={bookFor} phoneOnly={view === 'grid'} />}

      <section className="panel">
        <h2>{W.week.schedule} <i>{data ? W.week.thisWeekCount(data.events?.length ?? 0) : ''}</i></h2>
        <p className="muted small" style={{ margin: '0 0 8px' }}>{W.week.scheduleHint}</p>
        {schedule
          ? <><Meetups /><button className="quiet small" onClick={() => setSchedule(false)}>{W.week.hide}</button></>
          : <button className="small" onClick={() => setSchedule(true)}>{W.week.addEvent}</button>}
      </section>
    </>
  );
}

export function WeekGrid({ week, onOpen = () => {}, onBook = () => {} }: { week: WeekReport; onOpen?: (bookingId: string) => void; onBook?: (slotId: string) => void }) {
  const W = useWords();
  const extras = week.days.flatMap((d) => d.extra.map((b) => ({ day: d, b })));
  const events = week.events ?? [];
  return (
    <div className="gcal">
      <table>
        <thead>
          <tr>
            <th />
            {week.days.map((d, i) => (
              <th key={d.date} className={d.closed ? 'cl' : d.today ? 'today' : ''}>
                {W.week.days[i]}<b>{d.dayOfMonth}</b><i>{d.closed ? W.week[d.closed === 'closed' ? 'closed' : 'noSittings'] : `${d.filled} / ${d.total}`}</i>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.length > 0 && (
            <tr className="events">
              <td className="tcol">{W.week.his}</td>
              {week.days.map((d) => (
                <td key={d.date}>
                  {events.filter((e) => e.date === d.date).map((e) => <span key={e.id} className={`evchip ${e.kind}`} title={e.title}>{W.week[e.kind]} {e.time}</span>)}
                </td>
              ))}
            </tr>
          )}
          {week.times.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>{W.week.noSittingsLine}</td></tr>}
          {week.times.map((t) => (
            <Fragment key={t}>
              {t === week.afternoonFrom && <tr className="divider"><td colSpan={8}>{W.week.rest}</td></tr>}
              <tr>
                <td className="tcol">{shortTime(t)}</td>
                {week.days.map((d) => {
                  if (d.closed) return <td key={d.date} className="shut" />;
                  const slot = d.slots[t];
                  if (!slot) return <td key={d.date} className="none" />;
                  if (!slot.booking) return <td key={d.date}><button className="open" onClick={() => onBook(slot.slotId)}>{W.week.open}</button></td>;
                  return (
                    <td key={d.date}>
                      <button className={`ev ${chipClass(slot.booking.status)}`} onClick={() => onOpen(slot.booking!.id)} title={slot.booking.name}>
                        <b>{slot.booking.name}</b>{W.state[slot.booking.status]}
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
          {W.week.outside} {extras.map(({ day, b }) => `${b.name} (${W.week.days[week.days.indexOf(day)]} ${day.dayOfMonth}, ${shortTime(b.slotId.slice(16))})`).join(', ')}.
        </p>
      )}
      <p className="legend">
        <span><i className="paid" />{W.week.legend.paid}</span><span><i className="hold" />{W.week.legend.hold}</span><span><i className="done" />{W.week.legend.done}</span><span><i className="noshow" />{W.week.legend.noshow}</span>
        <span><i className="open" />{W.week.legend.open}</span><span><i className="shut" />{W.week.legend.shut}</span>
      </p>
    </div>
  );
}

// The same week as a list, grouped by day. Shown on request on a laptop, always on a phone.
export function WeekList({ week, onOpen, onBook, phoneOnly = false }: { week: WeekReport; onOpen: (id: string) => void; onBook: (slotId: string) => void; phoneOnly?: boolean }) {
  return (
    <div className={`glist ${phoneOnly ? 'phone-only' : ''}`}>
      {week.days.map((d, i) => <DayCard key={d.date} day={d} index={i} times={week.times} events={(week.events ?? []).filter((e) => e.date === d.date)} onOpen={onOpen} onBook={onBook} />)}
    </div>
  );
}

function DayCard({ day: d, index, times, events, onOpen, onBook }: { day: GridDay; index: number; times: string[]; events: WeekEvent[]; onOpen: (id: string) => void; onBook: (slotId: string) => void }) {
  const W = useWords();
  const slots = times.map((t) => d.slots[t]).filter(Boolean);
  const all = [...slots.map((s) => s.booking).filter(Boolean), ...d.extra];
  return (
    <section className={`panel day ${d.today ? 'today' : ''}`}>
      <h2>{W.week.days[index]} {d.dayOfMonth} <i>{d.closed ? W.week[d.closed === 'closed' ? 'closed' : 'noSittings'] : `${d.filled} / ${d.total}`}</i></h2>
      {events.map((e) => <p key={e.id} className="muted small dayevent">{W.week[e.kind]} · {e.title} · {e.time}</p>)}
      {d.closed && <p className="muted">{d.closed === 'closed' ? W.week.closedNobody : W.week.noSittingsLine}</p>}
      {!d.closed && slots.map((s) => s.booking ? (
        <button key={s.slotId} className={`line ev ${chipClass(s.booking.status)}`} onClick={() => onOpen(s.booking!.id)}>
          <span className="time">{shortTime(s.slotId.slice(16))}</span><b>{s.booking.name}</b><StateTag status={s.booking.status} />
        </button>
      ) : (
        <button key={s.slotId} className="line open" onClick={() => onBook(s.slotId)}>
          <span className="time">{shortTime(s.slotId.slice(16))}</span><span className="muted">{W.week.bookIt}</span>
        </button>
      ))}
      {d.extra.map((b) => (
        <button key={b.id} className={`line ev ${chipClass(b.status)}`} onClick={() => onOpen(b.id)}>
          <span className="time">{shortTime(b.slotId.slice(16))}</span><b>{b.name}</b><StateTag status={b.status} />
        </button>
      ))}
      {all.length === 0 && !d.closed && slots.length === 0 && <p className="muted">{W.week.noSittingsLine}</p>}
    </section>
  );
}

// Kept for the people list that other screens may link to.
export { askedAbout };
