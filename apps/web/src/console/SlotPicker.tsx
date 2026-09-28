import { useEffect, useState } from 'react';
import type { PublicSlots } from './types';

// The open times, from the same list both doors offer. Grouped by day so a long list stays readable.
export default function SlotPicker({ guruSlug, value, onChange, excludeDate, name }: {
  guruSlug: string; value: string; onChange: (slotId: string) => void; excludeDate?: string; name?: string;
}) {
  const [slots, setSlots] = useState<PublicSlots['slots'] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/gurus/${guruSlug}/slots`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`The api answered ${r.status}`))))
      .then((d: PublicSlots) => { if (live) setSlots(d.slots); })
      .catch((err: Error) => { if (live) setProblem(err.message); });
    return () => { live = false; };
  }, [guruSlug]);

  if (problem) return <span className="problem">{problem}</span>;
  if (!slots) return <span className="muted">Loading open times.</span>;
  const usable = slots.filter((s) => !excludeDate || !s.id.startsWith(`slot:${excludeDate}`));
  if (usable.length === 0) return <span className="muted">No open times in the days ahead. Open more in Settings.</span>;

  const byDay = new Map<string, PublicSlots['slots']>();
  for (const s of usable) {
    const day = s.label.split(' ')[0];
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  return (
    <select name={name} value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">Pick a time</option>
      {[...byDay.entries()].map(([day, list]) => (
        <optgroup key={day} label={day}>
          {list.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
