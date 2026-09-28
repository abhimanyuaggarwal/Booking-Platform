// Two reminders per booking: one the evening before, one ten minutes before her time.
//
// TEMPLATES. Meta refuses a free-form message to anyone who has not written to us in the last 24
// hours, which the evening-before reminder usually is. Until the pilot's templates are approved,
// that reminder is attempted as an ordinary message and simply fails for older bookings; the
// failure is recorded, not hidden, and the console's message history shows it. When the templates
// land, replace the two `say.text(...)` calls in sendDue() with `say.template(name, variables)` and
// nothing else here changes: the windows, the once-only rule and the record are already right.

import { describeSlot, instantToSlotId, parseSlotId } from '@expert-sessions/shared';
import { query } from './db.js';
import { logMessage } from './messages-log.js';
import { ProviderError } from './errors.js';

export const SOON_MINUTES = 12;          // "ten minutes before", with slack for a job that runs each minute
const NIGHT_BEFORE_FROM = 19;            // IST, the evening before
const NIGHT_BEFORE_TO = 21;

export const copy = {
  night: ({ guruName, slotId }) =>
    `A reminder: your time with ${guruName} is tomorrow, ${describeSlot(slotId).split(', ').slice(1).join(', ')}.\n\nOpen the link we sent you at your time to join.`,
  soon: ({ guruName }) =>
    `Your time with ${guruName} begins in about ten minutes. Open the link we sent you when you are ready.`,
};

/**
 * Pure. Which reminder, if any, this booking wants right now.
 * @returns {'night' | 'soon' | null}
 */
export function reminderDue({ slotStart, now }) {
  const minutesAway = (slotStart - now) / 60000;
  if (minutesAway > 0 && minutesAway <= SOON_MINUTES) return 'soon';

  const slotDay = istDay(slotStart);
  const today = istDay(now);
  const hourNow = parseSlotId(instantToSlotId(now)).getUTCHours();   // IST wall-clock hour
  const isTomorrow = daysBetween(today, slotDay) === 1;
  if (isTomorrow && hourNow >= NIGHT_BEFORE_FROM && hourNow < NIGHT_BEFORE_TO) return 'night';
  return null;
}

/**
 * Send what is due, once each. The record in messages_log is what makes it once: a reminder that
 * Meta refused is still written down, so we do not try it every minute for the rest of the day.
 * @returns {{sent: number, refused: number}}
 */
export async function sendDue({ conversation, now = new Date() }) {
  const { rows } = await query(
    `select b.id, b.guru_id, b.devotee_id, b.slot_start,
            g.name as guru_name, g.slug,
            d.phone, d.name as devotee_name,
            exists (select 1 from messages_log m where m.booking_id = b.id and m.kind = 'reminder.night') as had_night,
            exists (select 1 from messages_log m where m.booking_id = b.id and m.kind = 'reminder.soon') as had_soon
       from bookings b join gurus g on g.id = b.guru_id join devotees d on d.id = b.devotee_id
      where b.status = 'confirmed' and b.slot_start > now() and b.slot_start < now() + interval '2 days'`);

  let sent = 0;
  let refused = 0;
  for (const row of rows) {
    const due = reminderDue({ slotStart: row.slot_start, now });
    if (!due) continue;
    if (due === 'night' && row.had_night) continue;
    if (due === 'soon' && row.had_soon) continue;

    const slotId = instantToSlotId(row.slot_start);
    const text = copy[due]({ guruName: row.guru_name, slotId });
    const say = conversation.speak({ id: row.guru_id, name: row.guru_name }, { id: row.devotee_id, phone: row.phone }, row.id);
    try {
      await say.text(text);
      sent += 1;
      await record(row, due, { text, delivered: true });
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      refused += 1;
      // Written down so the team can see it and so we do not try again every minute.
      await record(row, due, { text, delivered: false, reason: err.message });
    }
  }
  return { sent, refused };
}

function record(row, due, payload) {
  return logMessage({
    guruId: row.guru_id, devoteeId: row.devotee_id, bookingId: row.id,
    direction: 'out', kind: `reminder.${due}`, payload,
  });
}

function istDay(instant) {
  return instantToSlotId(instant).slice(5, 15);
}

function daysBetween(fromDate, toDate) {
  return Math.round((parseSlotId(`slot:${toDate}T00:00`) - parseSlotId(`slot:${fromDate}T00:00`)) / 86400000);
}
