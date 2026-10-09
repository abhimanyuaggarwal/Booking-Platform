import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// The root of the platform's own host (and of localhost). Nobody's site lives here, so the three
// surfaces are one click away. A guru's own domain never shows this: his site answers at its root.
export default function FrontDoor() {
  const [gurus, setGurus] = useState<{ slug: string; name: string }[] | null>(null);
  useEffect(() => {
    fetch('/api/gurus').then((r) => (r.ok ? r.json() : [])).then(setGurus).catch(() => setGurus([]));
  }, []);
  return (
    <main className="surface-warm shell">
      <h1>Samvad</h1>
      <ul>
        {(gurus ?? []).map((g) => <li key={g.slug}><Link to={`/s/${g.slug}`}>{g.name}'s website (preview)</Link></li>)}
        {gurus && gurus.length === 0 && <li className="muted">No guru is live here yet.</li>}
        <li><Link to="/guru">Guruji's calendar</Link></li>
        <li><Link to="/console">Team console</Link></li>
      </ul>
    </main>
  );
}
