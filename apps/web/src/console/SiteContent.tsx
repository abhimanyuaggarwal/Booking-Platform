import { FormEvent, useState } from 'react';
import { api } from './api';
import type { Marketing, Settings } from './types';

// The words on his website: name, domain, about, tagline, text blocks, picture, facts, themes and quote.
// Writes gurus.name, domain, about, marketing_json.
export default function SiteContent({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [name, setName] = useState(settings.name);
  const [domain, setDomain] = useState(settings.domain ?? '');
  const [guruPhone, setGuruPhone] = useState(settings.guruPhone ?? '');
  const [about, setAbout] = useState(settings.about);
  const [marketing, setMarketing] = useState<Marketing>(structuredClone(settings.marketing ?? { tagline: '', blocks: [] }));
  const hero = marketing.hero ?? { image: '', portrait: '', credit: '' };
  const facts = marketing.facts ?? [];
  const setHero = (key: 'image' | 'portrait' | 'credit', value: string) => setMarketing({ ...marketing, hero: { image: hero.image ?? '', portrait: hero.portrait ?? '', credit: hero.credit ?? '', [key]: value } });
  const setFact = (i: number, key: 'label' | 'value', value: string) => setMarketing({ ...marketing, facts: facts.map((f, j) => (j === i ? { ...f, [key]: value } : f)) });
  const [status, setStatus] = useState<{ ok?: string; problem?: string }>({});
  const [busy, setBusy] = useState(false);

  function setBlock(i: number, key: 'heading' | 'body', value: string) {
    setMarketing({ ...marketing, blocks: marketing.blocks.map((b, j) => (j === i ? { ...b, [key]: value } : b)) });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus({});
    try {
      await api('/settings/site', { method: 'PUT', json: { name, domain, about, marketing, guruPhone } });
      setStatus({ ok: 'Saved. His website shows the new words on its next load.' });
      onSaved();
    } catch (err) {
      setStatus({ problem: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="settings" onSubmit={save}>
      <section className="panel">
        <h2>Who he is</h2>
        <div className="row">
          <label>His name, as shown everywhere<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>His domain<input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="guruji.com" /></label>
          <label>His own WhatsApp number, for a note ten minutes before each sitting<input value={guruPhone} onChange={(e) => setGuruPhone(e.target.value)} placeholder="919876543210" inputMode="tel" /></label>
        </div>
        <label style={{ marginTop: 10 }}>About, one or two sentences<textarea value={about} onChange={(e) => setAbout(e.target.value)} /></label>
        <label style={{ marginTop: 10 }}>Tagline under his name<input value={marketing.tagline} onChange={(e) => setMarketing({ ...marketing, tagline: e.target.value })} /></label>
      </section>

      <section className="panel">
        <h2>Text blocks on the page</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {marketing.blocks.map((b, i) => (
            <div className="block" key={i}>
              <input value={b.heading} placeholder="Heading" onChange={(e) => setBlock(i, 'heading', e.target.value)} />
              <textarea value={b.body} placeholder="A few plain sentences" onChange={(e) => setBlock(i, 'body', e.target.value)} />
              <div><button type="button" className="quiet" onClick={() => setMarketing({ ...marketing, blocks: marketing.blocks.filter((_, j) => j !== i) })}>Remove this block</button></div>
            </div>
          ))}
          <div><button type="button" onClick={() => setMarketing({ ...marketing, blocks: [...marketing.blocks, { heading: '', body: '' }] })}>Add a block</button></div>
        </div>
      </section>

      <section className="panel">
        <h2>Picture and facts</h2>
        <div className="row">
          <label>Wide picture at the top, a web address or a path<input value={hero.image ?? ''} onChange={(e) => setHero('image', e.target.value)} placeholder="/guruji-hero.jpg" /></label>
          <label>His portrait<input value={hero.portrait ?? ''} onChange={(e) => setHero('portrait', e.target.value)} placeholder="/guruji.jpg" /></label>
        </div>
        <label style={{ marginTop: 10 }}>Photo credit, if the picture needs one<input value={hero.credit ?? ''} onChange={(e) => setHero('credit', e.target.value)} /></label>
        <label style={{ marginTop: 10 }}>A line in his words, shown as a quote<textarea value={marketing.quote ?? ''} onChange={(e) => setMarketing({ ...marketing, quote: e.target.value })} /></label>
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {facts.map((f, i) => (
            <div className="row" key={i}>
              <input value={f.label} placeholder="Tradition" onChange={(e) => setFact(i, 'label', e.target.value)} />
              <input value={f.value} placeholder="Advaita Vedanta" onChange={(e) => setFact(i, 'value', e.target.value)} />
              <button type="button" className="quiet" onClick={() => setMarketing({ ...marketing, facts: facts.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          {facts.length < 6 && <div><button type="button" onClick={() => setMarketing({ ...marketing, facts: [...facts, { label: '', value: '' }] })}>Add a fact</button></div>}
        </div>
        <label style={{ marginTop: 10 }}>What people bring to him, one phrase per line<textarea value={(marketing.themes ?? []).join('\n')} onChange={(e) => setMarketing({ ...marketing, themes: e.target.value.split('\n') })} /></label>
      </section>

      <div className="row">
        <button className="primary" disabled={busy}>Save words</button>
        {status.ok && <span className="status">{status.ok}</span>}
        {status.problem && <span className="problem">{status.problem}</span>}
      </div>
    </form>
  );
}
