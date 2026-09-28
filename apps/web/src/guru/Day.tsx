import { useState } from 'react';
import type { DayItem, GuruDay, SessionItem } from './types';

// His day, as the mockup has it: times down the left, sessions beside them, rest where the day is
// empty. Nothing here says what anything cost.
export default function Day({ day, said, onJoin }: { day: GuruDay; said: string | null; onJoin: (s: SessionItem) => void }) {
  return (
    <main className="wrap">
      <p className="date">{day.dateLabel}</p>
      <h1>{day.greeting}</h1>
      <p className="summary">{day.summary}</p>
      {said && <p className="said">{said}</p>}
      {day.items.length === 0 && <p className="summary">Nothing is booked. The day is yours.</p>}
      {day.items.map((item, i) => <Item key={itemKey(item, i)} item={item} onJoin={onJoin} />)}
      <p className="foot">Your team looks after bookings, payments and questions.</p>
    </main>
  );
}

function itemKey(item: DayItem, i: number) {
  return item.kind === 'rest' ? `rest-${i}` : item.id;
}

function Item({ item, onJoin }: { item: DayItem; onJoin: (s: SessionItem) => void }) {
  if (item.kind === 'rest') {
    return <div className="rest"><span className="t">{item.when}</span>rest</div>;
  }
  if (item.kind === 'event') {
    return (
      <div className="tl satsang">
        <span className="t">{item.time}</span><span className="dot" />
        <span className="k">{item.eventKind === 'meetup' ? 'Meetup' : item.eventKind === 'live' ? 'Live · open to all' : 'Satsang · open to all'}</span>
        <b>{item.title}</b>
        {(item.notes || item.location) && <i>{[item.location, item.notes].filter(Boolean).join(' · ')}</i>}
      </div>
    );
  }
  return <Sitting session={item} onJoin={onJoin} />;
}

function Sitting({ session, onJoin }: { session: SessionItem; onJoin: (s: SessionItem) => void }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className={`tl${session.done ? ' done' : ''}`}>
      <span className="t">{session.time}</span><span className="dot" />
      <span className="k">One to one · {session.minutes} min</span>
      <b>{session.name}</b>
      <i>{session.context}</i>
      {session.voiceNote && (
        playing
          ? <audio className="voice" src={session.voiceNote} controls autoPlay />
          : <button className="voice" onClick={() => setPlaying(true)}>🎙 Play her message</button>
      )}
      {session.waiting && !session.done && <p className="waitingnow">She is waiting for you.</p>}
      {session.canJoin && <button className="join" onClick={() => onJoin(session)}>{session.joinWords}</button>}
      {session.done && <i>Complete.</i>}
    </div>
  );
}
