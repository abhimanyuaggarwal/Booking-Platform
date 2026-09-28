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
import BookingDrawer from './BookingDrawer';
import BookForCaller from './BookForCaller';
import { BookForCallerContext, OpenBookingContext } from './open-booking';
import { announceChange } from './changed';
import './console.css';

// The team's working tool. One shared login; the api says who the guru is. Four screens: Today
// (what is happening and what needs her), Week (his time), Money, Settings. The two things she does
// while someone is on the phone — find a person, hold a time — live in the top bar and work from
// every screen; the one booking drawer opens over whatever she was looking at.
export default function ConsoleShell() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [params, setParams] = useSearchParams();
  const [bookFor, setBookFor] = useState<{ open: boolean; slotId?: string }>({ open: false });
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
  const startBookFor = useCallback((slotId?: string) => setBookFor({ open: true, slotId }), []);
  const openId = params.get('booking');

  if (me === undefined) return <div className="console"><main className="console-main"><p className="muted">Opening the console.</p></main></div>;
  if (me === null) return <Login onSignedIn={setMe} />;

  return (
    <OpenBookingContext.Provider value={openBooking}>
      <BookForCallerContext.Provider value={startBookFor}>
        <div className="console">
          <TopBar guruName={me.guru.name} onBookForCaller={() => startBookFor()} />
          <div className="console-body">
            <Nav />
            <main className="console-main">
              {notice && <p className="banner ok">{notice}</p>}
              <Routes>
                <Route index element={<Today />} />
                <Route path="week" element={<Week />} />
                <Route path="money" element={<Money />} />
                <Route path="settings/*" element={<Settings />} />
                {/* The old addresses still work: bookmarks and links in chats survive the rebuild. */}
                <Route path="calendar" element={<Navigate to="/console/week" replace />} />
                <Route path="bookings" element={<Navigate to="/console/week" replace />} />
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
              onCancel={() => setBookFor({ open: false })}
              onDone={(b) => {
                setBookFor({ open: false });
                setNotice(`${b.name} has the pay link on WhatsApp. ${b.time} is held for ten minutes.`);
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
