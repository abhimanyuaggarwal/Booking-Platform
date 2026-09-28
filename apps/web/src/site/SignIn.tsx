import { FormEvent, useState } from 'react';
import { siteApi } from './api';
import type { MySessions } from './types';

// One code, no password. Her number is the only identity the system keeps, and it is the one she
// already gave when she booked.
export default function SignIn({ call, onSignedIn }: { call: ReturnType<typeof siteApi>; onSignedIn: (s: MySessions) => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const r = await call<{ sentTo: string; mock: boolean }>('/otp/request', { method: 'POST', json: { phone } });
      setSentTo(r.sentTo);
      setMock(r.mock);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function check(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onSignedIn(await call<MySessions>('/otp/verify', { method: 'POST', json: { phone, code } }));
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="wrap" style={{ paddingTop: 44, maxWidth: 420 }}>
      <h1>My sessions</h1>
      {!sentTo ? (
        <form onSubmit={ask}>
          <div className="field">
            <label htmlFor="phone">Your WhatsApp number</label>
            <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91 98765 43210" autoFocus required />
          </div>
          {problem && <p className="problem">{problem}</p>}
          <button className="primary" disabled={busy}>Send me a code</button>
          <p className="muted" style={{ fontSize: 14, marginTop: 14 }}>No password. Your number is how we find your sessions.</p>
        </form>
      ) : (
        <form onSubmit={check}>
          {mock ? <p className="muted">Enter the code for {sentTo}.</p> : <p className="muted">We sent a code to {sentTo}.</p>}
          <div className="field">
            <label htmlFor="code">Code</label>
            <input id="code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoFocus required />
          </div>
          {mock && <p className="muted" style={{ fontSize: 14 }}>While we are testing, the code is 1234.</p>}
          {problem && <p className="problem">{problem}</p>}
          <button className="primary" disabled={busy}>Continue</button>
          <button type="button" className="ghost" onClick={() => { setSentTo(null); setCode(''); setProblem(null); }}>Use another number</button>
        </form>
      )}
    </main>
  );
}
