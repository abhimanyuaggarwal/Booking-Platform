import { FormEvent, useState } from 'react';
import { api } from './api';
import { useLang, useWords } from './lang';
import type { Me } from './types';

type Mode = 'phone' | 'code' | 'admin';

// One screen for everyone: phone and password. First time here, or forgotten it: a code on WhatsApp,
// then a new password. The shared admin password from .env stays behind one small link.
export default function Login({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const W = useWords();
  const { lang, setLang } = useLang();
  const [mode, setMode] = useState<Mode>('phone');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [username, setUsername] = useState('team');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<void>) {
    setBusy(true); setProblem(null);
    try { await work(); } catch (err) { setProblem((err as Error).message); } finally { setBusy(false); }
  }
  const finish = async () => onSignedIn(await api<Me>('/me'));

  async function signIn(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (mode === 'admin') await api('/login', { method: 'POST', json: { username, password } });
      else await api('/login', { method: 'POST', json: { phone, password } });
      await finish();
    });
  }
  async function sendCode(e: FormEvent) {
    e.preventDefault();
    await run(async () => { await api('/login/code', { method: 'POST', json: { phone } }); setCodeSent(true); });
  }
  async function setNewPassword(e: FormEvent) {
    e.preventDefault();
    await run(async () => { await api('/login/password', { method: 'POST', json: { phone, code, password } }); await finish(); });
  }

  return (
    <div className="console login">
      <main className="login-card">
        <p className="eyebrow">{W.product}</p>
        <h1>{W.login.title}</h1>
        <p className="muted">{W.login.hint}</p>

        {mode === 'phone' && (
          <form className="settings" onSubmit={signIn}>
            <label>{W.login.phone}<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="username" placeholder="91 98765 43210" autoFocus required /></label>
            <label>{W.login.password}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
            {problem && <p className="problem">{problem}</p>}
            <div className="row"><button className="primary" disabled={busy}>{W.login.signIn}</button><button type="button" className="quiet" onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}>{W.nav.language}</button></div>
            <p className="muted small links"><button type="button" className="plain" onClick={() => { setMode('code'); setProblem(null); }}>{W.login.firstTime}</button> · <button type="button" className="plain" onClick={() => { setMode('admin'); setProblem(null); }}>{W.login.adminDoor}</button></p>
          </form>
        )}

        {mode === 'code' && !codeSent && (
          <form className="settings" onSubmit={sendCode}>
            <label>{W.login.phone}<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="91 98765 43210" autoFocus required /></label>
            {problem && <p className="problem">{problem}</p>}
            <div className="row"><button className="primary" disabled={busy}>{W.login.sendCode}</button><button type="button" className="quiet" onClick={() => setMode('phone')}>{W.login.back}</button></div>
          </form>
        )}

        {mode === 'code' && codeSent && (
          <form className="settings" onSubmit={setNewPassword}>
            <p className="banner ok">{W.login.codeSent}</p>
            <label>{W.login.code}<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required /></label>
            <label>{W.login.newPassword}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
            {problem && <p className="problem">{problem}</p>}
            <div className="row"><button className="primary" disabled={busy}>{W.login.setPassword}</button><button type="button" className="quiet" onClick={() => { setCodeSent(false); setMode('phone'); }}>{W.login.back}</button></div>
          </form>
        )}

        {mode === 'admin' && (
          <form className="settings" onSubmit={signIn}>
            <label>{W.login.username}<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>
            <label>{W.login.password}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus /></label>
            {problem && <p className="problem">{problem}</p>}
            <div className="row"><button className="primary" disabled={busy}>{W.login.signIn}</button><button type="button" className="quiet" onClick={() => setMode('phone')}>{W.login.phoneDoor}</button></div>
          </form>
        )}
      </main>
    </div>
  );
}
