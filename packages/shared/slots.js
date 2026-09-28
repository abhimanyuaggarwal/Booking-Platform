// Turns the weekly availability pattern into concrete bookable slots.
// All times are India Standard Time. We avoid timezone libraries by treating
// every Date in this file as "IST wall-clock time stored in UTC fields".
// The database stores real instants; slotIdToInstant / instantToSlotId cross that line.

export const IST_OFFSET_MINUTES = 330;
export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function nowInIst() {
  return new Date(Date.now() + IST_OFFSET_MINUTES * 60 * 1000);
}

// "slot:2026-09-16T16:00" -> a Date whose UTC fields hold 16:00 on that day (IST wall time)
export function parseSlotId(slotId) {
  const [datePart, timePart] = slotId.replace('slot:', '').split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm));
}

export function toSlotId(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `slot:${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
         `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

// A slot id names an IST wall-clock moment; bookings.slot_start is a real instant (timestamptz).
// The two differ by a fixed 5h30m, so the conversion is a shift, not a timezone lookup.
export function slotIdToInstant(slotId) {
  return new Date(parseSlotId(slotId).getTime() - IST_OFFSET_MINUTES * 60000);
}

export function instantToSlotId(instant) {
  return toSlotId(new Date(instant.getTime() + IST_OFFSET_MINUTES * 60000));
}

export function formatTime(date) {
  let h = date.getUTCHours();
  const m = String(date.getUTCMinutes()).padStart(2, '0');
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
}

// "Today 4:00 pm", "Tomorrow 10:00 am", "Thu 11:00 am"
export function labelFor(date, today) {
  const dayDiff = Math.round((startOfDay(date) - startOfDay(today)) / 86400000);
  let dayWord;
  if (dayDiff === 0) dayWord = 'Today';
  else if (dayDiff === 1) dayWord = 'Tomorrow';
  else dayWord = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()];
  return `${dayWord} ${formatTime(date)}`;
}

// Midnight of the same IST day, as milliseconds (wall-clock convention as above).
export function startOfDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isoDate(date) {
  return toSlotId(date).replace('slot:', '').split('T')[0];
}

/**
 * All bookable slots from now until `daysAhead`, minus the ones already taken.
 * @param {object} availability  gurus.pattern_json plus closedDates (see gurus.js availabilityOf)
 * @param {Set<string>} takenSlotIds  slot ids that are held or confirmed
 * @param {Date} [now]  injectable for tests; defaults to current IST time
 * @returns {{id: string, label: string, startsAt: Date}[]} sorted soonest first
 */
export function availableSlots(availability, takenSlotIds, now = nowInIst()) {
  const earliestAllowed = new Date(now.getTime() + availability.minimumNoticeMinutes * 60000);
  const stepMinutes = availability.slotMinutes + availability.gapMinutes;
  const slots = [];

  for (let dayOffset = 0; dayOffset < availability.daysAhead; dayOffset++) {
    const day = new Date(startOfDay(now) + dayOffset * 86400000);
    if (availability.closedDates.includes(isoDate(day))) continue;

    const windows = availability.weeklyPattern[DAY_KEYS[day.getUTCDay()]] || [];
    for (const [from, to] of windows) {
      const [fh, fm] = from.split(':').map(Number);
      const [th, tm] = to.split(':').map(Number);
      let cursor = new Date(day.getTime() + (fh * 60 + fm) * 60000);
      const windowEnd = new Date(day.getTime() + (th * 60 + tm) * 60000);

      while (cursor.getTime() + availability.slotMinutes * 60000 <= windowEnd.getTime()) {
        const id = toSlotId(cursor);
        if (cursor >= earliestAllowed && !takenSlotIds.has(id)) {
          slots.push({ id, label: labelFor(cursor, now), startsAt: new Date(cursor) });
        }
        cursor = new Date(cursor.getTime() + stepMinutes * 60000);
      }
    }
  }
  return slots;
}

// 'YYYY-MM-DD' plus n days
export function addDays(date, n) {
  return isoDate(new Date(parseSlotId(`slot:${date}T00:00`).getTime() + n * 86400000));
}

// [start, end) as real instants for one IST day
export function dayRange(date) {
  const start = slotIdToInstant(`slot:${date}T00:00`);
  return [start, new Date(start.getTime() + 86400000)];
}

// "Wednesday, 16 September" for a 'YYYY-MM-DD' date
export function describeDate(date) {
  const d = parseSlotId(`slot:${date}T00:00`);
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
  return `${dayName}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

// Long form used in confirmations: "Wednesday, 16 September, 4:00 pm"
export function describeSlot(slotId) {
  const d = parseSlotId(slotId);
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
  return `${dayName}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${formatTime(d)}`;
}
