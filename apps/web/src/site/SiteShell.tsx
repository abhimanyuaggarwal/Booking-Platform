import { useMemo } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { siteApi, useSite } from './api';
import HomePage from './HomePage';
import Confirmed from './Confirmed';
import MySessions from './MySessions';
import type { SitePage } from './types';
import FrontDoor from '../FrontDoor';
import './site.css';

// His own website. On his domain it answers at the root; /s/:guruSlug is the same pages as an
// internal preview, and the only difference is that the preview tells the api which guru it means.
export default function SiteShell() {
  const { guruSlug } = useParams<{ guruSlug?: string }>();
  const call = useMemo(() => siteApi(guruSlug), [guruSlug]);
  const base = guruSlug ? `/s/${guruSlug}` : '';
  const { data, error, status } = useSite<SitePage>(call, '/');

  // On the platform's own host (sessions.example.com) no guru's domain matches, which is fine:
  // that root is the front door. Under /s/<slug> a 404 is a real "no such guru".
  if (error && status === 404 && !guruSlug) return <FrontDoor />;
  if (error) return <div className="site"><div className="wrap"><p className="problem" style={{ paddingTop: 44 }}>{error}</p></div></div>;
  if (!data) return <div className="site"><div className="wrap"><p className="muted" style={{ paddingTop: 44 }}>One moment.</p></div></div>;

  return (
    <div className="site">
      <header className="top">
        <div className="wrap">
          <b>{data.guru.name}</b>
          <Link to={`${base}/sessions`}>My sessions</Link>
        </div>
      </header>
      <Routes>
        <Route index element={<HomePage page={data} call={call} base={base} />} />
        <Route path="sessions" element={<MySessions call={call} base={base} />} />
        <Route path="booked/:bookingId" element={<Confirmed call={call} base={base} />} />
        <Route path="*" element={<div className="wrap"><p className="muted" style={{ paddingTop: 44 }}>That page is not here. <Link to={base || '/'}>His page</Link></p></div>} />
      </Routes>
    </div>
  );
}
