import { FormEvent, useState } from 'react';
import { api } from './api';
import type { Settings } from './types';

// Two settings that are about WhatsApp, not the website: the language of every message a devotee
// receives (and of the notes to guruji), and his own number for the ten-minute note.
export default function Messages({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [guruPhone, setGuruPhone] = useState(settings.guruPhone ?? '');
  const [language, setLanguage] = useState<'en' | 'hi'>(settings.language ?? 'en');
  const [status, setStatus] = useState<{ ok?: string; problem?: string }>({});
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setStatus({});
    try {
      // The site editor and this one share one endpoint; the words are sent back unchanged.
      await api('/settings/site', { method: 'PUT', json: { name: settings.name, domain: settings.domain ?? '', about: settings.about, marketing: settings.marketing, guruPhone, language } });
      setStatus({ ok: 'Saved. Every message from now on follows this.' });
      onSaved();
    } catch (err) {
      setStatus({ problem: (err as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <form className="settings" onSubmit={save}>
      <section className="panel">
        <h2>Messages</h2>
        <div className="row">
          <label>Language of every WhatsApp message to his devotees, and of the notes to him
            <select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}>
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
            </select>
          </label>
        </div>
        <p className="muted">This panel has its own language button at the top; that one is yours, this one is theirs.</p>
      </section>
      <section className="panel">
        <h2>Guruji’s phone</h2>
        <div className="row">
          <label>His own WhatsApp number, for a note ten minutes before each sitting<input value={guruPhone} onChange={(e) => setGuruPhone(e.target.value)} placeholder="919876543210" inputMode="tel" /></label>
        </div>
        <p className="muted">Leave it empty and he gets no notes; the team can still tell him from any booking.</p>
      </section>
      <div className="row">
        <button className="primary" disabled={busy}>Save</button>
        {status.ok && <span className="status">{status.ok}</span>}
        {status.problem && <span className="problem">{status.problem}</span>}
      </div>
    </form>
  );
}
