import type { AttentionRow, BookingStatus, Source } from './types';

// One vocabulary for the whole console. A booking is in exactly one state and is named by exactly
// one word, in one tone, on every screen. Where she came from is a separate mark, shown only where
// it matters (Money, the drawer). What she asked is a separate line, never a colour.

export const STATE: Record<BookingStatus, { word: string; tone: 'g' | 'o' | 'n' | 'r' }> = {
  confirmed: { word: 'Paid', tone: 'g' },
  held: { word: 'Paying', tone: 'o' },
  completed: { word: 'Done', tone: 'n' },
  no_show: { word: 'Did not join', tone: 'r' },
  rescheduled: { word: 'Moved', tone: 'n' },
  cancelled: { word: 'Cancelled', tone: 'n' },
  refunded: { word: 'Returned', tone: 'r' },
  expired: { word: 'Hold expired', tone: 'n' },
};

export function stateWord(status: BookingStatus | string): string {
  return STATE[status as BookingStatus]?.word ?? status;
}

export function StateTag({ status }: { status: BookingStatus | string }) {
  const s = STATE[status as BookingStatus] ?? { word: status, tone: 'n' as const };
  return <span className={`tag ${s.tone}`}>{s.word}</span>;
}

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

// ---- what needs her ------------------------------------------------------------------------------

export const ATTENTION_WORDS: Record<AttentionRow['kind'], string> = {
  hold_expired: 'Chose a time, did not pay',
  paid_too_late: 'Paid after the hold ran out',
  did_not_join: 'Did not join',
  waited_alone: 'Waited, guruji did not sit',
  waited_and_chose: 'Waited, guruji did not sit',
  refund_sent: 'Dakshina returned',
};

export const ATTENTION_TONE: Record<AttentionRow['kind'], 'g' | 'o' | 'n' | 'r'> = {
  hold_expired: 'o', paid_too_late: 'r', did_not_join: 'n', waited_alone: 'r', waited_and_chose: 'r', refund_sent: 'n',
};

/** Pure. Rows she must act on, and rows that only inform. */
export function groupAttention(rows: AttentionRow[]) {
  const toDecide = rows.filter((r) => r.action === 'decide' || r.action === 'send_link');
  const forTheRecord = rows.filter((r) => r.action === 'done' || r.action === 'none');
  return { toDecide, forTheRecord };
}
