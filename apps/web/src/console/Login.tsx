import { FormEvent, useState } from 'react';
import { api } from './api';
import { useLang, useWords } from './lang';
import type { Me } from './types';

export default function Login({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const W = useWords();
  const { lang, setLang } = useLang();
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
    <div className="console login">
      <main className="login-card">
        <p className="eyebrow">{W.product}</p>
        <h1>{W.login.title}</h1>
        <p className="muted">{W.login.hint}</p>
        <form className="settings" onSubmit={submit}>
          <label>{W.login.username}<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>
          <label>{W.login.password}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus /></label>
          {problem && <p className="problem">{problem}</p>}
          <div className="row"><button className="primary" disabled={busy}>{W.login.signIn}</button><button type="button" className="quiet" onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}>{W.nav.language}</button></div>
        </form>
      </main>
    </div>
  );
}
