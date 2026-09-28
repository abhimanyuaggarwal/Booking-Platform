// Scheduled work inside the api.

import cron from 'node-cron';
import { expireStaleHolds, markNoShows } from './bookings.js';
import { sendDue } from './reminders.js';
import { closeAbandonedSessions } from './sessions.js';
import { reconcilePayments } from './reconcile.js';
import { query } from './db.js';

export function startJobs({ conversation, pay }) {
  // Every minute: sessions nobody ended. One forgotten session makes the api answer "he is with
  // someone" for ever, so every other devotee waits for a sitting that finished long ago.
  cron.schedule('* * * * *', async () => {
    try {
      const closed = await closeAbandonedSessions();
      if (closed) console.log(`Closed ${closed} session(s) nobody ended`);
    } catch (err) {
      console.error(`Closing abandoned sessions failed: ${err.message}`);
    }
  });

  // Every minute: unpaid holds older than HOLD_MINUTES go back on the shelf.
  cron.schedule('* * * * *', async () => {
    try {
      const released = await expireStaleHolds();
      if (released) console.log(`Released ${released} unpaid hold(s)`);
    } catch (err) {
      console.error(`Hold expiry failed: ${err.message}`); // the next minute tries again
    }
  });

  // Every minute: paid times that passed an hour ago with her link never opened become no-shows.
  // The dakshina stands (agreed policy), so there is nothing to decide, only to record.
  cron.schedule('* * * * *', async () => {
    try {
      const marked = await markNoShows();
      if (marked) console.log(`Marked ${marked} no-show(s)`);
    } catch (err) {
      console.error(`Marking no-shows failed: ${err.message}`);
    }
  });

  // Every hour: ask Razorpay about every link we never heard back on. A webhook lost to a
  // sleeping laptop or a dropped tunnel otherwise leaves her paid with no time and no ledger row.
  cron.schedule('0 * * * *', async () => {
    try {
      const r = await reconcilePayments({ pay, conversation });
      if (r.asked) console.log(`Reconciled payments: asked Razorpay about ${r.asked} link(s), settled ${r.settled}, ${r.failed} could not be fetched`);
    } catch (err) {
      console.error(`Payment reconciliation failed: ${err.message}`);
    }
  });

  // Every minute, not hourly: one of the two reminders is ten minutes before her time, and an
  // hourly job would send it anywhere from ten to seventy minutes early. Each reminder is sent
  // once (reminders.js), so running often costs nothing.
  cron.schedule('* * * * *', async () => {
    try {
      const { sent, refused } = await sendDue({ conversation });
      if (sent || refused) console.log(`Reminders: ${sent} sent, ${refused} refused by WhatsApp`);
    } catch (err) {
      console.error(`Reminders failed: ${err.message}`);
    }
  });

  // Every minute: tell a heartbeat monitor (Healthchecks.io, Better Stack, Cronitor) we are alive
  // AND can reach Postgres. The monitor pages someone when the pings stop. This is the one gap that
  // makes every other gap survivable: on 2026-09-18 a sleeping laptop lost a devotee's message and
  // nobody knew for two hours.
  if (process.env.HEARTBEAT_URL) {
    cron.schedule('* * * * *', async () => {
      try {
        await query('select 1');
        const res = await fetch(process.env.HEARTBEAT_URL, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) console.error(`Heartbeat monitor answered ${res.status}; check HEARTBEAT_URL`);
      } catch (err) {
        console.error(`Heartbeat not sent: ${err.message}`); // the monitor will notice the gap, which is the point
      }
    });
  }
}
