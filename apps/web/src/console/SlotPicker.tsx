import { useEffect, useState } from 'react';
import { parseSlotId } from '@expert-sessions/shared';
import type { PublicSlots } from './types';

// The open times, from the same list both doors offer: first the day, then the time of that day.
// Two short lists instead of one long one, so a guru whose doors offer every five-minute mark
// does not hand the team a select of two thousand rows.
export default function SlotPicker({ guruSlug, value, onChange, excludeDate, name, typeId }: {
  guruSlug: string; value: string; onChange: (slotId: string) => void; excludeDate?: string; name?: string; typeId?: string;
}) {
  const [slots, setSlots] = useState<PublicSlots['slots'] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [day, setDay] = useState<string>(value ? value.slice(5, 15) : '');

  useEffect(() => {
    let live = true;
    setSlots(null);
    fetch(`/api/gurus/${guruSlug}/slots${typeId ? `?type=${encodeURIComponent(typeId)}` : ''}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`The api answered ${r.status}`))))
      .then((d: PublicSlots) => { if (live) setSlots(d.slots); })
      .catch((err: Error) => { if (live) setProblem(err.message); });
    return () => { live = false; };
  }, [guruSlug, typeId]);

  if (problem) return <span className="problem">{problem}</span>;
  if (!slots) return <span className="muted">Loading open times.</span>;
  const usable = slots.filter((s) => !excludeDate || !s.id.startsWith(`slot:${excludeDate}`));
  if (usable.length === 0) return <span className="muted">No open times in the days ahead. Open more in Settings.</span>;

  const days = daysOf(usable);
  const current = days.find((d) => d.date === day) ?? days[0];
  return (
    <span className="slotpicker">
      <select aria-label="Day" value={current.date} onChange={(e) => { setDay(e.target.value); onChange(''); }}>
        {days.map((d) => <option key={d.date} value={d.date}>{d.word}</option>)}
      </select>
      <select name={name} aria-label="Time" value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Pick a time</option>
        {current.slots.map((s) => <option key={s.id} value={s.id}>{s.label.split(' ').slice(1).join(' ')}</option>)}
      </select>
    </span>
  );
}

function daysOf(slots: PublicSlots['slots']) {
  const days: { date: string; word: string; slots: PublicSlots['slots'] }[] = [];
  for (const s of slots) {
    const date = s.id.slice(5, 15);
    let d = days.find((x) => x.date === date);
    if (!d) {
      const word = s.label.split(' ')[0];
      d = { date, word: word === 'Today' || word === 'Tomorrow' ? word : `${word} ${parseSlotId(s.id).getUTCDate()}`, slots: [] };
      days.push(d);
    }
    d.slots.push(s);
  }
  return days;
}
