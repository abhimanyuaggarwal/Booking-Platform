import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { SessionView } from './types';

const ASK_EVERY_MS = 8000;

/**
 * What her screen knows: the api's view of her session, kept fresh two ways — the socket tells us
 * the moment guruji joins or leaves, and a slow poll covers a dropped connection.
 */
export function useSessionState(bookingId: string) {
  const [view, setView] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/${bookingId}`, { credentials: 'same-origin' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'We could not open your session just now.');
      setView(body as SessionView);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(load, ASK_EVERY_MS);
    return () => clearInterval(timer);
  }, [load]);

  // The socket is also how the api learns she has opened her link, which the team's panel shows.
  useEffect(() => {
    const socket = io({ auth: { bookingId, role: 'devotee' } });
    socketRef.current = socket;
    socket.on('session.started', load);
    socket.on('session.ended', load);
    socket.on('waiting.message', (m: { text: string; at: string; from?: 'team' | 'devotee' }) => {
      setView((v) => (v ? { ...v, messages: [...v.messages, { text: m.text, from: m.from ?? 'team', at: m.at }] } : v));
    });
    return () => { socket.close(); socketRef.current = null; };
  }, [bookingId, load]);

  return { view, error, reload: load };
}
