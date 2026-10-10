import { useState } from 'react';
import { parseSlotId } from '@expert-sessions/shared';
import type { PublicSlot } from './types';

// Every open time, one day at a time: the days in a row, then the times of the chosen day as
// chips. When his team offers starts every five minutes a day holds a hundred times, and chips
// keep that readable on a phone where a list of a hundred rows would not be.
export default function TimeChooser({ slots, chosen, onChoose }: { slots: PublicSlot[]; chosen?: string; onChoose: (s: PublicSlot) => void }) {
  const days = groupByDay(slots);
  const [picked, setPicked] = useState<string | null>(null);
  const current = days.find((d) => d.date === picked) ?? days[0];
  if (!current) return null;

  return (
    <div className="chooser">
      <div className="days">
        {days.map((d) => (
          <button key={d.date} type="button" aria-pressed={d.date === current.date} className={d.date === current.date ? 'on' : undefined} onClick={() => setPicked(d.date)}>
            <b>{d.word}</b><span>{d.slots.length}</span>
          </button>
        ))}
      </div>
      <div className="chips">
        {current.slots.map((s) => (
          <button key={s.id} type="button" className={s.id === chosen ? 'chip on' : 'chip'} aria-pressed={s.id === chosen} onClick={() => onChoose(s)}>{timeOf(s.label)}</button>
        ))}
      </div>
    </div>
  );
}

/** Pure. Open times grouped by their IST day, each day named the way its labels are: Today, Tomorrow, Wed 30. */
export function groupByDay(slots: PublicSlot[]): { date: string; word: string; slots: PublicSlot[] }[] {
  const days: { date: string; word: string; slots: PublicSlot[] }[] = [];
  for (const s of slots) {
    const date = s.id.slice(5, 15);
    let day = days.find((d) => d.date === date);
    if (!day) {
      const word = s.label.split(' ')[0];
      day = { date, word: word === 'Today' || word === 'Tomorrow' ? word : `${word} ${parseSlotId(s.id).getUTCDate()}`, slots: [] };
      days.push(day);
    }
    day.slots.push(s);
  }
  return days;
}

/** "Today 4:15 pm" -> "4:15 pm" */
export function timeOf(label: string) {
  return label.split(' ').slice(1).join(' ');
}
