import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from './api';
import { useWords } from './lang';
import type { GuruSummary } from './types';

const slugOf = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// Three fields make a draft. Everything else is a step on his Setup page.
export default function GuruNew() {
  const W = useWords();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [language, setLanguage] = useState<'en' | 'hi'>('hi');
  const [domain, setDomain] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setProblem(null);
    try {
      const g = await api<GuruSummary>('/admin/gurus', { method: 'POST', json: { name, slug, language, domain: domain || undefined } });
      navigate(`/console/gurus/${g.slug}`, { state: { created: true } });
    } catch (err) { setProblem((err as Error).message); setBusy(false); }
  }

  return (
    <>
      <p className="crumb"><Link to="/console/gurus"><ArrowLeft size={14} aria-hidden="true" /> {W.gurus.title}</Link></p>
      <header className="bar page"><div><h1>{W.gurus.newTitle}</h1><p className="page-line">{W.gurus.newLine}</p></div></header>
      <form className="settings narrow" onSubmit={submit}>
        <section className="panel">
          <label>{W.gurus.newName}<input value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugOf(e.target.value)); }} maxLength={80} required autoFocus /></label>
          <label style={{ marginTop: 12 }}>{W.gurus.newSlug}<input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} pattern="[a-z0-9-]+" required /></label>
          <p className="muted small">{W.gurus.newSlugHint}</p>
          <label style={{ marginTop: 12 }}>{W.gurus.newLanguage}
            <select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}><option value="hi">हिंदी</option><option value="en">English</option></select>
          </label>
          <label style={{ marginTop: 12 }}>{W.gurus.newDomain}<input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="guruji.com" /></label>
        </section>
        {problem && <p className="banner problem">{problem}</p>}
        <div className="row"><button className="primary" disabled={busy}>{W.gurus.create}</button></div>
      </form>
    </>
  );
}
