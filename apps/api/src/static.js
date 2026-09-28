// In production the api also hands out the built web app, so one origin serves her join link,
// the console, guruji's screens and both provider webhooks — the shape dev already has through
// Vite's proxy. Set WEB_DIST to the built folder (apps/web/dist); leave it unset in dev.

import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

const YEAR = 365 * 24 * 3600;

/**
 * Express router: hashed assets are cached for a year, everything else is the SPA's index.html
 * so react-router can answer /console, /guru, /join/:id and his site's pages on a hard reload.
 * Anything under /api or /socket.io is left alone for the routers mounted after this one.
 */
export function serveWeb(dir) {
  const index = path.join(dir, 'index.html');
  if (!fs.existsSync(index)) {
    throw new Error(`WEB_DIST=${dir} has no index.html. Build the web app first (pnpm --filter web build), or unset WEB_DIST.`);
  }
  const router = express.Router();
  router.use(express.static(dir, {
    index: false,
    setHeaders(res, file) {
      // Vite names files under assets/ by content hash, so they can be cached for ever.
      const immutable = file.includes(`${path.sep}assets${path.sep}`);
      res.setHeader('Cache-Control', immutable ? `public, max-age=${YEAR}, immutable` : 'no-cache');
    },
  }));
  router.get('*', (req, res, next) => {
    if (isApiPath(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
  return router;
}

export function isApiPath(p) {
  return p.startsWith('/api/') || p.startsWith('/socket.io') || p.startsWith('/webhook') || p.startsWith('/razorpay');
}
