// Small display helpers shared by the console screens.
import { addDays as sharedAddDays, formatTime, isoDate, nowInIst, parseSlotId } from '@expert-sessions/shared';

export function todayYmd(): string {
  return isoDate(nowInIst());
}

export const addDays = sharedAddDays;

/** '16:00' -> '4:00' for the grid's narrow time column */
export function shortTime(hhmm: string): string {
  return formatTime(parseSlotId(`slot:2000-01-01T${hhmm}`)).replace(/ [ap]m$/, '');
}

export function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}
