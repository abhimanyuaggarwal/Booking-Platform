import { FormEvent, useState } from 'react';
import { api } from './api';
import type { Me } from './types';

export default function Login({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [username, setUsername] = useState('team');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/login', { method: 'POST', json: { username, password } });
      onSignedIn(await api<Me>('/me'));
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="console">
      <main className="console-main" style={{ maxWidth: 420, margin: '10vh auto' }}>
        <h1>Team console</h1>
        <p className="muted">One login for the whole team. It is in the api's .env file.</p>
        <form className="settings" onSubmit={submit}>
          <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus /></label>
          {problem && <p className="problem">{problem}</p>}
          <div><button className="primary" disabled={busy}>Sign in</button></div>
        </form>
      </main>
    </div>
  );
}
