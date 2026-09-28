import { useCallback, useEffect, useState } from 'react';
import { forgetMagicToken, guruApi, magicToken } from './api';
import Day from './Day';
import GuruRoom from './GuruRoom';
import type { GuruDay, RoomPass, SessionItem } from './types';
import './guru.css';

const REFRESH_MS = 60000;

// Guruji's own screen: his day, and one tap into each sitting. Installable, so it sits on his
// home screen like any other app. No money anywhere on these screens.
export default function GuruShell() {
  const [name, setName] = useState<string | null>(null);
  const [day, setDay] = useState<GuruDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<(RoomPass & { bookingId: string }) | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const loadDay = useCallback(async () => {
    try {
      setDay(await guruApi<GuruDay>('/day'));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  // His link carries the token once; the api turns it into a cookie and we clear the address bar.
  useEffect(() => {
    const token = magicToken();
    guruApi<{ name: string }>('/me', { token })
      .then((me) => {
        setName(me.name);
        if (token) forgetMagicToken();
        return loadDay();
      })
      .catch((err: Error) => setError(err.message));
  }, [loadDay]);

  useEffect(() => {
    installable();
    if (room) return;
    const timer = setInterval(loadDay, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadDay, room]);

  async function join(session: SessionItem) {
    setSaid(null);
    try {
      const pass = await guruApi<RoomPass>(`/sessions/${session.id}/start`, { method: 'POST' });
      setRoom({ ...pass, bookingId: session.id });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // The server first, his screen after. Closing the room before we know the session ended left it
  // open for ever when the call failed — and one open session tells every other devotee he is busy.
  async function end() {
    if (!room || ending) return;
    const bookingId = room.bookingId;
    setEnding(true);
    try {
      const { minutes } = await guruApi<{ minutes: number }>(`/sessions/${bookingId}/end`, { method: 'POST' });
      setRoom(null);
      const fresh = await guruApi<GuruDay>('/day');
      setDay(fresh);
      setSaid(afterwards(minutes, fresh));
    } catch (err) {
      // He stays in the room. Leaving him outside a session that is still running is the worse error.
      setError(`${(err as Error).message} You are still in the room — tap End again.`);
    } finally {
      setEnding(false);
    }
  }

  /** He closed the video, or his phone locked. He leaves the room; the session stays his to end. */
  function leaveRoom() {
    setRoom(null);
    loadDay();
  }

  if (room) return <div className="guru"><GuruRoom guruName={name ?? 'Guruji'} token={room.token} devotee={room.devotee} onEnd={end} onLeave={leaveRoom} ending={ending} problem={error} /></div>;
  return (
    <div className="guru">
      {error && !day && <main className="wrap signin"><p className="problem">{error}</p></main>}
      {!day && !error && <main className="wrap"><p className="summary">One moment.</p></main>}
      {day && (
        <>
          {error && <main className="wrap" style={{ paddingBottom: 0 }}><p className="problem">{error}</p></main>}
          <Day day={day} said={said} onJoin={join} />
        </>
      )}
    </div>
  );
}

/** What he sees when he leaves a room: it is done, and who is next. */
export function afterwards(minutes: number, day: GuruDay): string {
  const next = day.items.find((i) => i.kind === 'session' && !i.done);
  const sat = `That is done — ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
  return next && next.kind === 'session' ? `${sat} Next is ${next.name} at ${next.time}.` : `${sat} Nothing more today.`;
}

/** The manifest and worker belong to his screen alone, not to the console or his website. */
function installable() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/guru.webmanifest';
    document.head.appendChild(link);
    const icon = document.createElement('link');
    icon.rel = 'apple-touch-icon';
    icon.href = '/guru-icon-180.png';
    document.head.appendChild(icon);
    const theme = document.createElement('meta');
    theme.name = 'theme-color';
    theme.content = '#231F19';
    document.head.appendChild(theme);
    document.title = "Guruji's day";
  }
  // Chrome only offers "Install" when a worker is registered; ours caches nothing (public/guru-sw.js).
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/guru-sw.js', { scope: '/guru' }).catch(() => {});
  }
}
