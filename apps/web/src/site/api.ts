// Talking to /api/site. The tenant travels as ?slug= on the internal preview; on his own domain the
// Host header is enough and no slug is sent.
import { useEffect, useState } from 'react';

export class SiteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function siteApi(guruSlug?: string) {
  const suffix = guruSlug ? `slug=${encodeURIComponent(guruSlug)}` : '';
  const url = (path: string) => `/api/site${path}${suffix ? (path.includes('?') ? '&' : '?') + suffix : ''}`;

  return async function call<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
    const res = await fetch(url(path), {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.json !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new SiteError(res.status, body.error ?? 'Something did not work just now. Please try again.');
    return body as T;
  };
}

export function useSite<T>(call: ReturnType<typeof siteApi>, path: string) {
  const [state, setState] = useState<{ data: T | null; error: string | null; status: number | null }>({ data: null, error: null, status: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    call<T>(path)
      .then((data) => { if (live) setState({ data, error: null, status: 200 }); })
      .catch((err: SiteError) => { if (live) setState({ data: null, error: err.message, status: err.status ?? 0 }); });
    return () => { live = false; };
  }, [call, path, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
