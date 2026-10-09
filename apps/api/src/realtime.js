// One Socket.IO namespace. A browser connects with { auth: { bookingId, role } } and lands in the
// room session:{bookingId}; the api emits what happens there, and remembers who is connected now
// so the console's waiting panel can say "in the waiting room, 6 minutes".
// Events (CLAUDE.md): waiting.joined, waiting.message, session.started, session.ended

import { Server } from 'socket.io';
import { noteDevoteeOpened } from './sessions.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['devotee', 'guru', 'team'];

let io = null;
const presence = new Map(); // bookingId -> { devotee: Date|null, guru: Date|null, sockets: Map<socketId, role> }

/**
 * @param {{corsOrigin: string[], isTeam?: (cookieHeader: string) => boolean, isGuru?: (cookieHeader: string) => boolean}} deps
 *   `isTeam` and `isGuru` read the console and guru cookies: a role is proven by its cookie, never
 *   just claimed, so nobody with a booking id can listen as the team or mark her as present.
 */
export function attachRealtime(httpServer, { corsOrigin, isTeam = () => false, isGuru = () => false }) {
  io = new Server(httpServer, { cors: { origin: corsOrigin, credentials: true } });

  io.on('connection', (socket) => {
    const { bookingId, role } = socket.handshake.auth ?? {};
    const cookie = socket.handshake.headers?.cookie ?? '';
    const proven = role === 'devotee' || (role === 'team' && isTeam(cookie)) || (role === 'guru' && isGuru(cookie));
    if (typeof bookingId !== 'string' || !UUID.test(bookingId) || !ROLES.includes(role) || !proven) {
      socket.disconnect(true); // validate at the edge; nothing inside checks again
      return;
    }
    socket.join(roomFor(bookingId));
    arrive(bookingId, role, socket.id);
    io.to(roomFor(bookingId)).emit('waiting.joined', { bookingId, role, at: new Date().toISOString() });

    if (role === 'devotee') {
      noteDevoteeOpened(bookingId).catch((err) => console.error(`Could not record that ${bookingId} opened her link: ${err.message}`));
    }
    socket.on('disconnect', () => leave(bookingId, socket.id));
  });

  return io;
}

/**
 * Tell everyone in a booking's room that something happened. Best effort by nature: the session is
 * already recorded in the database, and her screen also asks every few seconds, so a socket that is
 * not there must not undo the tap that started the session.
 * @returns {boolean} whether there was a socket server to tell
 */
export function emitToSession(bookingId, event, payload) {
  if (!io) {
    console.warn(`No socket server, so nobody was told ${event} for booking ${bookingId}. Her screen will notice within a few seconds anyway.`);
    return false;
  }
  io.to(roomFor(bookingId)).emit(event, { bookingId, ...payload });
  return true;
}

/** Who is connected to this booking's room right now, and since when. */
export function presenceFor(bookingId) {
  const p = presence.get(bookingId);
  return { devoteeSince: p?.devotee ?? null, guruSince: p?.guru ?? null };
}

function arrive(bookingId, role, socketId) {
  const p = presence.get(bookingId) ?? { devotee: null, guru: null, sockets: new Map() };
  p.sockets.set(socketId, role);
  if (role === 'devotee' && !p.devotee) p.devotee = new Date();
  if (role === 'guru' && !p.guru) p.guru = new Date();
  presence.set(bookingId, p);
}

function leave(bookingId, socketId) {
  const p = presence.get(bookingId);
  if (!p) return;
  p.sockets.delete(socketId);
  const roles = new Set(p.sockets.values());
  if (!roles.has('devotee')) p.devotee = null;
  if (!roles.has('guru')) p.guru = null;
  if (p.sockets.size === 0) presence.delete(bookingId);
}

function roomFor(bookingId) {
  return `session:${bookingId}`;
}
