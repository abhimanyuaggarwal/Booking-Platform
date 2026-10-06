import { useWords } from './lang';
import type { AttentionRow, BookingStatus, Source } from './types';

// One vocabulary for the whole console. A booking is in exactly one state and is named by exactly
// one word, in one tone, on every screen, in the team's language. Where she came from is a separate
// mark, shown only where it matters (Money, the drawer). What she asked is a line, never a colour.

export const TONE: Record<BookingStatus, 'g' | 'o' | 'n' | 'r'> = {
  confirmed: 'g', held: 'o', completed: 'n', no_show: 'r', rescheduled: 'n', cancelled: 'n', refunded: 'r', expired: 'n',
};

/** A dot and a word. */
export function StateTag({ status }: { status: BookingStatus | string }) {
  const W = useWords();
  const word = (W.state as Record<string, string>)[status] ?? status;
  return <span className={`state ${TONE[status as BookingStatus] ?? 'n'}`}><i />{word}</span>;
}

/** The English word, for places outside React (search results, titles). */
export function stateWord(status: BookingStatus | string, words: { state: Record<string, string> } = { state: STATE_EN }): string {
  return words.state[status] ?? status;
}
const STATE_EN: Record<string, string> = { confirmed: 'Paid', held: 'Paying', completed: 'Done', no_show: 'Did not join', rescheduled: 'Moved', cancelled: 'Cancelled', refunded: 'Returned', expired: 'Hold expired' };

/** The calendar chip's colour: state only. */
export function chipClass(status: BookingStatus): 'paid' | 'hold' | 'done' | 'noshow' {
  if (status === 'confirmed') return 'paid';
  if (status === 'held') return 'hold';
  if (status === 'no_show') return 'noshow';
  return 'done';
}

export function sourceWords(s: Source | null | undefined): string {
  return ({ live: 'a live', ashram: 'the ashram', poster: 'a poster', page: 'his website', direct: 'wrote or called directly' } as Record<string, string>)[s ?? ''] ?? '';
}

export function askedAbout(b: { question: string | null; hasVoiceNote: boolean }, max = 60): string {
  if (b.question) return b.question.length > max ? `${b.question.slice(0, max - 3)}…` : b.question;
  if (b.hasVoiceNote) return 'voice note';
  return '—';
}

/** Two letters in a circle, so a list of people scans without photos. */
export function Initials({ name, size = 'm' }: { name: string | null | undefined; size?: 's' | 'm' | 'l' }) {
  const letters = initialsOf(name);
  return <span className={`avatar ${size} h${hue(letters)}`} aria-hidden="true">{letters}</span>;
}

export function initialsOf(name: string | null | undefined): string {
  const clean = (name ?? '').replace(/^…/, '').trim();
  if (!clean) return '·';
  if (/^\d+$/.test(clean)) return clean.slice(-2);
  const parts = clean.split(/\s+/).filter(Boolean);
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hue(s: string) {
  let n = 0;
  for (const c of s) n = (n * 31 + c.charCodeAt(0)) % 6;
  return n;
}

// ---- what needs her ------------------------------------------------------------------------------

export const ATTENTION_TONE: Record<AttentionRow['kind'], 'g' | 'o' | 'n' | 'r'> = {
  hold_expired: 'o', paid_too_late: 'r', did_not_join: 'n', waited_alone: 'r', waited_and_chose: 'r', refund_sent: 'n', asked_team: 'r',
};

/** Pure. Rows she must act on, and rows that only inform. */
export function groupAttention(rows: AttentionRow[]) {
  const toDecide = rows.filter((r) => r.action === 'decide' || r.action === 'send_link');
  const forTheRecord = rows.filter((r) => r.action === 'done' || r.action === 'none');
  return { toDecide, forTheRecord };
}
