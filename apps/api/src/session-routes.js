// The waiting room and the room itself, and the two taps that start and end a session.
// Her side is public: the booking id in her link is the secret, as it is on the confirmed page.
// Guruji's own side of a session lives in guru-routes.js, behind his magic link.

import express from 'express';
import { describeSlot, instantToSlotId, dayRange } from '@expert-sessions/shared';
import { query } from './db.js';
import { videoClient } from './video.js';
import { waitingWords, ESCAPE_AFTER_MINUTES } from './waiting-words.js';
import { findSessionByBooking, currentSession, devoteeToken } from './sessions.js';
import { logMessage } from './messages-log.js';
import { findGuruById } from './gurus.js';
import * as bookings from './bookings.js';
import { BookingRuleError, ProviderError } from './errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESCAPE_CHOICES = { another_time: 'another time', dakshina_back: 'the dakshina back' };
const MESSAGE_LIMIT = 500; // a waiting room, not a chat: long enough to explain, short enough to read at a glance

export function sessionRoutes(env, conversation) {
  const video = videoClient(env);
  const router = express.Router();

  // ---- Her side ---------------------------------------------------------------------------------

  /** Everything her screen needs, in one call. Asked again every few seconds while she waits. */
  router.get('/api/session/:bookingId', handle(async (req, res) => {
    const found = await her(req, res); if (!found) return;
    const { booking, guru: his } = found;
    const [session, running, ahead, nextEvent] = await Promise.all([
      findSessionByBooking(booking.id),
      currentSession(his.id),
      countAhead(his.id, booking),
      nextPublicEvent(his.id),
    ]);
    const mine = session?.started_at ? { startedAt: session.started_at, endedAt: session.ended_at } : null;
    const elsewhere = running && running.booking_id !== booking.id ? { startedAt: running.started_at } : null;
    const words = waitingWords({
      status: booking.status, slotStart: booking.slot_start, slotMinutes: his.pattern_json.slotMinutes,
      session: mine, running: elsewhere, ahead,
    });

    res.json({
      booking: { id: booking.id, when: describeSlot(booking.slotId), status: booking.status, minutes: his.pattern_json.slotMinutes },
      guru: { name: his.name },
      devotee: { name: booking.devotee_name },
      ...words,
      video: { ready: video.isConfigured() },
      // An automatic close happens 90 minutes in; her screen should not call that the sitting's length.
      minutesTogether: session?.started_at && session?.ended_at ? Math.min(Math.max(1, Math.round((session.ended_at - session.started_at) / 60000)), (booking.minutes ?? 30) + 15) : null,
      escapeAfter: new Date(booking.slot_start.getTime() + ESCAPE_AFTER_MINUTES * 60000).toISOString(),
      messages: await waitingConversation(booking.id),
      nextEvent,
      bookAgainPath: his.slug,
    });
  }));

  /** Her way into the room, once guruji has started it. Only ever a guest role. */
  router.post('/api/session/:bookingId/token', handle(async (req, res) => {
    const found = await her(req, res); if (!found) return;
    const session = await findSessionByBooking(found.booking.id);
    const token = devoteeToken({ session, devoteeId: found.booking.devotee_id, video });
    // Telling her the room "is not open yet" when it has just closed is the wrong sentence for
    // what happened; her screen is a second away from showing the closing screen anyway.
    if (!token && session?.ended_at) return res.status(409).json({ error: 'That session has ended' });
    if (!token) return res.status(409).json({ error: 'The room is not open yet' });
    res.json({ roomId: session.room_id, token });
  }));

  /**
   * Ten minutes past, she chooses rather than chases. Neither choice moves money or a slot by
   * itself: both land in the team's Needs attention, because a cash refund is theirs to make
   * and a new time during a missed session is a judgement (CLAUDE.md).
   */
  router.post('/api/session/:bookingId/escape', handle(async (req, res) => {
    const found = await her(req, res); if (!found) return;
    const { booking, guru: his } = found;
    const choice = req.body?.choice;
    if (!ESCAPE_CHOICES[choice]) return res.status(400).json({ error: 'Choose another time, or the dakshina back' });
    if (new Date() < new Date(booking.slot_start.getTime() + ESCAPE_AFTER_MINUTES * 60000)) {
      return res.status(409).json({ error: 'Guruji may still join. This choice opens ten minutes past your time.' });
    }
    await logMessage({
      guruId: his.id, devoteeId: booking.devotee_id, bookingId: booking.id, direction: 'in', kind: 'escape.choice',
      payload: { choice, asked: ESCAPE_CHOICES[choice] },
    });
    res.json({
      said: choice === 'another_time'
        ? 'His team will write to you on WhatsApp with another time. You do not need to wait here.'
        : 'His team will return your dakshina. It reaches you within a week, and they will write to you on WhatsApp.',
    });
  }));

  /**
   * She writes to his team while she waits. One way in, one way out: the team answers from the
   * console's waiting panel, which is the only place these are read. Never reaches guruji — he is
   * either with someone else or about to join her.
   */
  router.post('/api/session/:bookingId/say', handle(async (req, res) => {
    const found = await her(req, res); if (!found) return;
    const { booking, guru: his } = found;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'Write something first' });
    if (text.length > MESSAGE_LIMIT) return res.status(400).json({ error: `Please keep it under ${MESSAGE_LIMIT} characters` });

    const at = await conversation.receiveWaitingMessage({ guru: his, devotee: { id: booking.devotee_id }, booking, text });
    res.status(201).json({ text, at, from: 'devotee' });
  }));

  // His side of a session lives in guru-routes.js, behind the same magic link.

  router.use((err, _req, res, next) => {
    if (err instanceof BookingRuleError) return res.status(409).json({ error: err.message });
    if (err instanceof ProviderError) return res.status(502).json({ error: err.message });
    next(err);
  });

  // ---- pieces ------------------------------------------------------------------------------------

  /** The booking her link names, and whose guru it is. Answers 404 itself when there is none. */
  async function her(req, res) {
    if (!UUID.test(req.params.bookingId)) { res.status(404).json({ error: 'This session link is not valid' }); return null; }
    const booking = await bookings.findWithDevotee(req.params.bookingId);
    if (!booking) { res.status(404).json({ error: 'This session link is not valid' }); return null; }
    return { booking, guru: await findGuruById(booking.guru_id) };
  }

  /** Both sides of the waiting-room conversation, oldest first, so a reload shows it whole. */
  async function waitingConversation(bookingId) {
    const { rows } = await query(
      `select payload_json, direction, created_at from messages_log
        where booking_id = $1 and kind = 'waiting.message' order by created_at`, [bookingId]);
    return rows.map((r) => ({
      text: r.payload_json.text,
      // `from` was added when she could first write back; older rows are all from his team.
      from: r.payload_json.from ?? (r.direction === 'in' ? 'devotee' : 'team'),
      at: r.created_at.toISOString(),
    }));
  }

  /** How many confirmed times stand between now and hers today. */
  async function countAhead(guruId, booking) {
    const [start] = dayRange(instantToSlotId(booking.slot_start).slice(5, 15));
    const { rows: [row] } = await query(
      `select count(*)::int as n from bookings
        where guru_id = $1 and status = 'confirmed' and slot_start >= $2 and slot_start < $3`,
      [guruId, new Date(Math.max(start.getTime(), Date.now() - 3600000)), booking.slot_start]);
    return row.n;
  }

  async function nextPublicEvent(guruId) {
    const { rows } = await query(
      `select title, kind, starts_at from events where guru_id = $1 and starts_at > now() order by starts_at limit 1`, [guruId]);
    if (!rows[0]) return null;
    return { title: rows[0].title, kind: rows[0].kind, when: describeSlot(instantToSlotId(rows[0].starts_at)) };
  }

  return router;
}

function handle(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}
