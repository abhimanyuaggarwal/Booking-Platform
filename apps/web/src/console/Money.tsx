import { Fragment, useState } from 'react';
import { describeDate, formatRupees } from '@expert-sessions/shared';
import { useApi } from './api';
import { useOpenBooking } from './open-booking';
import { paymentWords } from './BookingDrawer';
import { addDays, todayYmd } from './format';
import type { LedgerEntry, MoneyReport } from './types';
import { useWords } from './lang';

// Two numbers she is asked for, then only the money that moved the wrong way. The full ledger is
// there, behind one click, for the day an accountant wants it.
export default function Money() {
  const [start, setStart] = useState(todayYmd());
  const { data, error } = useApi<MoneyReport>(`/money?start=${start}`);
  return (
    <>
      <header className="bar">
        <h1>Money</h1>
        <span className="muted">{data?.label ?? ''}</span>
        <span className="spacer" />
        <div className="segmented">
          <button onClick={() => data && setStart(addDays(data.monday, -7))} disabled={!data} aria-label="Previous week">‹</button>
          <button onClick={() => setStart(todayYmd())}>This week</button>
          <button onClick={() => data && setStart(addDays(data.monday, 7))} disabled={!data} aria-label="Next week">›</button>
        </div>
      </header>
      {error && <p className="banner problem">{error}</p>}
      {!data && !error && <p className="muted">Loading the week.</p>}
      {data && <MoneyView report={data} today={todayYmd()} />}
    </>
  );
}

export function MoneyView({ report: r, today, showAllAtFirst = false }: { report: MoneyReport; today: string; showAllAtFirst?: boolean }) {
  const open = useOpenBooking();
  const W = useWords();
  const [showAll, setShowAll] = useState(showAllAtFirst);
  const exceptions = r.entries.filter((e) => e.kind !== 'payment');
  const fromLives = r.entries.filter((e) => e.kind === 'payment' && e.source === 'live');
  const fromLivesPaise = fromLives.reduce((n, e) => n + e.amountPaise, 0);
  const byDate = new Map<string, LedgerEntry[]>();
  for (const e of r.entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  return (
    <>
      <section className="kpis three">
        <Kpi label="Collected this week" value={formatRupees(r.kpis.collectedWeekPaise)} sub={`${formatRupees(r.kpis.collectedTodayPaise)} of it today`} />
        <Kpi label="Returned this week" value={formatRupees(r.kpis.returnedWeekPaise)} sub={r.kpis.returnedWeekPaise === 0 ? 'nothing went back' : 'cash refunds only'} />
        <Kpi label={`Settles ${r.kpis.settlesOn}`} value={formatRupees(r.kpis.dueToSettlePaise)} sub="estimate, since last Friday" />
      </section>
      {r.account && <p className="muted small">{r.account.own ? W.gurus.payments.moneyOwn(r.account.keyId ?? '', W.gurus.payments.modeWords[r.account.mode ?? 'test']) : W.gurus.payments.moneyShared}</p>}
      <p className="muted small pilot">From his lives this week: {fromLives.length === 0 ? 'no bookings yet' : `${fromLives.length} ${fromLives.length === 1 ? 'booking' : 'bookings'} · ${formatRupees(fromLivesPaise)}`}. That is the number the pilot is judged on.</p>

      <section className="panel">
        <h2>Money that went the other way <i>returns and credits</i></h2>
        {exceptions.length === 0 ? <p className="muted">Nothing was returned or kept as a credit this week.</p> : (
          <table>
            <tbody>
              {exceptions.map((e) => (
                <tr key={e.id} className={e.bookingId ? 'clickable' : undefined} onClick={() => e.bookingId && open(e.bookingId)}>
                  <td className="time">{e.date === today ? 'today' : shortDate(e.date)} {e.time}</td>
                  <td>{entryText(e)}</td>
                  <td>{e.name}{e.slotTime ? ` · ${e.slotTime}` : ''}</td>
                  <td className={`num ${amountTone(e.kind)}`}>{amountText(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Every entry <i>{r.entries.length} this week</i></h2>
        {!showAll && <button className="small" onClick={() => setShowAll(true)}>Show every entry</button>}
        {showAll && r.entries.length === 0 && <p className="muted">Nothing moved this week.</p>}
        {showAll && r.entries.length > 0 && (
          <table>
            <thead><tr><th>Time</th><th>What</th><th>Who</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {[...byDate.entries()].map(([date, entries]) => (
                <Fragment key={date}>
                  <tr className="daterow"><td colSpan={4}>{date === today ? 'Today' : describeDate(date)}</td></tr>
                  {entries.map((e) => (
                    <tr key={e.id} className={e.bookingId ? 'clickable' : undefined} onClick={() => e.bookingId && open(e.bookingId)}>
                      <td className="time">{e.time}</td>
                      <td>{entryText(e)} {e.source === 'live' && <span className="tag g" title="This booking came from a live">live</span>}</td>
                      <td>{e.name}{e.slotTime ? ` · ${e.slotTime}` : ''}</td>
                      <td className={`num ${amountTone(e.kind)}`}>{amountText(e)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        {showAll && <button className="quiet small" style={{ marginTop: 8 }} onClick={() => setShowAll(false)}>Hide</button>}
      </section>
    </>
  );
}

// The ledger's four kinds, in the words she would use on the phone.
export function entryText(e: LedgerEntry) {
  switch (e.kind) {
    case 'payment': return paymentWords(e.providerRef);
    case 'refund': return 'Returned to her';
    case 'credit_issued': return 'Kept as her credit';
    case 'credit_used': return 'Paid with her credit';
  }
}

function amountText(e: LedgerEntry) {
  const money = formatRupees(e.amountPaise);
  if (e.kind === 'payment') return `+ ${money}`;
  if (e.kind === 'refund') return `− ${money}`;
  return `${money} credit`;
}

function amountTone(kind: LedgerEntry['kind']) {
  return kind === 'payment' ? 'pos' : kind === 'refund' ? 'neg' : 'muted';
}

function shortDate(ymd: string) {
  return describeDate(ymd).split(',')[0];
}


export function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="kpi"><em>{label}</em><b>{value}</b>{sub && <small>{sub}</small>}</div>;
}
