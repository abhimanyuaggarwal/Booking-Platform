import { FormEvent, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, useApi } from './api';
import { drawStreamBand } from './stream-band';
import { formatRupees } from '@expert-sessions/shared';
import type { QrRow, QrSource, Settings } from './types';

// The greeting is how the WhatsApp door learns where she came from; same table as apps/api/src/qr-codes.js.
const GREETINGS: Record<Exclude<QrSource, 'custom'>, string> = { live: 'Hi — from the live', ashram: 'Hi — ashram', poster: 'Hi — poster' };
const SOURCES: { value: QrSource; label: string; hint: string }[] = [
  { value: 'live', label: 'YouTube live', hint: 'the band on the stream' },
  { value: 'ashram', label: 'Ashram', hint: 'notice board, reception' },
  { value: 'poster', label: 'Poster', hint: 'printed, anywhere' },
  { value: 'custom', label: 'Custom', hint: 'your own label' },
];

export default function QrCodes({ settings }: { settings: Settings }) {
  const { data, error, reload } = useApi<QrRow[]>('/qr-codes');
  const [source, setSource] = useState<QrSource>('live');
  const [label, setLabel] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const greeting = source === 'custom' ? `Hi — ${label || '…'}` : GREETINGS[source];
  const preview = `https://wa.me/${(settings.whatsappNumber ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(greeting)}`;

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/qr-codes', { method: 'POST', json: { source, label } });
      setLabel('');
      reload();
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="settings panel" onSubmit={create} style={{ maxWidth: 760 }}>
        <h2>Make a QR code</h2>
        <div className="row">
          {SOURCES.map((s) => (
            <label key={s.value} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, display: 'flex' }}>
              <input type="radio" name="source" value={s.value} checked={source === s.value} onChange={() => setSource(s.value)} />
              <span><b>{s.label}</b> <span className="muted">· {s.hint}</span></span>
            </label>
          ))}
        </div>
        <label>Label, so the team knows where this one hangs<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={source === 'custom' ? 'Jaipur satsang hall' : 'YouTube live · L-band'} required /></label>
        <p className="muted">She scans it, WhatsApp opens with “{greeting}” already typed, and the booking is counted under <b>{source}</b>.<br /><code style={{ fontSize: 11.5 }}>{preview}</code></p>
        {!settings.whatsappNumber && <p className="problem">His WhatsApp number is not set yet, so the link has no number.</p>}
        {problem && <p className="problem">{problem}</p>}
        <div><button className="primary" disabled={busy || !settings.whatsappNumber}>Generate and save</button></div>
      </form>

      {error && <p className="problem">{error}</p>}
      <div className="qr-list">
        {data?.map((q) => <QrCard key={q.id} qr={q} settings={settings} />)}
      </div>
    </>
  );
}

function QrCard({ qr, settings }: { qr: QrRow; settings: Settings }) {
  const [png, setPng] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(qr.waLink, { width: 640, margin: 1, color: { dark: '#231F19', light: '#FFFFFF' } })
      .then(setPng)
      .catch(() => setPng(null));
  }, [qr.waLink]);

  // The strip for the bottom of a live. Only worth offering where a stream is what she is watching.
  async function downloadBand() {
    if (!png) return;
    try {
      const blob = await drawStreamBand(png, {
        guruName: settings.name,
        line: `One to one · ${settings.pattern.slotMinutes} minutes · dakshina ${formatRupees(settings.dakshinaPaise)}`,
        call: 'Scan to book on WhatsApp',
      });
      save(URL.createObjectURL(blob), `${fileName(qr)}-stream-band.png`);
    } catch (err) {
      setProblem((err as Error).message);
    }
  }

  async function downloadSvg() {
    const svg = await QRCode.toString(qr.waLink, { type: 'svg', margin: 1, color: { dark: '#231F19', light: '#FFFFFF' } });
    save(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), `${fileName(qr)}.svg`);
  }

  return (
    <div className="qr-card">
      <span className="tag n">{qr.source.toUpperCase()}</span>
      <b>{qr.label}</b>
      {qr.stale && (
        <p className="problem" style={{ margin: 0 }}>
          This code was made when his WhatsApp number was different. The code below is correct — but
          anything already printed from it points at the old number and no longer reaches him.
        </p>
      )}
      {png ? <img src={png} alt={`QR code for ${qr.label}`} /> : <span className="muted">Drawing the code.</span>}
      <code>{qr.waLink}</code>
      <div className="row">
        {png && <a className="btn" href={png} download={`${fileName(qr)}.png`}>Download PNG</a>}
        <button onClick={downloadSvg}>Download SVG</button>
        {qr.source === 'live' && <button onClick={downloadBand} disabled={!png}>Download stream band</button>}
        <button className="quiet" onClick={() => navigator.clipboard.writeText(qr.waLink)}>Copy link</button>
      </div>
      {problem && <p className="problem" style={{ margin: 0 }}>{problem}</p>}
    </div>
  );
}

function save(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function fileName(qr: QrRow) {
  return `qr-${qr.source}-${qr.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}
