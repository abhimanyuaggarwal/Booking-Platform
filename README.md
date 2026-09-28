# Expert Sessions on Slike

Booking and consultation system for a guru's practice. See **CLAUDE.md** for the full brief and
**docs/build-plan.md** for the order to build things in.

    apps/api          Node + Express + Postgres — bookings, slots, payments, WhatsApp, sessions, jobs
    apps/web          React + Vite — /console (team), /guru (his PWA), /s/:guruSlug (devotee)
    packages/shared   slot maths and formatting used by both
    docs/             briefs, the clickable walkthrough (the spec), mockups, build plan

Getting started (Session 1 is built — see docs/architecture.md):

    pnpm install && pnpm db:up          # Docker; or Homebrew Postgres, see apps/api/README.md Part B
    cp apps/api/.env.example apps/api/.env   # fill in the Meta and Razorpay values (apps/api/README.md, Part A)
    pnpm seed && pnpm dev               # api :3000, web :5173
    pnpm test

Next: open this folder in Claude Code and paste Session 2 from docs/build-plan.md.
