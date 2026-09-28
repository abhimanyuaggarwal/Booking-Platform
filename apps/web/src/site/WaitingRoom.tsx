import { useEffect, useRef, useState } from 'react';
import type { SessionView, WaitingMessage } from './types';
import { useStreamOn } from './useSelfView';

// She has entered somewhere. Her own face is on the screen, his team can reach her, and she can
// answer — so the wait is a room she is sitting in, not a notice she is reading. The truth about
// how long is still a sentence, never a countdown.
export default function WaitingRoom({ view, stream, cameraProblem, onChoose, onSay }: {
  view: SessionView; stream: MediaStream | null; cameraProblem: string | null;
  onChoose: (choice: 'another_time' | 'dakshina_back') => Promise<string>;
  onSay: (text: string) => Promise<void>;
}) {
  const videoRef = useStreamOn(stream);
  return (
    <WaitingRoomView view={view} onChoose={onChoose} onSay={onSay} ready={Boolean(stream)}>
      {/* No camera is not an error here — she can still be heard, and an empty grey box
          with "You are ready" under it is the worst thing this screen could show. */}
      {stream
        ? <video ref={videoRef} autoPlay playsInline muted className="selfview" />
        : <div className="selfview off"><p>{cameraProblem ? 'Your camera is off. You can still join and speak — guruji will hear you.' : 'Turning on your camera.'}</p></div>}
    </WaitingRoomView>
  );
}

export function WaitingRoomView({ view, onChoose, onSay, children, ready = true }: {
  view: SessionView;
  onChoose: (choice: 'another_time' | 'dakshina_back') => Promise<string>;
  onSay: (text: string) => Promise<void>;
  children?: React.ReactNode;
  ready?: boolean;
}) {
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(choice: 'another_time' | 'dakshina_back') {
    setBusy(true);
    try { setSaid(await onChoose(choice)); }
    catch (err) { setSaid((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <main className="wrap session waiting">
      <div className="seat">
        {children}
        <p className="muted caption">{ready ? 'You are ready' : 'Sound only'}</p>
      </div>

      <div className="word">
        {view.canLeave ? <h1>{view.guru.name} has not been able to join</h1> : <h1>{view.sentence}</h1>}
        {view.canLeave && <p>{view.sentence}</p>}
      </div>

      <Conversation messages={view.messages} guruName={view.guru.name} onSay={onSay} />

      {view.canLeave && !said && (
        <div className="choices">
          <button className="primary" disabled={busy} onClick={() => choose('another_time')}>Choose another time</button>
          <button className="ghost" disabled={busy} onClick={() => choose('dakshina_back')}>Ask for the dakshina back</button>
          <p className="muted caption">His team can see you were waiting, and will settle it with you.</p>
        </div>
      )}
      {said && <p className="ok">{said}</p>}

      <p className="muted foot">This conversation will be only between you and {view.guru.name}.</p>
    </main>
  );
}

// Always on screen, empty or not: she should know someone can see her before she needs them to.
function Conversation({ messages, guruName, onSay }: { messages: WaitingMessage[]; guruName: string; onSay: (text: string) => Promise<void> }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const foot = useRef<HTMLDivElement>(null);

  useEffect(() => { foot.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setProblem(null);
    try {
      await onSay(text);
      setDraft('');
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="channel">
      <p className="eyebrow">His team</p>
      {messages.length === 0
        ? <p className="muted">They can see you are here. Write to them if you need anything while you wait.</p>
        : (
          <ol className="said">
            {messages.map((m, i) => (
              <li key={i} className={m.from === 'devotee' ? 'mine' : 'theirs'}>
                <span className="who">{m.from === 'devotee' ? 'You' : `${guruName}'s team`}</span>
                <span className="text">{m.text}</span>
              </li>
            ))}
          </ol>
        )}
      <div ref={foot} />

      <form className="say" onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write to his team"
          maxLength={500}
          aria-label="Write to his team"
          disabled={sending}
        />
        <button className="ghost" type="submit" disabled={sending || !draft.trim()}>Send</button>
      </form>
      {problem && <p className="problem">{problem}</p>}
    </section>
  );
}
