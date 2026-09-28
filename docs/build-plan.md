# Build plan — one Claude Code session per line

Each session: paste the prompt, let Claude Code plan, say yes, let it build, run `pnpm test`, commit.
Do them in this order — each one uses what the last one made. Sessions 3–6 can run in parallel on
different machines once session 2 is merged, because they touch different folders.

---

## Session 1 — Foundations (api + shared + db)   `~half day`

> Read CLAUDE.md. Set up the monorepo: pnpm workspaces, `apps/api` (Express, TypeScript optional — keep
> JS if faster), `apps/web` (Vite + React + TS, react-router, with three empty route groups `/console`,
> `/guru`, `/s/:guruSlug`), `packages/shared`. Move `apps/api/src/slots.js` and its test into
> `packages/shared` and import it from the api. Add Postgres via `pg`, a `db.js` with a pool and
> `migrate()`, and the first migration creating every table in CLAUDE.md's domain model. Replace the JSON
> file store in `bookings.js` with SQL, keeping the same function names and the state machine in that one
> file. Add `seed.js` that creates one guru ("Guruji Vishwanath", slug `guruji`, the pattern from
> `config/availability.json`, dakshina ₹500), twenty devotees, and a realistic week of bookings across all
> statuses and sources. Add Socket.IO to the api with the `session:{bookingId}` namespace and the four
> events from CLAUDE.md, but no UI yet. Make `pnpm dev`, `pnpm test`, `pnpm --filter api migrate`,
> `pnpm --filter api seed` all work. Create `docs/architecture.md` with a Component Index.
> Plan first; wait for my yes.

Exit: `pnpm seed && pnpm dev` runs; `GET /api/gurus/guruji/slots` returns real slots; WhatsApp flow
from yesterday still works end to end against Postgres.

## Session 2 — The team console, part one   `~1 day`

> Read CLAUDE.md and docs/architecture.md. Open docs/design/v1-walkthrough.html, tab "4 · The team's
> console" — build screens 1, 4 and 7 first: **Today**, **Calendar (week grid)**, **Money**. Cool
> palette from CLAUDE.md. Data from the api; add the endpoints you need under `/api/console/*` behind
> the shared console login. The week grid must derive fill counts from the bookings, colour by status
> (paid / hold / live-sourced / completed / open / closed day), and show the afternoon divider. Add
> **Settings** with four things: the availability pattern editor (days, windows, slot length, gap,
> dakshina, closed dates — writes `gurus.pattern_json`), his **website content** (domain, name, about,
> marketing text blocks), his **meetups** (add/edit upcoming satsangs and lives: title, when, link,
> location — the `events` table), and **QR codes**:
> pick a source (live / ashram / poster / custom label) → generate the `wa.me` link with the pre-filled
> attribution text → render and download the QR as PNG and SVG → save to `qr_codes`. Plan first.

Exit: a teammate can set Tuesday hours, download a poster QR, and see the seeded week on the grid.

## Session 3 — The team console, part two   `~1 day`

> Read CLAUDE.md and docs/architecture.md. Walkthrough tab 4, screens 2, 3, 5, 6: the **waiting panel**
> on Today (who has opened their link, how long, whether they are in the room; one-tap messages
> "Joining in 5 / 10 minutes", "Would another time suit you?", custom; click-to-call; each message
> shows where it landed — room via socket, or WhatsApp if she hasn't opened the link), the **close a
> day** flow (pick a date → list affected bookings → suggest nearest slots → move all and notify),
> **reschedule one booking**, **refund** (Razorpay refund API, ledger entry), **mark no-show**, the
> **Needs attention** queue (expired holds, no-slot-suited waitlist, did-not-join, refunds in flight),
> and **Bookings** (search by name/phone; create a booking on behalf of a caller → sends her the payment
> link on WhatsApp). Plan first.

Exit: full dry run of the assistant's day from the surfaces brief, on seed data.

## Session 4 — His website: marketing, schedule, booking, my sessions   `~1 day`

> Read CLAUDE.md and docs/architecture.md. Walkthrough tab "2 · His page". Warm palette. This is the
> guru's **own website** (e.g. guruji.com) — resolve the tenant from the Host header, with `/s/:guruSlug`
> as the dev preview. A minimal site, four sections on one scrolling page: (1) who he is — marketing text
> from `gurus.marketing_json`; (2) **his schedule** — upcoming meetups from `events` (satsangs and lives
> with their links) and the next three open 1:1 times; (3) booking — tap a time → bottom sheet (time,
> dakshina, WhatsApp number) → Razorpay checkout (test mode) → confirmed, plus the WhatsApp confirmation
> via the api; hold the slot 10 minutes while she pays; (4) **Sign in** with phone + mock OTP → "My
> sessions": upcoming with Join, **Reschedule** (once, ≥4 hours before, same slot picker) and **Cancel**
> (≥4 hours before → dakshina becomes a 30-day credit; the next booking sheet offers "use your credit");
> plus history. Both doors share `holdSlot`/`confirmByPayment` in `bookings.js`. Plan first.

Exit: on the preview URL, a fresh phone books in three taps; she signs in, cancels, sees the credit,
and rebooks with it; every step shows on the console grid.

## Session 5 — Waiting room and the room   `~1 day`

> Read CLAUDE.md and docs/architecture.md. Walkthrough tab "5 · The session" — all six steps. Warm,
> quiet, almost empty. `/s/:guruSlug/join/:bookingId`: pre-entry check (mic, camera, connection, self
> preview) → waiting room that listens on the socket for `session.started`, shows status in words,
> shows team messages (`waiting.message`) inline → mounts the 100ms prebuilt room on `session.started`
> with our theme; audio-first fallback → escape hatch at ten minutes past (`Choose another time` /
> `Ask for the dakshina back`) → closing screen. Never a countdown. Never an admin in the room.
> Plan first; ask me for the 100ms credentials.

Exit: two phones, a real call, started from an api call that emits `session.started`.

## Session 6 — Guruji's calendar (PWA)   `~half day`

> Read CLAUDE.md and docs/architecture.md. Walkthrough tab "3 · Guruji's day". `/guru`: the timeline
> (times left, sessions right, "rest" for empty afternoons), each with who is coming and the context
> line, voice-note playback, one-tap **Join** that creates the session, emits `session.started`, and
> opens the room with the devotee card beside the video; **End** → next name. Installable PWA
> (manifest, icon, start_url `/guru`). No money anywhere on these screens. Plan first.

Exit: he taps Join on his phone; her waiting room becomes the call.

## Session 7 — Reminders, polish, demo   `~half day`

> Read CLAUDE.md. Add the reminder job (night before, 10 minutes before — as session messages this
> week; note in code where templates plug in). Wire the L-band QR asset for the Slike test stream from
> `qr_codes`. Run the full demo script from the scope brief end to end on two phones and fix what breaks.
> Update docs/architecture.md.

---

## Prompts that save time in every session

- "Before you start, list the files you will touch and why." (catches drift into another surface)
- "Show me the screen next to the mockup in docs/mockups — what differs?"
- "What did you skip or simplify? Tell me now, not later."
- "Run pnpm test and paste the output."
