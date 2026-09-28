import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSessionState } from './useSessionState';
import { useSelfView } from './useSelfView';
import PreEntry from './PreEntry';
import WaitingRoom from './WaitingRoom';
import VideoRoom from './VideoRoom';
import type { RoomPass, SessionView } from './types';
import './site.css';

// Her session, end to end: the check, the wait, the room, the way out, and the closing screen.
// Nothing here depends on which domain she came in on — the booking id in her link is enough.
export default function Join() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { view, error, reload } = useSessionState(bookingId!);
  // Asked for once, held across the check and the waiting room, released when she leaves.
  const self = useSelfView();
  const [entered, setEntered] = useState(false);
  const [pass, setPass] = useState<RoomPass | null>(null);
  const [roomProblem, setRoomProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);   // bumping this asks again
  const [left, setLeft] = useState(false);     // she pressed leave; she is not chased back in

  /**
   * Guruji has joined: fetch her way in. This used to be asked exactly once — so a single failed
   * request, one blink of signal, left her on "Opening the room" for the whole half hour with
   * nothing trying again. It now retries, and she can ask herself.
   */
  useEffect(() => {
    if (view?.state !== 'running' || pass || left) return;
    let live = true;
    let retry: ReturnType<typeof setTimeout>;
    fetch(`/api/session/${bookingId}/token`, { method: 'POST', credentials: 'same-origin' })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'The room did not open.');
        if (!live) return;
        setPass(body as RoomPass);
        setRoomProblem(null);
      })
      .catch((err: Error) => {
        if (!live) return;
        setRoomProblem(err.message);
        // Backing off to ten seconds: long enough not to hammer a struggling connection, short
        // enough that she is in the room before she gives up on us.
        retry = setTimeout(() => setAttempt((n) => n + 1), Math.min(10000, 2000 * (attempt + 1)));
      });
    return () => { live = false; clearTimeout(retry); };
  }, [view?.state, bookingId, pass, left, attempt]);

  /** She left the room, or was dropped. The session is still running, so let her walk back in. */
  function rejoin() {
    setLeft(false);
    setRoomProblem(null);
    setAttempt((n) => n + 1);
  }

  // Her own words to his team while she waits. The socket echoes it back into view.messages,
  // so nothing is added here optimistically and she never sees a message twice.
  async function say(text: string) {
    const res = await fetch(`/api/session/${bookingId}/say`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'That did not reach them. Please try once more.');
  }

  async function choose(choice: 'another_time' | 'dakshina_back') {
    const res = await fetch(`/api/session/${bookingId}/escape`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ choice }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'That did not go through. Please try once more.');
    return body.said as string;
  }

  if (error) return <div className="site"><main className="wrap session"><p className="problem">{error}</p></main></div>;
  if (!view) return <div className="site"><main className="wrap session"><p className="muted">One moment.</p></main></div>;

  return (
    <div className="site">
      {view.state === 'ended' ? <Ended view={view} />
        : view.state === 'not_yours' ? <main className="wrap session"><h1>This link is no longer open</h1><p className="muted">{view.sentence}</p></main>
        : view.state === 'running' && pass ? <VideoRoom view={view} token={pass.token} onLeave={() => { setPass(null); setLeft(true); reload(); }} />
        : view.state === 'running'
          ? (
            <main className="wrap session">
              <h1>{view.guru.name} has joined</h1>
              <p className="muted">{left ? 'You left the room. He is still there.' : roomProblem ?? 'Opening the room.'}</p>
              {(left || roomProblem) && <button className="primary" onClick={rejoin}>{left ? 'Go back in' : 'Try again'}</button>}
            </main>
          )
        : !entered ? <PreEntry view={view} stream={self.stream} mic={self.mic} camera={self.camera} connection={self.connection} problem={self.problem} openElsewhere={self.openElsewhere} onEnter={() => setEntered(true)} />
        : <WaitingRoom view={view} stream={self.stream} cameraProblem={self.problem} onChoose={choose} onSay={say} />}
    </div>
  );
}

// Afterwards: what happened, when the next satsang is, and a quiet way to book again.
// No rating, no survey.
export function Ended({ view }: { view: SessionView }) {
  return (
    <main className="wrap session">
      <h1>Your session is complete</h1>
      {view.minutesTogether && <p>{view.minutesTogether} {view.minutesTogether === 1 ? 'minute' : 'minutes'} with {view.guru.name}.</p>}
      {view.nextEvent && <p className="muted">The next {view.nextEvent.kind === 'meetup' ? 'meetup' : 'satsang'} is {view.nextEvent.when}, open to all.</p>}
      <Link className="primary" to={`/s/${view.bookAgainPath}`}>Book another time</Link>
      <p className="held">You can close this screen.</p>
    </main>
  );
}
