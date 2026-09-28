# Running Expert Sessions on a server

For whoever operates the box. Everything below assumes one Linux server that you can ssh into.
The product itself is described in `../CLAUDE.md` and `../docs/architecture.md`; this file is only
about keeping it up.

## This deployment (28 September 2026)

| | |
|---|---|
| Server | `192.46.215.107`, Ubuntu 24.04, 1 vCPU, 1 GB RAM + 2 GB swap, Docker 29 |
| Address | https://192-46-215-107.sslip.io (Let's Encrypt certificate; swap for `sessions.slike.in` when DNS exists) |
| Code | https://github.com/abhimanyuaggarwal/Booking-Platform (`main`) |
| Checkout on the server | `/opt/expert-sessions` (rsynced by `deploy/deploy.sh`; `deploy/.env` lives only there) |
| Access | `ssh root@192.46.215.107` with the deploy key in `~/.ssh/id_ed25519_expert_sessions` (see `~/.ssh/config`); disable password login once every operator has a key |
| Demo guru | `bhagwat` (seeded 28 September); console at `/console`, his site at `/s/bhagwat`, his screen at `/guru?t=<GURU_MAGIC_TOKEN>` |

**Working with the code.** The laptop and the server are both fed from GitHub:

```
git pull                                   # get the latest
# ... change, test (pnpm test), commit ...
git push                                   # to GitHub
deploy/deploy.sh root@192.46.215.107       # build the web app here, ship it, restart the app container
```

Anyone with the repository and the deploy key can deploy; the server never builds the web app itself.

## What runs

| Container | What | Where its data lives |
|---|---|---|
| `caddy` | public https on ports 80 and 443; certificates from Let's Encrypt, automatically renewed | `caddy_data` volume |
| `app` | the api and the built web app in one process; runs database migrations on every start; all scheduled jobs (hold expiry, no-shows, reminders, payment reconciliation, heartbeat) | none |
| `db` | Postgres 16 | `pgdata` volume |
| `backup` | a `pg_dump` every 24 hours, fourteen kept | `deploy/backups/` on the host |

Every container restarts by itself after a crash or a reboot (`restart: unless-stopped`).

## Before the first deploy

1. **A server.** Ubuntu 22.04 or newer. 1 vCPU and 1 GB RAM (with a 2 GB swap file) is enough
   for a pilot because the web app is built on the deploying machine, not the server. Install
   Docker Engine and the compose plugin: `curl -fsSL https://get.docker.com | sh`.
2. **Reachable from the internet on ports 80 and 443.** Not optional: Meta delivers WhatsApp
   messages and Razorpay delivers payment confirmations by calling this server. An in-house box
   behind a corporate firewall needs a public IP or a NAT rule for 80 and 443. Test from a phone on
   mobile data, not from the office network.
3. **A hostname.** An A record, for example `sessions.slike.in`, pointing at the server's public
   IP. This is `PUBLIC_HOST`. It serves the console, guruji's screens, the `/s/<slug>` previews and
   both webhooks. Gurus' own domains come later (below). Until DNS exists, `<ip-with-dashes>.sslip.io`
   (for `192.46.215.107`: `192-46-215-107.sslip.io`) resolves to the server with no setup and gets a
   real certificate; change `PUBLIC_HOST` and the two provider dashboards when the real name arrives.
4. **A heartbeat monitor**, five minutes to set up. Create a free check at https://healthchecks.io
   with a period of 1 minute and a grace of 3 minutes, add the phone number or email of whoever is
   on call, and copy the ping URL into `HEARTBEAT_URL`. From then on, if the api or Postgres stops,
   that person is told within four minutes. Optionally also point an uptime monitor
   (UptimeRobot, Better Stack) at `https://PUBLIC_HOST/api/health`, which answers 503 when
   Postgres is down.

## First deploy

On the server, once:

```
sudo mkdir -p /opt/expert-sessions && sudo chown $USER /opt/expert-sessions
```

From a machine that has this repository and ssh access:

```
deploy/deploy.sh ubuntu@sessions.slike.in
```

The first run stops and says `deploy/.env is missing`. On the server:

```
cd /opt/expert-sessions/deploy
cp .env.production.example .env
nano .env        # fill in every value; openssl rand -hex 32 for the secrets
```

Then run `deploy/deploy.sh ubuntu@sessions.slike.in` again. It builds the image, starts the four
containers, and prints the health answer. Give Caddy a minute to obtain the certificate, then open
`https://sessions.slike.in/api/health` from a phone: `{"ok":true,"db":true}`.

Seed the demo guru and his week, once:

```
cd /opt/expert-sessions/deploy
docker compose exec app node src/seed.js
```

The seed reads `WHATSAPP_DISPLAY_NUMBER` from the env file for the guru's WhatsApp number.
Re-running the seed **wipes every table** (bookings, devotees, ledger). Never run it on a server
that has real bookings.

## Switching the providers to the server

The three dashboards currently point at the ngrok tunnel on Abhimanyu's laptop. Change them once:

- **Meta (WhatsApp).** developers.facebook.com, the app, WhatsApp, Configuration. Callback URL
  `https://PUBLIC_HOST/webhook`, Verify token = `WHATSAPP_VERIFY_TOKEN` from the env file. Press
  Verify and save. Check that the `messages` webhook field is still Subscribed.
- **Razorpay.** Dashboard, Settings, Webhooks. Edit the webhook URL to
  `https://PUBLIC_HOST/razorpay/webhook`; the secret stays what `RAZORPAY_WEBHOOK_SECRET` holds.
  Event `payment_link.paid` must be ticked.
- **100ms.** Nothing to change; rooms are created by api calls.

Then stop the laptop: quit ngrok and the `pnpm dev` terminals. Two servers answering the same
webhooks would double-confirm bookings.

## Checking it is well

```
cd /opt/expert-sessions/deploy
docker compose ps                         # four containers, all "Up (healthy)" or "Up"
docker compose logs --tail=100 app        # the api log; provider refusals show here as sentences
docker compose logs -f app                # follow it live
curl -s https://PUBLIC_HOST/api/health    # {"ok":true,"db":true}
```

The console's **Needs attention** screen is the product's own alarm: paid-too-late, waited-alone,
did-not-join rows appear there without anyone reading logs.

## Updating the code

From a machine with the repository:

```
deploy/deploy.sh ubuntu@sessions.slike.in
```

Rebuilds the image and restarts `app` only. Migrations in `apps/api/db/migrations` run before the
api listens. Downtime is the ten seconds the container takes to start; a devotee in a video room
is unaffected because the room lives on 100ms, and her waiting-room page reconnects by itself.

## Backups and restore

A dump is written to `deploy/backups/` every 24 hours and fourteen are kept. **Copy them off the
box**: a nightly `rsync` of that folder to another machine, or an object-store upload, is the one
thing this compose file cannot do for you. Restore:

```
cd /opt/expert-sessions/deploy
docker compose stop app
docker compose exec -T db pg_restore -U es -d expert_sessions --clean --if-exists < backups/expert_sessions-YYYYMMDD-HHMM.dump
docker compose start app
```

## A guru's own domain

The site answers at the root of his domain, exactly as CLAUDE.md describes.

1. His team creates a CNAME `guruji.com` (or `www.guruji.com`) pointing at `PUBLIC_HOST`.
2. In the console, Settings, His website, type the domain and save.
3. The first visitor to `https://guruji.com` waits a few seconds while Caddy asks the api whether it
   knows that domain (`/api/tls-ask`) and obtains a certificate. From then on it is instant.

Domains nobody typed into the console are refused a certificate, so pointing a random domain at the
server does nothing.

## What still depends on a person

Hosting was one of five open items before a pilot. The other four are decisions, not code, and each
one limits what a month of pitching can show:

- **WhatsApp reaches only five numbers.** The Meta app is unpublished, and its test number may
  message only recipients on the allow list (five). Every guru you pitch to, and anyone who books in
  front of him, must be added under WhatsApp, API Setup, "To" numbers, or the app must be published.
  Publishing needs a Privacy Policy URL on the app and business verification of the Slike
  portfolio. Until then a stranger scanning the QR gets nothing and the console shows the send as
  NOT DELIVERED.
- **Razorpay is in test mode** on Abhimanyu's personal account, and test mode allows 30 payment links per account for ever. That cap was reached on 28 September, so no booking can be paid until live keys exist or the payment step is rebuilt on Razorpay Orders. Payment links open a test page and
  no money moves. Going live needs the merchant-of-record decision (whose account receives the
  dakshina) and that account's KYC.
- **Her sign-in code is the fixed mock `1234`** until an SMS provider is wired (`OTP_CODE`).
- **The 100ms account is a personal one** on the free tier (10,000 participant-minutes a month,
  roughly 160 half-hour sittings).

## Pitching to several gurus with one deployment

The console manages one guru (`CONSOLE_GURU_SLUG`). For a pitch, personalise the demo guru rather
than adding a row: Settings, His website (name, about, picture, facts, quote, themes), His timings,
Satsangs and meetups. His portrait goes in as a web address in "His portrait", so it needs no
deploy. Between pitches, reset with the seed only if there are no real bookings yet.

## If something is wrong

| Symptom | Look at | Usually |
|---|---|---|
| Heartbeat alert | `docker compose ps`, then `logs app` | the box rebooted (containers come back alone) or Postgres is down |
| `/api/health` says `db:false` | `docker compose logs db` | disk full, or the volume is gone |
| WhatsApp messages stop arriving | Meta dashboard, webhook, "messages" field subscribed; `logs app` for 401 | the System User token was revoked, or the callback URL points elsewhere |
| A payment is made but the time is not confirmed | console Needs attention, then `logs app` for "signature" | the webhook secret differs between Razorpay and the env file; reconciliation settles it within the hour anyway |
| Certificate errors on a guru's domain | `docker compose logs caddy` | the CNAME is missing, or the domain was not typed into the console |
| "Something went wrong on our side" on a console screen | `logs app` for the stack trace | report it with the trace; the console never swallows an error |
