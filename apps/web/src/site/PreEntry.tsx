import { useState } from 'react';
import type { SessionView } from './types';
import { useStreamOn, type Check } from './useSelfView';

// The three things that ruin a call, checked while it still costs nothing to fix them.
// She also sees how she will look, which quietly settles nerves. The camera itself belongs to
// useSelfView in Join, so that stepping into the waiting room does not switch it off.
export default function PreEntry({ view, stream, mic, camera, connection, problem, openElsewhere, onEnter }: {
  view: SessionView; stream: MediaStream | null; mic: Check; camera: Check; connection: Check;
  problem: string | null; openElsewhere: boolean; onEnter: () => void;
}) {
  const videoRef = useStreamOn(stream);
  if (openElsewhere) return <OpenInSafari view={view} />;
  return (
    <PreEntryView view={view} mic={mic} camera={camera} connection={connection} problem={problem} onEnter={onEnter}>
      <video ref={videoRef} autoPlay playsInline muted className="selfview" />
    </PreEntryView>
  );
}

/**
 * She opened her link inside WhatsApp on an iPhone, where no browser can reach the camera. Sending
 * her into a room she cannot be seen or heard in would be worse than stopping her here — so we
 * stop, and give her the one thing that fixes it.
 */
export function OpenInSafari({ view, onCopy }: { view: SessionView; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === 'undefined' ? '' : window.location.href;

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); onCopy?.(); }
    catch { setCopied(false); }
  }

  return (
    <main className="wrap session">
      <p className="eyebrow">{view.booking.when}</p>
      <h1>Please open this in Safari</h1>
      <p>This window cannot reach your camera or microphone, so {view.guru.name} would not be able to see or hear you.</p>
      <p className="muted">Tap the ⋯ or share button at the bottom of this screen and choose <b>Open in Safari</b>. Everything else is ready — your time is held.</p>
      <div className="linkbox">
        <code>{link}</code>
        <button className="ghost" onClick={copy}>{copied ? 'Copied' : 'Copy the link'}</button>
      </div>
      <p className="held">Nothing is recorded.</p>
    </main>
  );
}

export function PreEntryView({ view, mic, camera, connection, problem, onEnter, children }: {
  view: SessionView; mic: Check; camera: Check; connection: Check; problem: string | null; onEnter: () => void; children?: React.ReactNode;
}) {
  return (
    <main className="wrap session">
      <p className="eyebrow">{view.booking.when}</p>
      <h1>Your session with {view.guru.name}</h1>
      <p className="muted">{view.booking.minutes} minutes, only the two of you.</p>

      <div className="preview">
        {children}
        <p className="muted caption">This is how {view.guru.name} will see you</p>
      </div>

      <ul className="checks">
        <li className={mic}>{word(mic, 'Microphone')}</li>
        <li className={camera}>{word(camera, 'Camera')}</li>
        <li className={connection}>{word(connection, 'Connection')}</li>
      </ul>
      {problem && <p className="muted">{problem}</p>}

      <button className="primary" onClick={onEnter}>Enter the waiting room</button>
      <p className="held">Nothing is recorded.</p>
    </main>
  );
}

function word(state: Check, thing: string) {
  if (state === 'checking') return `Checking your ${thing.toLowerCase()}`;
  if (state === 'good') return `${thing} is working`;
  return thing === 'Connection' ? 'Your connection is slow — sound will hold even if the picture does not' : `${thing} is not available`;
}
