import { FormEvent, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Circle, ExternalLink, Copy } from 'lucide-react';
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
      <PaymentsCard g={g} onChanged={onChanged} />
      <WhatsappCard g={g} onChanged={onChanged} />

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
        {shared && <p className="small muted">{W.gurus.shared}</p>}
      </div>
      <div className="do">
        {link && <button onClick={() => onOpen(link)}>{words.action}</button>}
        {st.key === 'address' && <a href="#domain" className="btn">{words.action}</a>}
        {st.key === 'business' && <a href="#business" className="btn">{words.action}</a>}
        {st.key === 'payments' && <a href="#payments" className="btn">{words.action}</a>}
        {st.key === 'whatsapp' && <a href="#whatsapp" className="btn">{words.action}</a>}
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

function PaymentsCard({ g, onChanged }: { g: GuruDetail; onChanged: () => void }) {
  const W = useWords();
  const P = W.gurus.payments;
  const pay = g.payments;
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'problem' } | null>(null);
  const [busy, setBusy] = useState(false);
  const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  async function act(work: () => Promise<string>) {
    setBusy(true); setNote(null);
    try { setNote({ text: await work(), tone: 'ok' }); onChanged(); } catch (err) { setNote({ text: (err as Error).message, tone: 'problem' }); } finally { setBusy(false); }
  }
  const send = (e: FormEvent) => { e.preventDefault(); act(async () => { await api(`/admin/gurus/${g.slug}/payments`, { method: 'POST', json: { keyId, keySecret, webhookSecret } }); setKeySecret(''); setWebhookSecret(''); return P.sent; }); };
  const verify = () => act(async () => (await api<{ ok: boolean }>(`/admin/gurus/${g.slug}/payments/verify`, { method: 'POST' })).ok ? P.verifiedOk : P.verifiedBad);
  const disconnect = () => { if (window.confirm(P.confirmDisconnect)) act(async () => { await api(`/admin/gurus/${g.slug}/payments`, { method: 'DELETE' }); return W.gurus.saved; }); };

  return (
    <section className="panel" id="payments">
      <h2>{P.title}</h2>
      {note && <p className={`banner ${note.tone}`}>{note.text}</p>}
      {pay.connected ? (
        <>
          <p className="ok-line"><Check size={16} aria-hidden="true" /> {P.connected(pay.keyId, P.modeWords[pay.mode ?? 'test'], when(pay.connectedAt!))}{pay.verifiedAt ? <span className="muted small"> · {P.lastVerified(when(pay.verifiedAt))}</span> : null}</p>
          <p className="muted small">{P.webhook}</p>
          <p className="mono"><code>{pay.webhookUrl}</code> <button type="button" className="quiet" aria-label="Copy" onClick={() => navigator.clipboard?.writeText(pay.webhookUrl)}><Copy size={14} aria-hidden="true" /></button></p>
          <div className="row"><button onClick={verify} disabled={busy}>{P.verify}</button><button className="quiet" onClick={disconnect} disabled={busy}>{P.disconnect}</button></div>
        </>
      ) : pay.pending ? (
        <p className="banner ok">{P.pending(pay.pending.summary, pay.pending.requestedBy ?? 'Slike', when(pay.pending.createdAt))}</p>
      ) : (
        <>
          <p className="muted">{P.shared}</p>
          {!pay.canApprove && <p className="banner problem">{P.noPhone}</p>}
          {!pay.secretsReady && <p className="banner problem">{P.noSecrets}</p>}
          <form onSubmit={send}>
            <p className="muted small">{P.where}</p>
            <div className="row">
              <label>{P.keyId}<input value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_live_…" required /></label>
              <label>{P.keySecret}<input type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} autoComplete="off" required /></label>
              <label>{P.webhookSecret}<input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} autoComplete="off" required /></label>
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>{P.webhook}</p>
            <p className="mono"><code>{pay.webhookUrl}</code></p>
            <div className="row"><button className="primary" disabled={busy || !pay.canApprove || !pay.secretsReady}>{P.send}</button></div>
          </form>
        </>
      )}
    </section>
  );
}

function WhatsappCard({ g, onChanged }: { g: GuruDetail; onChanged: () => void }) {
  const W = useWords();
  const N = W.gurus.whatsapp;
  const wa = g.whatsapp;
  const [displayName, setDisplayName] = useState(wa.displayName ?? `Samvad · ${g.name}`);
  const [phone, setPhone] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'problem' } | null>(null);
  const [busy, setBusy] = useState(false);
  const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  async function act(work: () => Promise<string>) {
    setBusy(true); setNote(null);
    try { setNote({ text: await work(), tone: 'ok' }); onChanged(); } catch (err) { setNote({ text: (err as Error).message, tone: 'problem' }); onChanged(); } finally { setBusy(false); }
  }
  const post = (path: string, json?: unknown) => api(`/admin/gurus/${g.slug}/whatsapp${path}`, { method: 'POST', json });
  const stage = wa.status;

  return (
    <section className="panel" id="whatsapp">
      <h2>{N.title} <i>{N.statusWords[stage]}</i></h2>
      {note && <p className={`banner ${note.tone}`}>{note.text}</p>}
      {wa.lastError && stage === 'failed' && <p className="banner problem">{N.failed(wa.lastError)}</p>}
      {stage === 'live' ? (
        <>
          <p className="ok-line"><Check size={16} aria-hidden="true" /> {N.live(wa.displayName ?? '', wa.number ?? '', when(wa.connectedAt!))}</p>
          <div className="row"><button className="quiet" disabled={busy} onClick={() => { if (window.confirm(N.confirmDisconnect)) act(async () => { await api(`/admin/gurus/${g.slug}/whatsapp`, { method: 'DELETE' }); return W.gurus.saved; }); }}>{N.disconnect}</button></div>
        </>
      ) : wa.pending ? (
        <p className="banner ok">{N.pending(wa.pending.summary, wa.pending.requestedBy ?? 'Slike', when(wa.pending.createdAt))}</p>
      ) : (
        <>
          <p className="muted">{N.shared(wa.sharedNumber ?? '')}</p>
          {(stage === 'none' || stage === 'failed') && (
            <>
              <p className="muted small">{N.rule}</p>
              {!wa.wabaReady && <p className="banner problem">{N.noWaba}</p>}
              <form onSubmit={(e) => { e.preventDefault(); act(async () => { await post('', { displayName, phone }); return N.added; }); }}>
                <div className="row">
                  <label>{N.displayName}<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} required /></label>
                  <label>{N.phone}<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="91 98765 43210" required /></label>
                </div>
                <p className="muted small">{N.displayNameNote}</p>
                <div className="row"><button className="primary" disabled={busy || !wa.wabaReady}>{N.add}</button></div>
              </form>
              <h3 style={{ marginTop: 18 }}>{N.manualTitle}</h3>
              <p className="muted small">{N.manualLine}</p>
              <form onSubmit={(e) => { e.preventDefault(); act(async () => { await post('/manual', { displayName, phone, phoneNumberId }); return N.registered; }); }}>
                <div className="row">
                  <label>{N.displayName}<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} required /></label>
                  <label>{N.phone}<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required /></label>
                  <label>{N.phoneNumberId}<input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} inputMode="numeric" required /></label>
                </div>
                <div className="row"><button disabled={busy}>{N.useManual}</button></div>
              </form>
            </>
          )}
          {stage === 'added' && (
            <div className="row"><button className="primary" disabled={busy} onClick={() => act(async () => { await post('/code', { method: 'SMS' }); return N.codeSent; })}>{N.sendSms}</button><button disabled={busy} onClick={() => act(async () => { await post('/code', { method: 'VOICE' }); return N.codeSent; })}>{N.sendCall}</button></div>
          )}
          {(stage === 'code_sent' || stage === 'verified') && (
            <form onSubmit={(e) => { e.preventDefault(); act(async () => { await post('/verify', { code }); return N.registered; }); }}>
              <div className="row"><label>{N.code}<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} required /></label></div>
              <div className="row"><button className="primary" disabled={busy}>{N.verify}</button><button type="button" className="quiet" disabled={busy} onClick={() => act(async () => { await post('/code', { method: 'SMS' }); return N.codeSent; })}>{N.sendSms}</button></div>
            </form>
          )}
          {stage === 'registered' && (
            <>
              <p className="muted">{N.registered}</p>
              <form onSubmit={(e) => { e.preventDefault(); act(async () => { await post('/go-live', { phone }); return N.sentToGuru; }); }}>
                <div className="row"><label>{N.phone}<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="91 98765 43210" required /></label></div>
                <div className="row"><button className="primary" disabled={busy || !wa.canApprove}>{N.goLive}</button><button type="button" className="quiet" disabled={busy} onClick={() => { if (window.confirm(N.confirmDisconnect)) act(async () => { await api(`/admin/gurus/${g.slug}/whatsapp`, { method: 'DELETE' }); return W.gurus.saved; }); }}>{N.disconnect}</button></div>
                {!wa.canApprove && <p className="banner problem">{W.gurus.payments.noPhone}</p>}
              </form>
            </>
          )}
        </>
      )}
    </section>
  );
}
