import { FormEvent, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Circle, ExternalLink } from 'lucide-react';
import { formatRupees } from '@expert-sessions/shared';
import { api, useApi } from './api';
import { useWords } from './lang';
import { StatusBadge } from './Gurus';
import type { GuruDetail, Me, ReadinessStep, StepKey } from './types';

// One guru's setup: his status and the switch, the nine steps with a why and a way in, the
// subscription Slike charges him, his business details, his team, and what changed.
export default function GuruSetup({ me }: { me: Me }) {
  const { slug } = useParams();
  const { state } = useLocation() as { state?: { created?: boolean } };
  const { data, error, reload } = useApi<GuruDetail>(`/admin/gurus/${slug}`);
  if (error) return <p className="banner problem">{error}</p>;
  if (!data) return <p className="muted">…</p>;
  return <GuruSetupView g={data} me={me} justCreated={!!state?.created} onChanged={reload} />;
}

const STEP_LINKS: Record<StepKey, string | null> = {
  identity: '/console/settings/website', address: null, team: '/console/settings/access', sittings: '/console/settings/kinds',
  payments: null, whatsapp: null, distribution: '/console/settings/qr', business: null, live: null,
};

export function GuruSetupView({ g, me, justCreated = false, onChanged }: { g: GuruDetail; me: Me; justCreated?: boolean; onChanged: () => void }) {
  const W = useWords();
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'problem' } | null>(justCreated ? { text: W.gurus.created(g.name), tone: 'ok' } : null);
  const [busy, setBusy] = useState(false);

  async function act(work: () => Promise<string>) {
    setBusy(true); setNote(null);
    try { setNote({ text: await work(), tone: 'ok' }); onChanged(); } catch (err) { setNote({ text: (err as Error).message, tone: 'problem' }); } finally { setBusy(false); }
  }
  const setStatus = (status: GuruDetail['status']) => act(async () => { await api(`/admin/gurus/${g.slug}/status`, { method: 'POST', json: { status } }); return W.gurus.saved; });
  // The team's screens for this guru open after switching the admin's view to him.
  async function openAs(path = '/console') {
    await api('/view-as', { method: 'POST', json: { slug: g.slug } });
    window.location.assign(path);
  }

  const line = g.status === 'live' ? W.gurus.live : g.status === 'paused' ? W.gurus.pausedLine : g.status === 'draft' ? W.gurus.draftLine : W.gurus.settingUpLine;
  return (
    <>
      <p className="crumb"><Link to="/console/gurus"><ArrowLeft size={14} aria-hidden="true" /> {W.gurus.title}</Link></p>
      <header className="bar page">
        <div><h1>{W.gurus.setupTitle(g.name)} <StatusBadge status={g.status} /></h1><p className="page-line">{line}</p></div>
        <span className="spacer" />
        <button onClick={() => openAs()}><ExternalLink size={14} aria-hidden="true" /> {W.gurus.viewAs}</button>
        {g.status === 'draft' && <button className="primary" disabled={busy} onClick={() => setStatus('setting_up')}>{W.gurus.startSetup}</button>}
        {(g.status === 'setting_up' || g.status === 'draft') && <button className="primary" disabled={busy || !g.readyToGoLive} title={g.readyToGoLive ? '' : W.gurus.notReady} onClick={() => setStatus('live')}>{W.gurus.goLive}</button>}
        {g.status === 'live' && <button className="quiet" disabled={busy} onClick={() => setStatus('paused')}>{W.gurus.pause}</button>}
        {g.status === 'paused' && <button className="primary" disabled={busy} onClick={() => setStatus('live')}>{W.gurus.resume}</button>}
      </header>
      {note && <p className={`banner ${note.tone}`}>{note.text}</p>}

      <section className="progress" aria-label={W.gurus.progress(g.done, g.total)}>
        <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round((100 * g.done) / g.total)}%` }} /></div>
        <span className="muted small">{W.gurus.progress(g.done, g.total)}</span>
      </section>

      <div className="steps">
        {g.readiness.map((st, i) => <Step key={st.key} n={i + 1} step={st} g={g} onOpen={openAs} onGoLive={() => setStatus('live')} />)}
      </div>

      <div className="cols split">
        <SubscriptionCard g={g} onChanged={onChanged} />
        <BusinessCard g={g} onChanged={onChanged} />
      </div>
      <DomainCard g={g} onChanged={onChanged} />

      <section className="panel">
        <h2>{W.gurus.steps.team.title} <i>{W.gurus.teamOf(g.team.length)}</i></h2>
        {g.team.length === 0 ? <p className="muted">{W.gurus.nobodyYet}</p> : <ul className="plain-list">{g.team.map((u) => <li key={u.id}><b>{u.name || u.phone}</b> <span className="muted">+{u.phone}</span></li>)}</ul>}
        <button onClick={() => openAs('/console/settings/access')}>{W.gurus.steps.team.action}</button>
      </section>

      <section className="panel">
        <h2>{W.gurus.trail}</h2>
        {g.trail.length === 0 ? <p className="muted">—</p> : (
          <ul className="plain-list">
            {g.trail.map((t) => <li key={t.id}><span className="muted small">{new Date(t.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span> · <b>{t.who}</b> {W.gurus.actions[t.action] ?? t.action}</li>)}
          </ul>
        )}
      </section>
      {me.user.role !== 'admin' && null}
    </>
  );
}

function Step({ n, step: st, g, onOpen, onGoLive }: { n: number; step: ReadinessStep; g: GuruDetail; onOpen: (path: string) => void; onGoLive: () => void }) {
  const W = useWords();
  const words = W.gurus.steps[st.key];
  const link = STEP_LINKS[st.key];
  const shared = st.detail === 'shared';
  return (
    <div className={`step ${st.done ? 'done' : ''} ${shared ? 'shared' : ''}`}>
      <div className="mark">{st.done ? <Check size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}</div>
      <div className="body">
        <h3>{n}. {words.title} <span className={`muted small ${st.required ? 'req' : ''}`}>{st.required ? W.gurus.required : W.gurus.optional}</span></h3>
        <p className="muted">{words.why}</p>
        {st.key === 'address' && <p className="small">{g.domain ?? g.subdomain ?? `/s/${g.slug}`}</p>}
        {shared && <p className="small muted">{W.gurus.shared} · {W.gurus.soon}</p>}
      </div>
      <div className="do">
        {link && <button onClick={() => onOpen(link)}>{words.action}</button>}
        {st.key === 'address' && <a href="#domain" className="btn">{words.action}</a>}
        {st.key === 'business' && <a href="#business" className="btn">{words.action}</a>}
        {st.key === 'live' && !st.done && <button className="primary" disabled={!g.readyToGoLive} onClick={onGoLive}>{words.action}</button>}
        <span className={`muted small ${st.done ? 'ok' : ''}`}>{st.done ? W.gurus.done : W.gurus.todo}</span>
      </div>
    </div>
  );
}

function SubscriptionCard({ g, onChanged }: { g: GuruDetail; onChanged: () => void }) {
  const W = useWords();
  const [plan, setPlan] = useState(g.subscription.plan ?? '');
  const [fee, setFee] = useState(g.subscription.feePaise != null ? String(Math.round(g.subscription.feePaise / 100)) : '');
  const [status, setStatus] = useState(g.subscription.status ?? 'trial');
  const [nextDueOn, setNextDueOn] = useState(g.subscription.nextDueOn ?? '');
  const [note, setNote] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault(); setNote(null);
    try { await api(`/admin/gurus/${g.slug}`, { method: 'PUT', json: { subscription: { plan, feePaise: Math.round(Number(fee || 0) * 100), status, nextDueOn } } }); setNote(W.gurus.saved); onChanged(); }
    catch (err) { setNote((err as Error).message); }
  }
  return (
    <form className="panel" onSubmit={save}>
      <h2>{W.gurus.subscription}</h2>
      <p className="muted">{W.gurus.subscriptionLine}</p>
      <div className="row">
        <label>{W.gurus.plan}<input value={plan} onChange={(e) => setPlan(e.target.value)} maxLength={60} placeholder="Pilot" /></label>
        <label>{W.gurus.fee}<input type="number" min={0} step={1} value={fee} onChange={(e) => setFee(e.target.value)} /></label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label>{W.gurus.subStatus}<select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>{(['trial', 'active', 'overdue', 'cancelled'] as const).map((k) => <option key={k} value={k}>{W.gurus.subStatusWords[k]}</option>)}</select></label>
        <label>{W.gurus.nextDue}<input type="date" value={nextDueOn} onChange={(e) => setNextDueOn(e.target.value)} /></label>
      </div>
      <div className="row" style={{ marginTop: 12 }}><button className="primary">{W.gurus.save}</button>{note && <span className="status">{note}</span>}</div>
      {g.subscription.feePaise ? <p className="muted small">{formatRupees(g.subscription.feePaise)} / month</p> : null}
    </form>
  );
}

function BusinessCard({ g, onChanged }: { g: GuruDetail; onChanged: () => void }) {
  const W = useWords();
  const [b, setB] = useState({ legalName: g.business.legalName ?? '', address: g.business.address ?? '', gst: g.business.gst ?? '', pan: g.business.pan ?? '' });
  const [note, setNote] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault(); setNote(null);
    try { await api(`/admin/gurus/${g.slug}`, { method: 'PUT', json: { business: b } }); setNote(W.gurus.saved); onChanged(); } catch (err) { setNote((err as Error).message); }
  }
  return (
    <form className="panel" id="business" onSubmit={save}>
      <h2>{W.gurus.steps.business.title}</h2>
      <p className="muted">{W.gurus.businessLine}</p>
      <label>{W.gurus.legalName}<input value={b.legalName} onChange={(e) => setB({ ...b, legalName: e.target.value })} /></label>
      <label style={{ marginTop: 10 }}>{W.gurus.addressLine}<input value={b.address} onChange={(e) => setB({ ...b, address: e.target.value })} /></label>
      <div className="row" style={{ marginTop: 10 }}>
        <label>{W.gurus.gst}<input value={b.gst} onChange={(e) => setB({ ...b, gst: e.target.value })} /></label>
        <label>{W.gurus.pan}<input value={b.pan} onChange={(e) => setB({ ...b, pan: e.target.value })} /></label>
      </div>
      <div className="row" style={{ marginTop: 12 }}><button className="primary">{W.gurus.save}</button>{note && <span className="status">{note}</span>}</div>
    </form>
  );
}

function DomainCard({ g, onChanged }: { g: GuruDetail; onChanged: () => void }) {
  const W = useWords();
  const [domain, setDomain] = useState(g.domain ?? '');
  const [note, setNote] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault(); setNote(null);
    try { await api(`/admin/gurus/${g.slug}`, { method: 'PUT', json: { domain } }); setNote(W.gurus.saved); onChanged(); } catch (err) { setNote((err as Error).message); }
  }
  return (
    <form className="panel" id="domain" onSubmit={save}>
      <h2>{W.gurus.domainTitle}</h2>
      <p className="muted">{W.gurus.domainLine(g.subdomain ?? `/s/${g.slug}`)}</p>
      <div className="row"><label>{W.gurus.newDomain}<input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="guruji.com" /></label></div>
      <div className="row" style={{ marginTop: 12 }}><button className="primary">{W.gurus.save}</button>{note && <span className="status">{note}</span>}</div>
    </form>
  );
}
