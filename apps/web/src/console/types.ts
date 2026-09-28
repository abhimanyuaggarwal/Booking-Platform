// Shapes the api returns under /api/console/* (apps/api/src/reports.js, console-routes.js).

export interface Me { user: string; guru: { slug: string; name: string } }

export type BookingStatus = 'held' | 'confirmed' | 'completed' | 'no_show' | 'rescheduled' | 'cancelled' | 'refunded' | 'expired';
export type Source = 'live' | 'ashram' | 'poster' | 'page' | 'direct';

export interface SessionRow {
  id: string; slotId: string; status: BookingStatus; source: Source;
  name: string; forWhom: string | null; priorVisits: number;
  question: string | null; hasVoiceNote: boolean; paid: boolean;
}

export interface AttentionItem { kind: string; name: string; time: string; text: string }

export interface MoneyKpis {
  collectedTodayPaise: number; collectedWeekPaise: number; returnedWeekPaise: number;
  dueToSettlePaise: number; settlesOn: string; settlesOnDate: string;
}

export interface TodayReport {
  date: string; dateLabel: string; guru: { name: string };
  attention: AttentionItem[];
  kpis: MoneyKpis & { slotsFilled: number; slotsTotal: number };
  timeline: { slotId: string; time: string; kind: 'booking' | 'open'; booking: SessionRow | null }[];
}

export type GridKind = 'paid' | 'hold' | 'live' | 'done' | 'noshow';
export interface GridBooking { id: string; slotId: string; name: string; status: BookingStatus; source: Source; kind: GridKind; note: string }
export interface GridDay {
  date: string; weekday: string; dayOfMonth: number; today: boolean;
  closed: 'closed' | 'no sittings' | null; filled: number; total: number;
  slots: Record<string, { slotId: string; booking: GridBooking | null }>;
  extra: GridBooking[];
}
export interface WeekEvent { id: string; title: string; kind: 'satsang' | 'live' | 'meetup'; date: string; time: string; link: string | null; location: string | null }
export interface WeekReport {
  monday: string; sunday: string; label: string; times: string[]; afternoonFrom: string | null;
  days: GridDay[]; filled: number; total: number;
  /** His satsangs, lives and meetups that fall in this week. */
  events?: WeekEvent[];
}

export type LedgerKind = 'payment' | 'refund' | 'credit_issued' | 'credit_used';
export interface LedgerEntry {
  id: string; kind: LedgerKind; amountPaise: number; providerRef: string | null; bookingId: string | null;
  at: string; date: string; time: string; name: string; source: Source | null; slotId: string | null; slotTime: string | null;
  expiresAt: string | null;
}
export interface MoneyReport { monday: string; sunday: string; label: string; kpis: MoneyKpis; entries: LedgerEntry[] }

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export interface Pattern {
  slotMinutes: number; gapMinutes: number; minimumNoticeMinutes: number; daysAhead: number;
  /** How far apart the offered starts are. Missing on a pattern saved before the setting existed: back to back. */
  stepMinutes?: number;
  weeklyPattern: Record<DayKey, [string, string][]>;
}
export interface Marketing {
  tagline: string;
  blocks: { heading: string; body: string }[];
  /** The picture band, his portrait over it, and the photo credit. All optional; the page hides what is missing. */
  hero?: { image: string | null; portrait: string | null; credit: string | null } | null;
  facts?: { label: string; value: string }[];
  themes?: string[];
  quote?: string;
}
export interface Settings {
  id: string; slug: string; name: string; domain: string | null; about: string; marketing: Marketing;
  dakshinaPaise: number; whatsappNumber: string | null; guruPhone?: string | null; language?: 'en' | 'hi'; pattern: Pattern; closedDates: string[];
}

export type EventKind = 'satsang' | 'live' | 'meetup';
export interface EventRow { id: string; title: string; kind: EventKind; startsAt: string; link: string | null; location: string | null; notes: string | null }

export type QrSource = 'live' | 'ashram' | 'poster' | 'custom';
export interface QrRow { id: string; source: QrSource; label: string; waLink: string; createdAt: string; stale?: boolean }

// ---- Session 3: waiting panel, attention, bookings, close a day ----

export interface WaitingPerson extends SessionRow {
  time: string; phone: string;
  inRoomSince: string | null; openedLinkAt: string | null;
  messages: { text: string; from?: 'team' | 'devotee'; landed?: 'room' | 'whatsapp' | 'failed'; reason?: string; at: string }[];
}
export interface WaitingBoard {
  now: string;
  running: { bookingId: string; name: string; startedAt: string; slotTime: string; minutesLate: number } | null;
  people: WaitingPerson[];
  suggestions: { laterToday: { slotId: string; label: string }[]; tomorrow: { slotId: string; label: string }[] };
  oneTap: string[];
}
export interface MessageResult { landed: 'room' | 'whatsapp' | 'failed'; reason?: string; at: string }

export interface AttentionRow {
  kind: 'hold_expired' | 'paid_too_late' | 'did_not_join' | 'waited_alone' | 'refund_sent' | 'waited_and_chose';
  bookingId: string | null; name: string; phone: string; slotId: string | null; when: string; why: string;
  action: 'send_link' | 'decide' | 'done' | 'none';
  expiredAt?: string; amountPaise?: number; providerRef?: string | null;
}

export interface BookingRow {
  id: string; slotId: string; time: string; date: string; status: BookingStatus; source: Source;
  name: string; phone: string; paid: boolean; question: string | null; hasVoiceNote: boolean;
  /** Set when the team booked and WhatsApp refused the confirmation: the booking stands, call her. */
  notDelivered?: string | null;
}
export type BookingAction = 'message' | 'reschedule' | 'cancel' | 'refund' | 'no_show' | 'send_link' | 'mark_paid' | 'tell_guru';
export interface BookingDetail {
  id: string; slotId: string; time: string; date: string; dateLabel: string; status: BookingStatus; source: Source;
  question: string | null; hasVoiceNote: boolean; paidAt: string | null; createdAt: string; rescheduledFromId: string | null;
  devotee: { id: string; name: string | null; phone: string; forWhom: string | null };
  paidWith: { kind: LedgerKind; amountPaise: number; providerRef: string | null } | null;
  ledger: { id: string; kind: LedgerKind; amountPaise: number; providerRef: string | null; expiresAt: string | null; at: string }[];
  messages: { id: string; direction: 'in' | 'out'; kind: string; payload: Record<string, unknown>; at: string }[];
  session: { devoteeJoinedAt: string | null; guruJoinedAt: string | null; startedAt: string | null; endedAt: string | null } | null;
  history: { id: string; slotId: string; status: BookingStatus; source: Source }[];
  actions: BookingAction[];
}

export interface CloseDayPreview {
  date: string; dateLabel: string;
  bookings: { id: string; slotId: string; time: string; name: string; phone: string; source: Source; suggestedSlotId: string | null }[];
  alternatives: { slotId: string; label: string }[];
  heldCount: number;
}
export interface CloseDayResult {
  date: string; moved: { bookingId: string; slotId: string; ok: boolean; newBookingId: string | null }[];
  expiredHolds: number; notified: number; notDelivered: string[];
}

export interface PublicSlots { guru: { slug: string; name: string; dakshinaPaise: number; slotMinutes: number }; slots: { id: string; label: string; startsAt: string }[] }
