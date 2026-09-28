// A cancelled booking keeps its dakshina as a credit for thirty days (CLAUDE.md cancellation policy).
// Credits are not a table: they are ledger_entries of kind credit_issued, spent by credit_used.

import { query } from './db.js';

/**
 * Pure: match credit_used rows against credit_issued rows oldest first, and report what is left
 * that has not expired. Every v1 credit is one dakshina, so the matching is one voucher at a time.
 * @returns {{ balancePaise: number, vouchers: {amountPaise: number, expiresAt: Date}[] }}
 */
export function creditBalance(issued, used, now = new Date()) {
  const vouchers = [...issued]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((r) => ({ amountPaise: r.amount_paise, expiresAt: r.expires_at ? new Date(r.expires_at) : null, left: r.amount_paise }));

  let toSpend = used.reduce((sum, r) => sum + r.amount_paise, 0);
  for (const v of vouchers) {
    if (toSpend <= 0) break;
    const taken = Math.min(v.left, toSpend);
    v.left -= taken;
    toSpend -= taken;
  }

  const live = vouchers.filter((v) => v.left > 0 && (!v.expiresAt || v.expiresAt > now));
  return {
    balancePaise: live.reduce((sum, v) => sum + v.left, 0),
    vouchers: live.map((v) => ({ amountPaise: v.left, expiresAt: v.expiresAt })),
  };
}

/** What this devotee may spend with this guru right now. */
export async function creditFor(guruId, devoteeId) {
  const { rows } = await query(
    `select kind, amount_paise, expires_at, created_at from ledger_entries
      where guru_id = $1 and devotee_id = $2 and kind in ('credit_issued', 'credit_used') order by created_at`,
    [guruId, devoteeId]);
  return creditBalance(rows.filter((r) => r.kind === 'credit_issued'), rows.filter((r) => r.kind === 'credit_used'));
}
