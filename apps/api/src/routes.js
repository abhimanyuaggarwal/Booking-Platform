// HTTP endpoints that are not webhooks. The console's endpoints (/api/console/*) arrive in
// Session 2, the website's booking endpoints in Session 4.

import express from 'express';
import { availableSlots, describeSlot, slotIdToInstant } from '@expert-sessions/shared';
import * as bookings from './bookings.js';
import { listSessionTypes, publicType } from './session-types.js';
import * as gurus from './gurus.js';
import { resolveGuru } from './tenancy.js';
import { query } from './db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function routes() {
  const router = express.Router();

  // The uptime monitor calls this every minute. A dead database is the failure that matters most,
  // so the answer is 503 unless Postgres answered too.
  router.get('/api/health', async (_req, res) => {
    try {
      await query('select 1');
      res.json({ ok: true, db: true });
    } catch (err) {
      res.status(503).json({ ok: false, db: false, error: `Postgres did not answer: ${err.message}` });
    }
  });

  // Caddy's on-demand TLS asks before issuing a certificate for a hostname. Lives outside /api/site
  // because everything there first resolves the tenant from the Host header, which is Caddy's own. Yes for the platform's
  // own host and for any domain a guru's team has set in the console; no for everything else, so a
  // stranger pointing a domain at us cannot make us mint certificates.
  router.get('/api/tls-ask', async (req, res, next) => {
    try {
      const domain = String(req.query.domain ?? '').toLowerCase();
      if (!domain) return res.status(400).end();
      if (platformHosts().has(domain) || (await gurus.findGuruByDomain(domain)) || (await gurus.findGuruBySubdomain(domain))) return res.status(200).end();
      res.status(404).end();
    } catch (err) {
      next(err);
    }
  });

  // Open times, soonest first. Both doors — WhatsApp and his website — draw from this one list.
  router.get('/api/gurus/:slug/slots', async (req, res, next) => {
    try {
      const guru = await gurus.findGuruBySlug(req.params.slug);
      if (!guru) return res.status(404).json({ error: `No guru with slug ${req.params.slug}` });
      // Times for one kind of sitting (?type=<id>), the default kind when none is named.
      const types = await listSessionTypes(guru.id, { activeOnly: true });
      const type = types.find((t) => t.id === req.query.type) ?? types[0];
      const open = availableSlots(gurus.availabilityOf(guru), await bookings.takenIntervals(guru.id), undefined, { minutes: type.minutes, typeId: type.id });
      res.json({
        guru: { slug: guru.slug, name: guru.name, dakshinaPaise: guru.dakshina_paise, slotMinutes: guru.pattern_json.slotMinutes },
        sessionTypes: types.map(publicType), type: publicType(type),
        slots: open.map((s) => ({ id: s.id, label: s.label, startsAt: slotIdToInstant(s.id).toISOString() })),
      });
    } catch (err) {
      next(err);
    }
  });

  // The waiting room is on his site. Links printed before that was true still land somewhere useful.
  router.get('/join/:id', async (req, res, next) => {
    if (!UUID.test(req.params.id)) return res.status(404).send('This session link is not valid.');
    try {
      const booking = await bookings.findById(req.params.id);
      if (!booking) return res.status(404).send('This session link is not valid.');
      const guru = await gurus.findGuruById(booking.guru_id);
      const base = process.env.JOIN_LINK_BASE || (guru.domain ? `https://${guru.domain}` : '');
      if (base) return res.redirect(302, `${base}/join/${booking.id}`);
      res.send(`<h2>Your session with ${guru.name}</h2><p>${describeSlot(booking.slotId)}</p>` +
               '<p>Set JOIN_LINK_BASE in the api .env, or his domain in the console, so this link opens the waiting room.</p>');
    } catch (err) {
      next(err);
    }
  });

  // Raw list for the team until the console exists. Session 2 puts this behind the console login.
  router.get('/admin/bookings', async (_req, res, next) => {
    try {
      res.json(await bookings.listRecent(200));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * The hostnames that are ours rather than a guru's: PUBLIC_HOST, plus EXTRA_HOSTS (comma-separated)
 * for an older address that still serves — the provider webhooks point at it until they are moved.
 */
export function platformHosts() {
  const list = [process.env.PUBLIC_HOST ?? '', ...(process.env.EXTRA_HOSTS ?? '').split(',')];
  return new Set(list.map((h) => h.trim().toLowerCase()).filter(Boolean));
}

/** His installable screen's manifest, named for the guru whose address this is. Mounted before the static files. */
export function manifestRoute() {
  const router = express.Router();
  // His installable screen is named for him on his own address: the manifest says his name and uses
  // his portrait as the icon when his website has one. On the platform's own host it stays generic.
  router.get('/guru.webmanifest', async (req, res, next) => {
    try {
      const guru = await resolveGuru(req).catch(() => null);
      const portrait = guru?.marketing_json?.hero?.portrait || null;
      const icons = portrait
        ? [{ src: portrait, sizes: '512x512', type: 'image/jpeg', purpose: 'any' }, { src: '/guru-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
        : [{ src: '/guru-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/guru-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/guru-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }];
      res.type('application/manifest+json').json({
        name: guru ? `${guru.name} · Samvad` : "Guruji's day", short_name: guru ? guru.name.slice(0, 12) : 'His day',
        description: 'The times he is sitting today, and one tap to join each one.',
        start_url: '/guru', scope: '/guru', display: 'standalone', orientation: 'portrait', background_color: '#F4F1EA', theme_color: '#231F19', icons,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
