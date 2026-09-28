# Expert Sessions — what is built, and what is not

Written 15 September 2026. For anyone who needs the picture without reading code.
The technical map is `docs/architecture.md`; the screen-by-screen spec is `docs/design/v1-walkthrough.html`.

## In one paragraph

A devotee sees a QR under Guruji's live, or opens his website, and books a paid thirty-minute
one-to-one. She pays by UPI. At her time she opens a link and waits on a quiet screen until he joins
from his phone. His assistant runs the whole day from one console and never opens a notebook. All of
this is built and working against a real database. What is not proven is the three outside services —
WhatsApp, Razorpay and the video room — because we do not have their credentials on this machine.

---

## What we built, session by session

**1 · Foundations.** The plumbing. A real database holding gurus, devotees, bookings, money, sessions,
messages and QR codes. One place decides what a booking may do next, so no screen can invent its own
rules. Demo data that looks like a real week. *You can see: open times for the week, produced by his
timings rather than by hand.*

**2 · The team console, part one.** His assistant's working screens. **Today** with what has come in,
what is filled, and what needs her. **Calendar**, the week as a grid coloured by paid, not-yet-paid,
came-from-a-live, done, open and closed. **Money**, every entry as it happened with no adding up.
**Settings** for his sitting hours, the dakshina, the words on his website, his satsangs, and QR codes
she can print or download. *She can set Tuesday's hours and the booking buttons change immediately.*

**3 · The team console, part two.** The parts that stop money leaking. A **waiting panel** showing who
has opened their link and how long they have waited, with one-tap messages that land in the waiting
room or on WhatsApp, and it says which. **Close a day** when he travels: everyone booked gets a
suggested new time and one tap moves them all. **Reschedule, refund, mark did-not-join.** A **Needs
attention** list of expired holds, people who paid and never joined, and refunds on their way.
**Bookings** search, and booking on behalf of someone who rang instead of tapping.

**4 · His website.** His own page on his own domain: who he is, his schedule of satsangs and meetups,
and the next open times already on screen before she scrolls. Tapping a time opens a short sheet
asking only for her WhatsApp number, then the UPI page. Afterwards she can sign in with her number and
a code to see her sessions, move one, or cancel. Cancelling in time turns her dakshina into a credit
good for thirty days, and she can spend it in one tap.

**5 · The waiting room and the video room.** Before she enters, a check of microphone, camera and
connection with a preview of how she will look. Then a screen that tells her the truth in a sentence,
never a countdown: "Guruji is with someone before you. You are next." Notes from his team appear in
the same frame. When he joins, the screen becomes the call. Ten minutes past her time she is offered
two choices, another time or the dakshina back, and told his team can see she was waiting. Afterwards:
how long they sat, when the next satsang is, and a quiet way to book again.

**6 · Guruji's own calendar.** A small app for his phone, installable to his home screen. Times down
the left, who is coming beside them, and the one line the notebook could never give him: "Second
visit, wishes to speak about a property dispute." Her voice note plays with a tap. At the hour, one
button joins the room with her card beside the video. No money appears anywhere on his screens.

**7 · Reminders, the stream banner, and the dry run.** A reminder the evening before and another ten
minutes before her time, each sent once and recorded whether it arrived or not. A downloadable banner
for the bottom of a live stream carrying his name, the terms, and the QR. And `pnpm demo`, one command
that walks the entire journey and prints what really happened, marking anything it had to stand in for.

---

## What is pending

### Waiting on you — nothing else can be proven without these

| What | Where it goes | What it unblocks |
|---|---|---|
| WhatsApp access token and phone number id | `apps/api/.env` | Every message to a devotee. Today they are composed and recorded but not delivered. |
| Razorpay test key and secret | `apps/api/.env` | The payment page. Today a booking holds the time and then releases it because the link cannot be made. |
| 100ms access key, secret and template id | `apps/api/.env` | The video call itself. Everything either side of it is proven. |

Once those are in, `pnpm demo` runs the same journey for real and its closing list should be empty.

### Work that exists but has not been exercised on real phones

- Nobody has clicked through the screens in a browser here. Tests render them and the api behind them
  is exercised, but a human should walk each surface once.
- Two phones on a real call, which is the last line of the plan.

### Needs someone outside the team

- **Approved WhatsApp templates.** Meta refuses a free-form message to anyone who has not written in
  the last 24 hours, which the evening-before reminder usually is. The code is ready for templates and
  names the one place they plug in. Submitting them runs on Meta's clock.
- **A real WhatsApp business number.** The test number reaches five whitelisted phones only.
- **His domain.** The website is built to answer on `guruji.com`; his team adds one DNS record.

### Small things we know about

- His app icon is a placeholder we drew. Replace it when he has a mark.
- Voice notes play only while WhatsApp is live; Meta drops media after a while.
- "Due to settle" on the Money screen is our own arithmetic since the last Friday, not Razorpay's
  settlement figure.
- The team console has one shared login and no roles, by design for the pilot.

### Deliberately not built (agreed in the brief)

Paid questions on air · ticketed group sessions · simulcast · a directory of gurus · reviews or
ratings · free-text understanding on WhatsApp · booking by phone call · accounts and passwords ·
cards and netbanking · self-serve cash refunds · recording · chat, screen share or files in the room ·
native apps · roles and permissions · a CRM · analytics beyond the pilot numbers.

A waitlist for "no time suited me" was considered and left out on 14 September.
