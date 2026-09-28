// Talking to /api/guru. His magic link carries the token once; the api turns it into a cookie.

export class GuruError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** The token from his link, if this is the first open on this phone. */
export function magicToken(): string | null {
  const t = new URLSearchParams(window.location.search).get('t');
  return t && t.length > 8 ? t : null;
}

/** Take it out of the address bar once it has become a cookie, so it is not shared by accident. */
export function forgetMagicToken() {
  const url = new URL(window.location.href);
  url.searchParams.delete('t');
  window.history.replaceState({}, '', url.toString());
}

export async function guruApi<T>(path: string, init: { method?: string; token?: string | null } = {}): Promise<T> {
  const url = `/api/guru${path}${init.token ? `${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(init.token)}` : ''}`;
  const res = await fetch(url, { method: init.method ?? 'GET', credentials: 'same-origin' });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new GuruError(res.status, body.error ?? 'That did not work just now.');
  return body as T;
}
