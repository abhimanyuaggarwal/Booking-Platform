// The console's endpoints, all under /api/console, all behind the shared team login.
// Reads come from reports.js. Every change to a booking goes through bookings.js, and every word
// sent to a devotee goes through conversation.js.

import express from 'express';
import { describeSlot } from '@expert-sessions/shared';
import { consoleAuth, readCookie } from './console-auth.js';
import { listUsers, validateUser, createUser, deactivateUser, findUser } from './console-users.js';
import * as whatsapp from './whatsapp.js';
import { findGuruBySlug, findGuruById, listGurus, validatePattern, validateSite, updatePattern, updateSite, validateNewGuru, createGuru, validateSetup, updateSetup, setGuruStatus, subdomainOf, GURU_STATUSES, validateRazorpayKeys, connectRazorpay, markRazorpayVerified, disconnectRazorpay, validateNumberRequest, updateWhatsappSetup } from './gurus.js';
import { encrypt, secretsKey, maskKey } from './secrets.js';
import { requestApproval, pendingApproval } from './approvals.js';
import { audit, auditTrail } from './audit.js';
import {
  todayReport, weekReport, moneyReport, todayIst, mondayOf, attentionQueue, waitingBoard, closeDayPreview, bookingDetail, bookingRow,
  listDevotees, devoteeDetail, setupState, readiness,
} from './reports.js';
import { listEvents, createEvent, updateEvent, deleteEvent, validateEvent } from './events.js';
import { listQrCodes, createQrCode, QR_SOURCES } from './qr-codes.js';
import { cancelAndRefund } from './cancellations.js';
import { listSessionTypes, findSessionType, defaultSessionType, validateSessionTypes, replaceSessionTypes, publicType } from './session-types.js';
import * as bookings from './bookings.js';
import * as devotees from './devotees.js';
import * as razorpay from './razorpay.js';
import { presenceFor } from './realtime.js';
import { BookingRuleError, ProviderError } from './errors.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOT = /^slot:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const SOURCES = ['live', 'ashram', 'poster', 'page', 'direct'];
// The one-tap notes follow the guru's language (devotee-words.js).

export function consoleRoutes(env, conversation) {
  const wa = whatsapp.client(env);
  const auth = consoleAuth(env, {
    // The sign-in code goes out on WhatsApp from the platform's number, in both languages.
    sendCode: (phone, code) => wa.text(phone, `Samvad: your sign-in code is ${code}. It works for ten minutes.\nसंवाद: आपका साइन-इन कोड ${code} है। यह दस मिनट तक चलेगा।`),
  });
  const guruSlug = env.CONSOLE_GURU_SLUG || 'guruji';
  const GURU_COOKIE = 'es_console_guru';   // which guru an admin is looking at
  const router = express.Router();

  // ---- signing in ---------------------------------------------------------------------------
  // Phone and password for everyone. `username` + `password` is the break-glass admin door from .env.
  router.post('/login', handle(async (req, res) => {
    const { username, phone, password } = req.body ?? {};
    if (username) {
      const token = auth.login(username, password);
      if (!token) return res.status(401).json({ error: 'That username and password do not match. They are CONSOLE_USER and CONSOLE_PASSWORD in the api .env.' });
      auth.setCookie(res, token);
      return res.status(204).end();
    }
    const signed = await auth.signIn(phone, password);
    if (!signed) return res.status(401).json({ error: 'That number and password do not match. First time here, or forgotten it? Ask for a code.' });
    auth.setCookie(res, signed.token);
    res.status(204).end();
  }));

  // First sign-in and forgotten passwords: a code on WhatsApp, then a new password.
  router.post('/login/code', handle(async (req, res) => {
    try {
      await auth.requestCode(req.body?.phone);
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      console.error(err.message);
      return res.status(502).json({ error: 'WhatsApp could not deliver the code to that number just now. Ask a Slike admin to check it is registered, or try again in a minute.' });
    }
    res.status(204).end(); // the same answer whether or not the number is anyone's
  }));

  router.post('/login/password', handle(async (req, res) => {
    const { phone, code, password } = req.body ?? {};
    if (String(password ?? '').length < 8) return res.status(400).json({ error: 'Choose a password of at least 8 characters' });
    if (!(await auth.verifyCode(phone, code))) return res.status(401).json({ error: 'That code does not match, or has run out. Ask for a new one.' });
    const signed = await auth.setPassword(phone, password);
    if (!signed) return res.status(401).json({ error: 'That number is not on the team. Ask a Slike admin to add it.' });
    auth.setCookie(res, signed.token);
    res.status(204).end();
  }));

  router.post('/logout', (_req, res) => {
    auth.clearCookie(res);
    res.setHeader('Set-Cookie', [res.getHeader('Set-Cookie'), `${GURU_COOKIE}=; Path=/; Max-Age=0`]);
    res.status(204).end();
  });

  // Everything below needs the cookie. A team member sees their guru; an admin sees the guru they
  // chose with /view-as, or the first one.
  router.use(auth.requireConsole);
  router.use(handle(async (req, res, next) => {
    req.user = await findUser(req.session.userId);
    if (!req.user || !req.user.active) return res.status(401).json({ error: 'This sign-in is no longer valid. Sign in again.' });
    if (req.session.role === 'team') {
      req.guru = await findGuruById(req.session.guruId);
    } else {
      const chosen = readCookie(req.headers.cookie, GURU_COOKIE);
      req.guru = (chosen && await findGuruBySlug(chosen)) || await findGuruBySlug(guruSlug) || (await listGurus())[0];
    }
    if (!req.guru) throw new Error(`No guru for this sign-in. Run pnpm seed, or set CONSOLE_GURU_SLUG in .env.`);
    next();
  }));

  router.get('/me', handle(async (req, res) => {
    const admin = req.session.role === 'admin';
    res.json({
      user: { id: req.user.id, name: req.user.name, phone: req.user.phone, role: req.user.role },
      guru: { slug: req.guru.slug, name: req.guru.name },
      gurus: admin ? (await listGurus()).map((g) => ({ slug: g.slug, name: g.name })) : undefined,
    });
  }));

  // An admin looks at one guru's console at a time; this picks which.
  router.post('/view-as', auth.requireAdmin, handle(async (req, res) => {
    const g = await findGuruBySlug(String(req.body?.slug ?? ''));
    if (!g) return res.status(404).json({ error: 'No such guru' });
    res.setHeader('Set-Cookie', `${GURU_COOKIE}=${g.slug}; Path=/; SameSite=Lax; Max-Age=${30 * 86400}${env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    res.json({ guru: { slug: g.slug, name: g.name } });
  }));

  // ---- the admin's Gurus: add, set up, go live, pause -----------------------------------------
  async function guruSummary(g) {
    const [types, qr, team] = await Promise.all([
      listSessionTypes(g.id), listQrCodes(g), listUsers({ guruId: g.id }),
    ]);
    const steps = readiness({ guru: g, sessionTypes: types, qrCount: qr.length, teamCount: team.filter((u) => u.active).length, publicHost: env.PUBLIC_HOST });
    const [pending, pendingNumber] = await Promise.all([pendingApproval(g.id, 'payments'), pendingApproval(g.id, 'whatsapp')]);
    return {
      whatsapp: {
        status: g.whatsapp_status ?? 'none', displayName: g.whatsapp_display_name, number: g.whatsapp_status === 'live' ? g.whatsapp_number : g.whatsapp_number_pending,
        phoneNumberId: Boolean(g.whatsapp_phone_number_id), connectedAt: g.whatsapp_connected_at ? g.whatsapp_connected_at.toISOString() : null,
        lastError: g.whatsapp_last_error, pending: pendingNumber, canApprove: Boolean(g.guru_phone), sharedNumber: env.WHATSAPP_DISPLAY_NUMBER ?? null,
        wabaReady: Boolean(env.WHATSAPP_BUSINESS_ACCOUNT_ID),
      },
      payments: {
        connected: Boolean(g.razorpay_connected_at), keyId: maskKey(g.razorpay_key_id), mode: g.razorpay_mode,
        connectedAt: g.razorpay_connected_at ? g.razorpay_connected_at.toISOString() : null, verifiedAt: g.razorpay_verified_at ? g.razorpay_verified_at.toISOString() : null,
        webhookUrl: `${env.APP_BASE_URL}/razorpay/webhook/${g.slug}`, pending, canApprove: Boolean(g.guru_phone), secretsReady: Boolean(secretsKey(env)),
      },
      slug: g.slug, name: g.name, language: g.language, status: g.status, domain: g.domain, subdomain: subdomainOf(g, env.PUBLIC_HOST),
      subscription: g.subscription_json ?? {}, business: g.business_json ?? {}, activatedAt: g.activated_at ? g.activated_at.toISOString() : null,
      readiness: steps, done: steps.filter((st) => st.done).length, total: steps.length,
      readyToGoLive: steps.filter((st) => st.required).every((st) => st.done),
    };
  }

  router.get('/admin/gurus', auth.requireAdmin, handle(async (_req, res) => {
    res.json(await Promise.all((await listGurus()).map(guruSummary)));
  }));

  router.post('/admin/gurus', auth.requireAdmin, handle(async (req, res) => {
    const problem = validateNewGuru(req.body);
    if (problem) return res.status(400).json({ error: problem });
    if (await findGuruBySlug(req.body.slug)) return res.status(409).json({ error: 'That address name is taken. Choose another.' });
    const g = await createGuru(req.body);
    await audit({ guruId: g.id, user: req.user, action: 'guru.created', detail: { slug: g.slug, name: g.name } });
    res.status(201).json(await guruSummary(g));
  }));

  router.get('/admin/gurus/:slug', auth.requireAdmin, handle(async (req, res) => {
    const g = await findGuruBySlug(req.params.slug);
    if (!g) return res.status(404).json({ error: 'No such guru' });
    const [summary, team, trail] = await Promise.all([guruSummary(g), listUsers({ guruId: g.id }), auditTrail(g.id)]);
    res.json({ ...summary, about: g.about, tagline: g.marketing_json?.tagline ?? '', guruPhone: g.guru_phone, team: team.filter((u) => u.active), trail });
  }));

  router.put('/admin/gurus/:slug', auth.requireAdmin, handle(async (req, res) => {
    const g = await findGuruBySlug(req.params.slug);
    if (!g) return res.status(404).json({ error: 'No such guru' });
    const problem = validateSetup(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const updated = await updateSetup(g.id, req.body);
    await audit({ guruId: g.id, user: req.user, action: 'guru.setup', detail: Object.fromEntries(Object.entries(req.body).filter(([k]) => ['domain', 'subscription', 'business'].includes(k))) });
    res.json(await guruSummary(updated));
  }));

  // draft -> setting_up -> live <-> paused. Live needs every required step; pausing needs nothing.
  router.post('/admin/gurus/:slug/status', auth.requireAdmin, handle(async (req, res) => {
    const g = await findGuruBySlug(req.params.slug);
    if (!g) return res.status(404).json({ error: 'No such guru' });
    const status = req.body?.status;
    if (!GURU_STATUSES.includes(status)) return res.status(400).json({ error: 'Status must be draft, setting_up, live or paused' });
    if (status === 'live') {
      const summary = await guruSummary(g);
      if (!summary.readyToGoLive) return res.status(409).json({ error: 'Not ready: finish the required steps first, then go live.' });
    }
    const updated = await setGuruStatus(g.id, status);
    await audit({ guruId: g.id, user: req.user, action: `guru.${status}`, detail: {} });
    res.json(await guruSummary(updated));
  }));

  // ---- his Razorpay: keys in, guruji's Yes, then connected (admin only) -----------------------
  router.post('/admin/gurus/:slug/payments', auth.requireAdmin, handle(async (req, res) => {
    const g = await findGuruBySlug(req.params.slug);
    if (!g) return res.status(404).json({ error: 'No such guru' });
    const problem = validateRazorpayKeys(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const key = secretsKey(env);
    if (!key) return res.status(503).json({ error: 'SECRETS_KEY is not set on the server, so secrets cannot be stored. Add it to deploy/.env (openssl rand -hex 32) and restart.' });
    if (!g.guru_phone) return res.status(409).json({ error: 'Guruji has no WhatsApp number yet, so he cannot approve this. Add it under Settings, Messages, first.' });
    const keyId = req.body.keyId.trim();
    // The keys must open the account before guruji is even asked.
    const ok = await razorpay.client({ RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: req.body.keySecret.trim() }).verifyKeys();
    if (!ok) return res.status(400).json({ error: 'Razorpay does not accept that key id and secret together. Check both, or make a new key in his dashboard.' });
    const payload = { keyId, secretEnc: encrypt(req.body.keySecret.trim(), key), webhookSecretEnc: encrypt(req.body.webhookSecret.trim(), key) };
    const summary = `Razorpay ${maskKey(keyId)} (${keyId.startsWith('rzp_live_') ? 'live' : 'test'})`;
    const approval = await requestApproval({ guru: g, kind: 'payments', payload, summary, requestedBy: req.user.name, key });
    const W = conversation.wordsFor(g.language);
    try {
      await conversation.askGuru({ guru: g, text: W.approvalAsk({ summary, by: req.user.name || 'Slike' }), approvalId: approval.id });
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      return res.status(502).json({ error: `The request is saved, but WhatsApp could not reach guruji's number: ${err.message}` });
    }
    await audit({ guruId: g.id, user: req.user, action: 'payments.requested', detail: { keyId: maskKey(keyId) } });
    res.status(202).json(await guruSummary(await findGuruBySlug(g.slug)));
  }));

  // Do the connected keys still open the account? Marks the date they were last seen working.
  router.post('/admin/gurus/:slug/payments/verify', auth.requireAdmin, handle(async (req, res) => {
    const g = await findGuruBySlug(req.params.slug);
    if (!g) return res.status(404).json({ error: 'No such guru' });
    if (!g.razorpay_key_id) return res.status(409).json({ error: 'No account is connected yet' });
    const ok = await razorpay.clientFor(g, env).verifyKeys();
    await markRazorpayVerified(g.id, ok);
    await audit({ guruId: g.id, user: req.user, action: ok ? 'payments.verified' : 'payments.failed', detail: {} });
    res.json({ ok, ...(await guruSummary(await findGuruBySlug(g.slug))) });
  }));

  router.delete('/admin/gurus/:slug/payments', auth.requireAdmin, handle(async (req, res) => {
    const g = await findGuruBySlug(req.params.slug);
    if (!g) return res.status(404).json({ error: 'No such guru' });
    await disconnectRazorpay(g.id);
    await audit({ guruId: g.id, user: req.user, action: 'payments.disconnected', detail: {} });
    res.json(await guruSummary(await findGuruBySlug(g.slug)));
  }));

  // ---- his WhatsApp number, under Slike's business account (admin only) ------------------------
  const numbers = whatsapp.numbers(env);
  async function numberStep(req, res, work) {
    const g = await findGuruBySlug(req.params.slug);
    if (!g) return res.status(404).json({ error: 'No such guru' });
    try {
      await work(g);
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      await updateWhatsappSetup(g.id, { whatsapp_status: 'failed', whatsapp_last_error: err.message });
      return res.status(502).json({ error: err.message, ...(await guruSummary(await findGuruBySlug(g.slug))) });
    }
    res.json(await guruSummary(await findGuruBySlug(g.slug)));
  }

  // 1. Add the number to Slike's account with his display name. Meta answers with its id for the number.
  router.post('/admin/gurus/:slug/whatsapp', auth.requireAdmin, (req, res, next) => numberStep(req, res, async (g) => {
    const problem = validateNumberRequest(req.body);
    if (problem) throw Object.assign(new BookingRuleError(problem), { status: 400 });
    const digits = String(req.body.phone).replace(/\D/g, '');
    const cc = digits.startsWith('91') && digits.length === 12 ? '91' : digits.slice(0, digits.length - 10);
    const added = await numbers.add({ countryCode: cc, nationalNumber: digits.slice(cc.length), displayName: req.body.displayName.trim() });
    await updateWhatsappSetup(g.id, { whatsapp_phone_number_id: added.id, whatsapp_display_name: req.body.displayName.trim(), whatsapp_number_pending: digits, whatsapp_status: 'added', whatsapp_last_error: null });
    await audit({ guruId: g.id, user: req.user, action: 'whatsapp.added', detail: { displayName: req.body.displayName.trim() } });
  }).catch(next));

  // 1b. A number already registered in Meta's dashboard: paste its id and skip to the approval.
  router.post('/admin/gurus/:slug/whatsapp/manual', auth.requireAdmin, (req, res, next) => numberStep(req, res, async (g) => {
    const problem = validateNumberRequest(req.body);
    if (problem) throw Object.assign(new BookingRuleError(problem), { status: 400 });
    if (!/^\d{6,}$/.test(String(req.body.phoneNumberId ?? ''))) throw Object.assign(new BookingRuleError('The phone number id is the long number Meta shows under the number in WhatsApp Manager'), { status: 400 });
    await updateWhatsappSetup(g.id, { whatsapp_phone_number_id: String(req.body.phoneNumberId), whatsapp_display_name: req.body.displayName.trim(), whatsapp_number_pending: String(req.body.phone).replace(/\D/g, ''), whatsapp_status: 'registered', whatsapp_last_error: null });
    await audit({ guruId: g.id, user: req.user, action: 'whatsapp.manual', detail: {} });
  }).catch(next));

  // 2. Meta sends a code to the SIM, by SMS or a call.
  router.post('/admin/gurus/:slug/whatsapp/code', auth.requireAdmin, (req, res, next) => numberStep(req, res, async (g) => {
    if (!g.whatsapp_phone_number_id) throw Object.assign(new BookingRuleError('Add the number first'), { status: 409 });
    await numbers.requestCode({ phoneNumberId: g.whatsapp_phone_number_id, method: req.body?.method === 'VOICE' ? 'VOICE' : 'SMS' });
    await updateWhatsappSetup(g.id, { whatsapp_status: 'code_sent', whatsapp_last_error: null });
  }).catch(next));

  // 3. The code from the SIM, then registration with a two-step PIN we keep encrypted.
  router.post('/admin/gurus/:slug/whatsapp/verify', auth.requireAdmin, (req, res, next) => numberStep(req, res, async (g) => {
    if (!g.whatsapp_phone_number_id) throw Object.assign(new BookingRuleError('Add the number first'), { status: 409 });
    if (!/^\d{6}$/.test(String(req.body?.code ?? ''))) throw Object.assign(new BookingRuleError('The code is six digits'), { status: 400 });
    await numbers.verifyCode({ phoneNumberId: g.whatsapp_phone_number_id, code: String(req.body.code) });
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    await numbers.register({ phoneNumberId: g.whatsapp_phone_number_id, pin });
    const key = secretsKey(env);
    await updateWhatsappSetup(g.id, { whatsapp_status: 'registered', whatsapp_pin_enc: key ? encrypt(pin, key) : null, whatsapp_last_error: null });
    await audit({ guruId: g.id, user: req.user, action: 'whatsapp.registered', detail: {} });
  }).catch(next));

  // 4. Guruji's Yes: from then on devotees write to his number and every message comes from it.
  router.post('/admin/gurus/:slug/whatsapp/go-live', auth.requireAdmin, (req, res, next) => numberStep(req, res, async (g) => {
    if (g.whatsapp_status !== 'registered') throw Object.assign(new BookingRuleError('The number must be registered first'), { status: 409 });
    if (!g.guru_phone) throw Object.assign(new BookingRuleError('Guruji has no WhatsApp number yet, so he cannot approve this. Add it under Settings, Messages, first.'), { status: 409 });
    const number = g.whatsapp_number_pending ?? '';
    if (!/^\d{10,15}$/.test(number)) throw Object.assign(new BookingRuleError('The number itself is missing; go back to the shared number and add it again'), { status: 409 });
    const key = secretsKey(env);
    if (!key) throw Object.assign(new BookingRuleError('SECRETS_KEY is not set on the server'), { status: 503 });
    const summary = `+${number} (${g.whatsapp_display_name})`;
    const approval = await requestApproval({ guru: g, kind: 'whatsapp', payload: { phoneNumberId: g.whatsapp_phone_number_id, number, displayName: g.whatsapp_display_name }, summary, requestedBy: req.user.name, key });
    await conversation.askGuru({ guru: g, text: conversation.wordsFor(g.language).numberAsk({ summary, by: req.user.name || 'Slike' }), approvalId: approval.id });
    await audit({ guruId: g.id, user: req.user, action: 'whatsapp.requested', detail: { summary } });
  }).catch(next));

  router.delete('/admin/gurus/:slug/whatsapp', auth.requireAdmin, (req, res, next) => numberStep(req, res, async (g) => {
    const back = { whatsapp_phone_number_id: null, whatsapp_display_name: null, whatsapp_number_pending: null, whatsapp_status: 'none', whatsapp_pin_enc: null, whatsapp_last_error: null };
    // Devotees write to the shared number again. Without it on record, his number stays as it was rather than becoming nothing.
    if (env.WHATSAPP_DISPLAY_NUMBER) back.whatsapp_number = env.WHATSAPP_DISPLAY_NUMBER;
    await updateWhatsappSetup(g.id, back);
    await audit({ guruId: g.id, user: req.user, action: 'whatsapp.disconnected', detail: {} });
  }).catch(next));

  // ---- who has access (admin only) ------------------------------------------------------------
  router.get('/admin/users', auth.requireAdmin, handle(async (req, res) => {
    const forGuru = typeof req.query.guru === 'string' ? await findGuruBySlug(req.query.guru) : null;
    res.json(await listUsers(forGuru ? { guruId: forGuru.id } : {}));
  }));

  router.post('/admin/users', auth.requireAdmin, handle(async (req, res) => {
    const body = { ...req.body, guruId: req.body?.guruSlug ? (await findGuruBySlug(req.body.guruSlug))?.id ?? 'missing' : null };
    if (body.guruId === 'missing') return res.status(404).json({ error: 'No such guru' });
    const problem = validateUser(body);
    if (problem) return res.status(400).json({ error: problem });
    const made = await createUser(body);
    await audit({ guruId: body.guruId, user: req.user, action: 'access.added', detail: { name: made.name, role: made.role } });
    res.status(201).json(made);
  }));

  router.delete('/admin/users/:id', auth.requireAdmin, handle(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'No such person' });
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot remove yourself' });
    const u = await deactivateUser(req.params.id);
    if (!u) return res.status(404).json({ error: 'No such person' });
    await audit({ guruId: u.guruId, user: req.user, action: 'access.removed', detail: { name: u.name } });
    res.json(u);
  }));

  router.get('/today', handle(async (req, res) => {
    res.json(await todayReport(req.guru, dateParam(req.query.date) ?? todayIst()));
  }));

  router.get('/week', handle(async (req, res) => {
    res.json(await weekReport(req.guru, mondayOf(dateParam(req.query.start) ?? todayIst())));
  }));

  router.get('/money', handle(async (req, res) => {
    const report = await moneyReport(req.guru, mondayOf(dateParam(req.query.start) ?? todayIst()));
    res.json({ ...report, account: req.guru.razorpay_connected_at ? { own: true, keyId: maskKey(req.guru.razorpay_key_id), mode: req.guru.razorpay_mode } : { own: false } });
  }));

  router.get('/settings', handle(async (req, res) => res.json(await settingsWithTypes(req.guru))));

  router.put('/settings/pattern', handle(async (req, res) => {
    const problem = validatePattern(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const g1 = await updatePattern(req.guru.id, req.body);
    await audit({ guruId: req.guru.id, user: req.user, action: 'settings.timings', detail: {} });
    res.json(await settingsWithTypes(g1));
  }));

  router.put('/settings/site', handle(async (req, res) => {
    const problem = validateSite(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const g2 = await updateSite(req.guru.id, req.body);
    await audit({ guruId: req.guru.id, user: req.user, action: 'settings.website', detail: {} });
    res.json(await settingsWithTypes(g2));
  }));

  // The kinds of sitting he offers: up to three, each a length and a dakshina. The whole list is saved at once.
  router.put('/settings/session-types', handle(async (req, res) => {
    const problem = validateSessionTypes(req.body);
    if (problem) return res.status(400).json({ error: problem });
    await replaceSessionTypes(req.guru.id, req.body.types);
    await audit({ guruId: req.guru.id, user: req.user, action: 'settings.kinds', detail: { kinds: req.body.types.length } });
    res.json(await settingsWithTypes(await findGuruBySlug(req.guru.slug)));
  }));

  async function settingsWithTypes(guru) {
    return { ...settingsView(guru), sessionTypes: (await listSessionTypes(guru.id)).map(publicType) };
  }

  router.get('/events', handle(async (req, res) => res.json(await listEvents(req.guru.id))));

  router.post('/events', handle(async (req, res) => {
    const problem = validateEvent(req.body);
    if (problem) return res.status(400).json({ error: problem });
    res.status(201).json(await createEvent(req.guru.id, eventFields(req.body)));
  }));

  router.put('/events/:id', handle(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'No such event' });
    const problem = validateEvent(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const row = await updateEvent(req.guru.id, req.params.id, eventFields(req.body));
    if (!row) return res.status(404).json({ error: 'No such event' });
    res.json(row);
  }));

  router.delete('/events/:id', handle(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'No such event' });
    const gone = await deleteEvent(req.guru.id, req.params.id);
    if (!gone) return res.status(404).json({ error: 'No such event' });
    res.status(204).end();
  }));

  // ---- Needs attention, the waiting panel, close a day ------------------------------------------

  router.get('/attention', handle(async (req, res) => res.json(await attentionQueue(req.guru))));

  router.get('/waiting', handle(async (req, res) => res.json({ ...(await waitingBoard(req.guru, presenceFor)), oneTap: conversation.wordsFor(req.guru.language).oneTap })));

  router.get('/days/:date/close', handle(async (req, res) => {
    if (!YMD.test(req.params.date)) return res.status(400).json({ error: 'Pick a date like 2026-09-17' });
    res.json(await closeDayPreview(req.guru, req.params.date));
  }));

  router.post('/days/:date/close', handle(async (req, res) => {
    const date = req.params.date;
    if (!YMD.test(date) || date < todayIst()) return res.status(400).json({ error: 'Pick today or a day ahead' });
    const moves = Array.isArray(req.body?.moves) ? req.body.moves : [];
    if (moves.some((m) => !UUID.test(m?.bookingId ?? '') || !SLOT.test(m?.slotId ?? ''))) return res.status(400).json({ error: 'Each move needs a booking and a new time' });
    if (moves.some((m) => m.slotId.startsWith(`slot:${date}`))) return res.status(400).json({ error: 'A new time cannot be on the day being closed' });

    const result = await bookings.closeDay({ guru: req.guru, date, moves });
    const told = [];
    for (const m of result.moved) {
      if (!m.booking) continue;
      const devotee = await devotees.findDevoteeById(m.booking.devotee_id);
      told.push(await tell(() => conversation.sendNewTime({ guru: req.guru, devotee, booking: m.booking })));
    }
    res.json({
      date, moved: result.moved.map((m) => ({ bookingId: m.bookingId, slotId: m.slotId, ok: !!m.booking, newBookingId: m.booking?.id ?? null })),
      expiredHolds: result.expiredHolds, notified: told.filter((t) => t.ok).length, notDelivered: told.filter((t) => !t.ok).map((t) => t.reason),
    });
  }));

  // ---- Bookings: search, one booking, book for a caller, and the moves ---------------------------

  router.get('/bookings', handle(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '';
    res.json((await bookings.searchBookings(req.guru.id, q)).map(bookingRow));
  }));

  router.get('/bookings/:id', handle(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'No such booking' });
    const detail = await bookingDetail(req.guru, req.params.id);
    if (!detail) return res.status(404).json({ error: 'No such booking' });
    res.json(detail);
  }));

  // She called: the team holds the time for her and she gets the pay link on WhatsApp.
  router.post('/bookings', handle(async (req, res) => {
    const phone = String(req.body?.phone ?? '').replace(/\D/g, '');
    const { slotId, name, forWhom, question, paidOutside, typeId } = req.body ?? {};
    const source = SOURCES.includes(req.body?.source) ? req.body.source : 'direct';
    // How she pays: the link we send, cash or UPI already in hand, or nothing — guruji asked for this one to be free.
    if (paidOutside != null && paidOutside !== '' && !['cash', 'upi', 'complimentary'].includes(paidOutside)) return res.status(400).json({ error: 'Paid outside must be cash, upi or complimentary' });
    if (phone.length < 10 || phone.length > 15) return res.status(400).json({ error: 'Her WhatsApp number, with country code, like 919876543210' });
    if (!SLOT.test(slotId ?? '')) return res.status(400).json({ error: 'Pick a time' });
    const type = typeId ? await findSessionType(req.guru.id, String(typeId)) : await defaultSessionType(req.guru.id);
    if (!type) return res.status(400).json({ error: 'Pick a kind of sitting' });

    let devotee = await devotees.findOrCreateDevotee(req.guru.id, phone);
    if (name || forWhom) devotee = await devotees.updateDevotee(devotee.id, { name, forWhom });
    // She rang and will pay the link — or the team already has the dakshina in hand and confirms now.
    const booking = paidOutside
      ? await conversation.bookPaidOutside({ guru: req.guru, devotee, slotId, source, method: paidOutside, type })
      : await conversation.startPayment({ guru: req.guru, devotee, slotId, source, type, team: true });
    if (!booking) return res.status(409).json({ error: 'That time was just taken. Pick another.' });
    if (typeof question === 'string' && question.trim()) await bookings.setQuestion(booking.id, { text: question.trim() });
    res.status(201).json({ ...bookingRow({ ...booking, phone: devotee.phone, devotee_name: devotee.name }), notDelivered: booking.notDelivered ?? null });
  }));

  router.post('/bookings/:id/reschedule', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    if (!SLOT.test(req.body?.slotId ?? '')) return res.status(400).json({ error: 'Pick the new time' });
    await bookings.assertBookable(req.guru, req.body.slotId, { team: true });
    const moved = await bookings.rescheduleBooking({ bookingId: b.id, slotId: req.body.slotId });
    if (!moved) return res.status(409).json({ error: 'That time was just taken. Pick another.' });
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    const note = await tell(() => conversation.sendNewTime({ guru: req.guru, devotee, booking: moved }));
    res.json({ booking: bookingRow({ ...moved, phone: devotee.phone, devotee_name: devotee.name }), notified: note.ok, notDelivered: note.reason ?? null });
  }));

  // Everyone who has booked, and one person's whole history. The team's "who are our regulars".
  router.get('/devotees', handle(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '';
    res.json(await listDevotees(req.guru, q));
  }));

  router.get('/devotees/:id', handle(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'No such devotee' });
    const detail = await devoteeDetail(req.guru, req.params.id);
    if (!detail) return res.status(404).json({ error: 'No such devotee' });
    res.json(detail);
  }));

  // The go-live checklist a new guru's team sees on Today until everything is set.
  router.get('/setup', handle(async (req, res) => res.json(await setupState(req.guru))));

  // Her WhatsApp name is a start, not a record. The team corrects it, or notes who the time is for.
  router.put('/devotees/:id', handle(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'No such devotee' });
    const devotee = await devotees.findDevoteeById(req.params.id);
    if (!devotee || devotee.guru_id !== req.guru.id) return res.status(404).json({ error: 'No such devotee' });
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
    const forWhom = typeof req.body?.forWhom === 'string' ? req.body.forWhom.trim().slice(0, 120) : '';
    if (!name && !forWhom) return res.status(400).json({ error: 'Type her name, or who the time is for' });
    const updated = await devotees.updateDevotee(devotee.id, { name, forWhom });
    res.json({ id: updated.id, name: updated.name, forWhom: updated.for_whom, phone: updated.phone });
  }));

  // She asked the team to cancel. Same outcome as her own button — the dakshina goes back to her —
  // without the four-hour rule, because the team is making a judgement, not pressing a self-serve
  // button. "Return the dakshina" below is for when guruji could not sit.
  router.post('/bookings/:id/cancel', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    const { booking, amountPaise, how } = await cancelAndRefund({ booking: b, pay: razorpay.clientFor(req.guru, env), reason: 'cancelled by the team at her request' });
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    const note = await tell(() => conversation.sendCancelledNote({ guru: req.guru, devotee, booking, amountPaise, how }));
    res.json({ booking: bookingRow({ ...booking, phone: devotee.phone, devotee_name: devotee.name }), amountPaise, how, notified: note.ok, notDelivered: note.reason ?? null });
  }));

  // Guruji could not sit. Razorpay first; only when the money has moved do we mark the booking.
  router.post('/bookings/:id/refund', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    bookings.transition(b.status, 'refund'); // throws BookingRuleError before any money moves
    const paid = await bookings.paymentFor(b.id);
    if (!paid) return res.status(409).json({ error: 'Nothing was paid for this booking, so there is nothing to return' });
    // Money Razorpay collected goes back through Razorpay; money the team took by hand is handed
    // back by hand, and the ledger row says so.
    const byHand = paid.kind === 'payment' && String(paid.provider_ref ?? '').startsWith('offline:');
    let providerRef = byHand ? `offline:refund:${b.id}` : null;
    if (paid.kind === 'payment' && !byHand) {
      providerRef = (await razorpay.clientFor(req.guru, env).refundPayment({ paymentId: paid.provider_ref, amountPaise: paid.amount_paise, bookingId: b.id })).id;
    }
    const refunded = await bookings.refundBooking({ bookingId: b.id, providerRef });
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    const note = await tell(() => conversation.sendRefundNote({ guru: req.guru, devotee, booking: refunded, amountPaise: paid.amount_paise, viaCredit: paid.kind === 'credit_used', byHand }));
    res.json({ booking: bookingRow({ ...refunded, phone: devotee.phone, devotee_name: devotee.name }), amountPaise: paid.amount_paise, viaCredit: paid.kind === 'credit_used', byHand, notified: note.ok, notDelivered: note.reason ?? null });
  }));

  // The team took the dakshina by hand after holding the time. Confirms it and sends her the join link.
  router.post('/bookings/:id/mark-paid', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    const method = req.body?.method;
    if (!['cash', 'upi', 'complimentary'].includes(method)) return res.status(400).json({ error: 'Say how she paid: cash, upi, or complimentary' });
    const booking = await bookings.confirmOffline({ bookingId: b.id, method });
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    const note = await tell(() => conversation.sendConfirmation({ guru: req.guru, devotee, booking }));
    res.json({ booking: bookingRow({ ...booking, phone: devotee.phone, devotee_name: devotee.name }), notified: note.ok, notDelivered: note.reason ?? null });
  }));

  // A note to guruji's own WhatsApp about this sitting, now.
  router.post('/bookings/:id/tell-guru', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    const text = conversation.wordsFor(req.guru.language).guruNow({ devoteeName: devotee.name ?? `…${devotee.phone.slice(-4)}`, time: describeSlot(b.slotId), question: b.question_text });
    await conversation.tellGuru({ guru: req.guru, devotee, booking: b, text, kind: 'note.guru' });
    res.json({ told: true });
  }));

  router.post('/bookings/:id/no-show', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    const marked = await bookings.markNoShow(b.id);
    res.json({ booking: bookingRow({ ...marked, phone: b.phone, devotee_name: b.devotee_name }) });
  }));

  // A note to her while she waits: one tap, or typed. Lands in the room or on WhatsApp.
  router.post('/bookings/:id/message', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 300) : '';
    if (!text) return res.status(400).json({ error: 'Write something to send' });
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    res.json(await conversation.sendWaitingMessage({ guru: req.guru, devotee, booking: b, text }));
  }));

  // Her hold expired and the slot is still free: hold it again and send the link again.
  router.post('/bookings/:id/send-link', handle(async (req, res) => {
    const b = await ownBooking(req, res); if (!b) return;
    if (b.status !== 'expired') return res.status(409).json({ error: `A ${b.status} booking does not need a new link` });
    const devotee = await devotees.findDevoteeById(b.devotee_id);
    const held = await conversation.startPayment({ guru: req.guru, devotee, slotId: b.slotId, source: b.source, team: true });
    if (!held) return res.status(409).json({ error: 'Someone else has that time now. Offer her another from Bookings.' });
    res.status(201).json({ booking: bookingRow({ ...held, phone: devotee.phone, devotee_name: devotee.name }) });
  }));

  router.get('/qr-codes', handle(async (req, res) => res.json(await listQrCodes(req.guru))));

  router.post('/qr-codes', handle(async (req, res) => {
    const source = req.body?.source;
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    if (!QR_SOURCES.includes(source)) return res.status(400).json({ error: `Source must be one of ${QR_SOURCES.join(', ')}` });
    if (!label) return res.status(400).json({ error: 'Give the QR a label so the team knows where it hangs' });
    if (!req.guru.whatsapp_number) return res.status(400).json({ error: 'Set his WhatsApp number first (gurus.whatsapp_number)' });
    res.status(201).json(await createQrCode(req.guru, { source, label }));
  }));

  // A rule said no, or a provider did: a sentence, not a 500.
  router.use((err, _req, res, next) => {
    if (err instanceof BookingRuleError) return res.status(err.status ?? 409).json({ error: err.message });
    if (err instanceof ProviderError) return res.status(502).json({ error: err.message });
    next(err);
  });

  return router;
}

/** The booking in the path, if it is this guru's; otherwise answers 404 and returns null. */
async function ownBooking(req, res) {
  if (!UUID.test(req.params.id)) { res.status(404).json({ error: 'No such booking' }); return null; }
  const b = await bookings.findWithDevotee(req.params.id);
  if (!b || b.guru_id !== req.guru.id) { res.status(404).json({ error: 'No such booking' }); return null; }
  return b;
}

/** Send a WhatsApp note as part of a team action; the action stands even if Meta refuses. */
async function tell(send) {
  try {
    await send();
    return { ok: true };
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    return { ok: false, reason: err.message };
  }
}

// Express 4 does not catch a rejected promise; every async handler goes through here.
function handle(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

function dateParam(value) {
  return typeof value === 'string' && YMD.test(value) ? value : null;
}

function eventFields(b) {
  return { title: b.title.trim(), kind: b.kind, startsAt: new Date(b.startsAt), link: b.link || null, location: b.location || null, notes: b.notes || null };
}

/** The guru row as the Settings screen sees it. */
export function settingsView(g) {
  return {
    id: g.id, slug: g.slug, name: g.name, domain: g.domain, about: g.about, marketing: g.marketing_json,
    dakshinaPaise: g.dakshina_paise, whatsappNumber: g.whatsapp_number, guruPhone: g.guru_phone, language: g.language ?? 'en', pattern: g.pattern_json, closedDates: g.closed_dates,
  };
}
