// Shapes the api returns under /api/guru (apps/api/src/guru-routes.js). No money appears here.

export interface RestItem { kind: 'rest'; when: 'morning' | 'afternoon' | 'evening' }
export interface SessionItem {
  kind: 'session'; id: string; time: string; minutes: number; name: string; context: string;
  voiceNote: string | null; status: string; startedAt: string | null; endedAt: string | null;
  waiting: boolean; canJoin: boolean; joinWords: string | null; done: boolean;
}
export interface EventItem {
  kind: 'event'; id: string; time: string; minutes: number; title: string;
  eventKind: 'satsang' | 'live' | 'meetup'; link: string | null; location: string | null; notes: string | null;
}
export type DayItem = RestItem | SessionItem | EventItem;

export interface GuruDay { date: string; dateLabel: string; greeting: string; summary: string; items: DayItem[] }
export interface DevoteeCard { name: string; context: string; time: string }
export interface RoomPass { roomId: string; token: string; devotee: DevoteeCard | null }
