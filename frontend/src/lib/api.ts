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

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
