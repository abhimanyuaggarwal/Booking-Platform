import { Link } from 'react-router-dom';

// The root of the platform's own host (and of localhost). Nobody's site lives here, so the three
// surfaces are one click away. A guru's own domain never shows this: his site answers at its root.
export default function FrontDoor() {
  return (
    <main className="surface-warm shell">
      <h1>Expert Sessions</h1>
      <ul>
        <li><Link to="/s/guruji">His website (preview)</Link></li>
        <li><Link to="/guru">Guruji's calendar</Link></li>
        <li><Link to="/console">Team console</Link></li>
      </ul>
    </main>
  );
}
