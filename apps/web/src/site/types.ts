// Shapes the api returns under /api/site (apps/api/src/site-routes.js).

export interface Marketing {
  tagline: string;
  blocks: { heading: string; body: string }[];
  /** The picture band, his portrait over it, and the photo credit. All optional; the page hides what is missing. */
  hero?: { image: string | null; portrait: string | null; credit: string | null } | null;
  facts?: { label: string; value: string }[];
  themes?: string[];
  quote?: string;
}
export interface PublicGuru {
  slug: string; name: string; about: string; marketing: Marketing;
  dakshinaPaise: number; slotMinutes: number; whatsappLink: string | null;
}
export interface PublicSlot { id: string; label: string; when: string }
/** One kind of sitting he offers: a length and a dakshina. The first is the default. */
export interface PublicSessionType { id: string; name: string; minutes: number; dakshinaPaise: number; dakshina: string; active: boolean }
export interface PublicEvent {
  id: string; title: string; kind: 'satsang' | 'live' | 'meetup';
  startsAt: string; when: string; link: string | null; location: string | null; notes: string | null;
}
export interface SitePage { guru: PublicGuru; sessionTypes: PublicSessionType[]; events: PublicEvent[]; nextSlots: PublicSlot[]; openCount: number }

export interface HeldBooking { bookingId: string; payUrl: string; holdMinutes: number }
/** What /api/pay/:id says about the booking she is about to pay for. */
export interface PayView {
  status: string; orderId: string | null; keyId: string; amountPaise: number; dakshina: string; minutes?: number;
  guru: { name: string; slug: string }; when: string; phone: string; holdMinutes: number;
}
export interface BookingStatus {
  id: string; slotId: string; when: string; status: string;
  minutes?: number; dakshinaPaise: number; guruName: string; joinUrl: string | null;
}

export interface MyBooking {
  id: string; slotId: string; when: string; status: string; joinUrl: string | null;
  minutes?: number; dakshinaPaise?: number; sessionTypeId?: string | null;
  cannotReschedule: string | null; cannotCancel: string | null;
}
export interface MySessions {
  devotee: { name: string | null; phoneTail: string };
  guru: PublicGuru;
  upcoming: MyBooking[]; earlier: MyBooking[];
  credit: { balancePaise: number; expiresAt: string | null };
  sessionTypes?: PublicSessionType[];
  slots: PublicSlot[];
  said?: string; notified?: boolean;
}

// ---- Session 5: the waiting room and the room ----

export type SessionState = 'not_yours' | 'early' | 'due' | 'queued' | 'late' | 'running' | 'ended';
export interface SessionView {
  booking: { id: string; when: string; status: string; minutes: number };
  guru: { name: string };
  devotee: { name: string | null };
  state: SessionState;
  sentence: string;
  canLeave: boolean;
  video: { ready: boolean };
  minutesTogether: number | null;
  escapeAfter: string;
  messages: WaitingMessage[];
  nextEvent: { title: string; kind: string; when: string } | null;
  bookAgainPath: string;
}
export interface RoomPass { roomId: string; token: string }

/** One line of the waiting-room conversation. `from` says which side wrote it. */
export interface WaitingMessage { text: string; from: 'team' | 'devotee'; at: string }
