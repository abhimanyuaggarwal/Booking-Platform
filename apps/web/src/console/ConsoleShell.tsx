import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { api } from './api';
import type { Me } from './types';
import Nav, { TopBar } from './Nav';
import Login from './Login';
import Today from './Today';
import Week from './Week';
import Money from './Money';
import Settings from './Settings';
import Devotees from './Devotees';
import DevoteePage from './DevoteePage';
import Gurus from './Gurus';
import GuruNew from './GuruNew';
import GuruSetup from './GuruSetup';
import BookingDrawer from './BookingDrawer';
import BookForCaller from './BookForCaller';
import { BookForCallerContext, OpenBookingContext } from './open-booking';
import { announceChange } from './changed';
import { LangProvider, useWords } from './lang';
import './console.css';

// The team's working tool. One shared login; the api says who the guru is. Five named places —
// Today, Calendar, Devotees, Money, Settings — in English or Hindi, nothing hidden under a "more".
// The two things she does while someone is on the phone — find a person, book a time — live in the
// top bar and work from every screen; the one booking drawer opens over whatever she was looking at.
export default function ConsoleShell() {
  return <LangProvider><Shell /></LangProvider>;
}

function Shell() {
  const W = useWords();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [params, setParams] = useSearchParams();
  const [bookFor, setBookFor] = useState<{ open: boolean; slotId?: string; phone?: string }>({ open: false });
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { api<Me>('/me').then(setMe).catch(() => setMe(null)); }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 9000);
    return () => clearTimeout(t);
  }, [notice]);

  const openBooking = useCallback((id: string) => {
    setParams((p) => { p.set('booking', id); return p; });
  }, [setParams]);
  const closeBooking = useCallback(() => {
    setParams((p) => { p.delete('booking'); return p; });
  }, [setParams]);
  const startBookFor = useCallback((slotId?: string, phone?: string) => setBookFor({ open: true, slotId, phone }), []);
  const openId = params.get('booking');

  if (me === undefined) return <div className="console"><main className="console-main"><p className="muted">{W.common.loading}</p></main></div>;
  if (me === null) return <Login onSignedIn={setMe} />;

  return (
    <OpenBookingContext.Provider value={openBooking}>
      <BookForCallerContext.Provider value={startBookFor}>
        <div className="console">
          <TopBar me={me} onBookForCaller={() => startBookFor()} />
          <div className="console-body">
            <Nav me={me} />
            <main className="console-main">
              {notice && <p className="banner ok">{notice}</p>}
              <Routes>
                <Route index element={<Today />} />
                <Route path="calendar" element={<Week />} />
                <Route path="devotees" element={<Devotees />} />
                <Route path="devotees/:id" element={<DevoteePage />} />
                <Route path="money" element={<Money />} />
                <Route path="settings/*" element={<Settings me={me} />} />
                <Route path="gurus" element={<Gurus />} />
                <Route path="gurus/new" element={<GuruNew />} />
                <Route path="gurus/:slug" element={<GuruSetup me={me} />} />
                {/* The old addresses still work: bookmarks and links in chats survive the rebuild. */}
                <Route path="week" element={<Navigate to="/console/calendar" replace />} />
                <Route path="more" element={<Navigate to="/console/settings" replace />} />
                <Route path="bookings" element={<Navigate to="/console/calendar" replace />} />
                <Route path="attention" element={<Navigate to="/console" replace />} />
                <Route path="*" element={<Navigate to="/console" replace />} />
              </Routes>
            </main>
          </div>
          {openId && <BookingDrawer id={openId} guruSlug={me.guru.slug} onClose={closeBooking} onChanged={announceChange} />}
          {bookFor.open && (
            <BookForCaller
              guruSlug={me.guru.slug}
              initialSlotId={bookFor.slotId}
              initialPhone={bookFor.phone}
              onCancel={() => setBookFor({ open: false })}
              onDone={(b) => {
                setBookFor({ open: false });
                setNotice(b.notDelivered ? W.booking.doneNotDelivered(b.name, b.time, b.payUrl) : b.paid ? W.booking.donePaid(b.name, b.time) : W.booking.doneLink(b.name, b.time));
                announceChange();
                openBooking(b.id);
              }}
            />
          )}
        </div>
      </BookForCallerContext.Provider>
    </OpenBookingContext.Provider>
  );
}
