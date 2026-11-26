const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';
// The backend also serves static files (product images, store logo) outside the
// /api prefix — see backend/src/app.ts's express.static('/public', ...).
const SERVER_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

export function assetUrl(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SERVER_ORIGIN}${encodeURI(normalized)}`;
}

// For requests apiFetch can't handle (non-JSON responses, e.g. the parcel summary PDF).
export function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

export class ApiError extends Error {
  status: number;
  /** The parsed error body, incl. any structured extras (e.g. Phase 32's existingOrderNumber). */
  body?: Record<string, unknown>;

  constructor(status: number, message: string, body?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // `...init` first, then the merged headers — otherwise a caller passing its own
  // header (Phase 32 D3: Idempotency-Key) would silently drop the JSON Content-Type.
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? res.statusText, body ?? undefined);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
