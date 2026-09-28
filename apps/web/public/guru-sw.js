// The smallest service worker that makes his calendar installable. It caches nothing: his day must
// always be today's, and a stale day would be worse than a slow one.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => event.respondWith(fetch(event.request)));
