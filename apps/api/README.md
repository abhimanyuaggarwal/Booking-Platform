# Expert Sessions — api

Express + Postgres. The WhatsApp door, bookings, payments, realtime and scheduled jobs.

```
she sends anything      ->  two nearest slots + "Other times"   (buttons)
she taps a slot         ->  slot held 10 min, "Pay ₹500" button  (Razorpay link)
Razorpay says paid      ->  "Your time is confirmed" + Join link
she sends a voice note  ->  attached to her booking for guruji
```

`src/whatsapp-door.js` is that conversation, top to bottom. `src/bookings.js` is the only file that
changes a booking's status. `docs/architecture.md` at the repo root indexes every module.

---

## Part A — for Abhimanyu (no code needed)

You already have a Meta developer app with the WhatsApp test number. You need to hand the engineer **six values**. Here is where each one lives.

| Value | Where to find it |
|---|---|
| **Access token** | Meta app → WhatsApp → *API Setup* (or *Step 1. Try it out*). A long string. It expires every 24 hours on that screen — the engineer will make a permanent one later (see Part C). |
| **Phone number ID** | Same screen, just under the test phone number. A number like `1234567890123`. Not the phone number itself. |
| **Test phone number** | Same screen. The number itself, digits only (`15550001234`). Goes in `WHATSAPP_DISPLAY_NUMBER` so messages to it reach Guruji. |
| **Verify token** | You invent it. Any word. `expert-sessions-verify-2026` is fine. You will type the same word into Meta's *Verify token* box. |
| **Razorpay test keys** | razorpay.com → log in → switch the toggle to **Test mode** → Settings → API Keys → Generate. You get a Key ID (starts `rzp_test_`) and a Key Secret. |
| **Razorpay webhook secret** | You invent this one too. You'll paste it in Razorpay when adding the webhook (Part C). |
| **Console password** | You invent it. The whole team shares it to open the console. `CONSOLE_PASSWORD` in `.env`. |
| **Devotee session secret** | Any long random string, `DEVOTEE_SESSION_SECRET` in `.env`. It signs her "my sessions" cookie. |
| **100ms credentials** | 100ms.live → your app → Developer → *App credentials* gives an access key and secret. The template id is on the template you want rooms made from. Three values: `HMS_ACCESS_KEY`, `HMS_SECRET`, `HMS_TEMPLATE_ID`. |
| **Guruji's magic token** | You invent it, `GURU_MAGIC_TOKEN` in `.env`. His link is `{web}/guru?t=<it>`; only he gets it. |

Also add the demo phones as recipients on the *API Setup* screen ("To" field → add number → enter the code WhatsApp sends). Up to five. Yours, the demo phone, the guru's assistant.

**His timings** live in the database on the guru's row (`gurus.pattern_json` and `closed_dates`), edited from the
console's Settings screen. `config/availability.json` is only the starting pattern that `pnpm seed` loads:

```json
"tue": [["10:00", "13:00"], ["16:00", "17:30"]]
```
means Tuesday sittings 10–1 and 4–5:30. `slotMinutes` 30 and `gapMinutes` 10 means a slot every 40 minutes. `closedDates` is a list like `["2026-09-17"]` for days he is travelling. The dakshina (₹500) is set in `src/seed.js`.

---

## Part B — for the engineer (15 minutes to first reply)

From the repo root:

```bash
pnpm install
pnpm db:up                  # Postgres 16 in Docker (needs Docker Desktop running)
cp apps/api/.env.example apps/api/.env   # fill in the six values from Part A
pnpm seed                   # runs migrations, then loads Guruji, 20 devotees, a week of bookings
pnpm seed -- --slug bhagwat --name Bhagwat   # the same week under another guru; then CONSOLE_GURU_SLUG=bhagwat
pnpm test
pnpm dev                    # api on :3000, web on :5173
```

`pnpm migrate` on its own applies new SQL files in `db/migrations/` without touching data.

**Without Docker** (Docker Desktop needs a paid licence at a company our size). Install Postgres with Homebrew once,
then create the same user and database the compose file would have made, so `DATABASE_URL` stays unchanged:

```bash
brew install postgresql@16 && brew services start postgresql@16
/opt/homebrew/opt/postgresql@16/bin/psql postgres -c "create role es with login password 'es' createdb"
/opt/homebrew/opt/postgresql@16/bin/createdb -O es expert_sessions
```

`pnpm db:up` is then not needed; `brew services start postgresql@16` is the equivalent.

Expose the api to the internet for the week:

```bash
ngrok http 3000             # copy the https URL it prints
```

Put that URL in `.env` as `APP_BASE_URL` and restart.

**Connect Meta:** app → WhatsApp → *Configuration* (or *Step 2 → Configure Webhooks*):
- Callback URL: `https://<your-ngrok>.ngrok-free.app/webhook`
- Verify token: the value of `WHATSAPP_VERIFY_TOKEN`
- Click **Verify and save** — the server answers the handshake (`GET /webhook`).
- Under *Webhook fields*, **subscribe to `messages`**. Without this, nothing arrives.

**Connect Razorpay:** Dashboard (Test mode) → Settings → Webhooks → Add:
- URL: `https://<your-ngrok>.ngrok-free.app/razorpay/webhook`
- Secret: the value of `RAZORPAY_WEBHOOK_SECRET`
- Events: tick **payment_link.paid**

**The team console** is at `http://localhost:5173/console` (or the port Vite prints). Sign in with
`CONSOLE_USER` / `CONSOLE_PASSWORD` from `.env`. Today, Calendar (with Close a day), Bookings (search, book for a
caller, move, refund, no-show, message), Needs attention, Money, and Settings (his timings, the words on his
website, his meetups, QR codes). No restart needed for any of it.

**The waiting room and the video room** are at `{his site}/join/<booking id>`, which is where the WhatsApp
"Join session" button points. It needs a 100ms account: put `HMS_ACCESS_KEY`, `HMS_SECRET` and
`HMS_TEMPLATE_ID` in `.env` (100ms dashboard → Developer → App credentials, and the template rooms are made
from). **Guruji's own calendar** is at `{web}/guru?t=<GURU_MAGIC_TOKEN>`. That link is all he needs: opening it once
leaves a cookie on his phone, and the token is cleared from the address bar. From there he sees his day and taps
Join. On Android, Chrome's menu offers *Install app*; on iPhone, Share then *Add to Home Screen*.

**His website** is at `http://localhost:5173/s/guruji` (the internal preview) and, in production, at the root of
his own domain — the api reads the `Host` header and the console's Settings holds the domain. Her sign-in code is
`1234` until an SMS provider is wired.

**Try it:** from a recipient phone, send `Hi` to the test number. You should get two slot buttons and "Other times". Tap a slot → a Pay button → complete with Razorpay's test UPI (any UPI ID works in test mode, e.g. `success@razorpay`) → confirmation with a Join link. `GET /admin/bookings` shows the rows; `GET /api/gurus/guruji/slots` shows what is open.

---

## Part C — the two things that expire

1. **The access token on the API Setup screen lasts 24 hours.** For anything beyond a demo: Business Settings → Users → System Users → add one → *Generate token* with `whatsapp_business_messaging` and `whatsapp_business_management` → set it as `WHATSAPP_TOKEN`. It does not expire.
2. **The test number only messages five whitelisted phones.** A real number (Step 2 in Meta's guide) needs TIL's verified business portfolio. Start that this week; it runs on Meta's clock, not ours.

---

## What is real here, and what is not yet

Real: the conversation, holds, slot logic, payment, confirmation, voice-note capture, Postgres with every table
in the domain model, the ledger, the message log, hold expiry, the Socket.IO namespace, seed data.
Not yet: reminders (need approved templates — outside the 24-hour window the API refuses free-form messages),
the video room (`/join/:id` is a placeholder page), the console (`/admin/bookings` is raw JSON).

## If something does not work

| Symptom | Likely cause |
|---|---|
| `Cannot reach Postgres` | Docker Desktop is not running, or `pnpm db:up` was not run. |
| "Verify and save" fails | `WHATSAPP_VERIFY_TOKEN` in `.env` ≠ the box in Meta, or the server isn't reachable at the URL |
| Sending Hi does nothing | Not subscribed to the `messages` webhook field; or your phone isn't in the recipient list; or the token expired (24h) |
| Log says `no guru has that whatsapp_number` | `WHATSAPP_DISPLAY_NUMBER` in `.env` is not the test number; fix it and run `pnpm seed` |
| Buttons arrive but Pay fails | Razorpay keys are Live not Test, or missing; check the `pnpm dev` output for the error |
| Paid but no confirmation | Razorpay webhook not added, wrong URL, or `RAZORPAY_WEBHOOK_SECRET` mismatch (server logs "Bad signature") |
| Meta shows a yellow "unpublished app" warning | Test-number traffic to recipients works in development mode. If it ever doesn't, App Settings → Basic → add a Privacy Policy URL, then switch the app to Live. |
