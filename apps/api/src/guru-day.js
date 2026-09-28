// Guruji's day, as he reads it: times down the left, what is at each time beside them, and the
// empty stretches named as rest rather than left blank. No money anywhere — that is the team's
// screen, never his (CLAUDE.md, Design language).

const REST_AFTER_MINUTES = 100;   // a gap shorter than this is just a gap between sittings
// Exported because the api enforces the same window sessions.js: a button his screen does not
// show must not be startable by a stale tab either.
export const JOIN_OPENS_MINUTES = 10;    // Join appears this long before her time
export const JOIN_CLOSES_MINUTES = 60;   // and stays while the sitting could still reasonably happen

/**
 * Pure. Lays his sittings and his public events onto one timeline, with rest where the day is empty.
 * @param {{kind: 'session'|'event', at: Date, ...}[]} entries  in any order
 * @param {Date} now
 * @returns {{items: object[], sessions: number}}
 */
export function guruDay(entries, now = new Date()) {
  const ordered = [...entries].sort((a, b) => a.at - b.at);
  const items = [];

  for (const [i, entry] of ordered.entries()) {
    const previous = ordered[i - 1];
    if (previous) {
      const gapMinutes = (entry.at - endOf(previous)) / 60000;
      // Named for the middle of the gap: an empty stretch from noon to five is an afternoon, not a morning.
      if (gapMinutes >= REST_AFTER_MINUTES) items.push({ kind: 'rest', when: partOfDay(new Date((endOf(previous).getTime() + entry.at.getTime()) / 2)) });
    }
    items.push(entry.kind === 'session' ? { ...entry, ...joinWindow(entry, now) } : entry);
  }

  return { items, sessions: ordered.filter((e) => e.kind === 'session').length };
}

/** Whether the Join button is there yet, and what it says. */
function joinWindow(session, now) {
  if (session.status === 'completed') return { canJoin: false, joinWords: null, done: true };
  if (session.endedAt) return { canJoin: false, joinWords: null, done: true };
  if (session.startedAt) return { canJoin: true, joinWords: 'Return to the room', done: false };
  const minutesAway = (session.at - now) / 60000;
  if (minutesAway > JOIN_OPENS_MINUTES) return { canJoin: false, joinWords: null, done: false };
  if (minutesAway < -JOIN_CLOSES_MINUTES) return { canJoin: false, joinWords: null, done: false };
  return { canJoin: true, joinWords: `Join at ${session.time}`, done: false };
}

function endOf(entry) {
  return new Date(entry.at.getTime() + (entry.minutes ?? 60) * 60000);
}

function partOfDay(date) {
  const hour = date.getUTCHours(); // IST wall-clock in UTC fields, as everywhere
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
const TOPIC_LENGTH = 60;

/**
 * Pure. The one line that tells him what she carries, built from what we already know.
 * A short topic finishes our sentence — "Second visit · wishes to speak about a property dispute".
 * Anything longer is her own words, quoted, because grafting a sentence into ours mangles both.
 */
export function contextLine({ priorVisits, question, hasVoiceNote, forWhom }) {
  const parts = [priorVisits === 0 ? 'First time' : `${ORDINALS[priorVisits] ?? `${priorVisits + 1}th`} visit`];
  if (forWhom) parts.push(forWhom);
  if (question) parts.push(asTopic(question) ?? `“${firstSentence(question)}”`);
  else if (hasVoiceNote) parts.push('has sent a message to hear');
  return parts.join(' · ');
}

/** Her words as the end of our sentence, or null if they will not sit there. */
function asTopic(question) {
  const text = question.trim().replace(/\.$/, '');
  if (text.length > TOPIC_LENGTH || /[.?!]\s/.test(text)) return null;   // more than one sentence
  if (/^(I|My|We|He|She|They)\b/.test(text)) return null;                // already a statement of her own
  if (/\?$/.test(text) || /^(How|What|Why|When|Where|Who|Which|Should|Can|Could|Would|Will|Is|Are|Am|Do|Does|Did|Have|Has)\b/i.test(text)) return null; // a question, not a topic
  const lowered = /^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
  return `wishes to speak about ${lowered}`;
}

function firstSentence(question) {
  const text = question.trim();
  const stop = text.search(/[.?!]\s/);
  const one = stop === -1 ? text : text.slice(0, stop + 1);
  return one.length > 90 ? `${one.slice(0, 87).trimEnd()}…` : one;
}

export { REST_AFTER_MINUTES };
