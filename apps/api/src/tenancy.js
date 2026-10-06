// Each guru's site lives on his own domain. The tenant comes from the Host header in production;
// in dev the web app says which guru it means, because localhost matches no domain.
//   guruji.com/…            -> Host header
//   /s/guruji  (preview)    -> ?slug=guruji
//   ?host=guruji.com        -> pretend to be that domain

import { findGuruBySlug, findGuruByDomain, findGuruBySubdomain } from './gurus.js';

/** The guru whose site this request is for, or null. */
export async function resolveGuru(req) {
  const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
  if (slug) return findGuruBySlug(slug);
  const host = typeof req.query.host === 'string' ? req.query.host : req.headers.host;
  return (await findGuruByDomain(host)) ?? findGuruBySubdomain(host);   // his own domain, or <slug>.<PUBLIC_HOST>
}

/** Express middleware: put the guru on the request, or answer 404 with a sentence. */
export function withGuru(req, res, next) {
  resolveGuru(req)
    .then((guru) => {
      if (!guru) {
        return res.status(404).json({ error: `No guru's site is served at ${req.query.host ?? req.headers.host}. Set his domain in the console's Settings, or open /s/<his slug>.` });
      }
      req.guru = guru;
      next();
    })
    .catch(next);
}
