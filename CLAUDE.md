# Expert Sessions — CLAUDE.md

**Product name: Samvad** (chosen 2026-09-28; "Expert Sessions" stays the repo's internal name). Devotee
WhatsApp copy lives in `apps/api/src/devotee-words.js` in English and Hindi, chosen per guru (`gurus.language`). The
team console reads in English or Hindi (`apps/web/src/console/lang.tsx`); Money and Settings sit at
level two under More.

You are building **Expert Sessions on Slike**: a booking-and-consultation system for one guru's
practice. Devotees book paid 30-minute 1:1 time with him from his YouTube lives, a QR, or his own website;
the session happens in a browser video room; his team runs everything from a console.

Read this file fully before touching code. Then read `docs/architecture.md` if it exists.

---

## What we are trying to prove

The customer is **the guru's practice** — he adopts it, his team lives in it daily. The devotee is the
user, not the buyer. The one hypothesis: **a booking link under his lives produces consultations that
would never have existed.** Organising bookings he already gets is not the goal. Every feature must
serve either (a) that funnel, or (b) the team never needing a notebook again.

## The five surfaces (this is v1 — all of it, nothing more)

| Surface | Where | Who |
|---|---|---|
| WhatsApp booking door | `apps/api` (webhooks) | devotee |
| His website — marketing text, schedule & meetups, booking, "my sessions" | `apps/web` served on **his own domain** (e.g. `guruji.com`); `/s/:guruSlug` is the internal preview of the same pages | devotee |
| Guruji's calendar (PWA) | `apps/web` → `/guru` | the expert |
| Team console | `apps/web` → `/console` | his assistant |
| Waiting room + video room | `guruji.com/join/:bookingId` (same app) | devotee + guruji |

**The visual spec is `docs/design/v1-walkthrough.html`** — open it in a browser. Every screen, every
step, and the "built in v1 / left for later" split per surface. When in doubt about what a screen should
do or look like, that file wins. Static references are in `docs/mockups/`.

### Not in v1 — do not build, do not stub, do not "leave a hook for"
Paid questions on air · ticketed group sessions · more than three session types · simulcast · discovery/directory · reviews or ratings ·
free-text NLU on WhatsApp · booking by voice or phone call · proxy identities (one optional "who is this
for" field only) · OTP before payment · cards/netbanking (UPI only) · self-serve **cash**
refunds (cancellation converts the dakshina to a credit; cash refunds stay with the team) · recording · chat/screen-share/files in the room · native apps · roles beyond admin and team · CRM beyond the booking record · analytics beyond pilot numbers.

If a task seems to need one of these, stop and say so instead of building it.

---

## Architecture decisions (settled — do not reopen without asking)

- **One repo, two deployables.** `apps/api` (Node 22, Express, Postgres) and `apps/web` (React 18 + Vite +
  TypeScript, react-router). `packages/shared` holds slot maths and formatting used by both.
- **Postgres via `pg` with plain SQL migrations** in `apps/api/db/migrations/*.sql`. No ORM. One
  `db.js` module exports a pool and a `migrate()` that runs files in order.
- **WhatsApp:** Meta Cloud API directly (`apps/api/src/whatsapp.js`). Interactive reply buttons
  (max 3) and list messages (max 10 rows). No BSP SDK.
- **Payments:** Razorpay Orders + Checkout on our own page `/pay/:bookingId` (UPI first); confirmed by the
  `order.paid` webhook and by the signed Checkout result, idempotently. Payment Links were retired on
  2026-09-28 (test mode caps an account at thirty links for ever). Native `order_details`
  in-chat payment later. Signature-verify every webhook.
- **Video:** 100ms prebuilt room UI (`@100mslive/roomkit-react`). We build the waiting room ourselves
  and mount the SDK room only after the "guruji joined" event. Audio-first fallback on.
- **Realtime:** one Socket.IO namespace on the api: `session:{bookingId}` rooms. Events:
  `waiting.joined`, `waiting.message`, `session.started`, `session.ended`.
- **Jobs:** `node-cron` inside the api. Hold expiry every minute; reminders hourly (templates later).
- **Auth (changed 2026-10-07, client decision):** devotee = phone + OTP (mock `1234` until an SMS provider is
  wired); console = **phone + password** for everyone, two roles (`console_users.role`: `admin` at Slike sees every
  guru and the Setup/Access screens, `team` sees one guru), first password and resets through a six-digit code on
  WhatsApp; `CONSOLE_USER`/`CONSOLE_PASSWORD` remain the admin's break-glass door; guru PWA = magic link for the pilot.
- **Time:** everything is IST. See `packages/shared/slots.js` for the convention (IST wall-clock in UTC fields).
- **Tenancy:** every table has `guru_id`. A guru is a row with a lifecycle (`status`: draft, setting_up, live, paused), created by a
  Slike admin from the console's Gurus section; his site answers at `<slug>.<PUBLIC_HOST>` by default and at his own domain when set.
- **Custom domains:** each guru's site lives on his own domain (`gurus.domain`). The web server resolves
  the tenant from the `Host` header; `/s/:guruSlug` renders the same pages as an internal preview. In
  dev, `?host=guruji.com` or the `/s/` path selects the tenant. TLS is on-demand via Caddy (or
  Cloudflare in front) — the guru's team adds one CNAME record pointing at us.
- **Session types (2026-10-06):** a guru offers up to three kinds of sitting (`session_types`: minutes +
  dakshina, the first active one is the default). Every booking snapshots `minutes` and `dakshina_paise`;
  prices live on the types, `gurus.dakshina_paise` / `pattern_json.slotMinutes` only mirror the default.
  Open times are computed per kind (`availableSlots(..., { minutes, typeId })`), a timing window may be
  limited to some kinds (`[from, to, [typeIds]]`), and the team may book a sitting as `complimentary` (₹0).
- **Cancellation policy (changed 2026-10-06, decided by the client):** devotee may cancel or reschedule
  once, up to 4 hours before. Cancel → the dakshina is **refunded to her account** (Razorpay refund, or
  the team hands cash back) and she is told in how many days it reaches her. Credits are no longer
  issued to devotees; the credit ledger kinds stay for old rows. `cancellations.cancelAndRefund` is the one
  place the money moves; WhatsApp, the site and the console all call it. On WhatsApp "Hi" with a time ahead
  shows Change the time / Cancel / Book another; inside four hours the button becomes "tell the team".

## Domain model

```
gurus            id, slug, domain, name, about, marketing_json, dakshina_paise, whatsapp_number,
                 guru_phone (his own WhatsApp, for the ten-minute note), pattern_json, closed_dates
events           id, guru_id, title, kind (satsang|live|meetup), starts_at, link, location, notes
devotees         id, guru_id, phone (unique per guru), name?, for_whom?
bookings         id, guru_id, devotee_id, slot_start (timestamptz), status, source, question_text,
                 question_media_id, payment_link_id, created_at, paid_at
                 status ∈ held | confirmed | completed | no_show | rescheduled | cancelled | refunded | expired
                 source ∈ live | ashram | poster | page | direct
ledger_entries   id, guru_id, booking_id, devotee_id, kind (payment|refund|credit_issued|credit_used),
                 amount_paise, provider_ref, expires_at?, created_at
sessions         id, booking_id, room_id, started_at, ended_at, devotee_joined_at, guru_joined_at
messages_log     id, booking_id?, devotee_id, direction, kind, payload_json, created_at
qr_codes         id, guru_id, source, label, wa_link, created_at
```

**Booking state machine** — enforce in one place (`bookings.js`), nowhere else:
`held --pay--> confirmed --session ends--> completed`
`held --10 min--> expired` · `confirmed --team/devotee--> rescheduled (new booking row, old marked)` ·
`confirmed --devotee cancels ≥4h before--> cancelled (refund)` ·
`confirmed --guru cannot sit--> refunded` · `confirmed --no join--> no_show`

**Invariant:** a slot appears on any calendar only because a `bookings` row exists for it. Calendar and
ledger are views of the same rows.

---

## Design language

Two palettes, deliberately. **Product screens the devotee and guruji see** are warm and quiet:
background `#F4F1EA`, ink `#231F19`, muted `#7C756A`, accent `#9C5A2C`, ok `#3E7D5F`; serif headings
(Iowan Old Style / Palatino / Georgia). Generous space, few words, status in sentences not timers.
**The console** is a cool working tool: paper `#EFEDE7`, nav `#221E18`, same accent; dense but calm.
Guruji's screen never shows money. The devotee's session screens never show a countdown.

Copy rules: "dakshina" not "fee"; "time" not "appointment"; "guruji" lowercase mid-sentence; plain
sentences; no exclamation marks anywhere in the product.

## Code standards (short version — these are enforced in review)

- Linear control flow, guard clauses, shallow call depth. A junior should find where to change things.
- Validate at the edges (HTTP handler, webhook), trust the inside. No re-checking downstream.
- Every network/db call names its failure behaviour. Never swallow an error into a log line.
- Names from the domain: `holdSlot`, `confirmByPayment`, `WaitingRoom` — not `BookingManagerService`.
- No abstraction before the third occurrence. No interface with one implementation.
- Comments explain *why*. Error messages say what to do ("check RAZORPAY_WEBHOOK_SECRET matches...").
- Tests read as usage examples. `packages/shared/slots.test.js` is the model.
- Prefer boring: plain SQL, plain functions, well-known libraries.

## Working agreement with Claude Code

1. **Plan before code.** For anything beyond a one-file change, write the plan (files, schema, endpoints,
   components) and wait for a yes.
2. **One surface per session.** Don't drift into another surface's files.
3. **Run `pnpm test` before declaring done.** Add tests for slot logic, state transitions, webhook
   signature checks. UI gets a smoke render test at minimum.
4. **Keep `docs/architecture.md` current** — Component Index and Conventions sections — whenever you
   add a module, table, endpoint or event.
5. **Ask before:** adding a dependency, adding a table, changing the state machine, changing a palette
   token, or anything in the "Not in v1" list.
6. **Seed data is part of the product.** `pnpm seed` must produce one guru, his pattern, twenty devotees
   and a realistic week — the console demo depends on it.

## Commands

```
pnpm install                 # all workspaces
pnpm db:up                   # Postgres in Docker
pnpm --filter api migrate    # run SQL migrations
pnpm --filter api seed       # demo data
pnpm dev                     # api on :3000, web on :5173
pnpm test
```

## Where to look

- `docs/briefs/01-v1-surfaces-and-journeys.docx` — journeys per surface, v1 boundary
- `docs/briefs/02-v1-scope-and-milestones.docx` — scope table, risks, open decisions
- `docs/design/v1-walkthrough.html` — the clickable spec
- `docs/build-plan.md` — the session-by-session order, with the prompt to paste for each
- `apps/api/README.md` — how to wire Meta and Razorpay
