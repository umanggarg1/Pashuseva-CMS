// Phase 27: formatting helpers for the Trash detail sections.

export const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString() : '—');
export const fmtDateTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : '—');
export const money = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `₹${v.toLocaleString()}`;
export const label = (v: string | null | undefined) => (v ? v.replace(/_/g, ' ') : '—');

export interface UserRef {
  id: number;
  name: string | null;
}
export const who = (u: UserRef | null | undefined) => u?.name ?? '—';
