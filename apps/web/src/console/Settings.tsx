import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Clock, Globe, MessageSquare, QrCode, Timer, Users } from 'lucide-react';
import { useWords } from './lang';
import { useApi } from './api';
import type { Settings as SettingsData } from './types';
import PatternEditor from './PatternEditor';
import SessionTypesEditor from './SessionTypesEditor';
import Messages from './Messages';
import Access from './Access';
import type { Me } from './types';
import SiteContent from './SiteContent';
import QrCodes from './QrCodes';

// Three things the team sets once: his timings, the words and pictures on his website, and QR
// codes. His schedule of satsangs and meetups changes weekly, so it lives with his week.
export default function Settings({ me }: { me: Me }) {
  const W = useWords();
  const { data, error, reload } = useApi<SettingsData>('/settings');
  const { pathname } = useLocation();
  const atIndex = /\/console\/settings\/?$/.test(pathname);
  const cards = [
    { to: 'kinds', icon: <Timer size={20} aria-hidden="true" />, title: W.settingsPage.kinds, line: W.settingsPage.kindsLine },
    { to: 'timings', icon: <Clock size={20} aria-hidden="true" />, title: W.settingsPage.timings, line: W.settingsPage.timingsLine },
    { to: 'website', icon: <Globe size={20} aria-hidden="true" />, title: W.settingsPage.website, line: W.settingsPage.websiteLine },
    { to: 'messages', icon: <MessageSquare size={20} aria-hidden="true" />, title: W.settingsPage.messages, line: W.settingsPage.messagesLine },
    { to: 'qr', icon: <QrCode size={20} aria-hidden="true" />, title: W.settingsPage.qr, line: W.settingsPage.qrLine },
    { to: 'access', icon: <Users size={20} aria-hidden="true" />, title: W.settingsPage.access, line: W.settingsPage.accessLine },
  ];
  return (
    <>
      <header className="bar page"><div><h1>{W.settingsPage.title}</h1><p className="page-line">{W.settingsPage.line}</p></div></header>
      {atIndex ? (
        <div className="cards">
          {cards.map((c) => <Link className="card-link" key={c.to} to={`/console/settings/${c.to}`}>{c.icon}<b>{c.title}</b><span className="muted">{c.line}</span></Link>)}
        </div>
      ) : (
        <nav className="tabs">
          {cards.map((c) => <NavLink key={c.to} to={`/console/settings/${c.to}`}>{c.title}</NavLink>)}
        </nav>
      )}
      {error && <p className="problem">{error}</p>}
      {!atIndex && !data && !error && <p className="muted">{W.common.loading}</p>}
      {data && (
        <Routes>
          <Route path="kinds" element={<SessionTypesEditor settings={data} onSaved={reload} />} />
          <Route path="timings" element={<PatternEditor settings={data} onSaved={reload} />} />
          <Route path="website" element={<SiteContent settings={data} onSaved={reload} />} />
          <Route path="messages" element={<Messages settings={data} onSaved={reload} />} />
          <Route path="meetups" element={<Navigate to="/console/calendar" replace />} />
          <Route path="qr" element={<QrCodes settings={data} />} />
          <Route path="access" element={<Access settings={data} me={me} />} />
        </Routes>
      )}
    </>
  );
}
