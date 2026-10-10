// Talking to /api/console. One function, one hook. Errors carry the api's own sentence.
import { useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const BASE = '/api/console';

/** The language the console reads in (lang.tsx keeps it), so the api words its dates the same way. */
function langHeader() { try { return localStorage.getItem('samvad-console-lang') === 'hi' ? 'hi' : 'en'; } catch { return 'en'; } }

export async function api<T = void>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: { 'x-lang': langHeader(), ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 && path !== '/me' && !path.startsWith('/login')) {
    // The cookie expired mid-session: back to the sign-in screen rather than a page of errors.
    window.location.assign('/console');
  }
  if (!res.ok) throw new ApiError(res.status, body.error ?? `The api answered ${res.status}`);
  return body as T;
}

export function useApi<T>(path: string) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api<T>(path)
      .then((data) => { if (live) setState({ data, error: null, loading: false }); })
      .catch((err: Error) => { if (live) setState({ data: null, error: err.message, loading: false }); });
    return () => { live = false; };
  }, [path, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
