import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useApi } from './api';
import type { Settings as SettingsData } from './types';
import PatternEditor from './PatternEditor';
import SessionTypesEditor from './SessionTypesEditor';
import SiteContent from './SiteContent';
import QrCodes from './QrCodes';

// Three things the team sets once: his timings, the words and pictures on his website, and QR
// codes. His schedule of satsangs and meetups changes weekly, so it lives with his week.
export default function Settings() {
  const { data, error, reload } = useApi<SettingsData>('/settings');
  return (
    <>
      <header className="bar"><h1>Settings</h1><span className="muted">set once, changed rarely</span></header>
      <nav className="tabs">
        <NavLink to="/console/settings" end>Kinds of sitting</NavLink>
        <NavLink to="/console/settings/timings">His timings</NavLink>
        <NavLink to="/console/settings/website">His website</NavLink>
        <NavLink to="/console/settings/qr">QR codes</NavLink>
      </nav>
      {error && <p className="problem">{error}</p>}
      {!data && !error && <p className="muted">Loading settings.</p>}
      {data && (
        <Routes>
          <Route index element={<SessionTypesEditor settings={data} onSaved={reload} />} />
          <Route path="timings" element={<PatternEditor settings={data} onSaved={reload} />} />
          <Route path="website" element={<SiteContent settings={data} onSaved={reload} />} />
          <Route path="meetups" element={<Navigate to="/console/week" replace />} />
          <Route path="qr" element={<QrCodes settings={data} />} />
        </Routes>
      )}
    </>
  );
}
