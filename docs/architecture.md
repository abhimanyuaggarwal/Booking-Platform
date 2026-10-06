# Architecture

Read `CLAUDE.md` first; it holds the product boundary, the settled decisions and the domain model.
This file is the map of what actually exists in the code. Keep the Component Index and Conventions
current whenever a module, table, endpoint or event is added.

## Shape

```
apps/api            Node 22+, Express 4, Postgres via pg, Socket.IO, node-cron        :3000
apps/web            React 18 + Vite + TypeScript, react-router 6                      :5173 (proxies /api and /socket.io to :3000)
packages/shared     slot maths and formatting, ES module, imported by both
docs/               briefs, the clickable spec (design/v1-walkthrough.html), mockups, build plan, this file
```

One Postgres database. Every table carries `guru_id`; one guru is seeded. Everything is plain ES
modules (`"type": "module"`) so the web app and the api import `@expert-sessions/shared` the same way.

## Component Index

### packages/shared

| File | What it is for | Key exports |
|---|---|---|
| `slots.js` | Turns a guru's weekly pattern into bookable slots; IST wall-clock convention; slot id ↔ instant | `availableSlots(availability, takenSlotIds, now?)`, `sittingStep(availability)`, `describeSlot(slotId)`, `slotIdToInstant`, `instantToSlotId`, `parseSlotId`, `toSlotId`, `labelFor`, `startOfDay`, `nowInIst` |
| `format.js` | Money copy | `formatRupees(paise)` → `₹500`, `₹1,50,000` |
| `index.js`, `index.d.ts` | Entry point and hand-written types for the web app | |
| `*.test.js` | Usage examples, `node --test` | |

### apps/api/src

| File | What it is for | Key exports / routes |
|---|---|---|
| `server.js` | Boot only: env check, Express, raw-body JSON, mounts the door and routes, attaches realtime, starts jobs | |
| `whatsapp-door.js` | The inbound WhatsApp conversation: parse, find the guru by the number she wrote to, offer slots, route her question. Speaks through `conversation.js` | `whatsappDoor(env, conversation)` → Router: `GET /webhook`, `POST /webhook`, `POST /razorpay/webhook` |
| `conversation.js` | **Every word we send a devotee**, and the steps it drives: hold and make the pay link (releasing the hold if Razorpay refuses); confirm and send the join link; new time; cancelled-to-credit note; refund note; a note while she waits (room or WhatsApp). Used by all three doors | `createConversation(env)` → `speak`, `startPayment`, `sendConfirmation`, `sendNewTime`, `sendCancelledNote`, `sendRefundNote`, `sendWaitingMessage`, `joinLink`; `copy` (pure text builders) |
| `sessions.js` | A booking's video room: when it was made, who arrived, when it started and ended. Guruji's tap starts it and tells the room in the same breath | `startSession({guru, bookingId, video})`, `endSession`, `devoteeToken`, `noteDevoteeOpened`, `findSessionByBooking`, `currentSession`, `isWaiting` |
| `session-routes.js` | Her side of a session: the waiting room and the way out | `GET /api/session/:bookingId`, `POST …/token`, `POST …/escape` |
| `devotee-words.js` | Every sentence a devotee (and guruji) receives on WhatsApp, in English and Hindi: `wordsFor(guru.language)`, `describeSlot(slotId, lang)`, `slotLabel(label, lang)`. `conversation.copy` and `reminders.copy` are the English set from this table. Pure; tested in `devotee-words.test.js` | `wordsFor`, `describeSlot`, `slotLabel`, `LANGUAGES` |
| `pay-routes.js` | Her payment page's api: `GET /api/pay/:id` (what to collect, the order id, the key id) and `POST /api/pay/:id/confirm` (Checkout's signed result, verified with the key secret and then with Razorpay itself before `settlePaidLink`) | `payRoutes(env, conversation)` |
| `guru-routes.js` | **Guruji's own screens**, behind his magic link: his day, her voice note, and the two taps. No money is selected in any query here | `guruRoutes(env)` → `/api/guru/me`, `/day`, `/media/:mediaId`, `/sessions/:id` and `/sessions/:id/start` and `/end` |
| `guru-day.js` | Pure. His sittings and events on one timeline, rest where the day is empty, when Join appears, and the one line about who is coming | `guruDay(entries, now)`, `contextLine({...})` |
| `video.js` | 100ms: one room per booking, and the two tokens that open it. Both JWTs signed here with `node:crypto`, so no JWT library | `videoClient(env)` → `isConfigured`, `createRoom`, `authToken`; `signJwt` |
| `waiting-words.js` | Pure. What her screen says at each moment, and never a countdown | `waitingWords({...})`, `ESCAPE_AFTER_MINUTES` |
| `guru-auth.js` | Guruji's screens: one magic link from `.env` for the pilot, kept in a cookie after the first open | `guruAuth(env)` → `isHim`, `requireGuru` |
| `errors.js` | `BookingRuleError` (the state machine or policy said no → 409) and `ProviderError` (Razorpay or Meta said no → 502) | |
| `routes.js` | HTTP endpoints that are not webhooks | `GET /api/health`, `GET /api/gurus/:slug/slots`, `GET /join/:id` (placeholder page), `GET /admin/bookings` (raw; Session 3 replaces it with the console's Bookings) |
| `site-routes.js` | **His own website**, public: his page, his schedule, the open times, holding a time, her sign-in, and her own sessions | `siteRoutes(env, conversation)` → `/api/site/*` |
| `tenancy.js` | Which guru's site a request is for: `?slug=` (preview), `?host=` (dev), else the `Host` header | `resolveGuru(req)`, `withGuru` middleware |
| `devotee-auth.js` | Her identity is her phone: a code (mock `1234`) and a signed 30-day cookie `es_devotee`. Five wrong guesses burn the request | `devoteeAuth(env)` → `requestCode`, `verifyCode`, `tokenFor`, `devoteeIdFrom`, `setCookie`, `clearCookie`; `normalisePhone` |
| `credits.js` | A cancelled booking's dakshina, kept 30 days. Not a table: `credit_issued` rows spent by `credit_used`, matched oldest first | `creditFor(guruId, devoteeId)`, `creditBalance` (pure) |
| `console-routes.js` | Every console endpoint under `/api/console`, behind the shared login. Reads via `reports.js`; booking writes via `bookings.js`, including the team's cancel-to-credit | `consoleRoutes(env, conversation)`, `settingsView(guru)` |
| `console-auth.js` | One shared team login from `.env`; signed 7-day cookie `es_console`, keyed by the password | `consoleAuth(env)` → `login`, `isValid`, `requireConsole`, `setCookie`, `clearCookie`; `readCookie` |
| `reports.js` | Read-only console views: Today, the week grid, Money, Needs attention, the waiting board, close-a-day preview, one booking in full; IST date helpers; the settlement estimate | `todayReport`, `weekReport`, `buildWeek` (pure), `moneyReport`, `attentionQueue`, `waitingBoard`, `closeDayPreview`, `suggestMoves` (pure), `bookingDetail`, `allowedActions` (pure), `bookingRow`, `todayIst`, `mondayOf`, `settlementStart`, `rangeLabel` |
| `events.js` | His public schedule (satsangs, lives, meetups) | `listEvents`, `createEvent`, `updateEvent`, `deleteEvent`, `validateEvent`, `EVENT_KINDS` |
| `qr-codes.js` | **The wa.me link is rebuilt from his CURRENT number on every read, never served from the stored column** — change his number and stored links point at the old one for ever, and a printed QR cannot be reissued. `stale` flags codes generated against a different number |
| ~~`qr-codes.js`~~ | wa.me links with the greeting the door recognises; rows in `qr_codes` | `listQrCodes`, `createQrCode`, `greetingFor`, `waLink`, `GREETINGS`, `QR_SOURCES` |
| `bookings.js` | **The only file that changes a booking's status.** The transition table, and every write to `bookings` | `transition`, `holdSlot`, `attachPaymentLink`, `confirmByPayment`, `attachQuestion`, `setQuestion`, `rescheduleBooking`, `refundBooking`, `markNoShow`, `expireHold`, `closeDay`, `expireStaleHolds`, `paymentFor` (follows reschedules), `cancelToCredit` (her button and the team's), `markNoShows`, `unreconciledPaymentLinks`, `confirmWithCredit`, `whyCannotCancel` / `whyCannotReschedule` (pure), `completeBooking`, `takenSlotIds`, `bookingsOn`, `searchBookings`, `listForDevotee`, `listForDevoteeWithGuru`, `findById`, `findWithDevotee`, `hasConfirmedBooking`, `listRecent`, `HOLD_MINUTES`, `SELF_SERVE_HOURS`, `NO_SHOW_AFTER_MINUTES` |
| `gurus.js` | The `gurus` table: reads for every surface, settings writes and their validation for the console | `findGuruBySlug`, `findGuruById`, `findGuruByDomain`, `findGuruByWhatsappNumber`, `availabilityOf(guru)`, `validatePattern`, `validateSite`, `updatePattern`, `updateSite` |
| `devotees.js` | A devotee is a phone under one guru. Her WhatsApp profile name fills an empty name on first contact and never overwrites one the team typed | `findOrCreateDevotee(guruId, phone, { name? })`, `findDevoteeById`, `updateDevotee` |
| `messages-log.js` | One row per WhatsApp message, either direction | `logMessage({...})` |
| `whatsapp.js` | Meta Cloud API adapter: text, buttons (≤3), list (≤10 rows), cta link; inbound parsing, including her profile name from `contacts[0]` | `client(env)`, `parseInbound(body)` → `{ from, to, profileName, kind, ... }` |
| `razorpay.js` | Orders (`createOrder`), one lookup for an order or an old link (`findPayments`), refunds, and the two signature checks (`isValidWebhook` for the webhook body, `isValidCheckout` for `order_id|payment_id`). `bookings.payment_link_id` holds the order id since 2026-09-28 | Payment Links and refunds adapter, webhook signature check | `client(env).createPaymentLink({amountPaise,...})`, `client(env).getPaymentLink(id)` → `{ url, status, payments[] }`, `client(env).refundPayment({paymentId, amountPaise, bookingId})`, `isValidWebhook(rawBody, signature, secret)` |
| `paid-link.js` | "Razorpay says paid", settled once for both the webhook and reconciliation: confirm if the hold stands, record the money either way, tell her which | `settlePaidLink({ paymentLinkId, providerRef, amountPaise, conversation })` → `confirmed` \| `too_late` \| `unknown_link` |
| `reconcile.js` | Hourly: every link we made with no payment recorded is asked about directly, so a lost webhook cannot leave her paid with no time and no ledger row | `reconcilePayments({ pay, conversation })`, `capturedPayment(link)` (pure) |
| `realtime.js` | Socket.IO: one namespace, `session:{bookingId}` rooms, and who is connected right now (in memory). A devotee joining records `sessions.devotee_joined_at`. Emitting is best effort and says so | `attachRealtime(httpServer, {corsOrigin})`, `emitToSession(bookingId, event, payload)` → boolean, `presenceFor(bookingId)` |
| `jobs.js` | node-cron inside the api: abandoned sessions, hold expiry, automatic no-shows and reminders every minute; payment reconciliation hourly | `startJobs({ conversation, pay })` |
| `reminders.js` | The evening before and ten minutes before, once each, recorded either way. Names in one comment where approved templates plug in | `reminderDue({slotStart, now})` (pure), `sendDue({conversation})`, `copy` |
| `demo.js` | `pnpm demo`: the whole journey against the running api, standing in for any service that is not wired and saying so | |
| `db.js` | The `pg` pool (created lazily), `query`, `transaction`, the migration runner | `query(text, params)`, `transaction(fn)`, `migrate()`, `close()`, `explainDbError(err)` |
| `migrate.js` | `pnpm --filter api migrate` | |
| `seed.js` | `pnpm --filter api seed`: wipes and loads the demo guru (Guruji Vishwanath by default; `-- --slug bhagwat --name Bhagwat [--domain x]` seeds the same week under another identity), 3 events, 20 devotees, ~8 days of bookings across every status and source, ledger, sessions, messages, 4 QR codes. Set `CONSOLE_GURU_SLUG` to the slug you seeded | |
| `*.test.js` | State machine table, webhook signature, inbound parsing, console auth, settings validation, week grid, close-a-day suggestions, allowed actions, devotee copy. Run without a database | |
| `bookings.db.test.js`, `sessions.db.test.js` | The state machine's SQL and the session's, against a real Postgres: each creates a throwaway database, runs the moves (the session one with a stubbed 100ms), and drops it. They skip themselves with a note if Postgres is down | |

- `static.js` — `serveWeb(dir)`: in production the api serves the built web app (hashed assets cached a year, every page as index.html; `/api`, `/socket.io`, `/webhook`, `/razorpay` pass through). Mounted when `WEB_DIST` is set. Test: `static.test.js`.

### apps/api/db/migrations

| File | Creates |
|---|---|
| `003_language.sql` | `gurus.language` ('en' or 'hi', default 'en') — the language of every WhatsApp sentence to this guru's devotees and of the notes to him; Settings → His website | |
| `002_guru_phone.sql` | `gurus.guru_phone text` — his own WhatsApp number for the ten-minute note and the console's "Tell guruji" | |
| `001_init.sql` | `gurus`, `events`, `devotees`, `bookings`, `ledger_entries`, `sessions`, `messages_log`, `qr_codes`, and the partial unique index `bookings_one_per_slot` |

### apps/web/src

| File | Surface |
|---|---|
| `App.tsx` | Route groups: `/console/*`, `/guru/*`, `/s/:guruSlug/*`, and a dev index at `/` |
| `console/open-booking.tsx` | Two contexts the shell provides: `useOpenBooking()(id)` opens the one booking drawer from any screen (addressed by `?booking=<id>`); `useBookForCaller()(slotId?)` opens the book-for-a-caller sheet with a slot pre-chosen. Defaults are no-ops, so pure views render in tests | `OpenBookingContext`, `BookForCallerContext`, `useOpenBooking`, `useBookForCaller` |
| `console/changed.ts` | The drawer announces a change; every screen showing bookings reloads. One window event, no store | `announceChange()`, `useOnChange(reload)` |
| `console/ConsoleShell.tsx` | Team console: checks `/api/console/me`, shows `Login` or the nav + four screens (Today, Week, Money, Settings). `/console/calendar`, `/bookings`, `/attention` redirect. Cool palette, `console.css` |
| `console/api.ts`, `types.ts`, `format.ts` | `api()` + `useApi()` for `/api/console/*`; the response shapes; small display helpers |
| `console/Today.tsx` | The operating screen: what needs her as cards with the action on them (`NeedsYou`), the waiting panel, today's sittings with the next one marked (`nextSitting`, pure). No money. `TodayView` is pure |
| `console/WaitingPanel.tsx` | Who is around a session now (polls `/waiting` every 15 s): in the room and since when, or link not opened; one-tap and typed notes with where each landed; call; the ways out (later today, tomorrow, return the dakshina). `WaitingPanelView` is pure |
| `console/BookForCaller.tsx`, `SlotPicker.tsx` | Hold a time for someone on the phone and send her the pay link; the open-times `<select>` both it and the drawer use |
| `console/CloseDay.tsx` | Pick a date, see everyone booked with a suggested new time each, move them all. `CloseDayPreviewView` is pure |
| `console/BookingDrawer.tsx` | One booking in full: the moves the state machine allows first (message, move, cancel to credit, return the dakshina, did not join, hold again and send the link), then who, money, what was said. `BookingDetailView` is pure |
| `site/useSelfView.ts` | Her camera, microphone and connection, asked for once and held across the check screen and the waiting room — switching it off at the door was what made the wait feel like a notice rather than a room. `useStreamOn` points a `<video>` at it |
| `console/words.tsx` | The one vocabulary: `STATE` (one word and tone per booking status), `StateTag`, `chipClass`, `sourceWords`, `askedAbout`, `ATTENTION_WORDS`, `groupAttention` (pure) |
| `console/Week.tsx` | His week: the grid (`WeekGrid`, pure: colour by state only, his events on their day, fill counts, closed days, afternoon divider) or the same week as a list by day (`WeekList`), Close a day, and his schedule editor (`Meetups`) underneath |
| `console/Money.tsx` | Three numbers (collected, returned, settles Friday), the pilot line (bookings from lives), the exceptions (returns and credits), and the full ledger behind one click. `MoneyView` is pure |
| `console/Settings.tsx` + `PatternEditor`, `SiteContent`, `QrCodes` | Three editors, set once: his timings and dakshina and closed dates; the words and pictures on his website; QR codes with PNG/SVG download (`qrcode`). `Meetups` (events CRUD) is used from Week |
| `console/stream-band.ts` | The 1920×280 strip for the bottom of a live: his name, what a sitting is, and the QR. Offered on any live-sourced QR. `bandLayout` is pure |
| `console/console.test.tsx` | The pure views rendered from api-shaped fixtures |
| `guru/GuruShell.tsx` | **Guruji's calendar.** Takes the token from his magic link once, keeps his day fresh, opens and closes the room. Adds the manifest and icon to the page so only his screen is installable. `afterwards()` is pure |
| `guru/Day.tsx` | The timeline: times down the left, sittings and satsangs beside them, rest where the day is empty, her voice note, one Join. Pure |
| `guru/GuruRoom.tsx` | The room with her card beside the video and only End to press. `DevoteeStrip` is pure |
| `guru/api.ts`, `types.ts`, `guru.css` | `guruApi()` and the magic-link handling; the response shapes; his warm palette |
| `public/guru.webmanifest`, `guru-sw.js`, `guru-icon-*.png` | What makes his screen installable: `start_url` `/guru`, a worker that caches nothing, and a placeholder icon |
| `site/SiteShell.tsx` | **His website.** Fetches his page, then routes: the page itself, `sessions`, `booked/:bookingId`. Warm palette, `site.css` |
| `site/HomePage.tsx` | One scrolling page: who he is, the next open times, his text blocks, his schedule. `HomeSections` is pure |
| `site/BookSheet.tsx` | The short sheet: the time, the dakshina, her WhatsApp number, then the Razorpay page. `BookSheetBody` is pure |
| `site/Confirmed.tsx` | Where Razorpay returns her; asks the api until the payment has landed, then says so in words. `ConfirmedView` is pure |
| `site/SignIn.tsx`, `MySessions.tsx`, `PickTime.tsx` | Phone and code; upcoming with Join, Reschedule and Cancel; her credit offered back as a time; her history. `MySessionsView` is pure |
| `site/Join.tsx` | Her session end to end: the check, the wait, the room, the way out, the closing screen. Its own route, so her link needs no tenant. `Ended` is pure |
| `site/PreEntry.tsx` | Microphone, camera, connection and a self preview, while they still cost nothing to fix. `PreEntryView` is pure |
| `site/WaitingRoom.tsx` | One sentence, notes from the team, and after ten minutes the two choices. Pure |
| `site/VideoRoom.tsx` | 100ms's prebuilt room in his colours, loaded only when guruji has joined (a lazy import, so the waiting room does not carry the SDK) |
| `site/useSessionState.ts` | Her screen's state: the socket for the moment it changes, a slow poll for a dropped connection |
| `site/api.ts`, `types.ts`, `site.css` | `siteApi(slug)` + `useSite()`; the response shapes; the warm palette |
| `styles/tokens.css` | The two palettes as CSS variables; `.surface-warm`, `.surface-console` |
| `App.test.tsx` | Smoke render of each route group with `react-dom/server` |

## Data

Tables follow the domain model in CLAUDE.md exactly, plus three things decided in Session 1:

- `bookings.rescheduled_from_id` — the new row points at the row it replaced.
- `guru_id` on `sessions` and `messages_log` — every table has it.
- `create unique index bookings_one_per_slot on bookings (guru_id, slot_start) where status in ('held','confirmed')` —
  one live booking per slot is a database fact; `holdSlot` inserts and treats a violation as "taken".

Shapes inside JSON columns:

- `gurus.pattern_json`: `{ slotMinutes, gapMinutes, minimumNoticeMinutes, daysAhead, stepMinutes?, weeklyPattern: { mon: [["10:00","13:00"]], ... } }`.
  Closed dates are the separate `closed_dates date[]` column; `gurus.availabilityOf()` joins the two for `availableSlots`.
- **Offer step vs sitting grid.** `stepMinutes` is how far apart the *doors* offer starts (Settings: "Times offered every"); missing means one sitting plus the gap, i.e. back to back. Set to 5 it lets a devotee book any five-minute mark (the demo guru runs this way so a call can be booked minutes ahead). `availableSlots` then hides any start nearer than one sitting plus the gap to a held or confirmed booking, in either direction, so sittings never overlap. The console keeps showing whole sittings: `gurus.sittingGridOf()` is the same pattern with the step forced to sitting plus gap, and Today, the week grid, close-a-day and the waiting-room suggestions all use it; a booking that sits off that grid gets its own row in the week (`buildWeek`), never a footnote.
- **Session types.** `session-types.js` (`listSessionTypes`, `defaultSessionType`, `validateSessionTypes`, `replaceSessionTypes`, `typeLabel`, `publicType`; migration `004_session_types.sql`). Up to three per guru; the editor saves the whole list and switched-off kinds are deactivated, never deleted. `bookings.holdSlot` / `confirmWithCredit` snapshot the kind's minutes and dakshina onto the booking; `bookings.takenIntervals` feeds `availableSlots` with each sitting's length. Doors: WhatsApp "Hi" shows the kinds as buttons when there is more than one (`type:<id>`, then `t:<typeId>|slot:<slotId>` and `more:<typeId>`; ids carry the state, nothing is remembered between taps); the site gets `sessionTypes` on `/api/site/` and `GET /api/site/slots?type=`; the console has `PUT /api/console/settings/session-types`, `POST /api/console/bookings` takes `typeId` and `paidOutside: cash|upi|complimentary`, and `GET /api/gurus/:slug/slots?type=`. A timing window `[from, to, [typeIds]]` is only for those kinds.
- **Cancel and change time, on WhatsApp too.** `cancellations.js` (`cancelAndRefund({ booking, pay, reason })`) is the one place a cancellation moves money: Razorpay refund for an online payment, `offline:refund:<id>` for cash or UPI taken by hand (Needs you shows it as "to be handed back"), the credit re-issued for an old credit, nothing for a complimentary sitting; then `bookings.cancelWithRefund` writes the status and the refund row in one transaction. The site's and the console's cancel buttons call it, and so does the WhatsApp door: "Hi" from a devotee with a time ahead answers with her booking and three buttons (`move:<id>`, `cancel:<id>`, `new`); `move:` lists the open times for that sitting's kind (`mv:<id>|slot:<slotId>`), `cancel:` asks once more with what happens to the dakshina (`cancel-yes:<id>` / `keep`); outside the self-serve rule (once, four hours) the button becomes `tell:<id>`, which logs `asked.team` and raises an `asked_team` item on Today. Her moves and cancellations are logged as `devotee.moved` / `devotee.cancelled` on the booking.
- **Console IA (6 October 2026).** Five named places on the rail, each with a lucide icon: Today (`/console`), Calendar (`/console/calendar`, the week), Devotees (`/console/devotees`, `/console/devotees/:id`), Money, Settings. "More" is gone; `/console/week` and `/console/more` redirect. Today opens with a three-tile "now" strip (next sitting, needs you, sittings today) and, until a new guru's five go-live steps are done, the checklist (`GET /api/console/setup`, `reports.setupSteps`). Settings is a card index over five tabs: kinds, timings, website, messages (language + guruji's phone, `Messages.tsx`, split out of the website words), qr. Devotees: `GET /api/console/devotees?q=` (`reports.listDevotees`: sittings, last, next, dakshina given) and `GET /api/console/devotees/:id` (`reports.devoteeDetail`); the person page books her next time with her number already typed (`BookForCaller(slotId?, phone?)`).
- **Console sign-in and roles (7 October 2026).** `console-auth.js`: phone + password (`scrypt`), a signed cookie carrying `{userId, role, guruId}`, codes on WhatsApp (`login_codes`, hashed, ten minutes, five guesses; outside production the mock `OTP_CODE` is accepted too), and the `.env` break-glass admin (`login(username, password)` → user id `env`). `console-users.js` (`console_users`, migration `005`): `listUsers`, `createUser` (upsert by phone), `deactivateUser`, `ensureFirstAdmin` (from `ADMIN_PHONE` on boot). Routes: `POST /api/console/login` (phone+password, or username+password), `/login/code`, `/login/password`, `/view-as` (admin picks a guru; cookie `es_console_guru`), `GET /me` (role, guru, and every guru for an admin), `/admin/users` (list, add, remove). A team member's `req.guru` is their own; an admin's is the chosen one.
- **Guru lifecycle and the admin's Setup area (7 October 2026).** `gurus.status` draft → setting_up → live ⇄ paused (migration `006`, with `subscription_json`, `business_json`, `activated_at` and the `audit_log` table written by `audit.js`). While not live, the WhatsApp door answers `notOpen` and the site reports `open: false` and refuses holds. `gurus.createGuru` makes a draft with empty timings and one 30-minute ₹500 kind; `reports.readiness` is the nine-step list (identity, address, team, sittings required; payments and whatsapp read `shared` until D3/D4; distribution, business, live inform). Admin routes: `GET/POST /api/console/admin/gurus`, `GET/PUT /admin/gurus/:slug`, `POST /admin/gurus/:slug/status` (live needs the required steps). Subdomains: `<slug>.<PUBLIC_HOST>` resolves the tenant (`gurus.findGuruBySubdomain`, `tenancy.js`) and gets a certificate (`/api/tls-ask`); one wildcard DNS record `*.samvad.sli.ke` → the server is needed for that. Web: `/console/gurus`, `/console/gurus/new`, `/console/gurus/:slug` (`GuruSetup.tsx`), the Gurus rail item for admins only; "Open his console" switches the admin's view-as and goes to the team's screens.
- **Platform hostnames.** `PUBLIC_HOST` is the address in every link we make (`APP_BASE_URL`, `WEB_ORIGIN` follow it). `EXTRA_HOSTS` lists older addresses that must keep answering: `routes.platformHosts()` lets Caddy issue their certificates (`/api/tls-ask`) and `server.js` lets the waiting room's Socket.IO connect from them. Since 2026-09-29 the pilot is at `samvad.sli.ke`; `192-46-215-107.sslip.io` stays in `EXTRA_HOSTS` until the Meta and Razorpay webhooks are re-pointed.
- **A time booked minutes before it begins** (`conversation.startsWithin`): the confirmation carries the join link instead of the booking page, is written to `messages_log` as `reminder.soon` so `reminders.sendDue` does not send it again, and guruji hears at once (`reminder.guru`) if his number is set.
- `gurus.marketing_json`: `{ tagline, blocks: [{ heading, body }], hero?: { image, portrait, credit }, facts?: [{ label, value }], themes?: string[], quote?: string }`. The optional fields feed the picture band, facts strip, themes and pull quote on his home page (`site/HomePage.tsx`); `gurus.updateSite` keeps whatever an editor does not send, so an older console tab cannot wipe them. Static files for the pictures live in `apps/web/public` (`guruji-hero.jpg` is seeded; `guruji.jpg`, his portrait, is his team's to add — the page hides the frame until it exists).
- `messages_log.payload_json`: inbound — the parsed message from `parseInbound`; outbound — `{ body, buttons? | sections? | buttonLabel?, href? }`.

Ledger amounts are always positive; `kind` says what happened (`payment`, `refund`, `credit_issued`, `credit_used`).
A rescheduled booking keeps its payment row on the original booking; the new row carries `paid_at` and no new ledger row.

## Booking state machine

Defined once, in `bookings.js` `TRANSITIONS`, exercised by `transition(status, event)`:

```
held      --pay-->         confirmed
held      --expire-->      expired          (jobs.js, every minute, after HOLD_MINUTES = 10)
expired   --pay-->         expired          (the time is NOT given back; the dakshina is recorded and raised to the team)
confirmed --end-->         completed
confirmed --reschedule-->  rescheduled      (new row with rescheduled_from_id)
confirmed --cancel-->      cancelled        (+ ledger credit_issued, 30 days)
confirmed --refund-->      refunded         (+ ledger refund)
confirmed --no_show-->     no_show          (team, or jobs.js an hour after her time when she never opened her link)
```

Session 1 implemented the DB functions the WhatsApp door and the hold-expiry job need. Cancel,
reschedule, refund, no-show and complete get their DB functions when their screens arrive (Sessions 3
and 4); they must call `transition()` and add no rules elsewhere.

## Endpoints

| Method + path | Who calls it | Notes |
|---|---|---|
| `GET /webhook` | Meta, once | verify-token handshake |
| `POST /webhook` | Meta | every inbound WhatsApp message; acknowledged first, handled after |
| `POST /razorpay/webhook` | Razorpay | HMAC-SHA256 over the raw body, checked before anything else; `payment_link.paid` only |
| `GET /api/health` | anyone | `{ ok: true }` |
| `GET /api/gurus/:slug/slots` | web, curl | `{ guru: {slug, name, dakshinaPaise, slotMinutes}, slots: [{ id, label, startsAt }] }` |
| `GET /join/:id` | the WhatsApp Join button | placeholder page until Session 5 |
| `GET /admin/bookings` | the team, for now | raw rows; Session 3's Bookings screen replaces it |
| `POST /api/console/login`, `POST /api/console/logout` | the console | `{ username, password }` → 204 + `es_console` cookie; 401 with a sentence otherwise |
| `GET /api/console/me` | the console on load | `{ user, guru: { slug, name } }`; 401 means show the sign-in screen |
| `GET /api/console/today?date=` | Today | `{ date, dateLabel, attention[], kpis, timeline[] }` — see `reports.js` |
| `GET /api/console/week?start=` | Calendar | week containing `start`, Monday first: `{ label, times[], afternoonFrom, days[] }` |
| `GET /api/console/money?start=` | Money | `{ kpis, entries[] }` for that week |
| `GET /api/console/settings`, `PUT …/settings/pattern`, `PUT …/settings/site` | Settings | validated at the edge (`validatePattern`, `validateSite`); 400 carries the sentence to show |
| `GET/POST /api/console/events`, `PUT/DELETE …/events/:id` | Settings › meetups | `{ title, kind, startsAt (ISO), link, location, notes }` |
| `GET/POST /api/console/qr-codes` | Settings › QR | `{ source: live|ashram|poster|custom, label }` → row with `waLink` |
| `GET /api/console/attention` | Needs attention, Today's strip, the nav badge | `[{ kind: paid_too_late|hold_expired|waited_alone|did_not_join|refund_sent|waited_and_chose, action: send_link|decide|done|none, ... }]` — `paid_too_late` sorts first: we hold her money. `waited_alone` = she opened her link, he never started: a decision. `did_not_join` = she never opened it: a decision for one hour, then `markNoShows` records it and the row says `done` |
| `GET /api/console/waiting` | the waiting panel | `{ running, people[] (inRoomSince, openedLinkAt, messages), suggestions, oneTap }` |
| `GET /api/console/days/:date/close`, `POST …/close` | Close a day | preview with a suggested slot per booking; `{ moves: [{ bookingId, slotId }] }` → moved, expired holds, notified, notDelivered |
| `PUT /api/console/devotees/:id` | the drawer's "Edit name or who it is for" | `{ name?, forWhom? }`, empty strings leave a field alone; 400 when both are empty |
| `GET /api/console/bookings?q=`, `GET …/bookings/:id` | Bookings, the top-bar search | search by name or phone digits; one booking with devotee, ledger, messages, session, history, `actions` |
| `POST /api/console/bookings` | Booking for a caller | `{ phone, name?, forWhom?, slotId, source?, question? }` → holds and sends the pay link; 409 if taken |
| `GET /api/site` | his website | his words, his upcoming events, the next three open times. Tenant from `Host`, or `?slug=` on the preview |
| `GET /api/site/slots` | "See other times" | every open time |
| `POST /api/site/hold` | the booking sheet | `{ phone, slotId, question? }` → `{ bookingId, payUrl }`; 409 if taken. No code before paying |
| `GET /api/site/bookings/:id` | the confirmed page | status, time, dakshina, join link once confirmed |
| `POST /api/site/otp/request`, `/otp/verify` | sign in | a code to her number, then the cookie and her sessions |
| `GET /api/site/me` | my sessions | upcoming, earlier, her credit, and the open times, each with why she may not move or cancel it |
| `GET /api/session/:bookingId` | her waiting room | her state and its sentence, team notes, when the way out opens, the next satsang. Public: the booking id is the secret |
| `POST /api/session/:bookingId/token` | the room | her 100ms token, only while the room is open; 409 otherwise |
| `POST /api/session/:bookingId/say` | her waiting room | `{ text }` → recorded as `waiting.message` direction `in`, pushed to the booking's room so the console's waiting panel shows it. Max 500 chars. Never reaches guruji |
| `POST /api/session/:bookingId/escape` | ten minutes past | `{ choice: another_time \| dakshina_back }` → a sentence for her, and a row in the team's Needs attention. Moves no money by itself |
| `GET /api/guru/me`, `/day?date=` | his calendar | his name; his day as a timeline with rest, the context line, her voice note, and whether Join is open |
| `GET /api/guru/media/:mediaId` | her voice note | streamed through us, so his browser never holds Meta's token; 404 once Meta has dropped the media |
| `POST /api/guru/sessions/:bookingId/start`, `/end`, `GET /api/guru/sessions/:bookingId` | guruji's taps | start makes the room, emits `session.started`, returns his host token and her card; end completes the booking and emits `session.ended`; the GET lets him back in after a reload |
| `POST /api/site/me/bookings/:id/cancel`, `/reschedule`, `POST /api/site/me/book-with-credit` | my sessions | her own moves, inside the four-hour rule; each answers with her sessions again and the sentence to show |
| `POST …/bookings/:id/reschedule`, `/cancel` (to credit, no four-hour rule: a team judgement), `/refund`, `/no-show`, `/message`, `/send-link` | the drawer, the waiting panel, Needs attention | each answers with the booking and whether WhatsApp delivered; 409 with the rule's sentence when the state machine says no; 502 when Razorpay or Meta refuse |

## Realtime

Socket.IO on the api. A client connects with `auth: { bookingId, role }` where role is `devotee`, `guru`
or `team`, and is placed in `session:{bookingId}`. Anything else is disconnected. Events emitted into
the room, each payload carrying `bookingId`:

| Event | When |
|---|---|
| `waiting.joined` | a client joined the room (`{ role, at }`) |
| `waiting.message` | either side writes while she waits. Carries `{ text, at, from: 'team' \| 'devotee' }` — the team's one-tap or custom message, or her reply from the waiting room |
| `session.started` | guruji taps Join; her waiting room becomes the call |
| `session.ended` | guruji taps End; carries how many minutes they sat |

### The session, when things go wrong

| What happens | What the system does |
|---|---|
| He forgets to tap End, or closes his browser | `sessions.closeAbandonedSessions` (jobs.js, every minute) ends anything running past `ABANDON_AFTER_MINUTES = 90`, completes the booking and emits `session.ended`. **Without this one forgotten session makes `currentSession` answer "he is with someone" for ever, so every other devotee is told he is busy** |
| His End call fails | He stays in the room and is told to tap again. The screen is never cleared before the server agrees |
| His phone locks, or he switches apps | The SDK's `onLeave` leaves the room only. Ending the session is the End button alone |
| Her token request fails | Retried with backoff, plus a "try again" she can press. It used to be asked once, so one blink of signal stranded her for the whole half hour |
| She leaves the room by accident | "Go back in" — the session is still running and she is not chased out of it |
| A stale tab tries to start a session | Refused: `startSession` enforces the same −10/+60 window his screen shows. An already-running session can always be rejoined |
| She opens her link inside WhatsApp on an iPhone | `useSelfView` detects that the browser cannot reach the camera at all and `PreEntry` shows "open this in Safari" with the link to copy. iOS in-app browsers are WKWebViews, where `getUserMedia` does not work |
| Her socket drops | socket.io reconnects on its own, and an eight-second poll covers the gap |

**Still unproven, and code cannot close them:** the audio-first fallback has never met a poor
connection, and two devices on one booking has never been tried. Both need a rehearsal with real
phones, not another commit.

### Answering a message we cannot read

CLAUDE.md rules out free-text interpretation, so the WhatsApp door answers a text from **where she
stands**, not from what she wrote (`bookings.whereSheStands`, checked in this order):

| Where she is | What she gets |
|---|---|
| a confirmed session ahead | it is her question — attached for guruji to read |
| a time held, unpaid | the **same** payment page again (never a new calendar, which would let her hold a second slot) |
| a session finished within 24h | "his team will read this" — no calendar is offered |
| nothing in flight | the two nearest times |

"Hi" always means she wants a time, whatever else is in flight.

## The three doors, one inventory

WhatsApp, his website and the console all reach the same two files: `bookings.js` for anything that
changes a booking, `conversation.js` for anything a devotee is told. That is why a time taken on his
page disappears from the WhatsApp buttons in the same second, and why a booking made by the team reads
the same to her as one she made herself.

| | WhatsApp door | His website | Console |
|---|---|---|---|
| who she is | her number, from Meta | her number, typed | the team types it |
| before paying | nothing | nothing | nothing |
| paying | payment link in the thread | the same link, in the browser, returning to `/booked/:id` | the same link, sent to her |
| source recorded | `live` / `ashram` / `poster` / `page` / `direct` from the QR greeting | `page` | what the team picks |

## Deployment (`deploy/`)

One Linux server, four containers via `deploy/docker-compose.yml`: `caddy` (public https, on-demand
certificates for gurus' own domains, asking `/api/tls-ask`), `app` (this api serving the web
build from `WEB_DIST`; migrations run before it listens; all cron jobs), `db` (Postgres 16), `backup`
(daily `pg_dump`, fourteen kept). `deploy/Dockerfile` builds the one image from the repo root.
`deploy/deploy.sh user@host` builds the web app locally, rsyncs the checkout (with `apps/web/dist`) and runs `docker compose up -d --build`; the image itself never runs Vite, so a 1 GB server suffices. Code lives at https://github.com/abhimanyuaggarwal/Booking-Platform; the pilot server is `192.46.215.107` (see `deploy/RUNBOOK.md`, This deployment).
`deploy/RUNBOOK.md` is the operator's document: prerequisites, first deploy, provider dashboard
changes, monitoring, backups, updating, what still depends on a person.

Production-only environment: `PUBLIC_HOST`, `ACME_EMAIL`, `POSTGRES_PASSWORD` (compose),
`TRUST_PROXY=1` (Express trusts Caddy's `X-Forwarded-*`), `WEB_DIST`, `HEARTBEAT_URL` (jobs.js pings
it every minute after `select 1`; the monitor alerts when pings stop). `/api/health` answers 503
when Postgres does not answer.

### Findings from the live UAT of 2026-09-28, and what changed

- `bookings.assertBookable(guru, slotId, { team })` is the one check before any slot is written: devotees may take only a slot his pattern offers and nobody holds (`availableSlots`); the team may book any time that has not passed. Called by `conversation.startPayment` (all three doors), the site's reschedule and book-with-credit, and the console's reschedule.
- `whatsapp.isSignedByMeta` + `WHATSAPP_APP_SECRET`: with the secret set, `POST /webhook` refuses unsigned or mis-signed deliveries (403). `demo.js` signs its fake deliveries when the secret is set.
- A Razorpay refusal on the WhatsApp door now tells her (`copy.paymentUnavailable`); on the site it is logged before the 502. An expired hold with no `payment_link_id` reads "our payment page could not be opened" on Today, not "did not pay".
- `attachQuestion` attaches to the upcoming time she paid for most recently, not the soonest one.
- A credit-paid booking the team refunds is told "back in your credit" (`copy.refundedAsCredit`), matching the console.
- `waiting-words.js` gives an old join link its own sentence per ending (cancelled, moved, returned, passed, not paid); `Join.tsx` heads it "This link is no longer open".
- `My sessions` no longer lists holds under Earlier; `earlierWords` knows `held`/`expired`.
- The night-before reminder window is 19:00–23:00 IST so a short outage does not lose it.
- Seed devotees use `91555…` numbers that no network routes; seed payment links (`plink_seed_*`) are skipped by reconciliation.
- Sign-in says "Enter the code" while the code is the mock 1234; it never claims a message was sent.
- Razorpay test mode caps an account at 30 payment links for ever; the pilot account hit it on 2026-09-28. The payment step now runs on Razorpay Orders + Checkout on `/pay/:bookingId` (web `site/Pay.tsx`, api `pay-routes.js`): the hold creates an order, her WhatsApp button and the site sheet both open our page, Checkout collects (UPI first), and the booking confirms from the `order.paid` webhook or the signed Checkout result, whichever lands first. Old `plink_…` references are still read by `findPayments`.

### Day-one flows for a team that already takes bookings by hand (2026-09-28)

- **A booking the team took by phone and was paid in cash or by UPI to the ashram.** Book for a caller → "How she pays" → already paid. `conversation.bookPaidOutside` holds and confirms in one go via `bookings.confirmOffline` (same `pay` transition, ledger `payment` row with `provider_ref = offline:<cash|upi>:<bookingId>`), then sends her the usual confirmation and join link. A hold made earlier can be confirmed the same way from the drawer ("Paid in cash" / "Paid by UPI to the ashram", `POST /api/console/bookings/:id/mark-paid`). Money words these rows "Paid in cash at the ashram" / "Paid by UPI to the ashram" and keeps them out of the settlement estimate.
- **Guruji hears about a sitting on his own WhatsApp.** `gurus.guru_phone` (migration 002; Settings → His website → "His own WhatsApp number"). The ten-minute reminder job also sends him `reminders.copy.guruSoon` once per booking (`messages_log` kind `reminder.guru`); the drawer's "Tell guruji" (`POST /api/console/bookings/:id/tell-guru`, kind `note.guru`) sends `copy.guruNow` now. Both go through `conversation.tellGuru`, which records refusals like every other send. While the Meta app is unpublished his number must be on the allow list.

### Her messages, since 2026-09-28 evening

- **Language.** `gurus.language` decides the words of every WhatsApp sentence, button label and one-tap note (`devotee-words.js`). Dates read as "बुधवार, 30 सितंबर, 4:10 pm" in Hindi; slot buttons as "आज 4:10 pm".
- **The confirmation points at her booking, not the room.** `sendConfirmation` and `sendNewTime` send `bookingLink` (`/booked/:id` on his domain, `/s/:slug/booked/:id` on the platform host) with "See my booking", so she can see, move or cancel. The join link comes from `reminders.sendDue` ten minutes before ("Join now"); the evening reminder carries the booking page. The confirmed page on the site offers "Open the waiting room" only from an hour before to an hour after her time (`joinIsNear`, pure).
- **Guruji and a devotee are told apart by number.** A message to guruji goes to `gurus.guru_phone`; a devotee is a `devotees.phone` row. In the pilot both were set to the same phone for testing, which is why one handset received both kinds of note.

## Conventions

- **Time.** Slot ids (`slot:2026-09-16T16:00`) are IST wall-clock. `bookings.slot_start` and every other
  timestamp column is a real instant (`timestamptz`). Cross with `slotIdToInstant` / `instantToSlotId`;
  `bookings.js` returns rows with `slotId` already attached.
- **Money** is integer paise. Copy uses `formatRupees` and the word "dakshina".
- **Ids** are uuids generated by Postgres. Validate the shape at the HTTP edge before querying.
- **Tenancy.** Every query that reads bookings, devotees, ledger or messages passes a `guru_id`. The
  WhatsApp door finds the guru by the number she wrote to; the website by slug (later, by `Host`).
- **Writes to bookings** happen only in `bookings.js`. Reads may live where they are used.
- **Validation at the edge.** Webhook handlers and routes check shape and signature; modules below trust their inputs.
- **Failure behaviour is named.** Network and db calls either throw a message that says what to do, or
  return `null` for "not found / taken", never both for the same case.
- **Migrations** are plain SQL, `NNN_name.sql`, applied in order, each in a transaction, recorded in `schema_migrations`.
- **Tests** are usage examples with `node --test` (api, shared) and `vitest` (web). None need Postgres.
- **Module format** is ES modules everywhere; `import.meta.dirname` instead of `__dirname`.
- **Env.** `apps/api/.env` from `.env.example`. `DATABASE_URL` defaults to the docker-compose database;
  the WhatsApp and Razorpay keys and `CONSOLE_PASSWORD` are required to boot.
- **Console auth.** One shared login (`CONSOLE_USER`, `CONSOLE_PASSWORD`). The cookie is an HMAC of its expiry
  keyed by the password, so changing the password signs everyone out. `CONSOLE_GURU_SLUG` says whose console it is.
- **Console shape (revamp, 2026-09-22).** A top bar (search by name or number, "Book for a caller", sign out) and a
  side rail on a laptop that becomes bottom tabs under 900px. Every name on Today, Calendar, the waiting panel,
  Needs attention and Bookings opens the same `BookingDrawer`, addressed by `?booking=<id>`. The week grid becomes
  a day list on a phone (`WeekList`). Needs attention is two lists: to decide, and for the record. A devotee
  writing from the waiting room chimes and marks the tab title. No emoji anywhere in the console; the voice-note
  marker is the words "voice note". Closing a day lives only on the Calendar; Settings can reopen a date.
- **Console reads vs writes.** Screens read through `reports.js`, which never writes. Every change to a booking goes
  through `bookings.js`; every word to a devotee goes through `conversation.js`.
- **Errors as sentences.** `BookingRuleError` → 409, `ProviderError` → 502, both with a message the screen shows
  as-is. A team action stands even if the WhatsApp note fails; the response says `notDelivered` and the screen says
  "call her".
- **Refund order.** Razorpay first, then `refundBooking`. If Razorpay refuses nothing changes. A booking paid with a
  credit is "refunded" by issuing the credit again for 30 days.
- **Tenancy on the web.** His site is the root of his own domain; `/s/:slug` is the same pages as a
  preview and is the only caller that sends `?slug=`. Nothing else in the api reads the `Host` header.
- **Her side of the rules.** `whyCannotCancel` / `whyCannotReschedule` return the sentence she is shown,
  or null. The website asks them for the buttons and the api asks them again before acting.
- **Credits are ledger rows**, not a balance column: `credit_issued` (30 days) spent by `credit_used`,
  matched oldest first so the credit expiring soonest goes first.
- **Nothing on his screens costs anything.** `guru-routes.js` selects no money column, and a test asserts
  no rupee, dakshina or payment word reaches his day. The one mention is the footer telling him the team
  handles it.
- **His identity is the magic link.** `?t=` on any `/api/guru` call becomes an `es_guru` cookie for 180 days,
  and the web clears the token out of the address bar once it has.
- **The room opens only when he is in it.** She waits on our own screen and the SDK is mounted on
  `session.started`, so she is never alone in an empty room. She is always the guest role, he the host.
- **Her screens never count down.** `waitingWords` returns a sentence; minutes, where they appear, are
  rounded to five. The same rule holds on the confirmed page and the closing screen. Opened more than an
  hour early, the sentence names her day and time instead of "at your time".
- **A no-show is a record, not a decision.** The dakshina stands (agreed policy), so `markNoShows` marks a
  confirmed time an hour after it passed if her link was never opened. If she opened it and waited, the
  booking is left alone and Needs attention raises `waited_alone`: that absence is his, and the team
  returns the dakshina or offers another time.
- **A paid link is settled in one place.** `paid-link.js settlePaidLink` is called by the webhook and by
  the hourly reconciliation, so a lost webhook ends in the same rows and the same words to her.
- **Her name comes from WhatsApp.** The door never asks for it; `parseInbound` reads the profile name Meta
  sends and `findOrCreateDevotee` keeps it unless the team has typed one. The website and the console
  still take a typed name.
- **The way out moves nothing.** Her choice after ten minutes is recorded and shown to the team, because a
  cash refund is theirs to make and a new time mid-session is a judgement.
- **Every message is written down, delivered or not.** `speak()` records the attempt and then rethrows a
  refusal, so the console's history shows what we tried to say and why it did not arrive.
- **Reminders run every minute, not hourly.** One of the two is ten minutes before her time, which an hourly
  job would send up to an hour early. Each is sent once, so running often costs nothing.
- **Presence** is in memory in `realtime.js` and lost on restart; `sessions.devotee_joined_at` is the durable record
  that she opened her link at least once.
- **Settlement estimate.** "Due to settle" is payments minus refunds since the most recent Friday (today, if
  Friday). It stands in for Razorpay's settlements API and is labelled an estimate in the UI.
- **Grid colours** come from `gridBooking()` in `reports.js`: `done`, `noshow`, `hold`, `live` (confirmed and
  live-sourced), `paid`. The web only maps those five words to CSS.
- **Dev ports.** The web app asks for 5173; if another Vite holds it, Vite prints the port it took (5174 on the
  dev Mac). The api proxies are path-based, so the port does not matter.

## The dry run

`pnpm demo` walks the whole journey against a running api: the QR, her "Hi", the tap, the payment webhook,
her question, the team's Today and waiting panel, a one-tap message, guruji's Join and End, a cancellation
into a credit and a rebooking with it, and the money screen. Where a service is not wired it stands in and
prints "(stood in for …)", and the closing section lists everything that still needs a real account. With
real WhatsApp, Razorpay and 100ms credentials in `.env` it runs the same steps for real, which makes it the
acceptance test for those credentials.

## Commands

```
pnpm install
pnpm db:up                   # Postgres 16 in Docker — or Homebrew Postgres, see apps/api/README.md Part B
pnpm seed                    # migrate + demo data (wipes tables)
pnpm migrate                 # apply new migrations only
pnpm dev                     # api :3000, web :5173 (Vite moves to :5174 if 5173 is taken; it says so in the log)
pnpm demo                    # the whole journey end to end, against a running api
pnpm test
```

Known gaps carried into later sessions:

- ~~A payment that arrives after the hold expired throws in `confirmByPayment` and is only logged.~~
  **Closed 2026-09-15.** An expired hold is never revived (that rule was affirmed deliberately — two people
  could otherwise hold one slot), but the money is recorded against the expired booking, she is told plainly
  that nothing is booked, and `attentionQueue` raises a `paid_too_late` row at the top of the list for the
  team to refund or offer another time. `recordPayment` is keyed on the provider's payment id, so a Razorpay
  retry writes nothing twice.
- If creating the Razorpay link fails, the devotee hears nothing until the hold expires (unchanged from the prototype).
- ~~A Razorpay webhook that never arrives leaves her paid with no time and no ledger row.~~ **Closed 2026-09-21**:
  `reconcile.js` asks Razorpay hourly about every link with no payment against it (15 minutes to 3 days old).
- `pendingSource` (which QR she came from) is in memory in `whatsapp-door.js` and is lost on restart.
- The scope brief mentions a waitlist when no slot suits; there is no table for it. Ask before adding one.
- Closing a date in Settings only stops new bookings. Moving the people already booked that day is the calendar's
  "Close a day" flow, Session 3.
- Seeded `held` rows expire ten minutes after seeding (the cron is real), so a demo started later shows them as
  expired holds in the attention strip. Re-run `pnpm seed` just before a demo.
- Free-text WhatsApp to a devotee who last wrote more than 24 hours ago is refused by Meta until approved templates
  exist (Session 7). The console reports "could not be delivered — call her" rather than pretending.
- Razorpay refunds are reported as sent when Razorpay accepts them; the `refund.processed` webhook is not wired, so
  "reaches her within a week" is the policy, not a tracked fact.
- There is no waitlist table (decided against on 2026-09-14). The WhatsApp "no open times" reply asks her to write
  again in a few days.
- Booking for a caller, or on his website, with fake Razorpay keys releases the hold at once and answers with a
  sentence; with real keys she gets the pay link.
- The sign-in code is the mock `1234` (`OTP_CODE` in `.env`) until an SMS provider is wired. It is logged, never sent.
- `GET /api/site/bookings/:id` is public: the booking id is the secret, as it is in the join link.
- Razorpay's `callback_url` brings her back to `/booked/:id`, but the confirmation itself comes from the webhook,
  so the page asks the api until it lands and says "still waiting for the bank" after forty seconds.
- 100ms is not wired here: `HMS_ACCESS_KEY`, `HMS_SECRET` and `HMS_TEMPLATE_ID` are empty, so starting a session
  answers 502 with what to set. Everything either side of the room is built and tested, and the whole chain —
  his tap, the session row, both tokens, `session.started` and `session.ended` reaching her socket, the booking
  completing — was verified with a pre-made room id. Only 100ms's own room creation and the video are unproven.
- His app icon is a placeholder mark (a warm sun on ink), generated in this repo. Replace the three PNGs in
  `apps/web/public` with his own when there is one.
- Installing needs the built app: Chrome offers it only with a service worker, which is registered in
  production builds only (`pnpm --filter web build && pnpm --filter web preview`).
- The 100ms SDK is about 8.5 MB (2.3 MB gzipped) in its own chunk, loaded only when the room opens.
- Guruji's start and end are api calls behind `GURU_MAGIC_TOKEN`. Session 6 builds his screens on them.
- `JOIN_LINK_BASE` in `.env` points her join link at localhost while the pilot runs; without it the link uses
  his domain from the console's Settings.
- She may move a time once. "Once" is read from the booking's own history (`rescheduled_from_id`), so no column
  counts her changes. Cancelling stays open to her at any time up to four hours before.
