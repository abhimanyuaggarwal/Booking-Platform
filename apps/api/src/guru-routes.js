// Guruji's own screens. His day, the one line about who is coming, her voice note, and the two taps.
// No money anywhere here: what was paid is the team's business, never his (CLAUDE.md).

import express from 'express';
import axios from 'axios';
import { describeDate, formatTime, instantToSlotId, parseSlotId, dayRange, isoDate, nowInIst } from '@expert-sessions/shared';
import { query } from './db.js';
import { guruAuth } from './guru-auth.js';
import { findGuruBySlug, firstGuru } from './gurus.js';
import { guruDay, contextLine } from './guru-day.js';
import { startSession, endSession, findSessionByBooking, isWaiting } from './sessions.js';
import { videoClient } from './video.js';
import { BookingRuleError, ProviderError } from './errors.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRAPH_URL = 'https://graph.facebook.com/v21.0';

export function guruRoutes(env) {
  const auth = guruAuth(env);
  const video = videoClient(env);
  const router = express.Router();

  router.use(auth.requireGuru);
  router.use(handle(async (req, _res, next) => {
    req.guru = (await findGuruBySlug(env.CONSOLE_GURU_SLUG || 'guruji')) ?? (await firstGuru());
    if (!req.guru) throw new Error('No guru is set up yet. Run pnpm seed.');
    next();
  }));

  router.get('/me', (req, res) => res.json({ name: req.guru.name }));

  /** His day: times down the left, what is at each one beside them, rest where the day is empty. */
  router.get('/day', handle(async (req, res) => {
    const date = YMD.test(req.query.date ?? '') ? req.query.date : isoDate(nowInIst());
    const [start, end] = dayRange(date);
    const [sittings, events] = await Promise.all([
      query(
        `select b.id, b.slot_start, b.status, b.question_text, b.question_media_id,
                d.name, d.for_whom,
                s.started_at, s.ended_at, s.devotee_joined_at,
                (select count(*)::int from bookings x
                  where x.devotee_id = b.devotee_id and x.status = 'completed' and x.slot_start < b.slot_start) as prior_visits
           from bookings b join devotees d on d.id = b.devotee_id
           left join sessions s on s.booking_id = b.id
          where b.guru_id = $1 and b.slot_start >= $2 and b.slot_start < $3
            and b.status in ('confirmed', 'completed', 'no_show')
          order by b.slot_start`, [req.guru.id, start, end]),
      query(
        `select id, title, kind, starts_at, link, location, notes from events
          where guru_id = $1 and starts_at >= $2 and starts_at < $3 order by starts_at`, [req.guru.id, start, end]),
    ]);

    const minutes = req.guru.pattern_json.slotMinutes ?? 30;
    const entries = [
      ...sittings.rows.map((r) => ({
        kind: 'session', id: r.id, at: wall(r.slot_start), time: formatTime(wall(r.slot_start)), minutes,
        name: r.name ?? 'Someone', context: contextLine({
          priorVisits: r.prior_visits, question: r.question_text, hasVoiceNote: !!r.question_media_id, forWhom: r.for_whom,
        }),
        voiceNote: r.question_media_id ? `/api/guru/media/${encodeURIComponent(r.question_media_id)}` : null,
        status: r.status,
        startedAt: r.started_at ? r.started_at.toISOString() : null,
        endedAt: r.ended_at ? r.ended_at.toISOString() : null,
        waiting: isWaiting(r.id),
      })),
      ...events.rows.map((r) => ({
        kind: 'event', id: r.id, at: wall(r.starts_at), time: formatTime(wall(r.starts_at)), minutes: 60,
        title: r.title, eventKind: r.kind, link: r.link, location: r.location, notes: r.notes,
      })),
    ];

    const day = guruDay(entries, nowInIst());
    res.json({
      date, dateLabel: describeDate(date).toUpperCase(),
      greeting: `Namaste, ${shortName(req.guru.name)}`,
      summary: summarise(day.sessions),
      items: day.items.map(({ at, ...rest }) => rest),
    });
  }));

  /** Her voice note, streamed through us so his browser never needs Meta's token. */
  router.get('/media/:mediaId', handle(async (req, res) => {
    if (!env.WHATSAPP_TOKEN) return res.status(502).json({ error: 'WhatsApp is not wired, so her message cannot be fetched' });
    const headers = { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` };
    try {
      const { data: meta } = await axios.get(`${GRAPH_URL}/${req.params.mediaId}`, { headers });
      const audio = await axios.get(meta.url, { headers, responseType: 'stream' });
      res.setHeader('Content-Type', meta.mime_type ?? 'audio/ogg');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      audio.data.pipe(res);
    } catch (err) {
      // Meta keeps media for a limited time, and seeded ids are not real ones.
      res.status(404).json({ error: `Her message is no longer available from WhatsApp: ${err.response?.status ?? err.message}` });
    }
  }));

  router.post('/sessions/:bookingId/start', handle(async (req, res) => {
    if (!UUID.test(req.params.bookingId)) return res.status(404).json({ error: 'No such booking' });
    const { roomId, token } = await startSession({ guru: req.guru, bookingId: req.params.bookingId, video });
    res.json({ roomId, token, devotee: await devoteeCard(req.guru, req.params.bookingId) });
  }));

  router.post('/sessions/:bookingId/end', handle(async (req, res) => {
    if (!UUID.test(req.params.bookingId)) return res.status(404).json({ error: 'No such booking' });
    const { minutes } = await endSession({ guru: req.guru, bookingId: req.params.bookingId });
    res.json({ minutes });
  }));

  /** Back into a room he already started, after a reload or a dropped connection. */
  router.get('/sessions/:bookingId', handle(async (req, res) => {
    if (!UUID.test(req.params.bookingId)) return res.status(404).json({ error: 'No such booking' });
    const session = await findSessionByBooking(req.params.bookingId);
    if (!session || session.guru_id !== req.guru.id || !session.started_at || session.ended_at) {
      return res.status(404).json({ error: 'That room is not open' });
    }
    res.json({
      roomId: session.room_id,
      token: video.authToken({ roomId: session.room_id, userId: `guru-${req.guru.id}`, who: 'guru' }),
      devotee: await devoteeCard(req.guru, req.params.bookingId),
    });
  }));

  router.use((err, _req, res, next) => {
    if (err instanceof BookingRuleError) return res.status(409).json({ error: err.message });
    if (err instanceof ProviderError) return res.status(502).json({ error: err.message });
    next(err);
  });

  return router;
}

/** Who is with him, beside the video. Her name and what she carries — nothing about money. */
async function devoteeCard(guru, bookingId) {
  const { rows: [r] } = await query(
    `select d.name, d.for_whom, b.question_text, b.question_media_id, b.slot_start,
            (select count(*)::int from bookings x
              where x.devotee_id = b.devotee_id and x.status = 'completed' and x.slot_start < b.slot_start) as prior_visits
       from bookings b join devotees d on d.id = b.devotee_id where b.id = $1 and b.guru_id = $2`,
    [bookingId, guru.id]);
  if (!r) return null;
  return {
    name: r.name ?? 'Someone',
    context: contextLine({ priorVisits: r.prior_visits, question: r.question_text, hasVoiceNote: !!r.question_media_id, forWhom: r.for_whom }),
    time: formatTime(wall(r.slot_start)),
  };
}

function wall(instant) {
  return parseSlotId(instantToSlotId(instant));
}

function shortName(name) {
  return name.split(' ')[0];
}

function summarise(n) {
  if (n === 0) return 'No sittings today';
  if (n === 1) return 'One session today';
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return `${capitalise(words[n] ?? String(n))} sessions today`;
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function handle(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}
