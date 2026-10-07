// A morning of five-minute times is a hundred open rows. The team reads it as one line per stretch.
export type Run<T> = { kind: 'one'; item: T } | { kind: 'open'; items: T[] };

/** Booked rows stay as they are; consecutive open rows fold into one stretch. */
export function collapseOpen<T extends { booking: unknown }>(items: T[]): Run<T>[] {
  const out: Run<T>[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (!item.booking && last?.kind === 'open') { last.items.push(item); continue; }
    out.push(item.booking ? { kind: 'one', item } : { kind: 'open', items: [item] });
  }
  return out;
}
