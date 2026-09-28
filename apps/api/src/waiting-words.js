// What her waiting room says. Words, not a timer that runs out and leaves her guessing
// (CLAUDE.md: the devotee's session screens never show a countdown).

import { describeSlot, instantToSlotId } from '@expert-sessions/shared';

const ESCAPE_AFTER_MINUTES = 10;
// The link in her WhatsApp outlives the booking. Each ending gets its own sentence.
const NOT_YOURS = {
  cancelled: 'This time was cancelled. Your dakshina is kept as a credit for thirty days; book any other time with it.',
  rescheduled: 'This time was moved. Open the newer link on your WhatsApp for the new time.',
  refunded: 'Guruji could not sit at this time. Your dakshina is on its way back to you.',
  no_show: 'This time has passed. If you wish to book another, write Hi to his team on WhatsApp.',
  held: 'This time is not paid for yet. The payment link is on your WhatsApp.',
  expired: 'This time was not paid for in time and is no longer held. Write Hi on WhatsApp to choose again.',
};
// Opened this far ahead, "at your time" is not an answer; the sentence names the time instead.
const NAME_THE_TIME_BEYOND_MINUTES = 60;

/**
 * Pure. The state her screen is in and the sentence it shows.
 * @param {object} p
 * @param {'confirmed'|string} p.status         her booking's status
 * @param {Date} p.slotStart                    when her time begins
 * @param {number} p.slotMinutes                how long a sitting is
 * @param {{startedAt: Date}|null} p.session    her own session, once guruji has started it
 * @param {{startedAt: Date}|null} p.running    the session he is in now, if it is someone else's
 * @param {number} p.ahead                      how many confirmed times stand between now and hers
 * @param {Date} p.now
 * @returns {{state: string, sentence: string, canLeave: boolean}}
 */
export function waitingWords({ status, slotStart, slotMinutes, session, running, ahead = 0, now = new Date() }) {
  if (status !== 'confirmed' && status !== 'completed') {
    return { state: 'not_yours', sentence: NOT_YOURS[status] ?? 'This time is not confirmed. Please write to his team on WhatsApp.', canLeave: false };
  }
  if (session?.endedAt) {
    return { state: 'ended', sentence: 'Your session is complete.', canLeave: false };
  }
  if (session?.startedAt) {
    return { state: 'running', sentence: 'Only the two of you. Nothing is recorded.', canLeave: false };
  }

  const minutesPast = (now - slotStart) / 60000;
  if (minutesPast >= ESCAPE_AFTER_MINUTES) {
    return {
      state: 'late',
      sentence: 'Something has kept him. You do not need to wait, or call anyone.',
      canLeave: true,
    };
  }
  if (running) {
    const left = minutesLeft(running.startedAt, slotMinutes, now);
    const whose = ahead <= 1
      ? `Guruji is with someone before you. You are next${left ? ` — about ${left} minutes` : ''}.`
      : `Guruji is with someone. There are ${ahead} before you.`;
    return { state: 'queued', sentence: whose, canLeave: false };
  }
  if (minutesPast >= 0) {
    return { state: 'due', sentence: 'Guruji will join you shortly. You can stay on this screen.', canLeave: false };
  }
  if (minutesPast <= -NAME_THE_TIME_BEYOND_MINUTES) {
    return {
      state: 'early',
      sentence: `Your time with guruji is ${describeSlot(instantToSlotId(slotStart))}. Come back to this screen then.`,
      canLeave: false,
    };
  }
  return { state: 'early', sentence: 'Guruji will join you at your time. You can stay on this screen.', canLeave: false };
}

export { ESCAPE_AFTER_MINUTES };

/** Rounded to five, because a number to the minute would be a countdown by another name. */
function minutesLeft(startedAt, slotMinutes, now) {
  const left = (new Date(startedAt).getTime() + slotMinutes * 60000 - now) / 60000;
  if (left < 2) return 0;
  return Math.max(5, Math.round(left / 5) * 5);
}
