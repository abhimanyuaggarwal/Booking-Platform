import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Sun, CalendarDays, Users, IndianRupee, Settings as SettingsIcon } from 'lucide-react';
import { describeSlot } from '@expert-sessions/shared';
import { api } from './api';
import { useOnChange } from './changed';
import { useOpenBooking } from './open-booking';
import { useLang, useWords } from './lang';
import { groupAttention, Initials, stateWord } from './words';
import type { AttentionRow, BookingRow } from './types';

// Five places, each named for what the team does there: Today, Calendar, Devotees, Money,
// Settings. Side rail on a laptop, bottom tabs on a phone. What needs the team shows as a count on Today.
export default function Nav() {
  const W = useWords();
  const [needs, setNeeds] = useState<number>(0);
  const load = () => api<AttentionRow[]>('/attention').then((rows) => setNeeds(groupAttention(rows).toDecide.length)).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  useOnChange(load);
  return (
    <nav className="console-nav" aria-label="Console">
      <NavLink to="/console" end><Sun size={18} aria-hidden="true" /><span>{W.nav.today}</span>{needs ? <span className="badge">{needs}</span> : null}</NavLink>
      <NavLink to="/console/calendar"><CalendarDays size={18} aria-hidden="true" /><span>{W.nav.calendar}</span></NavLink>
      <NavLink to="/console/devotees"><Users size={18} aria-hidden="true" /><span>{W.nav.devotees}</span></NavLink>
      <NavLink to="/console/money"><IndianRupee size={18} aria-hidden="true" /><span>{W.nav.money}</span></NavLink>
      <NavLink to="/console/settings"><SettingsIcon size={18} aria-hidden="true" /><span>{W.nav.settings}</span></NavLink>
    </nav>
  );
}

// Who the console is for, the search that works from anywhere, the one action she takes with a
// phone to her ear, and the language. Sign out lives here too, because a shared laptop changes hands.
export function TopBar({ guruName, onBookForCaller }: { guruName: string; onBookForCaller: () => void }) {
  const W = useWords();
  const { lang, setLang } = useLang();
  async function signOut() {
    await api('/logout', { method: 'POST' });
    window.location.assign('/console');
  }
  return (
    <header className="topbar">
      <b className="brand">{guruName}<span className="muted"> · {W.product}</span></b>
      <GlobalSearch />
      <button className="primary" onClick={onBookForCaller}><span className="long">{W.nav.newBooking}</span><span className="short">{W.nav.newBookingShort}</span></button>
      <button className="quiet lang" onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} aria-label="Language">{W.nav.language}</button>
      <button className="quiet long" onClick={signOut}>{W.nav.signOut}</button>
    </header>
  );
}

// Name or number, from any screen. Results open the booking drawer over the current screen.
export function GlobalSearch() {
  const W = useWords();
  const open = useOpenBooking();
  const [typed, setTyped] = useState('');
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = typed.trim();
    if (q.length < 2) { setRows(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api<BookingRow[]>(`/bookings?q=${encodeURIComponent(q)}`).then((r) => { if (live) { setRows(r.slice(0, 8)); setActive(0); } }).catch(() => { if (live) setRows([]); });
    }, 220);
    return () => { live = false; clearTimeout(t); };
  }, [typed]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setRows(null); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  function pick(b: BookingRow) {
    open(b.id);
    setTyped('');
    setRows(null);
  }

  return (
    <div className="search" ref={box}>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (!rows || rows.length === 0) { if (e.key === 'Escape') setTyped(''); return; }
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); pick(rows[active]); }
          if (e.key === 'Escape') { setRows(null); setTyped(''); }
        }}
        placeholder={W.nav.search}
        aria-label={W.nav.search}
      />
      {rows && (
        <ul className="results" role="listbox">
          {rows.length === 0 && <li className="muted">—</li>}
          {rows.map((b, i) => (
            <li key={b.id} role="option" aria-selected={i === active} className={i === active ? 'active' : undefined} onMouseDown={() => pick(b)}>
              <Initials name={b.name} size="s" />
              <span><b>{b.name}</b><span className="muted"> +{b.phone}</span><small>{describeSlot(b.slotId)} · {stateWord(b.status, W).toLowerCase()}</small></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
