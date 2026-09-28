import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import type { DayKey, Pattern, Settings } from './types';

const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES: Record<DayKey, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

// His weekly sittings, the dakshina, and the days he is away. Writes gurus.pattern_json, closed_dates,
// dakshina_paise. Both doors offer slots from this the moment it is saved.
export default function PatternEditor({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [pattern, setPattern] = useState<Pattern>(structuredClone(settings.pattern));
  const [closedDates, setClosedDates] = useState<string[]>([...settings.closedDates]);
  const [rupees, setRupees] = useState(String(settings.dakshinaPaise / 100));
  const [status, setStatus] = useState<{ ok?: string; problem?: string }>({});
  const [busy, setBusy] = useState(false);

  function setWindow(day: DayKey, i: number, which: 0 | 1, value: string) {
    const windows = pattern.weeklyPattern[day].map((w, j) => (j === i ? ([which === 0 ? value : w[0], which === 1 ? value : w[1]] as [string, string]) : w));
    setPattern({ ...pattern, weeklyPattern: { ...pattern.weeklyPattern, [day]: windows } });
  }
  function addWindow(day: DayKey) {
    const last = pattern.weeklyPattern[day].at(-1);
    const next: [string, string] = last ? ['16:00', '17:30'] : ['10:00', '13:00'];
    setPattern({ ...pattern, weeklyPattern: { ...pattern.weeklyPattern, [day]: [...pattern.weeklyPattern[day], next] } });
  }
  function removeWindow(day: DayKey, i: number) {
    setPattern({ ...pattern, weeklyPattern: { ...pattern.weeklyPattern, [day]: pattern.weeklyPattern[day].filter((_, j) => j !== i) } });
  }
  function setNumber(key: keyof Omit<Pattern, 'weeklyPattern'>, value: string) {
    setPattern({ ...pattern, [key]: Number(value) });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus({});
    try {
      await api('/settings/pattern', { method: 'PUT', json: { pattern, closedDates, dakshinaPaise: Math.round(Number(rupees) * 100) } });
      setStatus({ ok: 'Saved. WhatsApp and his website offer the new times from now.' });
      onSaved();
    } catch (err) {
      setStatus({ problem: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="settings" onSubmit={save}>
      <section className="panel">
        <h2>Weekly sittings</h2>
        {DAYS.map((day) => (
          <div className="dayline" key={day}>
            <b>{DAY_NAMES[day]}</b>
            <div className="windows">
              {pattern.weeklyPattern[day].length === 0 && <span className="muted" style={{ padding: '8px 0' }}>no sittings</span>}
              {pattern.weeklyPattern[day].map((w, i) => (
                <div className="window" key={i}>
                  <input type="time" value={w[0]} onChange={(e) => setWindow(day, i, 0, e.target.value)} required />
                  <span className="muted">to</span>
                  <input type="time" value={w[1]} onChange={(e) => setWindow(day, i, 1, e.target.value)} required />
                  <button type="button" className="quiet" onClick={() => removeWindow(day, i)}>Remove</button>
                </div>
              ))}
              <div><button type="button" onClick={() => addWindow(day)}>Add a sitting</button></div>
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Each time</h2>
        <div className="row">
          <label>Minutes per session<input type="number" min={5} max={180} value={pattern.slotMinutes} onChange={(e) => setNumber('slotMinutes', e.target.value)} /></label>
          <label>Gap between sessions<input type="number" min={0} max={120} value={pattern.gapMinutes} onChange={(e) => setNumber('gapMinutes', e.target.value)} /></label>
          <label>Earliest booking, minutes ahead<input type="number" min={0} max={10080} value={pattern.minimumNoticeMinutes} onChange={(e) => setNumber('minimumNoticeMinutes', e.target.value)} /></label>
          <label>Days offered ahead<input type="number" min={1} max={60} value={pattern.daysAhead} onChange={(e) => setNumber('daysAhead', e.target.value)} /></label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <label>Dakshina, in rupees<input type="number" min={0} step={1} value={rupees} onChange={(e) => setRupees(e.target.value)} /></label>
        </div>
      </section>

      <section className="panel">
        <h2>Days he is away</h2>
        <div className="chips">
          {closedDates.length === 0 && <span className="muted">none</span>}
          {closedDates.map((d) => (
            <span className="chip" key={d}>{d}<button type="button" aria-label={`Open ${d} again`} onClick={() => setClosedDates(closedDates.filter((x) => x !== d))}>×</button></span>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          To close a day use <Link to="/console/calendar">Close a day on the Calendar</Link>: it moves the people already booked and tells them, then closes the date here. Remove a date above to open it again, then save.
        </p>
      </section>

      <div className="row">
        <button className="primary" disabled={busy}>Save timings</button>
        {status.ok && <span className="status">{status.ok}</span>}
        {status.problem && <span className="problem">{status.problem}</span>}
      </div>
    </form>
  );
}
