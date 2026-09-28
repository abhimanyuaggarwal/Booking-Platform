export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

/** gurus.pattern_json plus the closed_dates column — see availabilityOf() in apps/api/src/gurus.js */
export interface Availability {
  slotMinutes: number;
  gapMinutes: number;
  minimumNoticeMinutes: number;
  daysAhead: number;
  weeklyPattern: Record<DayKey, [string, string][]>;
  closedDates: string[];
}

export interface Slot {
  id: string;        // "slot:2026-09-16T16:00" — IST wall-clock
  label: string;     // "Today 4:00 pm"
  startsAt: Date;    // IST wall-clock stored in UTC fields; use slotIdToInstant(id) for a real instant
}

export const IST_OFFSET_MINUTES: number;
export const DAY_KEYS: DayKey[];
export function nowInIst(): Date;
export function parseSlotId(slotId: string): Date;
export function toSlotId(date: Date): string;
export function slotIdToInstant(slotId: string): Date;
export function instantToSlotId(instant: Date): string;
export function formatTime(date: Date): string;
export function labelFor(date: Date, today: Date): string;
export function startOfDay(date: Date): number;
export function isoDate(date: Date): string;
export function addDays(date: string, n: number): string;
export function dayRange(date: string): [Date, Date];
export function availableSlots(availability: Availability, takenSlotIds: Set<string>, now?: Date): Slot[];
export function describeSlot(slotId: string): string;
export function describeDate(date: string): string;
export function formatRupees(paise: number): string;
