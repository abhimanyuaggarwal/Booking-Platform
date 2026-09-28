// Expert Sessions api — boot only.
// The WhatsApp conversation is whatsapp-door.js, HTTP endpoints routes.js, Socket.IO realtime.js,
// scheduled work jobs.js. Every write to a booking goes through bookings.js.

import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import { whatsappDoor } from './whatsapp-door.js';
import { routes } from './routes.js';
import { consoleRoutes } from './console-routes.js';
import { siteRoutes } from './site-routes.js';
import { sessionRoutes } from './session-routes.js';
import { guruRoutes } from './guru-routes.js';
import { createConversation } from './conversation.js';
import { attachRealtime } from './realtime.js';
import { startJobs } from './jobs.js';
import * as razorpay from './razorpay.js';
import { serveWeb } from './static.js';

const env = requireEnv(['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'APP_BASE_URL', 'CONSOLE_PASSWORD', 'DEVOTEE_SESSION_SECRET']);

const conversation = createConversation(env); // every word we send a devotee goes through this
const app = express();
// Behind Caddy (deploy/), the client's scheme and address arrive in X-Forwarded-* headers.
if (env.TRUST_PROXY) app.set('trust proxy', Number(env.TRUST_PROXY) || true);
// Keep the raw body: Razorpay's signature is computed over the exact bytes.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(whatsappDoor(env, conversation));
app.use('/api/console', consoleRoutes(env, conversation));
app.use('/api/site', siteRoutes(env, conversation));
app.use('/api/guru', guruRoutes(env));
app.use(sessionRoutes(env, conversation));
// Production: the same process serves the built web app, so /join/:id, /console and /guru are
// pages here rather than the dev-only redirect in routes.js. Mounted before routes() on purpose.
if (env.WEB_DIST) app.use(serveWeb(env.WEB_DIST));
app.use(routes());
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. The api log has the details.' });
});

const server = http.createServer(app);
attachRealtime(server, { corsOrigin: env.WEB_ORIGIN || 'http://localhost:5173' });
startJobs({ conversation, pay: razorpay.client(env) });

const port = env.PORT || 3000;
server.listen(port, () => {
  console.log(`Expert Sessions api listening on port ${port}`);
  console.log(`Webhook:  ${env.APP_BASE_URL}/webhook`);
  console.log(`Razorpay: ${env.APP_BASE_URL}/razorpay/webhook`);
  console.log(`Slots:    http://localhost:${port}/api/gurus/guruji/slots`);
  if (env.WEB_DIST) console.log(`Web app:  served from ${env.WEB_DIST}`);
  console.log(`Console:  ${env.WEB_ORIGIN || 'http://localhost:5173'}/console (user ${env.CONSOLE_USER || 'team'})`);
  console.log(`His site: ${env.WEB_ORIGIN || 'http://localhost:5173'}/s/guruji (his own domain in production)`);
  console.log(`Guruji:   ${env.WEB_ORIGIN || 'http://localhost:5173'}/guru?t=${env.GURU_MAGIC_TOKEN ? '<GURU_MAGIC_TOKEN>' : 'set GURU_MAGIC_TOKEN in .env'}`);
});

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing in .env: ${missing.join(', ')}. Copy .env.example to .env and fill these in.`);
    process.exit(1);
  }
  return process.env;
}
